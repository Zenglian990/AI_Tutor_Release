const { test, before, after } = require('node:test');
const assert = require('node:assert');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { createApp } = require('../server/app');
const { API_TOKEN } = require('../server/config');
const crypto = require('crypto');

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

// Test 1 (Item 2): CORS rejects unauthorized foreign origins
test('CORS: rejects unauthorized external origins', async () => {
  const res = await fetch(`${baseUrl}/api/health`, {
    headers: { 'Origin': 'https://evil-attacker.example.com' }
  });
  // When CORS rejects in Express, it returns 500 with CORS error or omits CORS headers
  const allowOrigin = res.headers.get('access-control-allow-origin');
  assert.notStrictEqual(allowOrigin, 'https://evil-attacker.example.com');
  assert.notStrictEqual(allowOrigin, '*');
});

// Test 2 (Item 3): Parent Remote View blocks IDOR profile switching
test('Parent Remote View: blocks IDOR profile switching to unauthorized student profile', async () => {
  const tokenRes = await fetch(`${baseUrl}/api/parent/remote-token?profile_id=child_alice`);
  const tokenData = await tokenRes.json();
  const token = tokenData.token;

  // Requesting switch_profile_id=child_bob must be blocked with 403
  const res = await fetch(`${baseUrl}/api/parent/remote-view?token=${token}&switch_profile_id=child_bob`);
  assert.strictEqual(res.status, 403);
  const data = await res.json();
  assert.ok(data.error.includes('无权访问其他学生'));
});

// Test 3 (Item 3 & 4): Auth middleware strictly rejects unauthorized access when REQUIRE_AUTH is true
test('Auth & Signature: rejects arbitrary tokens and protects sensitive endpoints', async () => {
  const previousAuth = process.env.REQUIRE_AUTH;
  try {
    process.env.REQUIRE_AUTH = 'true';

    // 1. Calling /api/system/network-info without token returns 401
    const resNoToken = await fetch(`${baseUrl}/api/system/network-info`);
    assert.strictEqual(resNoToken.status, 401);

    // 2. Calling with invalid token returns 403
    const resBadToken = await fetch(`${baseUrl}/api/system/network-info`, {
      headers: { 'Authorization': 'Bearer forged_token_12345' }
    });
    assert.strictEqual(resBadToken.status, 403);

    // 3. Calling /api/config/test-llm without token returns 401
    const resLlmNoToken = await fetch(`${baseUrl}/api/config/test-llm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider: 'deepseek' })
    });
    assert.strictEqual(resLlmNoToken.status, 401);

    // 4. Calling /api/system/network-info with valid API_TOKEN and valid HMAC signature succeeds
    const timestamp = Date.now().toString();
    const method = 'GET';
    const path = '/api/system/network-info';
    const msg = `${method}:${path}::${timestamp}::`;
    const signature = crypto.createHmac('sha256', API_TOKEN).update(msg).digest('hex');

    const resValid = await fetch(`${baseUrl}/api/system/network-info`, {
      headers: {
        'Authorization': `Bearer ${API_TOKEN}`,
        'x-timestamp': timestamp,
        'x-signature': signature
      }
    });
    assert.strictEqual(resValid.status, 200);
    const data = await resValid.json();
    assert.ok(data.lanIp);
  } finally {
    process.env.REQUIRE_AUTH = previousAuth;
  }
});

// Test 4 (Item 7 & 8): File isolation and encoding integrity checks
test('Release integrity: .dockerignore includes lancedb and .env is clean UTF-8', () => {
  const rootDir = path.resolve(__dirname, '..');
  
  // Verify .dockerignore does not exclude data/lancedb/
  const dockerignore = fs.readFileSync(path.join(rootDir, '.dockerignore'), 'utf8');
  assert.strictEqual(dockerignore.includes('data/lancedb/'), false);

  // Verify .env (or .env.example in CI runner where .env is gitignored) contains no corrupted characters
  const envPath = fs.existsSync(path.join(rootDir, '.env'))
    ? path.join(rootDir, '.env')
    : path.join(rootDir, '.env.example');
  const envContent = fs.readFileSync(envPath, 'utf8');
  assert.strictEqual(envContent.includes('\uFFFD'), false);
  assert.strictEqual(envContent.includes('ALLOWED_ORIGINS='), true);
});
