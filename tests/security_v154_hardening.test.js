const { test, before, after, describe } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
process.env.NODE_ENV = 'development';

const { createApp } = require('../server/app');
const { initDB, getSqliteDb, closeDB } = require('../server/db/init');
const { isAllowedDeepseekUrl } = require('../server/utils/urlValidator');
const { isSafeLocalPrinterHost } = require('../server/services/printerService');
const { 
  generateParentSessionToken, 
  verifyParentSessionToken, 
  isWeakPinHash, 
  isVerifiedAdminRequest 
} = require('../server/utils/adminAuth');

let app;
let server;
let baseUrl;
let db;

before(async () => {
  await initDB();
  db = getSqliteDb();

  app = createApp();
  await new Promise((resolve) => {
    server = app.listen(0, () => {
      const port = server.address().port;
      baseUrl = `http://localhost:${port}`;
      resolve();
    });
  });
});

after(async () => {
  if (db) {
    await db.run("DELETE FROM chat_history WHERE profile_id LIKE 'test_hygiene_%'");
  }
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
  await closeDB();
});

describe('1. Weak PIN & 888888 Backdoor Defenses', () => {
  const hash888888 = crypto.createHash('sha256').update('888888').digest('hex');
  const hash000000 = crypto.createHash('sha256').update('000000').digest('hex');
  const strongHash = crypto.createHash('sha256').update('975312').digest('hex');

  test('isWeakPinHash accurately identifies 888888 and 000000 hashes', () => {
    assert.equal(isWeakPinHash(hash888888), true);
    assert.equal(isWeakPinHash(hash000000), true);
    assert.equal(isWeakPinHash(strongHash), false);
  });

  test('POST /api/admin/pin strictly rejects weak PIN hashes', async () => {
    const res = await fetch(`${baseUrl}/api/admin/pin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin_hash: hash888888 })
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.match(body.error, /弱口令/);
  });

  test('POST /api/admin/verify-pin strictly rejects weak PIN verification attempts', async () => {
    const res = await fetch(`${baseUrl}/api/admin/verify-pin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin_hash: hash888888 })
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.valid, false);
  });

  test('POST /api/parent/auth-session rejects weak PIN and returns 400', async () => {
    const res = await fetch(`${baseUrl}/api/parent/auth-session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin_hash: hash000000 })
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.success, false);
  });

  test('Setting strong PIN succeeds and issues valid parent session token', async () => {
    const setRes = await fetch(`${baseUrl}/api/admin/pin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin_hash: strongHash })
    });
    assert.equal(setRes.status, 200);
    const setBody = await setRes.json();
    assert.equal(setBody.success, true);

    const verifyRes = await fetch(`${baseUrl}/api/admin/verify-pin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin_hash: strongHash })
    });
    assert.equal(verifyRes.status, 200);
    const verifyBody = await verifyRes.json();
    assert.equal(verifyBody.valid, true);
    assert.equal(typeof verifyBody.session_token, 'string');
    assert.ok(verifyBody.session_token.length > 20);

    const verified = verifyParentSessionToken(verifyBody.session_token);
    assert.ok(verified !== null);
    assert.equal(verified.profileId, 'admin');
  });
});

describe('2. DeepSeek API URL Whitelist Strictness (new URL parser)', () => {
  test('Allows genuine official HTTPS endpoints', () => {
    assert.equal(isAllowedDeepseekUrl('https://api.deepseek.com'), true);
    assert.equal(isAllowedDeepseekUrl('https://api.deepseek.com/'), true);
    assert.equal(isAllowedDeepseekUrl('https://api.deepseek.com/v1'), true);
    assert.equal(isAllowedDeepseekUrl('https://api.deepseek.com/v1/'), true);
  });

  test('Rejects credential / userinfo spoofing (api.deepseek.com@evil.com)', () => {
    assert.equal(isAllowedDeepseekUrl('https://api.deepseek.com@evil.com'), false);
    assert.equal(isAllowedDeepseekUrl('https://api.deepseek.com:password@evil.com'), false);
  });

  test('Rejects subdomain / suffix attacks', () => {
    assert.equal(isAllowedDeepseekUrl('https://api.deepseek.com.attacker.com'), false);
    assert.equal(isAllowedDeepseekUrl('https://fakeapi.deepseek.com'), false);
    assert.equal(isAllowedDeepseekUrl('https://evil-api.deepseek.com'), false);
  });

  test('Rejects non-HTTPS protocols and custom ports', () => {
    assert.equal(isAllowedDeepseekUrl('http://api.deepseek.com'), false);
    assert.equal(isAllowedDeepseekUrl('ftp://api.deepseek.com'), false);
    assert.equal(isAllowedDeepseekUrl('https://api.deepseek.com:8443'), false);
    assert.equal(isAllowedDeepseekUrl('https://api.deepseek.com:9000/v1'), false);
  });

  test('Rejects unexpected path endpoints', () => {
    assert.equal(isAllowedDeepseekUrl('https://api.deepseek.com/admin/leak'), false);
    assert.equal(isAllowedDeepseekUrl('https://api.deepseek.com/v2/chat'), false);
  });
});

describe('3. Printer Host & SSRF Hardening', () => {
  test('Strictly rejects cloud metadata IP (169.254.169.254)', () => {
    assert.equal(isSafeLocalPrinterHost('169.254.169.254'), false);
    assert.equal(isSafeLocalPrinterHost('169.254.1.1'), false);
  });

  test('Strictly rejects external internet domains and IPs', () => {
    assert.equal(isSafeLocalPrinterHost('google.com'), false);
    assert.equal(isSafeLocalPrinterHost('8.8.8.8'), false);
    assert.equal(isSafeLocalPrinterHost('evil.attacker.org'), false);
  });

  test('Rejects broadcast and zero IP', () => {
    assert.equal(isSafeLocalPrinterHost('0.0.0.0'), false);
    assert.equal(isSafeLocalPrinterHost('255.255.255.255'), false);
  });

  test('Accepts valid RFC 1918 LAN IPs and loopback', () => {
    assert.equal(isSafeLocalPrinterHost('192.168.1.100'), true);
    assert.equal(isSafeLocalPrinterHost('10.0.0.1'), true);
    assert.equal(isSafeLocalPrinterHost('172.16.1.50'), true);
    assert.equal(isSafeLocalPrinterHost('127.0.0.1'), true);
    assert.equal(isSafeLocalPrinterHost('localhost'), true);
  });
});

describe('4. Parent Session Token Authentication', () => {
  test('Valid parent session token authenticates isVerifiedAdminRequest', async () => {
    const sessionToken = generateParentSessionToken('test_profile', 300);
    const fakeReq = {
      headers: {
        'x-parent-session-token': sessionToken
      }
    };
    const result = await isVerifiedAdminRequest(fakeReq);
    assert.equal(result, true);
  });

  test('Bearer parent session token in Authorization header authenticates isVerifiedAdminRequest', async () => {
    const sessionToken = generateParentSessionToken('admin_user', 300);
    const fakeReq = {
      headers: {
        'authorization': `Bearer ${sessionToken}`
      }
    };
    const result = await isVerifiedAdminRequest(fakeReq);
    assert.equal(result, true);
  });

  test('Tampered or forged session token fails authentication', async () => {
    const sessionToken = generateParentSessionToken('admin', 300);
    const tampered = sessionToken.slice(0, -6) + 'abcdef';
    const fakeReq = {
      headers: {
        'x-parent-session-token': tampered
      }
    };
    const result = await isVerifiedAdminRequest(fakeReq);
    assert.equal(result, false);
  });

  test('Weak PIN hash header is strictly rejected by isVerifiedAdminRequest', async () => {
    const weakHash = crypto.createHash('sha256').update('888888').digest('hex');
    const fakeReq = {
      headers: {
        'x-parent-pin-hash': weakHash
      }
    };
    const result = await isVerifiedAdminRequest(fakeReq);
    assert.equal(result, false);
  });
});

describe('5. Chat History Data Hygiene & Transient Isolation', () => {
  const testProfile = `test_hygiene_${Date.now()}`;

  test('Omits transient offline messages and strips bloated base64 images', async () => {
    const messages = [
      {
        role: 'user',
        text: '老师请看这道题：data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg== 求解'
      },
      {
        role: 'ai',
        text: '这是离线备用思考模板回答',
        isTransient: true // should NOT be saved
      },
      {
        role: 'ai',
        text: '真正的名师启发引导步骤一...'
      }
    ];

    const res = await fetch(`${baseUrl}/api/chat-history`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        profile_id: testProfile,
        grade: '7_up',
        subject: '数学',
        messages
      })
    });

    assert.equal(res.status, 200);

    // Verify in SQLite database
    const rows = await db.all(
      'SELECT role, text FROM chat_history WHERE profile_id = ? ORDER BY id ASC',
      [testProfile]
    );

    // Should only have 2 rows (transient one excluded)
    assert.equal(rows.length, 2);

    // Decrypt and verify contents
    const { decryptField } = require('../server/utils/crypto');
    const userText = decryptField(rows[0].text);
    const aiText = decryptField(rows[1].text);

    assert.ok(userText.includes('[题目图片]'));
    assert.equal(userText.includes('data:image/png;base64'), false);
    assert.equal(aiText, '真正的名师启发引导步骤一...');
  });
});

describe('6. Anti-Cheat Supervision Lock Endpoint', () => {
  test('GET /api/admin/anti-cheat returns locked status', async () => {
    const res = await fetch(`${baseUrl}/api/admin/anti-cheat`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(typeof body.locked, 'boolean');
  });

  test('POST /api/admin/anti-cheat without admin credentials returns 403', async () => {
    const res = await fetch(`${baseUrl}/api/admin/anti-cheat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ locked: true })
    });
    assert.equal(res.status, 403);
  });

  test('POST /api/admin/anti-cheat with valid session token succeeds', async () => {
    const sessionToken = generateParentSessionToken('admin', 300);
    const res = await fetch(`${baseUrl}/api/admin/anti-cheat`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'x-parent-session-token': sessionToken
      },
      body: JSON.stringify({ locked: true })
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(body.locked, true);

    const statusRes = await fetch(`${baseUrl}/api/admin/anti-cheat`);
    const statusBody = await statusRes.json();
    assert.equal(statusBody.locked, true);
  });
});
