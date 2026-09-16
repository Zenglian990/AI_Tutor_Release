/**
 * Homework Grading Multi-Tier Arbitration & Defense Validator
 * 多层确定性仲裁与批改防幻觉守门员
 */

const logger = require('./logger');
const { extractAndVerifyDeterministicMath } = require('./mathSolver');

/**
 * 提取选项字母 (A, B, C, D)
 */
function extractOptionLetter(str) {
  if (typeof str !== 'string') return null;
  const match = str.trim().match(/^[A-Da-d](?=[\s.、，:：\)]|$)/);
  return match ? match[0].toUpperCase() : null;
}

/**
 * 提取纯数字或带单位的数值
 */
function extractNumbers(str) {
  if (typeof str !== 'string') return [];
  const matches = str.match(/\d+(?:\.\d+)?/g);
  return matches ? matches.map(Number) : [];
}

/**
 * 校验并自动修复作业批改结果，杜绝幻觉
 */
function sanitizeAndArbitrateHomeworkResults(parsedData, context = {}) {
  if (!parsedData || !Array.isArray(parsedData.results)) {
    return parsedData;
  }

  const { subject = '数学' } = context;

  for (const item of parsedData.results) {
    const studentAns = String(item.studentAnswer || '').trim();
    let standardAns = String(item.standardAnswer || '').trim();
    const reason = String(item.mistakeReason || '').trim();
    const snippet = String(item.questionSnippet || '').trim();

    // ---- 1. 确定性理科/几何代数沙盒求解校验 ----
    if (subject === '数学' || !subject) {
      const mathVerification = extractAndVerifyDeterministicMath(snippet);
      if (mathVerification && mathVerification.matched) {
        logger.info(`[HomeworkValidator] Math deterministic rule matched for Q${item.questionNumber}: ${mathVerification.category}`);

        const expectedPerimeter = mathVerification.expectedPerimeter;
        const expectedChickens = mathVerification.expectedChickens;
        const expectedRabbits = mathVerification.expectedRabbits;

        // 如果包含周长检验
        if (expectedPerimeter !== undefined) {
          const studentNums = extractNumbers(studentAns);
          const studentHasCorrectPerimeter = studentNums.includes(expectedPerimeter);
          const studentOpt = extractOptionLetter(studentAns);

          // 检查标准答案是否包含正确周长
          const standardNums = extractNumbers(standardAns);
          const standardHasCorrectPerimeter = standardNums.includes(expectedPerimeter);

          // 若大模型标准答案算错了（如把16算成20），纠正标准答案解析
          if (!standardHasCorrectPerimeter) {
            logger.warn(`[HomeworkValidator] Model standardAnswer hallucinated for Q${item.questionNumber}, auto-injecting verified math solution`);
            item.standardAnswer = `【确定性公式校验】正确答案应为：${expectedPerimeter}厘米。\n${mathVerification.verifiedText}`;
            standardAns = item.standardAnswer;
          }

          // 若学生回答了正确周长（如写了16）或选了对应选项
          if (studentHasCorrectPerimeter) {
            item.status = 'correct';
            item.score = item.maxScore || 10;
            item.mistakeReason = '';
            logger.info(`[HomeworkValidator] Q${item.questionNumber}: Student answer matched verified perimeter ${expectedPerimeter}, forced correct`);
          }
        }

        // 鸡兔同笼检验
        if (expectedChickens !== undefined && expectedRabbits !== undefined) {
          const studentNums = extractNumbers(studentAns);
          if (studentNums.includes(expectedChickens) && studentNums.includes(expectedRabbits)) {
            item.status = 'correct';
            item.score = item.maxScore || 10;
            item.mistakeReason = '';
            logger.info(`[HomeworkValidator] Q${item.questionNumber}: Student answer matched chicken/rabbit solution, forced correct`);
          }
        }
      }
    }

    // ---- 2. 老师红笔批改标记与自洽性纠错 ----
    const textIndicatesCorrect = /修正为正确|判定为正确|实际上正确|实际是正确|实际正确|学生是对的|学生做对|打勾.*正确|红勾.*正确|无需订正|选[a-dA-D].*正确/i.test(reason);

    // ---- 3. 选择题选项字母对齐 ----
    const studentOpt = extractOptionLetter(studentAns);
    const standardOpt = extractOptionLetter(standardAns);
    const optMatches = Boolean(studentOpt && standardOpt && studentOpt === standardOpt);

    // ---- 4. 字符串完全匹配 ----
    const exactMatch = Boolean(studentAns && standardAns && studentAns.toLowerCase() === standardAns.toLowerCase());

    // 综合触发拦截与状态校准
    if (item.status === 'wrong' && (textIndicatesCorrect || optMatches || exactMatch)) {
      logger.info(`[HomeworkValidator] Auto-correcting false wrong status for Q${item.questionNumber} to correct (reasonHint=${textIndicatesCorrect}, optMatches=${optMatches}, exactMatch=${exactMatch})`);
      item.status = 'correct';
      item.score = item.maxScore || 10;
      item.mistakeReason = '';
    }
  }

  // 重新精确统计总数与正确率
  const results = parsedData.results;
  parsedData.totalCount = results.length;
  parsedData.correctCount = results.filter(r => r.status === 'correct').length;
  parsedData.wrongCount = results.filter(r => r.status === 'wrong').length;
  parsedData.accuracyPct = Math.round((parsedData.correctCount / Math.max(1, results.length)) * 100);

  return parsedData;
}

module.exports = {
  sanitizeAndArbitrateHomeworkResults,
  extractOptionLetter,
  extractNumbers
};
