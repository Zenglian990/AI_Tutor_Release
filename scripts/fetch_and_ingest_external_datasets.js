#!/usr/bin/env node
/**
 * scripts/fetch_and_ingest_external_datasets.js
 * 
 * 批量清洗并导入开源教育数据集：
 * 1. Ape210K (猿辅导 21万道小学数学应用题真题) -> 覆盖 1-6 年级 (5000题)
 * 2. CMMaTH (中英文多模态数学大题/选择题精细标注库) -> 覆盖 初中/高中 (1000题)
 * 3. GAOKAO-Bench (全国高考各学科真题库：数学、物理、化学、生物、语文) -> 初高衔接与各学科选拔真题
 */

const fs = require('fs');
const path = require('path');
const { batchIngestQuestions, getDb } = require('./ingest_canonical_questions');

const DATA_DIR = path.join(__dirname, '..', 'data');
const APE_PATH = path.join(DATA_DIR, 'valid.ape.json');
const CMMATH_PATH = path.join(DATA_DIR, 'cmmath.json');
const MATH23K_PATH = path.join(DATA_DIR, 'Math_23K.json');
const GAOKAO_MATH_PATH = path.join(DATA_DIR, 'gaokao_math_mcq.json');
const GAOKAO_PHYSICS_PATH = path.join(DATA_DIR, 'gaokao_physics.json');
const GAOKAO_CHEMISTRY_PATH = path.join(DATA_DIR, 'gaokao_chemistry.json');
const GAOKAO_BIOLOGY_PATH = path.join(DATA_DIR, 'gaokao_biology.json');
const GAOKAO_CHINESE_PATH = path.join(DATA_DIR, 'gaokao_chinese.json');

/**
 * 转换 Math23K 试题（23,162 道精选中小学数学应用题真题）
 */
function transformMath23kQuestions(limit = 30000) {
  if (!fs.existsSync(MATH23K_PATH)) {
    console.warn(`[Warning] 未找到 ${MATH23K_PATH}，跳过 Math23K 导入`);
    return [];
  }

  const content = fs.readFileSync(MATH23K_PATH, 'utf-8');
  const chunks = content.split(/\n(?=\{)/g);
  const selected = chunks.slice(0, Math.min(chunks.length, limit));
  const questions = [];

  for (const chunk of selected) {
    if (!chunk.trim()) continue;
    try {
      const item = JSON.parse(chunk.trim());
      const text = (item.original_text || item.segmented_text || '').trim();
      const ans = String(item.ans || '').trim();
      const eq = String(item.equation || '').trim();

      if (!text || !ans) continue;

      const { grade, chapter, keyInsight } = inferApeGradeAndChapter(text, eq, ans);

      questions.push({
        question: text,
        options: '',
        standard_answer: ans,
        analysis: `【标准方程与列式】：${eq}\n【详细解答】：根据题干等量关系列式求解，计算得出准确结果为 ${ans}。\n【特级教师精析】：${keyInsight}`,
        key_insight: keyInsight,
        grade,
        subject: '数学',
        chapter,
        source: 'Math23K权威中小学数学应用题真题集'
      });
    } catch (e) {
      // ignore json parse error
    }
  }

  console.log(`[Math23K] 成功解析 ${questions.length} 道权威应用题真题`);
  return questions;
}

/**
 * 根据小学应用题题干、方程与答案智能推导年级与章节
 */
function inferApeGradeAndChapter(text, equation, ans) {
  const t = text || '';
  const eq = equation || '';
  const a = String(ans || '');

  // 6年级：圆柱、圆锥、比与比例、百分数应用题、工程问题
  if (t.includes('圆柱') || t.includes('圆锥') || t.includes('比是') || t.includes('比例') || t.includes('成活率') || t.includes('出勤率') || t.includes('%') || a.includes('%')) {
    return {
      grade: '6_up',
      chapter: '比和比例与几何立体形体',
      keyInsight: '找准基准量与比的份数，或利用几何形体体积/表面积公式进行等量代换。'
    };
  }

  // 5年级：分数的加减乘除应用题、长方体正方体表面积、小数乘除法
  if (t.includes('几分之几') || eq.includes('/') && (eq.includes('(') || eq.includes('-(')) || t.includes('长方体') || t.includes('正方体') || t.includes('公顷') || a.includes('/')) {
    return {
      grade: '5_down',
      chapter: '分数的意义与实际应用',
      keyInsight: '找准单位“1”，弄清所求量是占单位“1”的几分之几还是具体数量。'
    };
  }

  // 4年级：乘法分配律、平均数、四则混合运算、行程追及与相遇问题
  if (t.includes('平均数') || t.includes('相遇') || t.includes('追及') || t.includes('速度') || t.includes('米/分') || t.includes('千米') || eq.length > 20) {
    return {
      grade: '4_up',
      chapter: '行程与平均数应用题',
      keyInsight: '牢记核心公式：路程=速度和(差)×时间；总数量÷总份数=平均数。'
    };
  }

  // 3年级：长方形与正方形周长面积、多位数乘一位数/除一位数、倍数问题
  if (t.includes('周长') || t.includes('面积') || t.includes('倍') || t.includes('长方形') || t.includes('正方形') || t.includes('练习本') || t.includes('每班')) {
    return {
      grade: '3_up',
      chapter: '周长面积与倍数应用题',
      keyInsight: '抓住“1倍量”，画线段图分析倍数与差额之间的对应关系。'
    };
  }

  // 1-2年级：基础加减法、排队问题、简单购物
  return {
    grade: '2_down',
    chapter: '表内乘除与日常应用',
    keyInsight: '看清题意是“平均分”还是“求总数”，列出基本算式逐步计算。'
  };
}

/**
 * 转换 Ape210K 试题
 */
function transformApeQuestions(limit = 10000) {
  if (!fs.existsSync(APE_PATH)) {
    console.warn(`[Warning] 未找到 ${APE_PATH}，跳过 Ape210K 导入`);
    return [];
  }

  const lines = fs.readFileSync(APE_PATH, 'utf-8').trim().split('\n');
  const selected = lines.slice(0, Math.min(lines.length, limit));
  const questions = [];

  for (const line of selected) {
    if (!line.trim()) continue;
    try {
      const item = JSON.parse(line);
      const text = (item.original_text || item.segmented_text || '').trim();
      const ans = String(item.ans || '').trim();
      const eq = String(item.equation || '').trim();

      if (!text || !ans) continue;

      const { grade, chapter, keyInsight } = inferApeGradeAndChapter(text, eq, ans);

      questions.push({
        question: text,
        options: '',
        standard_answer: ans,
        analysis: `【标准列式】：${eq}\n【计算过程】：根据题意列出等量关系，解得未知数或结果为 ${ans}。\n【名师点睛】：${keyInsight}`,
        key_insight: keyInsight,
        grade,
        subject: '数学',
        chapter,
        source: 'Ape210K小学数学应用题真题库'
      });
    } catch (e) {
      // ignore json parse error on single line
    }
  }

  console.log(`[Ape210K] 成功解析 ${questions.length} 道小学真题`);
  return questions;
}

/**
 * 转换 CMMaTH 试题
 */
function transformCmmathQuestions(limit = 2000) {
  if (!fs.existsSync(CMMATH_PATH)) {
    console.warn(`[Warning] 未找到 ${CMMATH_PATH}，跳过 CMMaTH 导入`);
    return [];
  }

  try {
    const raw = JSON.parse(fs.readFileSync(CMMATH_PATH, 'utf-8'));
    const list = Array.isArray(raw) ? raw : [];
    const selected = list.slice(0, Math.min(list.length, limit));
    const questions = [];

    for (const item of selected) {
      const qText = (item.question || '').trim();
      const ans = String(item.answer || '').trim();
      const analysis = (item.analysis || '').trim();
      const kp = (item.knowledge_point || '').trim();
      const gradeId = Number(item.grade_id);

      if (!qText || !ans) continue;

      // 映射年级: grade_id 7-9 为初中 (7_up, 8_up, 9_up), 10-12 为高中 (senior)
      let grade = 'senior';
      if (gradeId === 7) grade = '7_up';
      else if (gradeId === 8) grade = '8_up';
      else if (gradeId === 9) grade = '9_up';
      else if (gradeId <= 6 && gradeId > 0) grade = `${gradeId}_up`;

      questions.push({
        question: qText,
        options: '',
        standard_answer: ans,
        analysis: analysis || `标准答案为 ${ans}。`,
        key_insight: kp ? `核心考查知识点：${kp}。结合几何与代数综合推导。` : '注重数形结合思想与规范解题步骤。',
        grade,
        subject: '数学',
        chapter: kp || '初高中数学专项拔高',
        source: 'CMMaTH多模态数学大题库'
      });
    }

    console.log(`[CMMaTH] 成功解析 ${questions.length} 道初高中数学真题`);
    return questions;
  } catch (e) {
    console.warn('[CMMaTH Parse Error]', e.message);
    return [];
  }
}

/**
 * 转换 GAOKAO-Bench 试题文件
 */
function parseGaokaoFile(filePath, subjectName, defaultChapter, limit = 500) {
  if (!fs.existsSync(filePath)) {
    console.warn(`[Warning] 未找到 ${filePath}，跳过 ${subjectName} 导入`);
    return [];
  }

  try {
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    const examples = Array.isArray(raw.example) ? raw.example : [];
    const selected = examples.slice(0, Math.min(examples.length, limit));
    const questions = [];

    for (const item of selected) {
      const qText = (item.question || '').trim();
      const ans = Array.isArray(item.answer) ? item.answer.join('') : String(item.answer || '').trim();
      const analysis = (item.analysis || '').trim();
      const year = item.year || '高考';
      const category = item.category || '';

      if (!qText || !ans) continue;

      questions.push({
        question: qText,
        options: '',
        standard_answer: ans,
        analysis: analysis || `【标准答案】：${ans}\n【考查要点】：全国卷高考学科核心概念与逻辑推理能力。`,
        key_insight: `高考真题(${year} ${category})侧重考查基础概念的综合运用与严谨推导。`,
        grade: 'senior',
        subject: subjectName,
        chapter: defaultChapter,
        source: `GAOKAO-Bench全国高考${subjectName}真题`
      });
    }

    console.log(`[GAOKAO-Bench] [${subjectName}] 成功解析 ${questions.length} 道真题`);
    return questions;
  } catch (e) {
    console.warn(`[GAOKAO-Bench ${subjectName} Parse Error]`, e.message);
    return [];
  }
}

/**
 * 汇总 GAOKAO-Bench 各学科
 */
function transformGaokaoQuestions() {
  const math = parseGaokaoFile(GAOKAO_MATH_PATH, '数学', '高中数学综合选拔真题', 500);
  const physics = parseGaokaoFile(GAOKAO_PHYSICS_PATH, '物理', '高中物理力学与电磁学真题', 500);
  const chemistry = parseGaokaoFile(GAOKAO_CHEMISTRY_PATH, '化学', '高中化学反应原理与有机化学真题', 500);
  const biology = parseGaokaoFile(GAOKAO_BIOLOGY_PATH, '生物', '高中生物分子与遗传学真题', 500);
  const chinese = parseGaokaoFile(GAOKAO_CHINESE_PATH, '语文', '高中语文语言文字运用真题', 500);

  return [...math, ...physics, ...chemistry, ...biology, ...chinese];
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');

  console.log('====================================================');
  console.log('[Ingestion Pipeline] 启动全量优质题库扩容导入任务...');
  console.log('====================================================');

  const apeQuestions = transformApeQuestions(10000); // valid.ape.json 全部 5,000 道题
  const cmmathQuestions = transformCmmathQuestions(2000); // cmmath.json 全部 1,000 道题
  const gaokaoQuestions = transformGaokaoQuestions(); // 高考数、理、化、生、语
  const math23kQuestions = transformMath23kQuestions(30000); // Math23K 全部 23,162 道题

  const allQuestions = [...apeQuestions, ...cmmathQuestions, ...gaokaoQuestions, ...math23kQuestions];
  console.log(`[Ingestion Pipeline] 汇总待导入题目总计: ${allQuestions.length} 道`);

  const db = await getDb();
  await batchIngestQuestions(allQuestions, { db, dryRun });
  await db.close();
}

if (require.main === module) {
  main().catch(err => {
    console.error('[Fatal Ingestion Error]', err);
    process.exit(1);
  });
}

module.exports = {
  transformApeQuestions,
  transformCmmathQuestions,
  transformGaokaoQuestions,
  transformMath23kQuestions,
  inferApeGradeAndChapter
};

