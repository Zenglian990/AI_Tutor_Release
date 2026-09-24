const crypto = require('crypto');
const { getSqliteDb } = require('../db/init');
const { API_TOKEN } = require('../config');
const logger = require('../services/logger');

// Master PIN overrides (888888 or 000000) for owner emergency/admin access
const MASTER_PIN_HASHES = [
  crypto.createHash('sha256').update('888888').digest('hex'),
  crypto.createHash('sha256').update('000000').digest('hex')
];

/**
 * Verify whether a request is authentically authorized as Admin (曾先生 / 家长管理员).
 * Validates either:
 * 1. Bearer API_TOKEN matching system API_TOKEN
 * 2. x-parent-pin-hash header or pin_hash body matching master hashes (888888 / 000000)
 * 3. x-parent-pin-hash header or pin_hash body matching system_settings.parent_pin_hash in SQLite
 *
 * @param {import('express').Request} req
 * @returns {Promise<boolean>}
 */
async function isVerifiedAdminRequest(req) {
  if (!req) return false;

  // 1. Check Bearer token if configured
  const authHeader = req.headers?.authorization;
  if (authHeader && API_TOKEN) {
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
    if (typeof token === 'string' && token.length > 0) {
      const tokenBuf = Buffer.from(token);
      const expectedBuf = Buffer.from(API_TOKEN);
      if (tokenBuf.length === expectedBuf.length && crypto.timingSafeEqual(tokenBuf, expectedBuf)) {
        return true;
      }
    }
  }

  // 2. Extract PIN hash from custom header or body
  const pinHash = (req.headers?.['x-parent-pin-hash'] || req.body?.pin_hash || '').toString().trim();
  if (!pinHash) {
    return false;
  }

  const pinHashBuf = Buffer.from(pinHash);

  // 3. Match against master PIN hashes (888888 / 000000)
  for (const masterHash of MASTER_PIN_HASHES) {
    const masterBuf = Buffer.from(masterHash);
    if (pinHashBuf.length === masterBuf.length && crypto.timingSafeEqual(pinHashBuf, masterBuf)) {
      return true;
    }
  }

  // 4. Match against SQLite saved parent PIN hash
  try {
    const sqliteDb = getSqliteDb();
    if (sqliteDb) {
      const savedPinRow = await sqliteDb.get("SELECT value FROM system_settings WHERE key = 'parent_pin_hash'");
      if (savedPinRow && savedPinRow.value) {
        const savedBuf = Buffer.from(String(savedPinRow.value));
        if (savedBuf.length === pinHashBuf.length && crypto.timingSafeEqual(savedBuf, pinHashBuf)) {
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
  MASTER_PIN_HASHES,
  isVerifiedAdminRequest
};
