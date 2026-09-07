const { test, before, after } = require('node:test');
const assert = require('node:assert');
const http = require('http');
const { createApp } = require('../server/app');

let server;
let baseUrl;

before((_, done) => {
  const app = createApp();
  server = http.createServer(app);
  server.listen(0, '127.0.0.1', () => {
    const port = server.address().port;
    baseUrl = `http://127.0.0.1:${port}`;
    done();
  });
});

after((_, done) => {
  if (server) {
    server.close(done);
  } else {
    done();
  }
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

test('POST /api/config/update-keys — safely accepts update payload', async () => {
  const res = await fetch(`${baseUrl}/api/config/update-keys`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ deepseekApiUrl: 'https://api.deepseek.com/v1' })
  });

  assert.strictEqual(res.status, 200);
  const data = await res.json();
  assert.strictEqual(data.success, true);
});
