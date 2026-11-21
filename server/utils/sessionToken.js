const crypto = require('crypto');

/**
 * 基于 SHA-256 定长摘要的恒定时间比对函数，消除变长输入导致的 timingSafeEqual 异常与长度侧信道。
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
function safeTokenEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || !a || !b) {
    return false;
  }
  const hashA = crypto.createHash('sha256').update(a, 'utf8').digest();
  const hashB = crypto.createHash('sha256').update(b, 'utf8').digest();
  return crypto.timingSafeEqual(hashA, hashB);
}

/**
 * 签发紧凑自包含 HMAC-SHA256 会话令牌：<payloadBase64Url>.<hmacSha256Hex>
 * @param {object} payloadObj
 * @param {string} secret
 * @returns {string}
 */
function signCompactToken(payloadObj, secret) {
  if (!secret || typeof secret !== 'string') {
    throw new Error('Missing signing secret');
  }
  const payloadB64 = Buffer.from(JSON.stringify(payloadObj), 'utf8').toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(payloadB64).digest('hex');
  return `${payloadB64}.${sig}`;
}

/**
 * 校验并解析紧凑自包含令牌。
 * @param {string} token
 * @param {string} secret
 * @param {string|null} expectedType
 * @returns {object|null}
 */
function verifyCompactToken(token, secret, expectedType = null) {
  try {
    if (!token || typeof token !== 'string' || !secret) return null;
    const trimmed = token.trim();
    const dotIdx = trimmed.indexOf('.');
    if (dotIdx <= 0 || dotIdx >= trimmed.length - 1) return null;
    // 确保只有单个 '.' 分隔符
    if (trimmed.indexOf('.', dotIdx + 1) !== -1) return null;

    const payloadB64 = trimmed.slice(0, dotIdx);
    const sigHex = trimmed.slice(dotIdx + 1);
    const expectedSig = crypto.createHmac('sha256', secret).update(payloadB64).digest('hex');

    if (!safeTokenEqual(sigHex, expectedSig)) {
      return null;
    }

    const decoded = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
    if (!decoded || typeof decoded !== 'object') return null;
    if (expectedType && decoded.typ !== expectedType) return null;

    const nowMs = Date.now();
    if (typeof decoded.exp !== 'number' || !Number.isFinite(decoded.exp) || nowMs > decoded.exp) {
      return null;
    }

    return decoded;
  } catch {
    return null;
  }
}

/**
 * 轻量解析 HTTP 请求 Cookie 头。
 * @param {import('express').Request} req
 * @returns {Record<string, string>}
 */
function parseCookies(req) {
  const result = {};
  const header = req?.headers?.cookie;
  if (!header || typeof header !== 'string') return result;

  const pairs = header.split(';');
  for (const pair of pairs) {
    const eqIdx = pair.indexOf('=');
    if (eqIdx <= 0) continue;
    const key = pair.slice(0, eqIdx).trim();
    const rawVal = pair.slice(eqIdx + 1).trim();
    if (!key) continue;
    try {
      result[key] = decodeURIComponent(rawVal);
    } catch {
      result[key] = rawVal;
    }
  }
  return result;
}

module.exports = {
  safeTokenEqual,
  signCompactToken,
  verifyCompactToken,
  parseCookies
};
