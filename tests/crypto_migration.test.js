const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { encryptField, decryptField } = require('../server/utils/crypto');
const { DB_ENCRYPTION_KEY } = require('../server/config');

test('Crypto Migration: GCM encryption and decryption', () => {
  const plaintext = '曾先生, 2026年6月启动 AI 深度辅导方案！';
  const encrypted = encryptField(plaintext);
  
  // Verify GCM format: iv_hex:tag_hex:ciphertext_hex
  const parts = encrypted.split(':');
  assert.equal(parts.length, 3, 'GCM cipher text should have 3 parts separated by colons');
  assert.equal(parts[0].length, 24, 'IV hex length should be 24 (12 bytes)');
  assert.equal(parts[1].length, 32, 'Auth tag hex length should be 32 (16 bytes)');

  // Verify GCM decryption
  const decrypted = decryptField(encrypted);
  assert.equal(decrypted, plaintext, 'GCM decrypted text should match original plaintext');
});

test('Crypto Migration: legacy CBC decryption fallback', () => {
  const plaintext = '这是以前旧的CBC加密的敏感聊天记录内容';
  const iv = crypto.randomBytes(16); // 16 bytes for CBC
  const cipher = crypto.createCipheriv('aes-256-cbc', DB_ENCRYPTION_KEY, iv);
  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  const legacyCipherText = `${iv.toString('hex')}:${encrypted}`;
  
  // Verify legacy format: iv_hex:ciphertext_hex
  const parts = legacyCipherText.split(':');
  assert.equal(parts.length, 2, 'Legacy cipher text should have 2 parts separated by colons');
  assert.equal(parts[0].length, 32, 'Legacy IV hex length should be 32 (16 bytes)');

  // Verify CBC fallback decryption works seamlessly
  const decrypted = decryptField(legacyCipherText);
  assert.equal(decrypted, plaintext, 'Legacy CBC decrypted text should match original plaintext');
});

test('Crypto Migration: plaintext fallback', () => {
  const plaintext = '普通明文字符串';
  
  // Decrypting plaintext should return the plaintext itself
  const decrypted = decryptField(plaintext);
  assert.equal(decrypted, plaintext, 'Plaintext decryption fallback should return original text');
  
  // Invalid formats should also fall back to original
  const invalidCipher1 = 'invalid_iv:invalid_tag:invalid_cipher';
  assert.equal(decryptField(invalidCipher1), invalidCipher1);
  
  const invalidCipher2 = 'invalid_iv_hex:invalid_cipher';
  assert.equal(decryptField(invalidCipher2), invalidCipher2);
});
