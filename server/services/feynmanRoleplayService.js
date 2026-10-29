/**
 * feynmanRoleplayService.js
 * 费曼学习法“虚拟小同桌”反向请教与三维逻辑评估引擎
 * 
 * 核心心理机制：
 * 1. 角色颠倒：学生当“小老师”，AI 扮演“好学但偶尔卡壳的同桌小明”。
 * 2. 启发式反馈：以同龄人顿悟或疑惑反问诱导学生主动反思。
 * 3. 三维评估向量：概念准确性 (Accuracy)、逻辑因果链 (Logic)、通俗比喻度 (Analogy)。
 */

const logger = require('./logger');

// Benchmark Feynman Peer Challenges for Core K-9 Concepts
const PEER_CHALLENGES = {
  math_pythagorean: {
    question: '练练小老师，我一直搞不懂：为什么直角三角形一定是 a² + b² = c² 呀？锐角三角形为什么就不能直接用这个公式呢？你能用拼图或者生活中的例子给我讲讲原理吗？',
    coreConcepts: ['直角', '勾股', '平方', '斜边', '面积', '弦图', '直角边'],
    analogyKeywords: ['正方形', '拼图', '梯形', '割补', '拐角', '弦图', '生活', '就像', '比如']
  },
  math_linear_function: {
    question: '练练同学，解析式 y = kx + b 里面，k 和 b 到底代表什么呀？为什么说 k 变大了直线就更陡峭了，b 变了只是上下平移？你能像爬山或者算水费一样解释给我听吗？',
    coreConcepts: ['斜率', '变化率', '截距', '平移', '倾斜', '直线'],
    analogyKeywords: ['坡度', '爬山', '水费', '起步价', '步长', '倾斜角', '比如', '就像']
  },
  math_quadratic_function: {
    question: '小老师，二次函数 y = a(x - h)² + k 为什么写成这种形式后，顶点就能直接看出来是 (h, k) 呀？那个 (x - h) 里面为什么是减号，图象却要往右移？我老是记反！',
    coreConcepts: ['顶点', '配方', '平方', '极值', '对称轴', '平移'],
    analogyKeywords: ['零点', '最小值', '最大值', '对称', '起跑线', '比如', '就像']
  },
  math_congruent_triangles: {
    question: '小老师，为什么“边边角 (SSA)”不能证明三角形全等，而“边角边 (SAS)”就可以？你在草稿纸上画一下，为什么角在旁边就可能会画出两个不一样的三角形？',
    coreConcepts: ['全等', '夹角', '两边', '确定', '对应边', '交点'],
    analogyKeywords: ['圆规', '圆弧', '夹住', '晃动', '两解', '钝角', '比如', '就像']
  }
};

/**
 * Builds system prompt for Peer Student Roleplay
 * @param {string} conceptName - Name of concept being taught
 * @param {string} studentName - Student's name (e.g. 曾练)
 * @param {string} grade - Current grade
 * @returns {string} System prompt block
 */
function generatePeerStudentPersonaPrompt(conceptName = '数学定理', studentName = '曾练同学', grade = '初中') {
  return `【🧑‍🤝‍🧑 虚拟小同桌角色扮演模式（费曼以教代学系统）】
- 你的身份：你现在不是威严的名师，而是${studentName}的初中同班同学兼好朋友“小明”。
- 性格特征：真诚求知、性格谦逊活泼、对数理规律充满好奇，但偶尔被抽象符号绕晕。
- 交互目标：你正拿着草稿纸向“${studentName}小老师”虚心请教【${conceptName}】。
- 关键规则：
  1. 绝对不要反客为主给学生讲大道理，必须始终保持“求教者与聆听者”的同伴身份。
  2. 针对${studentName}讲解的漏洞，以真实好奇心提出具体的疑问（如：“等等，为什么这里能约分呀？如果分母是0怎么办？”）。
  3. 当${studentName}用生活例子（如爬山、分蛋糕、欠钱、拔河）讲通了，你要表现出“恍然大悟”的欣喜顿悟（“哇！原来是这样，你这个比喻神了！”）。
  4. 每次回复控制在 2-4 句话以内，像真同桌在草稿纸旁交流一样自然。`;
}

/**
 * Evaluates student's explanation across 3 dimensions:
 * 1. Accuracy (0-100)
 * 2. Logic chain (0-100)
 * 3. Analogy & Clarity (0-100)
 * 
 * @param {string} studentExplanation - Text provided by student
 * @param {string} conceptKey - Key in PEER_CHALLENGES or generic
 * @returns {Object} Evaluation report
 */
function evaluateFeynmanExplanation(studentExplanation = '', conceptKey = 'math_pythagorean') {
  const text = String(studentExplanation).trim();
  const benchmark = PEER_CHALLENGES[conceptKey] || {
    coreConcepts: ['原理', '公式', '条件', '推导'],
    analogyKeywords: ['比如', '比方', '像', '生活', '相当于', '画图']
  };

  if (!text || text.length < 5) {
    return {
      passed: false,
      overallScore: 20,
      accuracy: 20,
      logic: 10,
      analogy: 10,
      feedback: '同桌小明歪了歪头：“小老师，你还没开始讲呢，快多教教我嘛！”'
    };
  }

  // 1. Concept Accuracy: match core concepts
  let matchedConcepts = 0;
  for (const c of benchmark.coreConcepts) {
    if (text.includes(c)) matchedConcepts++;
  }
  const requiredHits = Math.min(3, benchmark.coreConcepts.length);
  const accuracy = Math.min(100, Math.round((Math.min(matchedConcepts, requiredHits) / requiredHits) * 80 + (text.length > 20 ? 20 : 0)));

  // 2. Logic Chain: causality markers
  const logicWords = ['因为', '所以', '如果', '那么', '由于', '推导', '导致', '必然', '等于', '才能'];
  let matchedLogic = 0;
  for (const lw of logicWords) {
    if (text.includes(lw)) matchedLogic++;
  }
  const logic = Math.min(100, Math.round(matchedLogic * 25 + (text.length > 30 ? 25 : 0)));

  // 3. Analogy & Clarity
  let matchedAnalogy = 0;
  for (const aw of benchmark.analogyKeywords) {
    if (text.includes(aw)) matchedAnalogy++;
  }
  const analogy = Math.min(100, Math.round(matchedAnalogy * 35 + (text.includes('比如') || text.includes('就像') ? 30 : 0)));

  // Composite Weighted Score: 40% accuracy, 35% logic, 25% analogy
  const overallScore = Math.round(accuracy * 0.4 + logic * 0.35 + analogy * 0.25);
  const passed = overallScore >= 60;

  let feedback = '';
  if (overallScore >= 80) {
    feedback = '同桌小明眼前一亮，疯狂点头：“哇！小老师，你这个解释太绝了！因果关系非常清楚，我彻底想明白了！🎉”';
  } else if (passed) {
    feedback = '同桌小明若有所思：“听懂大部分了！核心点你点到了，不过如果能再给我画个草图或者举个生活例子，我就更通透啦！”';
  } else {
    feedback = '同桌小明抓了抓头发，有些困惑：“等等小老师，我有点没跟上，这里因果关系能不能再带我推一步呀？”';
  }

  return {
    passed,
    overallScore,
    accuracy,
    logic,
    analogy,
    feedback
  };
}

module.exports = {
  PEER_CHALLENGES,
  generatePeerStudentPersonaPrompt,
  evaluateFeynmanExplanation
};
