#!/usr/bin/env node
/**
 * Canonical Question Batch Ingestion Pipeline
 * 1-9 年级教材课后习题与中考真题批量导入管道
 *
 * 用法:
 *   node scripts/ingest_canonical_questions.js --file ./path/to/questions.json
 *   node scripts/ingest_canonical_questions.js --stats
 */

const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const {
  computeQuestionFingerprint,
  initCanonicalQuestionsTable,
  BENCHMARK_CANONICAL_QUESTIONS
} = require('../server/services/canonicalQuestions');

const DB_PATH = process.env.MISTAKES_DB_PATH || path.join(__dirname, '..', 'data', 'mistakes.db');

async function getDb() {
  const dbDir = path.dirname(DB_PATH);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }
  const db = await open({
    filename: DB_PATH,
    driver: sqlite3.Database
  });
  await initCanonicalQuestionsTable(db);
  return db;
}

/**
 * 批量将试题导入 SQLite 权威题库
 * @param {Array<Object>} questions 试题列表
 * @param {Object} options 配置参数
 */
async function batchIngestQuestions(questions, options = {}) {
  if (!Array.isArray(questions) || questions.length === 0) {
    console.log('[IngestPipeline] 试题列表为空，无需导入。');
    return { total: 0, inserted: 0, skipped: 0 };
  }

  const db = await getDb();
  let insertedCount = 0;
  let skippedCount = 0;

  console.log(`[IngestPipeline] 开始处理 ${questions.length} 道试题...`);

  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    const questionText = String(q.question || q.snippet || '').trim();
    if (!questionText) {
      skippedCount++;
      continue;
    }

    const standardAnswer = String(q.standard_answer || q.answer || q.standardAnswer || '').trim();
    const analysis = String(q.analysis || q.explanation || '特级名师详析').trim();
    const keyInsight = String(q.key_insight || q.keyInsight || '').trim();
    const grade = String(q.grade || 'all').trim();
    const subject = String(q.subject || '数学').trim();
    const chapter = String(q.chapter || '').trim();
    const source = String(q.source || '教材课后习题与中考真题库').trim();
    const optionsText = String(q.options || '').trim();

    const fp = computeQuestionFingerprint(questionText);

    if (options.dryRun) {
      console.log(`[DryRun] [${subject}|${grade}] ${questionText.substring(0, 40)}... (FP: ${fp.substring(0, 8)})`);
      insertedCount++;
      continue;
    }

    try {
      const res = await db.run(
        `INSERT OR IGNORE INTO canonical_questions
        (question, options, standard_answer, analysis, key_insight, grade, subject, chapter, source, fingerprint)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          questionText,
          optionsText,
          standardAnswer,
          analysis,
          keyInsight,
          grade,
          subject,
          chapter,
          source,
          fp
        ]
      );

      if (res && res.changes > 0) {
        insertedCount++;
      } else {
        skippedCount++;
      }
    } catch (err) {
      console.warn(`[IngestPipeline] 写入第 ${i + 1} 题失败:`, err.message);
      skippedCount++;
    }
  }

  const row = await db.get('SELECT COUNT(*) as total FROM canonical_questions');
  console.log('----------------------------------------------------');
  console.log(`[IngestPipeline] 导入完成！`);
  console.log(`  本次读取: ${questions.length} 道`);
  console.log(`  成功新增: ${insertedCount} 道`);
  console.log(`  重复跳过: ${skippedCount} 道`);
  console.log(`  库内总量: ${row ? row.total : 0} 道权威真题母题`);
  console.log('----------------------------------------------------');

  await db.close();
  return { total: questions.length, inserted: insertedCount, skipped: skippedCount };
}

// CLI 执行入口
async function main() {
  const args = process.argv.slice(2);
  const fileIdx = args.indexOf('--file');
  const dryRun = args.includes('--dry-run');
  const showStats = args.includes('--stats');

  if (showStats) {
    const db = await getDb();
    const row = await db.get('SELECT COUNT(*) as total FROM canonical_questions');
    const breakdown = await db.all('SELECT subject, grade, COUNT(*) as count FROM canonical_questions GROUP BY subject, grade');
    console.log(`[Canonical Bank Stats] 当前权威真题总数: ${row ? row.total : 0}`);
    console.table(breakdown);
    await db.close();
    return;
  }

  if (fileIdx !== -1 && args[fileIdx + 1]) {
    const filePath = path.resolve(process.cwd(), args[fileIdx + 1]);
    if (!fs.existsSync(filePath)) {
      console.error(`[Error] 指定文件不存在: ${filePath}`);
      process.exit(1);
    }
    const content = fs.readFileSync(filePath, 'utf-8');
    const data = JSON.parse(content);
    const questions = Array.isArray(data) ? data : (data.questions || data.results || []);
    await batchIngestQuestions(questions, { dryRun });
    return;
  }

  // 默认：同步预设基准试题集
  console.log('[IngestPipeline] 未指定 --file，执行权威真题基准母题同步...');
  await batchIngestQuestions(BENCHMARK_CANONICAL_QUESTIONS, { dryRun });
}

if (require.main === module) {
  main().catch(err => {
    console.error('[IngestPipeline Fatal]', err);
    process.exit(1);
  });
}

module.exports = {
  batchIngestQuestions,
  getDb
};
