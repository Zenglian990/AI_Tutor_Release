const { test, before, after } = require('node:test');
const assert = require('node:assert');
const http = require('http');
const crypto = require('crypto');
const { createApp } = require('../server/app');
const { initDB, getSqliteDb, closeDB } = require('../server/db/init');
const { API_TOKEN } = require('../server/config');
const { generateParentSessionToken } = require('../server/utils/adminAuth');

let server;
let baseUrl;

before(async () => {
  await initDB();
  const db = getSqliteDb();
  if (db) {
    const testPinHash = crypto.createHash('sha256').update('975312').digest('hex');
    await db.run("INSERT OR REPLACE INTO system_settings (key, value) VALUES ('parent_pin_hash', ?)", [testPinHash]);
  }
  const app = createApp();
  await new Promise((resolve) => {
    server = http.createServer(app);
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      baseUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });
});

after(async () => {
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
  await closeDB();
});

test('GET /api/config/providers — returns provider status without leaking raw keys', async () => {
  const res = await fetch(`${baseUrl}/api/config/providers`);
  assert.strictEqual(res.status, 200);
  const data = await res.json();

  assert.ok('gemini' in data);
  assert.ok('deepseek' in data);
  assert.strictEqual(typeof data.gemini.configured, 'boolean');
  assert.strictEqual(typeof data.deepseek.configured, 'boolean');
});

test('POST /api/config/test-llm — handles empty body safely without 500 error', async () => {
  const res = await fetch(`${baseUrl}/api/config/test-llm`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({})
  });

  assert.strictEqual(res.status, 400);
  const data = await res.json();
  assert.strictEqual(data.success, false);
  assert.ok(data.error.includes('未知的提供商类型'));
});

test('POST /api/config/test-llm — rejects invalid provider cleanly', async () => {
  const res = await fetch(`${baseUrl}/api/config/test-llm`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ provider: 'unknown_provider' })
  });

  assert.strictEqual(res.status, 400);
  const data = await res.json();
  assert.strictEqual(data.success, false);
  assert.ok(data.error.includes('未知的提供商类型'));
});

test('POST /api/config/test-llm — returns friendly diagnostic when Jev key is missing', async () => {
  const res = await fetch(`${baseUrl}/api/config/test-llm`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ provider: 'jev', apiKey: '' })
  });

  assert.strictEqual(res.status, 200);
  const data = await res.json();
  assert.strictEqual(data.success, false);
  assert.ok(data.error.includes('缺少 TypeSafe (Jev) API Key'));
  assert.ok(data.details.includes('TypeSafe'));
});

test('POST /api/config/test-llm — Gemini diagnostic returns HTTP 200 (never 500) even on invalid key', async () => {
  const res = await fetch(`${baseUrl}/api/config/test-llm`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ provider: 'gemini', apiKey: 'AIzaSy_Invalid_Mock_Key_For_Diagnostic' })
  });

  // Diagnostic tool endpoint must always return 200 with structured diagnostic data
  assert.strictEqual(res.status, 200);
  const data = await res.json();
  assert.strictEqual(data.success, false);
  assert.ok(typeof data.error === 'string' && data.error.length > 0);
  assert.strictEqual(data.provider, 'gemini');
  assert.ok(typeof data.latencyMs === 'number');
});

test('POST /api/config/test-llm — DeepSeek diagnostic returns HTTP 200 (never 500) even on invalid key', async () => {
  const res = await fetch(`${baseUrl}/api/config/test-llm`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ provider: 'deepseek', apiKey: 'sk-invalidmockkey1234567890' })
  });

  assert.strictEqual(res.status, 200);
  const data = await res.json();
  assert.strictEqual(data.success, false);
  assert.ok(typeof data.error === 'string' && data.error.length > 0);
  assert.strictEqual(data.provider, 'deepseek');
  assert.ok(typeof data.latencyMs === 'number');
});

test('POST /api/config/update-keys — safely accepts update payload with valid Bearer token', async () => {
  const res = await fetch(`${baseUrl}/api/config/update-keys`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${API_TOKEN}`
    },
    body: JSON.stringify({ deepseekApiUrl: 'https://api.deepseek.com/v1' })
  });

  assert.strictEqual(res.status, 200);
  const data = await res.json();
  assert.strictEqual(data.success, true);
});

test('POST /api/config/update-keys — rejects weak PIN (888888) and authorizes via valid session token', async () => {
  const weakPinHash = crypto.createHash('sha256').update('888888').digest('hex');

  // 1. Weak PIN must be strictly rejected
  const rejectRes = await fetch(`${baseUrl}/api/config/update-keys`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-parent-pin-hash': weakPinHash
    },
    body: JSON.stringify({ deepseekApiUrl: 'https://api.deepseek.com/v1' })
  });
  assert.strictEqual(rejectRes.status, 403);

  // 2. Valid Parent Session Token must be accepted
  const sessionToken = generateParentSessionToken('admin', 300);
  const authRes = await fetch(`${baseUrl}/api/config/update-keys`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-parent-session-token': sessionToken
    },
    body: JSON.stringify({ deepseekApiUrl: 'https://api.deepseek.com/v1' })
  });

  assert.strictEqual(authRes.status, 200);
  const data = await authRes.json();
  assert.strictEqual(data.success, true);
});

test('POST /api/membership/admin/generate-keys — rejects weak PIN and authorizes license generation via session token', async () => {
  const weakPinHash = crypto.createHash('sha256').update('888888').digest('hex');

  // 1. Weak PIN must be rejected
  const rejectRes = await fetch(`${baseUrl}/api/membership/admin/generate-keys`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-parent-pin-hash': weakPinHash
    },
    body: JSON.stringify({
      count: 2,
      days: 30,
      batch_name: '测试批次',
      pin_hash: weakPinHash
    })
  });
  assert.strictEqual(rejectRes.status, 403);

  // 2. Valid Session Token authorizes generation
  const sessionToken = generateParentSessionToken('admin', 300);
  const authRes = await fetch(`${baseUrl}/api/membership/admin/generate-keys`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-parent-session-token': sessionToken
    },
    body: JSON.stringify({
      count: 2,
      days: 30,
      batch_name: '曾先生测试批次'
    })
  });

  assert.strictEqual(authRes.status, 200);
  const data = await authRes.json();
  assert.strictEqual(data.success, true);
  assert.strictEqual(data.keys.length, 2);
});
