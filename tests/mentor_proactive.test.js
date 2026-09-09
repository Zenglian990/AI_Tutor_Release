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

test('Mentor API: GET /api/mentor/daily-briefing returns structured briefing', async () => {
  const res = await fetch(`${baseUrl}/api/mentor/daily-briefing?profile_id=test_student&grade=7_up&subject=%E6%95%B0%E5%AD%A6&student_name=%E6%9B%BE%E7%BB%83`);
  assert.strictEqual(res.status, 200);
  const data = await res.json();

  assert.strictEqual(data.success, true);
  assert.strictEqual(data.studentName, '曾练');
  assert.ok(data.greetingHeadline);
  assert.ok(data.suggestedMission);
  assert.ok(data.suggestedMission.title);
  assert.ok(data.suggestedMission.query);
});

test('Mentor API: POST /api/mentor/hint returns non-spoiling hint', async () => {
  const res = await fetch(`${baseUrl}/api/mentor/hint`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      problemText: '已知三角形ABC中，角A=60度，求角B加角C',
      student_name: '曾练'
    })
  });
  assert.strictEqual(res.status, 200);
  const data = await res.json();

  assert.strictEqual(data.success, true);
  assert.ok(data.hint.includes('曾练同学'));
  assert.ok(data.hint.includes('破题支架') || data.hint.includes('微提示') || data.hint.includes('审题陷阱'));
});

test('Socratic Stepper Prompt: includes strict step-by-step turn-taking rules', () => {
  const guidelines = getPromptGuidelines('7_up', 'strict');
  assert.ok(guidelines.includes('苏格拉底断点式分步引导模式'));
  assert.ok(guidelines.includes('严禁直接抛出最终答案数值'));
  assert.ok(guidelines.includes('动笔设问支架'));
  assert.ok(guidelines.includes('费曼反向挑战'));
});
