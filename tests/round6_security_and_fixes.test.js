/**
 * 第六轮全量修复核心红线回归测试（v1.7.6）
 * 覆盖：
 * 1. Android Capacitor APK (Origin: https://localhost) 生产模式 CORS 放通，同时严禁恶意外部源
 * 2. 家庭家长安全锁与站长超管双锁彻底解耦（家庭锁无需 ADMIN_SETUP_SECRET，密保错误严禁放行）
 * 3. 站长密钥直登 (/api/admin/secret-login) 手机端免 PIN 一键签发管理员会话
 * 4. 普通用户调用 /api/config/test-llm 不再遭 403 误拦，但绝不允许白嫖服务端环境变量 Key
 * 5. 匿名新访客自动分配独立 stu_* 档案，互不挤爆每日免费额度
 * 6. 费曼离线兜底严禁把“高锰酸钾”机械抠出单字“酸”
 */
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const crypto = require('crypto');

const sha256 = (str) => crypto.createHash('sha256').update(str).digest('hex');

describe('Round 6 Security, Android CORS & Dual-Lock Regression Suite (v1.7.6)', () => {
  let server;
  let baseUrl;
  const origEnv = { ...process.env };

  before(async () => {
    process.env.NODE_ENV = 'production';
    process.env.CLOUD_PUBLIC_MODE = 'true';
    delete process.env.REQUIRE_AUTH;
    process.env.ADMIN_SETUP_SECRET = 'round6-test-setup-secret-998877';
    process.env.API_TOKEN = 'round6-master-api-token-abcdefghijklmnop123456';
    process.env.GEMINI_API_KEY = '';
    process.env.ENFORCE_QUOTA = 'false';

    // 清理可能被前置测试缓存的模块，确保按最新生产环境变量初始化
    for (const k of Object.keys(require.cache)) {
      if (k.includes('server\\') || k.includes('server/')) {
        delete require.cache[k];
      }
    }

    const { initSqlite } = require('../server/db/init');
    await initSqlite();
    const { createApp } = require('../server/app');
    const app = createApp();
    await new Promise((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        baseUrl = `http://127.0.0.1:${server.address().port}`;
        resolve();
      });
    });
  });

  after(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    Object.keys(process.env).forEach((k) => {
      if (!(k in origEnv)) delete process.env[k];
    });
    Object.assign(process.env, origEnv);
  });

  it('allows Android Capacitor Origin https://localhost in production CORS while blocking untrusted origins', async () => {
    const androidRes = await fetch(`${baseUrl}/api/admin/pin-status`, {
      method: 'GET',
      headers: { Origin: 'https://localhost' }
    });
    assert.strictEqual(androidRes.status, 200);
    assert.strictEqual(androidRes.headers.get('access-control-allow-origin'), 'https://localhost');

    const evilRes = await fetch(`${baseUrl}/api/admin/pin-status`, {
      method: 'GET',
      headers: { Origin: 'https://evil-attacker.example.com' }
    });
    assert.strictEqual(evilRes.status, 403);
  });

  it('issues isolated stu_* profile IDs per anonymous device instead of sharing default bucket', async () => {
    const r1 = await fetch(`${baseUrl}/api/auth/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prefer_default: true })
    });
    const d1 = await r1.json();
    const r2 = await fetch(`${baseUrl}/api/auth/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prefer_default: true })
    });
    const d2 = await r2.json();

    assert.strictEqual(r1.status, 200);
    assert.strictEqual(r2.status, 200);
    assert.match(d1.profile_id, /^stu_[a-f0-9]+$/);
    assert.match(d2.profile_id, /^stu_[a-f0-9]+$/);
    assert.notStrictEqual(d1.profile_id, d2.profile_id);
  });

  it('decouples family parental lock from ADMIN_SETUP_SECRET and blocks wrong security answer reset', async () => {
    const sessRes = await fetch(`${baseUrl}/api/auth/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    const sess = await sessRes.json();
    const headers = {
      'Content-Type': 'application/json',
      'X-Student-Session-Token': sess.session_token
    };

    const statusBefore = await (await fetch(`${baseUrl}/api/family/pin-status?profile_id=${sess.profile_id}`, { headers })).json();
    assert.strictEqual(statusBefore.requires_setup_secret, false);
    assert.strictEqual(statusBefore.needs_setup, true);

    const pinHash = sha256('246810');
    const secHash = `birth_city:${sha256('chengdu')}`;

    // 首次设置家庭锁无需 ADMIN_SETUP_SECRET
    const setRes = await fetch(`${baseUrl}/api/family/pin`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ profile_id: sess.profile_id, pin_hash: pinHash, security_answer_hash: secHash })
    });
    assert.strictEqual(setRes.status, 200);

    // 验证正确 PIN 通过
    const verifyOk = await fetch(`${baseUrl}/api/family/verify-pin`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ profile_id: sess.profile_id, pin_hash: pinHash })
    });
    assert.strictEqual(verifyOk.status, 200);

    // 随便填错误密保答案必须坚决返 401，绝不允许绕过
    const badReset = await fetch(`${baseUrl}/api/family/reset-pin`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        profile_id: sess.profile_id,
        question_id: 'birth_city',
        answer_hash: sha256('wrong_city'),
        new_pin_hash: sha256('135790')
      })
    });
    assert.strictEqual(badReset.status, 401);

    // 正确密保答案可重置成功
    const goodReset = await fetch(`${baseUrl}/api/family/reset-pin`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        profile_id: sess.profile_id,
        question_id: 'birth_city',
        answer_hash: sha256('chengdu'),
        new_pin_hash: sha256('135790')
      })
    });
    assert.strictEqual(goodReset.status, 200);
  });

  it('supports admin secret-login for instant mobile console unlock without PIN deadlock', async () => {
    const badLogin = await fetch(`${baseUrl}/api/admin/secret-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret: 'wrong-secret' })
    });
    assert.strictEqual(badLogin.status, 401);

    const okLogin = await fetch(`${baseUrl}/api/admin/secret-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret: 'round6-test-setup-secret-998877' })
    });
    const okData = await okLogin.json();
    assert.strictEqual(okLogin.status, 200);
    assert.strictEqual(okData.valid, true);
    assert.ok(okData.session_token);
  });

  it('allows normal student to call /api/config/test-llm without 403 while refusing server env key fallback', async () => {
    const sessRes = await fetch(`${baseUrl}/api/auth/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    const sess = await sessRes.json();

    const testRes = await fetch(`${baseUrl}/api/config/test-llm`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Student-Session-Token': sess.session_token
      },
      body: JSON.stringify({ provider: 'gemini', apiKey: '' })
    });
    const testData = await testRes.json();
    // 普通用户不再遭 403 拦截，但未传自己的 Key 绝不会回退测试服务端密钥
    assert.strictEqual(testRes.status, 200);
    assert.strictEqual(testData.success, false);
    assert.match(testData.error, /缺少 Gemini API Key/);
  });

  it('prevents Feynman fallback from matching single char 酸 inside 高锰酸钾', () => {
    const { evaluateFeynmanExplanation } = require('../server/routes/feynman');
    const res = evaluateFeynmanExplanation({
      question: '高锰酸钾加热制取氧气的注意事项有哪些？',
      explanation: '首先我们要把高锰酸钾放进试管底部，因为加热会产生冷凝水，所以试管口要略向下倾斜防止炸裂。',
      studentName: '小明',
      subject: '化学'
    });
    assert.ok(!res.key_points_covered.includes('酸'), 'Must not extract single char 酸 from 高锰酸钾');
    assert.ok(!res.follow_up_question.includes('【酸】'), 'Follow-up must not ask about single char 酸');
  });
});
