import CryptoJS from 'crypto-js';

// Legacy keys kept ONLY for backwards compatibility so existing users don't get logged out.
// [SECURITY NOTE]: Frontend static key encryption is inherently insecure against XSS.
// We have moved to base64 encoding to prevent false sense of security while maintaining shoulder-surfing obfuscation.
const SECRET_KEY = CryptoJS.enc.Utf8.parse('ai_tutor_obfuscation_key_v1'.padEnd(32, '0'));

export const encryptData = (data) => {
  if (!data) return '';
  try {
    // btoa might not be available in old Android WebView, fallback to CryptoJS
    if (typeof btoa !== 'undefined') {
      return 'b64:' + btoa(encodeURIComponent(data));
    }
    const utf8Str = CryptoJS.enc.Utf8.parse(encodeURIComponent(data));
    return 'b64:' + CryptoJS.enc.Base64.stringify(utf8Str);
  } catch (err) {
    console.error('Encoding failed', err);
    return '';
  }
};

export const decryptData = (cipherText) => {
  if (!cipherText) return '';
  
  if (cipherText.startsWith('b64:')) {
    try {
      const b64Str = cipherText.substring(4);
      if (typeof atob !== 'undefined') {
        return decodeURIComponent(atob(b64Str));
      }
      const utf8Str = CryptoJS.enc.Base64.parse(b64Str);
      return decodeURIComponent(CryptoJS.enc.Utf8.stringify(utf8Str));
    } catch (err) {
      return '';
    }
  }

  // Legacy decryption for backwards compatibility
  try {
    const parts = cipherText.split(':');
    if (parts.length !== 2) {
      // Fallback for old ECB encrypted data
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
