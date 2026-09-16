/**
 * Canonical K-12 Question Bank & Fingerprint Grounding Engine
 * 权威 1-9 年级教材与真题题库指纹锚定系统
 * 
 * 作用:
 * 1. 题库确定性秒级匹配 (< 1ms)，彻底消除大模型自由演算产生的基础计算幻觉
 * 2. 权威教材标答与特级教师解析注入
 * 3. 支撑 1-9 年级核心真题库的持续扩充与冷启动
 */

const crypto = require('crypto');
const logger = require('./logger');

/**
 * 计算题目的标准化特征指纹 (Normalized Question Fingerprint)
 * 剔除题号、括号、空白与多余标点，使格式变式能精准归一化
 */
function computeQuestionFingerprint(text) {
  if (typeof text !== 'string') return '';
  let cleaned = text
    .replace(/^[【\[\(（]?\s*(?:第?\s*\d+\s*[题、.)）\]]|选择题|填空题|解答题|综合题)\s*[】\]\)]?\s*/i, '') // 去除前置题型题号
    .replace(/[（\(][\s\S]*?[）\)]/g, '') // 去除空括号或括号内容
    .replace(/[，。！？；：“”‘’、\s,.!?;:'"\\\/]/gu, '') // 去除所有空白和标点
    .toLowerCase();

  return crypto.createHash('sha256').update(cleaned).digest('hex');
}

/**
 * 初始化权威真题题库表结构
 */
async function initCanonicalQuestionsTable(db) {
  if (!db) return;
  try {
    await db.exec(`
      CREATE TABLE IF NOT EXISTS canonical_questions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        question TEXT NOT NULL,
        options TEXT DEFAULT '',
        standard_answer TEXT NOT NULL,
        analysis TEXT NOT NULL,
        key_insight TEXT DEFAULT '',
        grade TEXT DEFAULT 'all',
        subject TEXT DEFAULT '数学',
        chapter TEXT DEFAULT '',
        source TEXT DEFAULT '人教版核心教材与考点真题',
        fingerprint TEXT UNIQUE NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_canonical_fp ON canonical_questions(fingerprint);
      CREATE INDEX IF NOT EXISTS idx_canonical_grade_subj ON canonical_questions(grade, subject);
    `);
    logger.info('[CanonicalQuestions] Database table initialized.');
  } catch (err) {
    logger.error('[CanonicalQuestions] Failed to initialize table:', err);
  }
}

/**
 * 人教版 1-9 年级高频核心考点基准题库种子数据
 */
const BENCHMARK_CANONICAL_QUESTIONS = [
  {
    question: '用3个边长2厘米的正方形拼成一个长方形，该长方形的周长是（ ）厘米。',
    options: 'A. 24 B. 16 C. 20',
    standard_answer: 'B',
    analysis: '3个边长2厘米的正方形拼成一行，拼成后长方形的长为 3×2=6 厘米，宽为 2 厘米。根据长方形周长公式：周长 = (长 + 宽) × 2 = (6 + 2) × 2 = 16 厘米。选B。',
    key_insight: '图形拼接周长必先计算拼成长与宽，严禁主观扣减边长',
    grade: '3_up',
    subject: '数学',
    chapter: '长方形和正方形的周长',
    source: '人教版三年级上册期末统考真题'
  },
  {
    question: '用4个边长3厘米的正方形拼成一个长方形，该长方形的周长是（ ）厘米。',
    options: 'A. 48 B. 30 C. 36',
    standard_answer: 'B',
    analysis: '4个边长3厘米的正方形排成一行，长为 4×3=12 厘米，宽为 3 厘米。周长 = (12 + 3) × 2 = 30 厘米。选B。',
    key_insight: '排成一排的长方形周长公式 (n×a + a) × 2',
    grade: '3_up',
    subject: '数学',
    chapter: '长方形和正方形的周长',
    source: '人教版三年级上册'
  },
  {
    question: '从一个长10厘米，宽6厘米的长方形纸的一角剪去一个边长2厘米的正方形，剩下图形的周长是（ ）厘米。',
    options: 'A. 32 B. 28 C. 30',
    standard_answer: 'A',
    analysis: '从长方形角落剪去一个正方形，虽然减少了两条边长为2厘米的线段，但凹进去处同时又增加了两条长为2厘米的线段，新图形周长与原长方形周长完全相等！原周长 = (10 + 6) × 2 = 32 厘米。选A。',
    key_insight: '角落剪切周长守恒定理',
    grade: '3_up',
    subject: '数学',
    chapter: '长方形和正方形的周长',
    source: '人教版小学数学周长易错压轴题'
  },
  {
    question: '鸡兔同笼，共有35个头，94只脚，笼中鸡有（ ）只，兔有（ ）只。',
    options: 'A. 鸡23只，兔12只 B. 鸡12只，兔23只 C. 鸡20只，兔15只',
    standard_answer: 'A',
    analysis: '假设全是鸡，则有 35×2=70 只脚，实际比假设多 94-70=24 只脚。每只兔子比鸡多2只脚，因此兔子有 24÷2=12 只，鸡有 35-12=23 只。选A。',
    key_insight: '鸡兔同笼假设法破局点',
    grade: '4_down',
    subject: '数学',
    chapter: '数学广角——鸡兔同笼',
    source: '人教版四年级下册教材重点'
  },
  {
    question: '一条马路长100米，在马路两旁每隔5米栽一棵树（两端都栽），一共要栽（ ）棵树。',
    options: 'A. 21 B. 42 C. 40',
    standard_answer: 'B',
    analysis: '单侧栽树：段数 = 100 ÷ 5 = 20 段，两端都栽棵数 = 20 + 1 = 21 棵。注意题目要求“两旁”，所以总棵数 = 21 × 2 = 42 棵。选B。',
    key_insight: '植树问题审题注意“两旁”陷阱',
    grade: '5_up',
    subject: '数学',
    chapter: '数学广角——植树问题',
    source: '人教版五年级上册经典真题'
  },
  {
    question: '已知关于x的一元一次方程 2x + a = 7 的解是 x = 2，则 a 的值是（ ）。',
    options: 'A. 3 B. -3 C. 11',
    standard_answer: 'A',
    analysis: '将 x = 2 代入方程得：2×2 + a = 7，即 4 + a = 7，解得 a = 3。选A。',
    key_insight: '方程解的定义直接代入求参数',
    grade: '7_up',
    subject: '数学',
    chapter: '一元一次方程',
    source: '人教版七年级上册期末真题'
  },
  {
    question: '在直角三角形ABC中，∠C=90°，AC=6，BC=8，则斜边AB的长是（ ）。',
    options: 'A. 10 B. 14 C. 28',
    standard_answer: 'A',
    analysis: '根据勾股定理：AB² = AC² + BC² = 6² + 8² = 36 + 64 = 100，所以斜边 AB = √100 = 10。选A。',
    key_insight: '经典勾三股四弦五倍数特值法',
    grade: '8_down',
    subject: '数学',
    chapter: '勾股定理',
    source: '人教版八年级下册核心真题'
  }
];

/**
 * 预热并自动注入权威真题基准库
 */
async function seedCanonicalQuestionsIfEmpty(db) {
  if (!db) return;
  try {
    const row = await db.get('SELECT COUNT(*) as cnt FROM canonical_questions');
    if (row && row.cnt === 0) {
      logger.info('[CanonicalQuestions] Seeding benchmark K-12 canonical questions...');
      for (const item of BENCHMARK_CANONICAL_QUESTIONS) {
        const fp = computeQuestionFingerprint(item.question);
        await db.run(
          `INSERT OR IGNORE INTO canonical_questions 
          (question, options, standard_answer, analysis, key_insight, grade, subject, chapter, source, fingerprint)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            item.question,
            item.options,
            item.standard_answer,
            item.analysis,
            item.key_insight,
            item.grade,
            item.subject,
            item.chapter,
            item.source,
            fp
          ]
        );
      }
      logger.info(`[CanonicalQuestions] Seeded ${BENCHMARK_CANONICAL_QUESTIONS.length} benchmark questions.`);
    }
  } catch (err) {
    logger.warn('[CanonicalQuestions] Seeding warning:', err.message);
  }
}

/**
 * 毫秒级检索权威真题
 * 1. 指纹哈希精确检索 (< 1ms)
 * 2. 数学实体模糊近邻检索
 */
async function lookupCanonicalQuestion(querySnippet, grade, subject, db) {
  if (!db || typeof querySnippet !== 'string' || !querySnippet.trim()) {
    return null;
  }

  try {
    // 1. 精确指纹哈希匹配
    const fp = computeQuestionFingerprint(querySnippet);
    if (fp) {
      const exactMatch = await db.get(
        'SELECT * FROM canonical_questions WHERE fingerprint = ?',
        [fp]
      );
      if (exactMatch) {
        logger.info(`[CanonicalQuestions] Exact fingerprint match hit for ID: ${exactMatch.id}`);
        return {
          matched: true,
          matchType: 'exact_fingerprint',
          canonical: exactMatch
        };
      }
    }

    // 2. 实体关键词模糊检索 (提取数学实体如：4个、边长3、正方形、长方形、周长等)
    const terms = querySnippet.match(/(\d+\s*个|\d+\s*(?:只|头|脚|米|厘米|cm)|边长\s*\d+|正方形|长方形|周长|面积|鸡兔同笼|栽树|方程|勾股定理|剪去|剩下)/g) || [];
    if (terms.length >= 2) {
      const topTerms = terms.slice(0, 3);
      let sql = 'SELECT * FROM canonical_questions WHERE 1=1';
      const params = [];
      for (const t of topTerms) {
        const cleanT = t.replace(/\s+/g, '');
        sql += ' AND question LIKE ?';
        params.push(`%${cleanT}%`);
      }
      sql += ' LIMIT 1';

      const fuzzyMatch = await db.get(sql, params);
      if (fuzzyMatch) {
        logger.info(`[CanonicalQuestions] Fuzzy term match hit for ID: ${fuzzyMatch.id} (${topTerms.join(',')})`);
        return {
          matched: true,
          matchType: 'fuzzy_keyword',
          canonical: fuzzyMatch
        };
      }
    }

    return null;
  } catch (err) {
    logger.warn('[CanonicalQuestions] Lookup error:', err.message);
    return null;
  }
}

module.exports = {
  computeQuestionFingerprint,
  initCanonicalQuestionsTable,
  seedCanonicalQuestionsIfEmpty,
  lookupCanonicalQuestion,
  BENCHMARK_CANONICAL_QUESTIONS
};
