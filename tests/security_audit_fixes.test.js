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
test('Release integrity: .dockerignore includes lancedb and .env.example is clean UTF-8', () => {
  const rootDir = path.resolve(__dirname, '..');
  
  // Verify .dockerignore does not exclude data/lancedb/
  const dockerignore = fs.readFileSync(path.join(rootDir, '.dockerignore'), 'utf8');
  assert.strictEqual(dockerignore.includes('data/lancedb/'), false);

  // Verify .env.example contains no corrupted characters and defines ALLOWED_ORIGINS
  const exampleContent = fs.readFileSync(path.join(rootDir, '.env.example'), 'utf8');
  assert.strictEqual(exampleContent.includes('\uFFFD'), false);
  assert.strictEqual(exampleContent.includes('ALLOWED_ORIGINS='), true);

  // If local .env exists, verify it contains no replacement character
  const localEnvPath = path.join(rootDir, '.env');
  if (fs.existsSync(localEnvPath)) {
    const envContent = fs.readFileSync(localEnvPath, 'utf8');
    assert.strictEqual(envContent.includes('\uFFFD'), false);
  }
});

// Test 5: Rejection of legacy/backdoor token ait_ca1b...
test('Security Hardening: legacy token ait_ca1b... is strictly rejected', async () => {
  const previousAuth = process.env.REQUIRE_AUTH;
  try {
    process.env.REQUIRE_AUTH = 'true';
    const legacyToken = 'ait_ca1b54fffe5ac87ec1c65026ed0636aa7712941d053f3359f399e117200938a3';
    const res = await fetch(`${baseUrl}/api/system/network-info`, {
      headers: { 'Authorization': `Bearer ${legacyToken}` }
    });
    // If API_TOKEN happens to be set in .env, verify legacy token is rejected unless it was explicitly configured
    if (API_TOKEN !== legacyToken) {
      assert.strictEqual(res.status, 403);
    }
  } finally {
    process.env.REQUIRE_AUTH = previousAuth;
  }
});

// Test 6: CORS strictly rejects null origin and wildcard .onrender.com / .vercel.app
test('CORS: rejects null origin and arbitrary cloud subdomains', async () => {
  // 1. null origin
  const resNull = await fetch(`${baseUrl}/api/health`, {
    headers: { 'Origin': 'null' }
  });
  assert.notStrictEqual(resNull.headers.get('access-control-allow-origin'), 'null');

  // 2. arbitrary onrender subdomain
  const resRender = await fetch(`${baseUrl}/api/health`, {
    headers: { 'Origin': 'https://arbitrary-malicious-app.onrender.com' }
  });
  assert.notStrictEqual(resRender.headers.get('access-control-allow-origin'), 'https://arbitrary-malicious-app.onrender.com');

  // 3. arbitrary vercel subdomain
  const resVercel = await fetch(`${baseUrl}/api/health`, {
    headers: { 'Origin': 'https://phishing-site.vercel.app' }
  });
  assert.notStrictEqual(resVercel.headers.get('access-control-allow-origin'), 'https://phishing-site.vercel.app');
});

// Test 7: update-keys endpoint requires valid master authorization
test('Config Security: POST /api/config/update-keys requires master authorization', async () => {
  const previousAuth = process.env.REQUIRE_AUTH;
  try {
    process.env.REQUIRE_AUTH = 'true';
    const res = await fetch(`${baseUrl}/api/config/update-keys`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer wrong_unauthorized_token'
      },
      body: JSON.stringify({ deepseekApiUrl: 'https://evil.example.com' })
    });
    assert.strictEqual(res.status, 403);
  } finally {
    process.env.REQUIRE_AUTH = previousAuth;
  }
});
