const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { open } = require('sqlite');
const sqlite3 = require('sqlite3');
const {
  computeQuestionFingerprint,
  initCanonicalQuestionsTable,
  seedCanonicalQuestionsIfEmpty,
  lookupCanonicalQuestion
} = require('../server/services/canonicalQuestions');
const { sanitizeAndArbitrateHomeworkResults } = require('../server/services/homeworkValidator');

let db;

before(async () => {
  db = await open({
    filename: ':memory:',
    driver: sqlite3.Database
  });
  await initCanonicalQuestionsTable(db);
  await seedCanonicalQuestionsIfEmpty(db);
});

after(async () => {
  if (db) await db.close();
});

test('CanonicalQuestions: computeQuestionFingerprint normalizes punctuation, brackets, and whitespace', () => {
  const q1 = '用3个边长2厘米的正方形拼成一个长方形，该长方形的周长是（ ）厘米。';
  const q2 = '【第3题】(选择题) 用 3 个 边长 2 厘米 的 正方形 拼成 一个 长方形，该长方形的周长是（ ）厘米！ ';
  const fp1 = computeQuestionFingerprint(q1);
  const fp2 = computeQuestionFingerprint(q2);

  assert.ok(fp1);
  assert.strictEqual(fp1.length, 64, 'SHA256 hex should be 64 characters');
  assert.strictEqual(fp1, fp2, 'Different prefix/spaces/punctuation should produce identical fingerprint');
});

test('CanonicalQuestions: seedCanonicalQuestionsIfEmpty seeds benchmark K-12 questions', async () => {
  const row = await db.get('SELECT COUNT(*) as count FROM canonical_questions');
  assert.ok(row.count >= 7, 'Should seed at least 7 benchmark questions');
});

test('CanonicalQuestions: lookupCanonicalQuestion performs exact fingerprint match in sub-milliseconds', async () => {
  const snippet = '用3个边长2厘米的正方形拼成一个长方形，该长方形的周长是（ ）厘米。';
  const start = Date.now();
  const res = await lookupCanonicalQuestion(snippet, '3_up', '数学', db);
  const elapsed = Date.now() - start;

  assert.ok(res);
  assert.strictEqual(res.matched, true);
  assert.strictEqual(res.matchType, 'exact_fingerprint');
  assert.strictEqual(res.canonical.standard_answer, 'B');
  assert.ok(res.canonical.analysis.includes('16 厘米'));
  assert.ok(elapsed < 20, `Lookup should be instant, took ${elapsed}ms`);
});

test('CanonicalQuestions: lookupCanonicalQuestion performs fuzzy keyword match on variations', async () => {
  const variantSnippet = '期末真题：现有4个边长3厘米的正方形排成一行拼成长方形，周长是多少厘米';
  const res = await lookupCanonicalQuestion(variantSnippet, '3_up', '数学', db);

  assert.ok(res);
  assert.strictEqual(res.matched, true);
  assert.strictEqual(res.canonical.standard_answer, 'B');
  assert.ok(res.canonical.analysis.includes('30 厘米'));
});

test('CanonicalQuestions: Grounding overrides LLM hallucinated answer and protects student', async () => {
  const mockParsedData = {
    results: [
      {
        questionNumber: 1,
        type: '选择题',
        questionSnippet: '用3个边长2厘米的正方形拼成一个长方形，该长方形的周长是（ ）厘米。',
        studentAnswer: 'B. 16',
        standardAnswer: 'C. 20 (模型瞎算)',
        status: 'wrong',
        score: 0,
        maxScore: 10,
        mistakeReason: '周长计算错误'
      }
    ]
  };

  const validated = await sanitizeAndArbitrateHomeworkResults(mockParsedData, { subject: '数学', grade: '3_up' }, db);
  assert.strictEqual(validated.correctCount, 1);
  assert.strictEqual(validated.wrongCount, 0);
  assert.strictEqual(validated.accuracyPct, 100);

  const item = validated.results[0];
  assert.strictEqual(item.status, 'correct');
  assert.strictEqual(item.score, 10);
  assert.strictEqual(item.mistakeReason, '');
  assert.ok(item.standardAnswer.includes('【权威教材标答】：B'));
});
