const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const { createApp } = require('../server/app');
const { initDB, closeDB, getSqliteDb } = require('../server/db/init');
const { getStudentStreak } = require('../server/services/streakService');
const { findTopicsByKeyword, formatGradeLabel } = require('../server/services/knowledgeGraph');
const { heuristicEssayEvaluation } = require('../server/routes/essay');
const { assembleReliableExamPaper } = require('../server/routes/testPaper');
const { searchCanonicalQuestions } = require('../server/services/search');

let server;
let baseUrl;
const savedEnv = {
  NODE_ENV: process.env.NODE_ENV,
  CLOUD_PUBLIC_MODE: process.env.CLOUD_PUBLIC_MODE,
  ENFORCE_QUOTA: process.env.ENFORCE_QUOTA,
  REQUIRE_AUTH: process.env.REQUIRE_AUTH
};

before(async () => {
  process.env.NODE_ENV = 'production';
  process.env.CLOUD_PUBLIC_MODE = 'true';
  process.env.ENFORCE_QUOTA = 'true';
  delete process.env.REQUIRE_AUTH;

  await initDB();
  const app = createApp();
  server = http.createServer(app);
  await new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      baseUrl = `http://127.0.0.1:${server.address().port}`;
      resolve();
    });
  });
});

after(async () => {
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
  await closeDB();
  for (const [k, v] of Object.entries(savedEnv)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

test('R4-P0: Multi-profile session creation works cleanly in strict production mode & blocks cross-profile IDOR', async () => {
  // 1. Initialize student session
  const sessRes = await fetch(`${baseUrl}/api/auth/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prefer_default: true })
  });
  assert.equal(sessRes.status, 200);
  const sessData = await sessRes.json();
  assert.ok(sessData.session_token, 'Must issue student session token');
  assert.ok(sessData.profiles.includes('default'), 'Session must authorize default profile');

  // 2. Create child profile via /api/auth/profiles
  const createRes = await fetch(`${baseUrl}/api/auth/profiles`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-student-session-token': sessData.session_token
    },
    body: JSON.stringify({ action: 'create', name: '高三小明', grade: '12_up' })
  });
  assert.equal(createRes.status, 200);
  const createData = await createRes.json();
  const childPid = createData.profile_id;
  const childToken = createData.session_token;
  assert.ok(childPid && childPid.startsWith('stu_'));
  assert.ok(childToken);

  const authHeaders = { 'x-student-session-token': childToken };

  // 3. Authorized child profile endpoints must return 200 OK (no self-inflicted 403)
  const urls = [
    `/api/mentor/daily-briefing?profile_id=${encodeURIComponent(childPid)}&grade=12_up&subject=${encodeURIComponent('数学')}`,
    `/api/parent/daily-memo?profile_id=${encodeURIComponent(childPid)}&grade=12_up`,
    `/api/mistakes?profile_id=${encodeURIComponent(childPid)}`,
    `/api/gamification/profile?profile_id=${encodeURIComponent(childPid)}`,
    `/api/chat-history?profile_id=${encodeURIComponent(childPid)}&grade=12_up&subject=${encodeURIComponent('数学')}`
  ];
  for (const u of urls) {
    const r = await fetch(`${baseUrl}${u}`, { headers: authHeaders });
    assert.equal(r.status, 200, `Expected 200 OK for authorized profile on ${u}, got ${r.status}`);
  }

  // 4. Cross-profile IDOR attempt to unauthorized victim_other must be rejected with 403
  const idorUrls = [
    `/api/mistakes?profile_id=victim_other_student`,
    `/api/chat-history?profile_id=victim_other_student&grade=12_up&subject=${encodeURIComponent('数学')}`,
    `/api/gamification/profile?profile_id=victim_other_student`,
    `/api/stats?profile_id=victim_other_student`
  ];
  for (const u of idorUrls) {
    const r = await fetch(`${baseUrl}${u}`, { headers: authHeaders });
    assert.equal(r.status, 403, `Expected 403 IDOR block on ${u}, got ${r.status}`);
  }
});

test('R4-P0: Public cloud anonymous /api/system/network-info returns sanitized 200 OK without LAN IP leakage', async () => {
  const res = await fetch(`${baseUrl}/api/system/network-info`);
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.publicMode, true);
  assert.equal(data.lanIp, null);
});

test('R4-P0: Forged unrelated BYOK header (x-siliconflow-api-key) cannot bypass TTS quota wall', async () => {
  const sessRes = await fetch(`${baseUrl}/api/auth/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({})
  });
  const sessData = await sessRes.json();
  const pid = sessData.profile_id;
  const db = getSqliteDb();

  // Exhaust daily quota (FREE_DAILY_AI_QUOTA=30) for this fresh isolated profile
  for (let i = 0; i < 35; i++) {
    await db.run(
      'INSERT INTO api_usage (model, type, prompt_tokens, completion_tokens, status, profile_id) VALUES (?, ?, ?, ?, ?, ?)',
      ['gemini-tts', 'tts', 10, 10, 'success', pid]
    );
  }

  const res = await fetch(`${baseUrl}/api/tts`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-student-session-token': sessData.session_token,
      'x-siliconflow-api-key': 'sk-fake-forged-key-1234567890'
    },
    body: JSON.stringify({ text: '测试限额拦截', profile_id: pid })
  });
  assert.equal(res.status, 429, `Expected 429 quota wall despite forged siliconflow header, got ${res.status}`);
});

test('R4-P0: Streak freeze consumption is strictly idempotent across repeated refreshes', async () => {
  const db = getSqliteDb();
  const pid = `stu_freeze_${Date.now()}`;
  const d = new Date(Date.now() - 2 * 86400_000);
  const twoDaysAgo = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  await db.run(
    `INSERT OR REPLACE INTO student_streaks (profile_id, current_streak, longest_streak, last_active_date, streak_freeze_count, peer_intimacy_xp, peer_level, total_sessions)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [pid, 7, 10, twoDaysAgo, 2, 100, 2, 5]
  );

  const first = await getStudentStreak(db, pid);
  const second = await getStudentStreak(db, pid);
  const third = await getStudentStreak(db, pid);

  assert.equal(first.currentStreak, 7, 'Streak must be preserved by freeze card');
  assert.equal(first.streakFreezeCount, 1, 'Exactly 1 freeze card should be consumed on first check');
  assert.equal(second.streakFreezeCount, 1, 'Second refresh must NOT consume another freeze card');
  assert.equal(third.streakFreezeCount, 1, 'Third refresh must NOT consume another freeze card');
  assert.equal(third.currentStreak, 7, 'Streak must remain 7 after repeated refreshes');
});

test('R4-P0: High school canonical question search never leaks Grade 1 primary math questions', async () => {
  const results = await searchCanonicalQuestions('函数 导数', '11_up', '数学', 10);
  for (const row of results) {
    const g = String(row.grade || '');
    assert.ok(!/^1($|_)/.test(g), `High school 11_up leaked Grade 1 question: grade=${g}, q=${row.question}`);
  }
});

test('R4-P1: KnowledgeGraph high school search matches conic sections (not Grade 6 cone) and avoids 13年级/14年级', () => {
  const matches = findTopicsByKeyword('圆锥曲线', { grade: '11_up', subject: '数学', limit: 5 });
  assert.ok(matches.length > 0, 'Must match high school conic section topic');
  assert.ok(
    matches[0].name.includes('圆锥曲线') || matches[0].name.includes('椭圆'),
    `Top match for 11_up 圆锥曲线 must be high school conic, got: ${matches[0].name} (grade=${matches[0].grade})`
  );

  const label13 = formatGradeLabel(13, '上');
  const label14 = formatGradeLabel(14, '下');
  assert.ok(!label13.includes('13年级'), `Must not render 13年级, got: ${label13}`);
  assert.ok(!label14.includes('14年级'), `Must not render 14年级, got: ${label14}`);
});

test('R4-P0: English roleplay catches obvious grammar errors honestly instead of blindly scoring 96', async () => {
  const sessRes = await fetch(`${baseUrl}/api/auth/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({})
  });
  const sessData = await sessRes.json();

  const res = await fetch(`${baseUrl}/api/english/roleplay`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-student-session-token': sessData.session_token
    },
    body: JSON.stringify({
      grade: '12_up',
      scenario_title: 'AI Ethics Debate',
      user_text: 'I wants book of AI ethics yesterday'
    })
  });
  assert.equal(res.status, 200);
  const payload = await res.json();
  const data = payload.data || payload;
  assert.ok(data.score < 75, `Broken English sentence must score < 75, got ${data.score}`);
  assert.ok(Array.isArray(data.grammarIssues) && data.grammarIssues.length >= 2, 'Must detect multiple grammar issues');
});

test('R4-P1: Essay heuristic does not inflate 52-char high school fragment or produce broken Chinese replacements', () => {
  const shortDraft = '人工智能发展很快，改变了人们的生活。我们既要善用科技提高效率，也要保持独立思考的能力，不能完全依赖机器。';
  const res = heuristicEssayEvaluation('科技与思考', shortDraft, '12_up');
  assert.equal(res.max_score, 60);
  assert.ok(res.total_score <= 26, `52-char high school fragment should score <= 26/60, got ${res.total_score}`);
  assert.equal(res.isFallback, true);
  assert.ok(res.fallbackNotice);
  for (const u of res.sentence_upgrades || []) {
    assert.ok(!/置身于时代的浪潮中，.*们/.test(u.upgraded), `Must not produce broken pronoun replacement: ${u.upgraded}`);
  }
});

test('R4-P0/P1: High school math & non-math fallback papers have zero duplicates, zero 7th-grade leakage, and exact score sums', async () => {
  const hsMath = await assembleReliableExamPaper('10_up', '数学');
  const stems = new Set(hsMath.questions.map(q => q.question.replace(/\s+/g, '').slice(0, 40)));
  assert.equal(stems.size, hsMath.questions.length, 'High school math paper must have zero duplicate questions');
  const sumScore = hsMath.questions.reduce((acc, q) => acc + Number(q.score || 0), 0);
  assert.equal(sumScore, hsMath.totalScore, 'Sum of question scores must exactly match paper.totalScore');
  for (const q of hsMath.questions) {
    assert.ok(!q.question.includes('七年级学生研学'), `High school paper leaked 7th-grade question: ${q.question}`);
  }

  const hsChinese = await assembleReliableExamPaper('12_up', '语文');
  for (const q of hsChinese.questions) {
    assert.ok(!q.question.includes('x^2') && !q.question.includes('解方程'), `Chinese paper leaked math question: ${q.question}`);
  }
});
