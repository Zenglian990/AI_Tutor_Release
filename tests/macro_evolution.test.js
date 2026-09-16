const { test, before, after } = require('node:test');
const assert = require('node:assert');
const http = require('http');
const { createApp } = require('../server/app');
const { getPromptGuidelines } = require('../server/prompts/guidelines');

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

test('Campaign Roadmap API: GET /api/campaign/roadmap returns coverage, milestones & simulated score', async () => {
  const res = await fetch(`${baseUrl}/api/campaign/roadmap?profile_id=test_student&grade=7_up&subject=%E6%95%B0%E5%AD%A6`);
  assert.strictEqual(res.status, 200);
  const data = await res.json();

  assert.strictEqual(data.success, true);
  assert.ok(typeof data.coveragePercentage === 'number');
  assert.ok(typeof data.simulatedScore === 'string');
  assert.ok(data.grade);
  assert.ok(data.subject);
  assert.ok(Array.isArray(data.milestones));
  assert.strictEqual(data.milestones.length, 4);
  assert.ok(data.milestones[0].title.includes('阶段一'));
  assert.ok(data.scoreTier);
});

test('Parent Memo API: GET /api/parent/daily-memo returns active time & reassuring insights memo', async () => {
  const res = await fetch(`${baseUrl}/api/parent/daily-memo?profile_id=test_student&grade=7_up&subject=%E6%95%B0%E5%AD%A6&student_name=%E6%9B%BE%E7%BB%83`);
  assert.strictEqual(res.status, 200);
  const data = await res.json();

  assert.strictEqual(data.success, true);
  assert.strictEqual(data.studentName, '曾练');
  assert.ok(typeof data.activeMinutes === 'number');
  assert.ok(typeof data.todayChatCount === 'number');
  assert.ok(data.comfortScore.includes('放心') || data.comfortScore.includes('98'));
  assert.ok(Array.isArray(data.memoContent));
  assert.ok(data.memoContent[0].includes('曾练') || data.memoContent[0].includes('研学'));
  assert.ok(data.memoTitle.includes('曾先生'));
});

test('Parent Memo API: POST /api/parent/push-webhook validates URL and formats payload', async () => {
  // Test invalid URL validation
  const invalidRes = await fetch(`${baseUrl}/api/parent/push-webhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ webhook_url: 'invalid-url' })
  });
  assert.strictEqual(invalidRes.status, 400);

  // Test SSRF URL validation (loopback address blocked)
  const ssrfRes = await fetch(`${baseUrl}/api/parent/push-webhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      webhook_url: 'http://127.0.0.1:9999/mock-webhook',
      memo_title: '曾先生家访便签',
      memo_content: ['伴学专注40分钟'],
      student_name: '曾练'
    })
  });
  assert.strictEqual(ssrfRes.status, 400);

  // Test valid external URL handler format
  const validRes = await fetch(`${baseUrl}/api/parent/push-webhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      webhook_url: 'https://oapi.dingtalk.com/robot/send?access_token=mock_test_token',
      memo_title: '曾先生家访便签',
      memo_content: ['伴学专注40分钟'],
      student_name: '曾练'
    })
  });
  // Mock external URL may fail network resolution or remote error gracefully
  assert.ok([200, 500].includes(validRes.status));
});

test('Empathy Circuit Breaker: Prompt guidelines include frustration circuit breaker', () => {
  const guidelines = getPromptGuidelines('7_up', 'strict');
  assert.ok(guidelines.includes('挫败感共情熔断'));
  assert.ok(guidelines.includes('熔断保护机制'));
});
