const { test, before, after } = require('node:test');
const assert = require('node:assert');
const http = require('http');
const { createApp } = require('../server/app');
const { initDB, getSqliteDb } = require('../server/db/init');
const { getPromptGuidelines } = require('../server/prompts/guidelines');
const { formatGraphRAGPromptSection } = require('../server/services/knowledgeGraph');

let server;
let baseUrl;
const TEST_PROFILE = 'test_user_real_' + Date.now();

before(async () => {
  await initDB();
  const db = getSqliteDb();
  if (db) {
    await db.run('DELETE FROM user_gamification WHERE profile_id LIKE "test_user_real%"');
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
  const db = getSqliteDb();
  if (db) {
    await db.run('DELETE FROM user_gamification WHERE profile_id LIKE "test_user_real%"');
  }
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('Real Skills: System guidelines include Feynman reverse probe, Life analogies, and Tri-level error analysis', () => {
  const guidelines = getPromptGuidelines('7_up', 'strict');
  assert.ok(guidelines.includes('费曼反向挑战与防假懂探针'), 'Missing Feynman reverse probe');
  assert.ok(guidelines.includes('具象生活隐喻支架'), 'Missing life analogies');
  assert.ok(guidelines.includes('三层错因精准归因'), 'Missing tri-level error analysis');
  assert.ok(guidelines.includes('逆向抽查探针'), 'Should mention reverse probe');
});

test('Real Skills: KnowledgeGraph formatGraphRAGPromptSection includes lifeAnalogy and feynmanChallenge', () => {
  const mockDiagnosis = {
    hasPrerequisites: true,
    currentTopic: {
      name: '有理数四则运算与去括号',
      grade: '7_up'
    },
    rootCauseNode: {
      name: '正数和负数及数轴概念',
      grade: '7_up',
      coreRule: '0既不是正数也不是负数。数轴上左边的数总比右边的数小。负数的绝对值是它的相反数。',
      commonMistake: '误认为带负号的字母一定是负数。',
      lifeAnalogy: '数轴就像是一根笔直的温度计：0度是冰点，零下是负，零上是正。',
      feynmanChallenge: '若一个字母 a 本身就是 -5，那 -a 到底是正数还是负数？'
    }
  };
  const section = formatGraphRAGPromptSection(mockDiagnosis);
  assert.ok(section.includes('生活具象隐喻'), 'GraphRAG prompt should include life analogy section');
  assert.ok(section.includes('费曼反向挑战'), 'GraphRAG prompt should include feynman challenge section');
  assert.ok(section.includes('温度计'), 'Should have negative numbers analogy text');
});

test('Gamification API: GET /api/gamification/profile returns tier, streak, and badges', async () => {
  const res = await fetch(`${baseUrl}/api/gamification/profile?profile_id=${TEST_PROFILE}&student_name=%E6%9B%BE%E7%BB%83`);
  assert.strictEqual(res.status, 200);
  const data = await res.json();

  assert.strictEqual(data.success, true);
  assert.strictEqual(data.studentName, '曾练');
  assert.ok(typeof data.rankPoints === 'number');
  assert.ok(data.rankTier);
  assert.ok(data.rankTier.name);
  assert.ok(data.rankTier.icon);
  assert.ok(typeof data.streakDays === 'number');
  assert.ok(Array.isArray(data.badges));
  assert.ok(data.badges.length >= 1, 'Initial profile should unlock 初露锋芒');
  assert.strictEqual(data.badges[0], '初露锋芒');
});

test('Gamification API: POST /api/gamification/record-action awards points and unlocks badges', async () => {
  const postRes = await fetch(`${baseUrl}/api/gamification/record-action`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      profile_id: TEST_PROFILE,
      student_name: '曾练',
      action_type: 'feynman_challenge'
    })
  });
  assert.strictEqual(postRes.status, 200);
  const postData = await postRes.json();

  assert.strictEqual(postData.success, true);
  assert.strictEqual(postData.gainedPoints, 25);
  assert.ok(postData.newPoints >= 25);
  assert.strictEqual(postData.badgeGained, '费曼小导师');

  // Verify updated state via GET
  const getRes = await fetch(`${baseUrl}/api/gamification/profile?profile_id=${TEST_PROFILE}`);
  const updatedData = await getRes.json();
  assert.ok(updatedData.badges.includes('费曼小导师'));
});
