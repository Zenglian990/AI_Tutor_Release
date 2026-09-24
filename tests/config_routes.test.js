const { test, before, after } = require('node:test');
const assert = require('node:assert');
const http = require('http');
const crypto = require('crypto');
const { createApp } = require('../server/app');
const { initDB, closeDB } = require('../server/db/init');
const { API_TOKEN } = require('../server/config');

let server;
let baseUrl;

before(async () => {
  await initDB();
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

test('POST /api/config/update-keys — authorizes admin via master PIN hash (曾先生 888888)', async () => {
  const masterPinHash = crypto.createHash('sha256').update('888888').digest('hex');

  const res = await fetch(`${baseUrl}/api/config/update-keys`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-parent-pin-hash': masterPinHash
    },
    body: JSON.stringify({ deepseekApiUrl: 'https://api.deepseek.com/v1' })
  });

  assert.strictEqual(res.status, 200);
  const data = await res.json();
  assert.strictEqual(data.success, true);
});

test('POST /api/membership/admin/generate-keys — authorizes license generation via master PIN hash', async () => {
  const masterPinHash = crypto.createHash('sha256').update('888888').digest('hex');

  const res = await fetch(`${baseUrl}/api/membership/admin/generate-keys`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-parent-pin-hash': masterPinHash
    },
    body: JSON.stringify({
      count: 2,
      days: 30,
      batch_name: '曾先生测试批次',
      pin_hash: masterPinHash
    })
  });

  assert.strictEqual(res.status, 200);
  const data = await res.json();
  assert.strictEqual(data.success, true);
  assert.strictEqual(data.keys.length, 2);
});
