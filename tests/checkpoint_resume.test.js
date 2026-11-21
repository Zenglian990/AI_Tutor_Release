const { test } = require('node:test');
const assert = require('node:assert');
const { open } = require('sqlite');
const sqlite3 = require('sqlite3');

const {
  saveStudyCheckpoint,
  getStudyCheckpoint,
  formatResumeGreeting,
  formatCheckpointPromptSection
} = require('../server/services/checkpointService');

async function createTestDb() {
  const db = await open({
    filename: ':memory:',
    driver: sqlite3.Database
  });

  await db.exec(`
    CREATE TABLE IF NOT EXISTS study_checkpoints (
      profile_id TEXT NOT NULL,
      subject TEXT NOT NULL,
      chapter_id TEXT,
      chapter_name TEXT,
      concept_id TEXT,
      concept_name TEXT,
      last_query_snippet TEXT,
      unresolved_question TEXT,
      progress_pct INTEGER DEFAULT 0,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (profile_id, subject)
    );
  `);

  return db;
}

test('Checkpoint Resume Engine — Save & Retrieve Checkpoint', async () => {
  const db = await createTestDb();

  const saved = await saveStudyCheckpoint(db, {
    profileId: 'student_zeng',
    subject: '数学',
    chapterId: 'mt_ch1',
    chapterName: '初一上册·有理数四则混合运算',
    conceptId: 'math_rational_operations',
    conceptName: '有理数四则运算与去括号',
    lastQuerySnippet: '求值：(-3) × [(-2) + (-4)] ÷ (-6)',
    unresolvedQuestion: '除以负数时符号搞混了',
    progressPct: 65
  });

  assert.ok(saved);
  assert.strictEqual(saved.profileId, 'student_zeng');
  assert.strictEqual(saved.progressPct, 65);

  // Retrieve
  const cp = await getStudyCheckpoint(db, 'student_zeng', '数学');
  assert.ok(cp);
  assert.strictEqual(cp.concept_name, '有理数四则运算与去括号');
  assert.strictEqual(cp.progress_pct, 65);
  assert.strictEqual(cp.unresolved_question, '除以负数时符号搞混了');

  await db.close();
});

test('Checkpoint Resume Engine — Format Seamless Resume Greeting', () => {
  const mockCp = {
    subject: '数学',
    concept_name: '有理数四则运算与去括号',
    progress_pct: 65,
    last_query_snippet: '求值：(-3) × [(-2) + (-4)] ÷ (-6)',
    unresolved_question: '除以负数时符号搞混了'
  };

  const greeting = formatResumeGreeting(mockCp, '曾练');
  assert.match(greeting, /曾练同学，欢迎回来！/);
  assert.match(greeting, /有理数四则运算与去括号/);
  assert.match(greeting, /65%/);
  assert.match(greeting, /不用从头复述，直接接上这里的思维断点继续攻破/);
});

test('Checkpoint Resume Engine — Prompt Injection Enforces No-Restart Rule', () => {
  const mockCp = {
    subject: '数学',
    concept_name: '勾股定理及其逆定理',
    progress_pct: 40,
    last_query_snippet: '直角边3和4求斜边分类讨论',
    unresolved_question: ''
  };

  // When greeting or resuming session
  const promptGreeting = formatCheckpointPromptSection(mockCp, '曾练', true);
  assert.match(promptGreeting, /续学锚点 · 绝不从头讲起/);
  assert.match(promptGreeting, /严禁机械问“你想学什么”，绝对严禁从章节第一章重新讲！/);
  assert.match(promptGreeting, /勾股定理及其逆定理/);

  // During ordinary question flow
  const promptNormal = formatCheckpointPromptSection(mockCp, '曾练', false);
  assert.match(promptNormal, /学生当前是断断续续学习/);
  assert.match(promptNormal, /切勿重头啰嗦基础定义/);
});
