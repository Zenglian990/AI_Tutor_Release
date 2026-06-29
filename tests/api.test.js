const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../server/app');
const { initDB, getSqliteDb } = require('../server/db/init');
const config = require('../server/config');

let app;
let server;
let port;
let baseUrl;

before(async () => {
  // Set development mode and require auth for specific tests
  process.env.NODE_ENV = 'development';
  
  // Initialize DB
  await initDB();
  
  // Start server on a dynamic port
  app = createApp();
  await new Promise((resolve) => {
    server = app.listen(0, () => {
      port = server.address().port;
      baseUrl = `http://localhost:${port}`;
      resolve();
    });
  });
  console.log(`Test server started on ${baseUrl}`);
});

after(async () => {
  // Clean up SQLite test records
  const db = getSqliteDb();
  if (db) {
    await db.run("DELETE FROM chat_history WHERE profile_id = 'api_test_profile'");
    await db.run("DELETE FROM mistakes WHERE profile_id = 'api_test_profile'");
    await db.run("DELETE FROM profile_progress WHERE profile_id = 'api_test_profile'");
  }
  
  // Close server
  if (server) {
    await new Promise((resolve) => server.close(resolve));
    console.log('Test server shut down.');
  }
});

test('GET /api/health — returns ok status', async () => {
  const res = await fetch(`${baseUrl}/api/health`);
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.status, 'ok');
  assert.ok(data.uptime > 0);
});

test('POST & GET /api/chat-history — syncs and retrieves history', async () => {
  const profile_id = 'api_test_profile';
  const grade = '7_up';
  const subject = '数学';
  
  const testMessages = [
    { role: 'user', text: '你好，请问什么是勾股定理？' },
    { role: 'ai', text: '直角三角形两直角边平方和等于斜边平方。' }
  ];
  
  // 1. Sync chat history
  const syncRes = await fetch(`${baseUrl}/api/chat-history`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      profile_id,
      messages: testMessages,
      grade,
      subject
    })
  });
  
  assert.equal(syncRes.status, 200);
  const syncData = await syncRes.json();
  assert.ok(syncData.success);
  
  // 2. Fetch synced chat history
  const fetchRes = await fetch(`${baseUrl}/api/chat-history?profile_id=${profile_id}&grade=${grade}&subject=${subject}`);
  assert.equal(fetchRes.status, 200);
  const fetchData = await fetchRes.json();
  
  assert.ok(Array.isArray(fetchData.history));
  assert.equal(fetchData.history.length, 2);
  assert.equal(fetchData.history[0].role, 'user');
  assert.equal(fetchData.history[0].text, testMessages[0].text);
  assert.equal(fetchData.history[1].role, 'ai');
  assert.equal(fetchData.history[1].text, testMessages[1].text);
});

test('GET /api/stats — retrieves student metrics', async () => {
  const profile_id = 'api_test_profile';
  
  // Prime the DB with a mock mistake
  const db = getSqliteDb();
  await db.run(
    "INSERT INTO mistakes (profile_id, subject, query, answer, grade) VALUES (?, ?, ?, ?, ?)",
    [profile_id, '数学', '1+1=?', '2', '七年级上册']
  );
  
  const res = await fetch(`${baseUrl}/api/stats?profile_id=${profile_id}`);
  assert.equal(res.status, 200);
  const data = await res.json();
  
  assert.ok(data.total >= 1);
  assert.ok(Array.isArray(data.bySubject));
  const mathStat = data.bySubject.find(s => s.subject === '数学');
  assert.ok(mathStat);
  assert.ok(mathStat.count >= 1);
});

test('POST /api/report/weekly — fails gracefully on missing profile', async () => {
  const res = await fetch(`${baseUrl}/api/report/weekly`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      profile_id: 'non_existent_profile',
      grade: '3_up',
      student_name: '未知学生'
    })
  });
  
  // If no LLM key, it might return a weekly report text or 200 with an empty summary.
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.ok(data.report);
  assert.equal(typeof data.report, 'string');
  assert.ok(data.report.length > 0);
});

test('GET /api/mistakes/review-challenge — returns challenge or message when empty', async () => {
  const profile_id = 'api_test_profile';
  const res = await fetch(`${baseUrl}/api/mistakes/review-challenge?profile_id=${profile_id}&grade=7_up`);
  assert.equal(res.status, 200);
  const data = await res.json();
  
  // Since we inserted a mistake earlier, it might generate a challenge,
  // but if Gemini keys are empty or fail, it should fallback to a friendly message or mock text.
  assert.ok(data.hasOwnProperty('challenge'));
});

test('POST, GET, and PUT /api/mistakes — tags management', async () => {
  const profile_id = 'api_test_profile';
  
  // 1. Mark a mistake with tag
  const markRes = await fetch(`${baseUrl}/api/mistakes/mark`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: '2x + 5 = 15',
      answer: 'x = 5',
      grade: '7_up',
      subject: '数学',
      profile_id,
      tags: '一元一次方程,计算'
    })
  });
  assert.equal(markRes.status, 200);
  const markData = await markRes.json();
  assert.ok(markData.success);

  // 2. Fetch the mistake and assert tag is decrypted correctly
  const getRes = await fetch(`${baseUrl}/api/mistakes?profile_id=${profile_id}`);
  assert.equal(getRes.status, 200);
  const mistakes = await getRes.json();
  
  const targetMistake = mistakes.find(m => m.query === '2x + 5 = 15');
  assert.ok(targetMistake);
  assert.equal(targetMistake.tags, '一元一次方程,计算');

  // 3. Update tags on the mistake via PUT /api/mistakes/:id/tags
  const putRes = await fetch(`${baseUrl}/api/mistakes/${targetMistake.id}/tags?profile_id=${profile_id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tags: '一元一次方程,易错题,计算'
    })
  });
  assert.equal(putRes.status, 200);
  const putData = await putRes.json();
  assert.ok(putData.success);
  assert.equal(putData.tags, '一元一次方程,易错题,计算');

  // 4. Fetch again to check update was saved
  const getRes2 = await fetch(`${baseUrl}/api/mistakes?profile_id=${profile_id}`);
  assert.equal(getRes2.status, 200);
  const mistakes2 = await getRes2.json();
  const updatedMistake = mistakes2.find(m => m.id === targetMistake.id);
  assert.ok(updatedMistake);
  assert.equal(updatedMistake.tags, '一元一次方程,易错题,计算');
});
