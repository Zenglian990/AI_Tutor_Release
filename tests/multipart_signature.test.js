const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');

// Force signature check logic to run by enabling REQUIRE_AUTH before importing middlewares
process.env.REQUIRE_AUTH = 'true';

const { signatureMiddleware, verifyMultipartIntegrity } = require('../server/middleware/signature');
const { API_TOKEN } = require('../server/config');

// Helper to generate a valid signature for a request mockup
function generateSig(method, path, bodyStr, timestamp, formFieldsStr, fileFieldsStr) {
  const msg = `${method}:${path}:${bodyStr}:${timestamp}:${formFieldsStr}:${fileFieldsStr}`;
  const hmac = crypto.createHmac('sha256', API_TOKEN);
  hmac.update(msg);
  return hmac.digest('hex');
}

test('Multipart Signature: passes with valid signature and matching fields', () => {
  const timestamp = Date.now().toString();
  const formFields = { profile_id: 'p_12345', grade: '7_up' };
  const formFieldsStr = encodeURIComponent(JSON.stringify(formFields));
  const fileFieldsStr = encodeURIComponent('file:test.png:1024'); // fieldname:filename:size
  
  // For multipart request, the raw body before Multer runs is empty, so bodyStr in signature is ''
  const signature = generateSig('POST', '/api/chat-vision', '', timestamp, formFieldsStr, fileFieldsStr);

  const req = {
    method: 'POST',
    path: '/api/chat-vision',
    originalUrl: '/api/chat-vision?query=123',
    ip: '192.168.1.100', // Non-localhost IP to trigger verification
    headers: {
      'x-timestamp': timestamp,
      'x-signature': signature,
      'x-form-fields': formFieldsStr,
      'x-file-fields': fileFieldsStr
    },
    body: {}, // Empty before Multer runs
    files: [
      { fieldname: 'file', originalname: 'test.png', size: 1024 }
    ]
  };

  let signaturePassed = false;
  let integrityPassed = false;

  const res = {
    status: (code) => {
      return {
        json: (data) => {
          throw new Error(`Should not fail. Status: ${code}, Data: ${JSON.stringify(data)}`);
        }
      };
    }
  };

  // Run signature check
  signatureMiddleware(req, res, () => {
    signaturePassed = true;
  });

  // Simulate Multer running and parsing the body fields
  req.body = formFields;

  // Run integrity check
  verifyMultipartIntegrity(req, res, () => {
    integrityPassed = true;
  });

  assert.ok(signaturePassed, 'Signature middleware should call next()');
  assert.ok(integrityPassed, 'verifyMultipartIntegrity middleware should call next()');
});

test('Multipart Signature: fails when body fields do not match signature header', () => {
  const timestamp = Date.now().toString();
  const formFieldsStr = encodeURIComponent(JSON.stringify({ profile_id: 'p_12345' }));
  const fileFieldsStr = encodeURIComponent('file:test.png:1024');
  
  const signature = generateSig('POST', '/api/chat-vision', '', timestamp, formFieldsStr, fileFieldsStr);

  const req = {
    method: 'POST',
    path: '/api/chat-vision',
    originalUrl: '/api/chat-vision',
    ip: '192.168.1.100',
    headers: {
      'x-timestamp': timestamp,
      'x-signature': signature,
      'x-form-fields': formFieldsStr,
      'x-file-fields': fileFieldsStr
    },
    body: {}, // Empty before Multer runs
    files: [
      { fieldname: 'file', originalname: 'test.png', size: 1024 }
    ]
  };

  let statusCalled = null;
  let errorJson = null;

  const res = {
    status: (code) => {
      statusCalled = code;
      return {
        json: (data) => {
          errorJson = data;
        }
      };
    }
  };

  signatureMiddleware(req, res, () => {
    // Simulate Multer parsing a tampered body
    req.body = { profile_id: 'tampered_profile_id' };

    verifyMultipartIntegrity(req, res, () => {
      throw new Error('Should not pass integrity check');
    });
  });

  assert.equal(statusCalled, 400);
  assert.ok(errorJson.error.includes('body fields mismatch'));
});

test('Multipart Signature: fails when file size does not match signature header', () => {
  const timestamp = Date.now().toString();
  const formFieldsStr = encodeURIComponent(JSON.stringify({ profile_id: 'p_12345' }));
  const fileFieldsStr = encodeURIComponent('file:test.png:1024');
  
  const signature = generateSig('POST', '/api/chat-vision', '', timestamp, formFieldsStr, fileFieldsStr);

  const req = {
    method: 'POST',
    path: '/api/chat-vision',
    originalUrl: '/api/chat-vision',
    ip: '192.168.1.100',
    headers: {
      'x-timestamp': timestamp,
      'x-signature': signature,
      'x-form-fields': formFieldsStr,
      'x-file-fields': fileFieldsStr
    },
    body: {}, // Empty before Multer runs
    files: [
      { fieldname: 'file', originalname: 'test.png', size: 99999 } // Tampered size
    ]
  };

  let statusCalled = null;
  let errorJson = null;

  const res = {
    status: (code) => {
      statusCalled = code;
      return {
        json: (data) => {
          errorJson = data;
        }
      };
    }
  };

  signatureMiddleware(req, res, () => {
    // Simulate Multer parsing valid body
    req.body = { profile_id: 'p_12345' };

    verifyMultipartIntegrity(req, res, () => {
      throw new Error('Should not pass integrity check');
    });
  });

  assert.equal(statusCalled, 400);
  assert.ok(errorJson.error.includes('file mismatch'));
});
