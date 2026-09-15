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

test('Real Skills: System guidelines include Feynman reverse probe, Life analogies, and Deliberate practice', () => {
  const guidelines = getPromptGuidelines('7_up', 'strict');
  assert.ok(guidelines.includes('费曼反向挑战与防假懂探针'), 'Missing Feynman reverse probe');
  assert.ok(guidelines.includes('具象生活隐喻支架'), 'Missing life analogies');
  assert.ok(guidelines.includes('三层错因精准归因'), 'Missing tri-level error analysis');
  assert.ok(guidelines.includes('心智演练与做题前闭眼预演'), 'Missing mental rehearsal');
  assert.ok(guidelines.includes('Ericsson 刻意练习跨场景变式循环'), 'Missing deliberate practice');
});

test('Real Skills: KnowledgeGraph formatGraphRAGPromptSection includes lifeAnalogy, teacherMnemonic and feynmanChallenge', () => {
  const mockDiagnosis = {
    hasPrerequisites: true,
    currentTopic: {
      name: '整式的乘法与乘法公式',
      grade: '7_down'
    },
    rootCauseNode: {
      name: '整式的乘法与乘法公式',
      grade: '7_down',
      coreRule: '完全平方公式：(a±b)² = a² ± 2ab + b²。',
      commonMistake: '完全平方公式漏掉中间项 2ab。',
      teacherMnemonic: '首平方，尾平方，首尾二倍在中央；符号看前方，同号加异号减！',
      lifeAnalogy: '就像盖房子：左边一个大房间(a²)，右边一个大房间(b²)，走廊(2ab)千万不能忘！',
      feynmanChallenge: '在草稿纸上画一个边长为 (a+b) 的大正方形，切成4块指出 2ab 对应的长方形！'
    }
  };
  const section = formatGraphRAGPromptSection(mockDiagnosis);
  assert.ok(section.includes('真实名师独门口诀'), 'GraphRAG prompt should include teacher mnemonic section');
  assert.ok(section.includes('首平方，尾平方'), 'Should have teacher mnemonic content');
  assert.ok(section.includes('生活具象隐喻'), 'GraphRAG prompt should include life analogy section');
  assert.ok(section.includes('费曼反向挑战'), 'GraphRAG prompt should include feynman challenge section');
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
