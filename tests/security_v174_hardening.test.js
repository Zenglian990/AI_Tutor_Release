const { test, before, after } = require('node:test');
const assert = require('node:assert');
const crypto = require('crypto');
const http = require('http');

const { initSqlite, getSqliteDb } = require('../server/db/init');
const { createApp } = require('../server/app');
const jev = require('../server/services/jevDecisionService');
const { computeQuestionFingerprint, lookupCanonicalQuestion, seedCanonicalQuestionsIfEmpty } = require('../server/services/canonicalQuestions');
const { computeCampaignRoadmap } = require('../server/services/campaignRoadmap');

let server;
let baseUrl;
const origEnv = { ...process.env };

before(async () => {
  await initSqlite();
  const app = createApp();
  server = http.createServer(app);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  Object.assign(process.env, origEnv);
  if (server) await new Promise(resolve => server.close(resolve));
});

test('Security v1.7.4: POST /api/mistakes/mark rejects system API key error text & XSS image_url', async () => {
  const errRes = await fetch(`${baseUrl}/api/mistakes/mark`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: '鸡兔同笼',
      answer: '未检测到可用大模型 API Key，请点击右上角设置 (⚙️) 配置有效密钥。',
      grade: '4_up',
      subject: '数学',
      profile_id: 'sec_test_1'
    })
  });
  assert.strictEqual(errRes.status, 400);

  const xssRes = await fetch(`${baseUrl}/api/mistakes/mark`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: '1+1=?',
      answer: '等于 2',
      grade: '1_up',
      subject: '数学',
      profile_id: 'sec_test_1',
      image_url: 'javascript:alert(document.domain)'
    })
  });
  assert.strictEqual(xssRes.status, 400);
});

test('Security v1.7.4: POST /api/admin/pin requires setup secret in production when unconfigured', async () => {
  const prevNodeEnv = process.env.NODE_ENV;
  const prevReqAuth = process.env.REQUIRE_AUTH;
  const db = getSqliteDb();
  await db.run("DELETE FROM system_settings WHERE key = 'parent_pin_hash'");
  process.env.NODE_ENV = 'production';
  process.env.REQUIRE_AUTH = 'true';

  try {
    const validPinHash = crypto.createHash('sha256').update('246813').digest('hex');
    const res = await fetch(`${baseUrl}/api/admin/pin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin_hash: validPinHash })
    });
    assert.ok([401, 403].includes(res.status), `Expected 401 or 403, got ${res.status}`);
  } finally {
    process.env.NODE_ENV = prevNodeEnv;
    process.env.REQUIRE_AUTH = prevReqAuth;
  }
});

test('Security v1.7.4: Forged self-signed HMAC signature cannot bypass signatureMiddleware', async () => {
  const prevReqAuth = process.env.REQUIRE_AUTH;
  process.env.REQUIRE_AUTH = 'true';

  try {
    const attackerKey = 'attacker-forged-bearer-token-999';
    const ts = String(Date.now());
    const reqPath = '/api/stats';
    const msg = `GET:${reqPath}::${ts}::`;
    const forgedSig = crypto.createHmac('sha256', attackerKey).update(msg).digest('hex');

    const res = await fetch(`${baseUrl}${reqPath}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${attackerKey}`,
        'x-timestamp': ts,
        'x-signature': forgedSig
      }
    });
    assert.strictEqual(res.status, 401);
  } finally {
    process.env.REQUIRE_AUTH = prevReqAuth;
  }
});

test('Pedagogy v1.7.4: Jev LocalHeuristic does not misclassify math word problems (买菜) or English (自我介绍/天气) as off_topic', async () => {
  const heuristic = new jev.LocalHeuristicClient();
  const r1 = await heuristic.systemOne({
    state: { question: '妈妈去买菜花了15元，买水果花了20元，一共花了多少钱？', grade: '2_up', subject: '数学' },
    questions: { route: true }
  });
  assert.notStrictEqual(r1.route.value, 'off_topic');

  const r2 = await heuristic.systemOne({
    state: { question: '请教我如何用英语做个自我介绍和描述今日天气', grade: '7_up', subject: '英语' },
    questions: { route: true }
  });
  assert.notStrictEqual(r2.route.value, 'off_topic');
});

test('K12 Grounding v1.7.4: fingerprint preserves math inside parentheses & imports Gaokao math questions', async () => {
  const fp1 = computeQuestionFingerprint('已知函数 y = 2(x - 3)^2 + 5，求顶点坐标');
  const fp2 = computeQuestionFingerprint('已知函数 y = 2(x + 99)^2 + 5，求顶点坐标');
  assert.notStrictEqual(fp1, fp2, 'Parenthesized math expressions must NOT collide in fingerprint');

  const db = getSqliteDb();
  await seedCanonicalQuestionsIfEmpty(db);
  const gkRow = await db.get("SELECT COUNT(*) as cnt FROM canonical_questions WHERE grade = '12_up' AND chapter = '高考数学真题'");
  assert.ok(gkRow && gkRow.cnt >= 100, `Expected >=100 Gaokao math questions imported, got ${gkRow?.cnt}`);

  // Different numbers should NOT fuzzy-match unrelated canonical question
  const falseHit = await lookupCanonicalQuestion('把99个边长77cm的正方形拼成一个长方形，周长是多少？', '3_up', '数学', db);
  assert.strictEqual(falseHit, null);
});

test('K12 High School v1.7.4: campaignRoadmap uses 150-point scale for HS Math & mentor briefing isolates grade', async () => {
  const hsRoadmap = await computeCampaignRoadmap('hs_student_1', '11_up', '数学');
  assert.strictEqual(hsRoadmap.maxScore, 150);
  assert.ok(hsRoadmap.simulatedScore.endsWith('/ 150'));

  const hsPhysicsRoadmap = await computeCampaignRoadmap('hs_student_1', '11_up', '物理');
  assert.strictEqual(hsPhysicsRoadmap.maxScore, 100);
});
