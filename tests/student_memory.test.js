const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
process.env.NODE_ENV = 'development';
const { initDB, getSqliteDb, closeDB } = require('../server/db/init');
const { getStudentCognitiveMemory, formatStudentMemoryForPrompt } = require('../server/services/studentMemory');

const TEST_PROFILE = 'memory_test_zeng';

before(async () => {
  await initDB();
  const db = getSqliteDb();
  if (db) {
    // Insert test mistake records with tags and reasons
    await db.run(
      `INSERT INTO mistakes (query, answer, grade, source_info, reason, profile_id, subject, tags)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        '已知点P在射线AB上，AB=5，AP=2，求BP长',
        '分点P在AB内部与延长线上两种情况讨论',
        '7_up',
        '人教版七年级数学',
        '容易漏掉射线延长线情况',
        TEST_PROFILE,
        '数学',
        '分类讨论,射线性质'
      ]
    );

    await db.run(
      `INSERT INTO mistakes (query, answer, grade, source_info, reason, profile_id, subject, tags)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        '化简: -(-3) + (-5)',
        '-2',
        '7_up',
        '人教版七年级数学',
        '多重负号去括号符号看错',
        TEST_PROFILE,
        '数学',
        '有理数符号,去括号'
      ]
    );

    // Insert progress record
    await db.run(
      `INSERT INTO profile_progress (profile_id, grade, subject, chapter_id, status, progress_pct, score)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [TEST_PROFILE, '7_up', '数学', 'chapter_1', 'completed', 100, 95]
    );
  }
});

after(async () => {
  const db = getSqliteDb();
  if (db) {
    await db.run('DELETE FROM mistakes WHERE profile_id = ?', [TEST_PROFILE]);
    await db.run('DELETE FROM profile_progress WHERE profile_id = ?', [TEST_PROFILE]);
  }
  await closeDB();
});

test('Student Memory: returns structured memory for profile with learning history', async () => {
  const mem = await getStudentCognitiveMemory(TEST_PROFILE, '7_up', '数学');
  assert.equal(mem.profileId, TEST_PROFILE);
  assert.equal(mem.studentName, TEST_PROFILE);
  assert.equal(mem.hasHistory, true);
  assert.ok(mem.totalMistakes >= 2, 'Should detect at least 2 mistakes');
  assert.ok(mem.topWeakTags.includes('分类讨论') || mem.topWeakTags.includes('有理数符号'), 'Should aggregate top weak tags');
  assert.ok(mem.completedChapters >= 1, 'Should record completed chapters');

  const promptText = formatStudentMemoryForPrompt(mem);
  assert.ok(promptText.includes(TEST_PROFILE), 'Prompt should include student name');
  assert.ok(promptText.includes('近期高频薄弱知识点'), 'Prompt should include weak points section');
  assert.ok(promptText.includes('专属私教点拨要求'), 'Prompt should include custom teaching directives');
});

test('Student Memory: gracefully handles brand new student with no history', async () => {
  const mem = await getStudentCognitiveMemory('brand_new_student_xyz', '7_up', '数学');
  assert.equal(mem.hasHistory, false);
  const promptText = formatStudentMemoryForPrompt(mem);
  assert.ok(promptText.includes('初次学习或基础阶段'), 'Should provide gentle onboarding guidance');
});
