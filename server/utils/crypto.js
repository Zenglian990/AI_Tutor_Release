const crypto = require('crypto');
const { DB_ENCRYPTION_KEY } = require('../config');

const KEY = DB_ENCRYPTION_KEY;

/**
 * Encrypt a plaintext field using AES-256-GCM (Authenticated Encryption).
 * Returns cipher text in format `iv_hex:tag_hex:encrypted_hex`.
 */
function encryptField(text) {
  if (typeof text !== 'string') return text;
  if (!text.trim()) return text;
  try {
    const iv = crypto.randomBytes(12); // Standard 12-byte IV for GCM
    const cipher = crypto.createCipheriv('aes-256-gcm', KEY, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag();
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
  } catch (err) {
    console.error('[Crypto] Encryption failed:', err);
    return text;
  }
}

/**
 * Decrypt a cipher text field.
 * Handles both the new AES-256-GCM format (3 colon-separated parts)
 * and legacy AES-256-CBC format (2 colon-separated parts).
 * Automatically falls back to plaintext if parsing/decryption fails.
 */
function decryptField(cipherText) {
  if (typeof cipherText !== 'string') return cipherText;
  if (!cipherText.trim()) return cipherText;
  
  const parts = cipherText.split(':');
  
  // New AES-256-GCM format: iv_hex:tag_hex:cipher_hex
  if (parts.length === 3) {
    try {
      const iv = Buffer.from(parts[0], 'hex');
      const tag = Buffer.from(parts[1], 'hex');
      const encrypted = parts[2];
      
      // Safety check: IV is 12 bytes (24 hex characters), tag is 16 bytes (32 hex characters)
      if (parts[0].length !== 24 || parts[1].length !== 32) return cipherText;

      const decipher = crypto.createDecipheriv('aes-256-gcm', KEY, iv);
      decipher.setAuthTag(tag);
      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      return decrypted;
    } catch (err) {
      // Decryption failure usually implies it was not an encrypted string
      return cipherText;
    }
  }

  // Legacy AES-256-CBC format: iv_hex:cipher_hex
  if (parts.length === 2) {
    try {
      const iv = Buffer.from(parts[0], 'hex');
      const encrypted = parts[1];
      
      // Safety check on sizes to ensure it is hex-encoded IV (16 bytes = 32 hex characters)
      if (parts[0].length !== 32) return cipherText;

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
 * Convert text into a space-separated sequence of short HMAC hashes of individual characters/words.
 * This secures the FTS virtual table against plaintext leaks while allowing indexing.
 */
function generateFtsIndexText(text) {
  if (!text) return '';
  const searchWord = String(text).toLowerCase();
  
  // Extract Chinese characters as individual tokens, and English/numbers as words
  const tokens = [];
  
  // 1. Match Chinese characters
  const chineseRegex = /[\u4e00-\u9fa5]/g;
  let match;
  while ((match = chineseRegex.exec(searchWord)) !== null) {
    tokens.push(match[0]);
  }
  
  // 2. Match alphanumeric words (English words / numbers)
  const alphaNumRegex = /[a-zA-Z0-9]+/g;
  while ((match = alphaNumRegex.exec(searchWord)) !== null) {
    tokens.push(match[0]);
  }

  if (tokens.length === 0) return '';

  // Generate a derived secure token index
  const hashedTokens = tokens.map(token => {
    const hmac = crypto.createHmac('sha256', FTS_HMAC_KEY);
    hmac.update(token);
    // Truncate the hash to 12 hex chars to save space and reduce collision
    return hmac.digest('hex').slice(0, 12);
  });

  return hashedTokens.join(' ');
}

module.exports = {
  encryptField,
  decryptField,
  generateFtsIndexText
};
