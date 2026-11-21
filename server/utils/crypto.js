const crypto = require('crypto');
const { DB_ENCRYPTION_KEY } = require('../config');
const logger = require('../services/logger');

const KEY = DB_ENCRYPTION_KEY;
if (!Buffer.isBuffer(KEY) || KEY.length !== 32) {
  throw new Error('[Crypto] Invalid DB_ENCRYPTION_KEY: expected 32-byte Buffer.');
}

/**
 * 使用 AES-256-GCM 加密明文字段。
 * 返回格式 `iv_hex:tag_hex:encrypted_hex`。
 * 加密失败时严禁静默返回明文，必须抛出异常阻断明文落库。
 */
function encryptField(text) {
  if (typeof text !== 'string') return text;
  if (!text.trim()) return text;
  try {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', KEY, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag();
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
  } catch (err) {
    logger.error('[Crypto] Encryption failed (refusing plaintext fallback):', err.message);
    throw err;
  }
}

/**
 * 解密密文字段（兼容 AES-256-GCM 与历史 AES-256-CBC 格式）。
 * 若输入本身并非合法密文格式，则返回原字符串以兼容历史未加密记录。
 */
function decryptField(cipherText) {
  if (typeof cipherText !== 'string') return cipherText;
  if (!cipherText.trim()) return cipherText;

  const parts = cipherText.split(':');

  // AES-256-GCM: iv_hex:tag_hex:cipher_hex
  if (parts.length === 3) {
    try {
      if (parts[0].length !== 24 || parts[1].length !== 32) return cipherText;
      const iv = Buffer.from(parts[0], 'hex');
      const tag = Buffer.from(parts[1], 'hex');
      const encrypted = parts[2];

      const decipher = crypto.createDecipheriv('aes-256-gcm', KEY, iv);
      decipher.setAuthTag(tag);
      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      return decrypted;
    } catch (err) {
      return cipherText;
    }
  }

  // Legacy AES-256-CBC: iv_hex:cipher_hex
  if (parts.length === 2) {
    try {
      if (parts[0].length !== 32) return cipherText;
      const iv = Buffer.from(parts[0], 'hex');
      const encrypted = parts[1];

      const decipher = crypto.createDecipheriv('aes-256-cbc', KEY, iv);
      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      return decrypted;
    } catch (err) {
      return cipherText;
    }
  }

  return cipherText;
}

const FTS_HMAC_KEY = crypto.createHash('sha256').update(KEY).digest();

/**
 * 生成基于 HMAC-SHA256 截断摘要的 FTS 盲索引文本。
 */
function generateFtsIndexText(text) {
  if (!text) return '';
  const searchWord = String(text).toLowerCase();
  const tokens = [];

  const chineseRegex = /[\u4e00-\u9fa5]/g;
  let match;
  while ((match = chineseRegex.exec(searchWord)) !== null) {
    tokens.push(match[0]);
  }

  const alphaNumRegex = /[a-zA-Z0-9]+/g;
  while ((match = alphaNumRegex.exec(searchWord)) !== null) {
    tokens.push(match[0]);
  }

  if (tokens.length === 0) return '';

  const hashedTokens = tokens.map(token => {
    const hmac = crypto.createHmac('sha256', FTS_HMAC_KEY);
    hmac.update(token);
    return hmac.digest('hex').slice(0, 12);
  });

  return hashedTokens.join(' ');
}

module.exports = {
  encryptField,
  decryptField,
  generateFtsIndexText
};
