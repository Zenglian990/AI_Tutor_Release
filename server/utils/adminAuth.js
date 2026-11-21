const crypto = require('crypto');
const { getSqliteDb } = require('../db/init');
const config = require('../config');
const logger = require('../services/logger');
const { safeTokenEqual, signCompactToken, verifyCompactToken, parseCookies } = require('./sessionToken');

const ADMIN_SESSION_COOKIE = 'ai_tutor_admin_session';

// 已知弱 PIN 哈希黑名单（888888, 000000, 123456）
const KNOWN_WEAK_PIN_HASHES = new Set([
  '92925488b28ab12584ac8fcaa8a27a0f497b2c62940c8f4fbc8ef19ebc87c43e', // 888888
  '91b4d142823f7d20c5f08df69122de43f35f057a988d9619f6d3138485c9a203', // 000000
  '8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92', // 123456
  '7c4a8d09ca3762af61e59520943dc26494f8941b' // sha1 888888
]);

function isWeakPinHash(hash) {
  if (!hash || typeof hash !== 'string') return true;
  return KNOWN_WEAK_PIN_HASHES.has(hash.trim().toLowerCase());
}

function getEffectiveApiToken() {
  const candidates = [config.API_TOKEN, process.env.API_TOKEN];
  for (const raw of candidates) {
    if (typeof raw !== 'string') continue;
    const trimmed = raw.trim();
    if (trimmed.length >= 24 && !config.DEPRECATED_STATIC_TOKENS.has(trimmed)) {
      return trimmed;
    }
  }
  return null;
}

function getEffectiveSetupSecret() {
  const candidates = [config.ADMIN_SETUP_SECRET, process.env.ADMIN_SETUP_SECRET];
  for (const raw of candidates) {
    if (typeof raw !== 'string') continue;
    const trimmed = raw.trim();
    if (trimmed.length >= 8 && !config.DEPRECATED_STATIC_TOKENS.has(trimmed)) {
      return trimmed;
    }
  }
  return null;
}

function isSetupSecretValid(candidate) {
  const expected = getEffectiveSetupSecret();
  if (!expected || typeof candidate !== 'string' || !candidate.trim()) {
    return false;
  }
  return safeTokenEqual(candidate.trim(), expected);
}

/**
 * 签发有效期为 30 分钟的家长/管理员会话令牌（使用进程独立密钥 PARENT_SESSION_SECRET）
 */
function generateParentSessionToken(profileId = 'admin', ttlSeconds = 1800) {
  const now = Date.now();
  const payload = {
    typ: 'admin',
    profileId: String(profileId || 'admin'),
    iat: now,
    exp: now + ttlSeconds * 1000,
    jti: crypto.randomBytes(8).toString('hex')
  };
  return signCompactToken(payload, config.PARENT_SESSION_SECRET);
}

/**
 * 验证家长/管理员会话令牌
 */
function verifyParentSessionToken(token) {
  const decoded = verifyCompactToken(token, config.PARENT_SESSION_SECRET, 'admin');
  if (!decoded) return null;
  return {
    profileId: decoded.profileId || 'admin',
    exp: decoded.exp
  };
}

/**
 * 判断传入令牌是否为合法有效的管理员 Master API_TOKEN
 */
function isValidMasterApiToken(token) {
  if (typeof token !== 'string' || !token.trim()) return false;
  const trimmed = token.trim();
  if (config.DEPRECATED_STATIC_TOKENS.has(trimmed)) return false;
  const effectiveApiToken = getEffectiveApiToken();
  if (!effectiveApiToken) return false;
  return safeTokenEqual(trimmed, effectiveApiToken);
}

/**
 * 验证请求是否具备有效的管理员/家长授权：
 * 1. Authorization: Bearer <API_TOKEN> 或 <Parent-Session-Token>
 * 2. x-parent-session-token Header / body.session_token
 * 3. HttpOnly Cookie ai_tutor_admin_session
 * 4. x-parent-pin-hash Header / body.pin_hash（严禁弱 PIN，且严格比对 SQLite 存储值）
 *
 * @param {import('express').Request} req
 * @returns {Promise<boolean>}
 */
async function isVerifiedAdminRequest(req) {
  if (!req) return false;

  // 1. Authorization Bearer
  const authHeader = req.headers?.authorization;
  if (typeof authHeader === 'string' && authHeader.trim()) {
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : authHeader.trim();
    if (token) {
      if (isValidMasterApiToken(token)) {
        return true;
      }
      if (verifyParentSessionToken(token)) {
        return true;
      }
    }
  }

  // 2. x-parent-session-token Header / body.session_token
  const sessionHeader = (req.headers?.['x-parent-session-token'] || req.body?.session_token || '').toString().trim();
  if (sessionHeader && verifyParentSessionToken(sessionHeader)) {
    return true;
  }

  // 3. HttpOnly Cookie: ai_tutor_admin_session
  const cookies = parseCookies(req);
  const adminCookie = cookies[ADMIN_SESSION_COOKIE];
  if (adminCookie && verifyParentSessionToken(adminCookie)) {
    return true;
  }

  // 4. x-parent-pin-hash / body.pin_hash
  const pinHash = (req.headers?.['x-parent-pin-hash'] || req.body?.pin_hash || '').toString().trim();
  if (!pinHash) {
    return false;
  }

  if (isWeakPinHash(pinHash)) {
    logger.warn('[AdminAuth] Rejected authentication with known weak PIN hash.');
    return false;
  }

  try {
    const sqliteDb = getSqliteDb();
    if (sqliteDb) {
      const savedPinRow = await sqliteDb.get("SELECT value FROM system_settings WHERE key = 'parent_pin_hash'");
      if (savedPinRow && savedPinRow.value) {
        const savedVal = String(savedPinRow.value);
        if (isWeakPinHash(savedVal)) {
          logger.warn('[AdminAuth] DB has weak PIN hash; refusing authentication until reset.');
          return false;
        }
        if (safeTokenEqual(pinHash, savedVal)) {
          return true;
        }
      }
    }
  } catch (err) {
    logger.warn('[AdminAuth] Error checking SQLite for parent_pin_hash:', err.message);
  }

  return false;
}

module.exports = {
  ADMIN_SESSION_COOKIE,
  isVerifiedAdminRequest,
  isValidMasterApiToken,
  isSetupSecretValid,
  getEffectiveApiToken,
  getEffectiveSetupSecret,
  generateParentSessionToken,
  verifyParentSessionToken,
  isWeakPinHash,
  KNOWN_WEAK_PIN_HASHES
};
