const express = require('express');
const router = express.Router();
const logger = require('../services/logger');

/**
 * 费曼以教代学评估服务 (Feynman Technique Reverse Tutoring Engine)
 * 核心逻辑：
 * 1. 角色颠倒：学生当老师，虚拟同桌“小明”当好奇的学生
 * 2. 评估学生表达中包含的因果逻辑词、数学/科学核心术语与解题步骤完整度
 * 3. “小明”以童趣、好学、略带迷糊的语气提出高质量启发式追问 (装不懂检验真懂)
 * 4. 给出费曼掌握度星级与思维表达力战报
 */

const LOGIC_CONNECTORS = [
  '因为', '所以', '首先', '第一步', '接着', '然后', '接下来',
  '由于', '转化', '代入', '移项', '两边同时', '根据定理', '显然', '由此可得'
];

const DOMAIN_TERMS = {
  math: [
    '方程', '未知数', '去分母', '去括号', '移项', '合并同类项', '系数化为1',
    '判别式', '韦达定理', '配方', '因式分解', '公式法', '二次函数', '对称轴', '顶点',
    '中点', '垂线', '垂直', '角平分线', '全等', '相似', '平行', '轴对称', '勾股定理',
    '直角', '截长补短', '倍长中线', '面积', '底乘高', '割补法', '平均分', '余数',
    '进位', '退位', '借一当十', '分子', '分母', '通分', '约分'
  ],
  physics: [
    '重力', '浮力', '压力', '压强', '密度', '速度', '摩擦力', '二力平衡',
    '杠杆', '功', '功率', '机械效率', '电路', '串联', '并联', '电压', '电流',
    '电阻', '欧姆定律', '滑动变阻器', '凸透镜', '焦点', '焦距', '物距', '像距',
    '折射', '反射', '实像', '虚像'
  ],
  chemistry: [
    '分子', '原子', '元素', '化学式', '反应物', '生成物', '质量守恒', '化学方程式',
    '配平', '溶液', '溶质', '溶剂', '溶解度', '酸', '碱', '盐', '中和反应', '沉淀'
  ]
};

function evaluateFeynmanExplanation({ question = '', explanation = '', studentName = '曾练', subject = '数学' }) {
  const text = (explanation || '').trim();

  // 1. 长度过短防御
  if (text.length < 8) {
    return {
      mastery_score: 55,
      stars: 2,
      peer_reply: `小明挠了挠头：“${studentName}老师，我刚才有点走神没听明白，你能从第一步开始，详细讲讲是怎么想到的吗？”`,
      follow_up_question: '你能先告诉我题目里哪个条件是最关键的突破口吗？',
      key_points_covered: [],
      praise: '万事开头难，大胆开口就是好样的！试着像给同桌讲悄悄话一样说出来吧！',
      logic_rating: '需要展开'
    };
  }

  // 2. 检测逻辑关联词
  const detectedLogics = LOGIC_CONNECTORS.filter(c => text.includes(c));

  // 3. 检测学科术语
  const termsList = DOMAIN_TERMS[subject === '物理' ? 'physics' : (subject === '化学' ? 'chemistry' : 'math')];
  const detectedTerms = termsList.filter(t => text.includes(t) || question.includes(t) && text.includes(t.slice(0, 2)));

  // 4. 计算掌握度评分 (60 ~ 98)
  let score = 70;
  score += Math.min(15, detectedLogics.length * 3);
  score += Math.min(15, detectedTerms.length * 4);
  if (text.length > 50) score += 5;
  if (text.length > 100) score += 3;
  score = Math.min(98, Math.max(60, score));

  // 5. 换算星级
  let stars = 3;
  if (score >= 90) stars = 5;
  else if (score >= 80) stars = 4;

  // 6. 生成小明的拟人化角色追问 (装不懂引导深化)
  let peerReply = '';
  let followUp = '';

  if (text.includes('变号') || text.includes('移项')) {
    peerReply = `小明恍然大悟：“哇！${studentName}老师，原来要把常数移到等号另一边！你讲得比黑板上清楚多了！”`;
    followUp = '但我有个小迷糊：为什么移过等号就要变号呢？如果不变号会发生什么可怕的事？';
  } else if (text.includes('全等') || text.includes('中点') || text.includes('辅助线')) {
    peerReply = `小明连连点头：“天哪！${studentName}老师，这条辅助线加得太神了！两边三角形一下子就一模一样了！”`;
    followUp = '那如果题目里的中点变成了角平分线，还能用这个倍长的方法吗？';
  } else if (text.includes('平均') || text.includes('余数') || text.includes('乘') || text.includes('除')) {
    peerReply = `小明拍手笑道：“我懂啦！就像分糖果一样，每人拿一样多才叫平均分！”`;
    followUp = '那如果最后剩下的糖果不够每人分一个，剩下的应该放在哪里呀？';
  } else if (detectedTerms.length > 0) {
    const term = detectedTerms[0];
    peerReply = `小明记笔记道：“原来这里的关键是【${term}】！${studentName}老师讲得条理太清晰了！”`;
    followUp = `你能再用一句最简单的话告诉我，为什么必须用到【${term}】吗？`;
  } else {
    peerReply = `小明听得很投入：“哇，听${studentName}老师这么一梳理，我感觉自己摸到门道了！”`;
    followUp = '这道题如果让你出一道变式题考倒我，你会把哪个数字或者条件改掉？';
  }

  const praiseList = [
    '你能把解题逻辑清楚讲给别人听，说明你的大脑已经完成了高阶认知内化！',
    '表达极其自信，逻辑层层递进，很有特级教师的风范！',
    '恭喜你激活了费曼学习法最高层——“教是最好的学”！',
    '思路清晰，抓住了本题的核心突破口，继续保持这种表达力！'
  ];
  const praise = praiseList[Math.floor(Math.random() * praiseList.length)];

  return {
    mastery_score: score,
    stars,
    peer_reply: peerReply,
    follow_up_question: followUp,
    key_points_covered: detectedTerms.slice(0, 4),
    logic_words_count: detectedLogics.length,
    praise,
    logic_rating: detectedLogics.length >= 2 ? '逻辑严密' : '叙述自然'
  };
}

// POST /api/feynman/evaluate
router.post('/feynman/evaluate', (req, res) => {
  try {
    const { question, student_explanation, student_name, subject, grade } = req.body || {};

    if (!student_explanation || typeof student_explanation !== 'string') {
      return res.status(400).json({
        success: false,
        error: '缺少学生口述讲解内容'
      });
    }

    const evaluation = evaluateFeynmanExplanation({
      question: question || '',
      explanation: student_explanation,
      studentName: student_name || '曾练',
      subject: subject || '数学',
      grade: grade || '7_up'
    });

    return res.json({
      success: true,
      data: evaluation
    });
  } catch (err) {
    logger.error(`[Feynman API Error]: ${err.message}`);
    return res.status(500).json({
      success: false,
      error: '费曼评估计算服务暂时不可用'
    });
  }
});

module.exports = {
  router,
  evaluateFeynmanExplanation
};
