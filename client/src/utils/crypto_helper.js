import CryptoJS from 'crypto-js';

// Use a static key for simple obfuscation against casual inspection.
// Note: In a real frontend environment, true security requires backend validation.
const SECRET_KEY = 'ai_tutor_obfuscation_key_v1';

export const encryptData = (data) => {
  if (!data) return '';
  try {
    return CryptoJS.AES.encrypt(data, SECRET_KEY).toString();
  } catch (err) {
    console.error('Encryption failed', err);
    return '';
  }
};

export const decryptData = (cipherText) => {
  if (!cipherText) return '';
  try {
    const bytes = CryptoJS.AES.decrypt(cipherText, SECRET_KEY);
    return bytes.toString(CryptoJS.enc.Utf8);
  } catch (err) {
    console.error('Decryption failed', err);
    return '';
  }
};
