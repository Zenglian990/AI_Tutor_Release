import CryptoJS from 'crypto-js';

// Use a static key for simple obfuscation against casual inspection.
// Note: In a real frontend environment, true security requires backend validation.
// [SECURITY DISCLAIMER]: This is purely OBFUSCATION, not secure encryption. 
// Storing keys in frontend code means any user can decrypt the data.
const SECRET_KEY = CryptoJS.enc.Utf8.parse('ai_tutor_obfuscation_key_v1'.padEnd(32, '0'));

export const encryptData = (data) => {
  if (!data) return '';
  try {
    // Security Fix: Switched from ECB to CBC mode with random IV
    const iv = CryptoJS.lib.WordArray.random(16);
    const encrypted = CryptoJS.AES.encrypt(data, SECRET_KEY, {
      iv: iv,
      mode: CryptoJS.mode.CBC,
      padding: CryptoJS.pad.Pkcs7
    });
    // Store IV along with ciphertext
    return iv.toString(CryptoJS.enc.Hex) + ':' + encrypted.toString();
  } catch (err) {
    console.error('Encryption failed', err);
    return '';
  }
};

export const decryptData = (cipherText) => {
  if (!cipherText) return '';
  try {
    const parts = cipherText.split(':');
    if (parts.length !== 2) {
      // Fallback for old ECB encrypted data during transition
      const bytes = CryptoJS.AES.decrypt(cipherText, 'ai_tutor_obfuscation_key_v1');
      return bytes.toString(CryptoJS.enc.Utf8);
    }
    const iv = CryptoJS.enc.Hex.parse(parts[0]);
    const encryptedText = parts[1];
    
    const bytes = CryptoJS.AES.decrypt(encryptedText, SECRET_KEY, {
      iv: iv,
      mode: CryptoJS.mode.CBC,
      padding: CryptoJS.pad.Pkcs7
    });
    return bytes.toString(CryptoJS.enc.Utf8);
  } catch (err) {
    console.error('Decryption failed', err);
    return '';
  }
};
