const express = require('express');
const router = express.Router();
const logger = require('../services/logger');
const { fetchWithKeyRotation, buildChatURL } = require('../services/embedding');
const { extractClientAiHeaders } = require('../utils/aiHeaders');
const { extractAndParseJson } = require('../utils/jsonParser');
const { requireQuotaOrVip } = require('../middleware/quota');
const { formatGradeName } = require('../prompts/guidelines');

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
    '高锰酸钾', '氯酸钾', '二氧化锰', '过氧化氢', '氧气', '二氧化碳', '排水法', '向上排空气法',
    '试管口略向下倾斜', '冷凝水倒流', '质量守恒', '化学方程式', '催化剂', '分解反应', '化合反应',
    '置换反应', '复分解反应', '中和反应', '氧化还原', '摩尔质量', '物质的量',
    '分子', '原子', '离子', '元素', '化学式', '反应物', '生成物', '配平', '溶液', '溶质', '溶剂', '溶解度', '沉淀', '酸碱中和'
  ]
};

function evaluateFeynmanExplanation({ question = '', explanation = '', studentName = '同学', subject = '数学' }) {
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

  // 3. 检测学科术语（按词长降序优先匹配完整术语，严禁把“高锰酸钾”错误截断成单字“酸”）
  const termsList = [...(DOMAIN_TERMS[subject === '物理' ? 'physics' : (subject === '化学' ? 'chemistry' : 'math')] || DOMAIN_TERMS.math)]
    .sort((a, b) => b.length - a.length);
  const detectedTerms = termsList.filter(t => t.length >= 2 && text.includes(t));

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

// POST /api/feynman/evaluate — 真实 AI 费曼以教代学评估与苏格拉底同桌追问（极速轻量模式，异常时安全兜底）
router.post('/feynman/evaluate', requireQuotaOrVip('feynman'), async (req, res) => {
  try {
    const { question = '', student_explanation, student_name = '同学', subject = '数学', grade = '7_up' } = req.body || {};

    if (!student_explanation || typeof student_explanation !== 'string' || !student_explanation.trim()) {
      return res.status(400).json({
        success: false,
        error: '缺少学生口述讲解内容'
      });
    }

    const cleanExplanation = student_explanation.trim().slice(0, 1500);
    const cleanQuestion = String(question || '').trim().slice(0, 800);
    const gradeLabel = formatGradeName(grade);
    const profileId = req.auth?.activeProfileId || 'default';

    // 短于 6 字的敷衍回答直接快速反馈
    if (cleanExplanation.length < 6) {
      const quickEval = evaluateFeynmanExplanation({
        question: cleanQuestion,
        explanation: cleanExplanation,
        studentName: student_name,
        subject
      });
      return res.json({ success: true, engine: 'quick-check', data: quickEval });
    }

    const prompt = `你是“费曼以教代学”模式里好奇又爱钻研的虚拟同桌“小明”。当前你的“小老师”是${gradeLabel}的${student_name}同学，学科：${subject}。
【原题/知识点】：${cleanQuestion || '学生自选知识点讲解'}
【小老师刚才的讲解】：${cleanExplanation}

请严格完成以下任务：
1. 真正检查小老师讲的科学/逻辑内容是否准确、是否遗漏关键条件或存在概念误区（绝不胡乱吹捧错误讲解，也不要机械抠字眼）。
2. 以同桌“小明”的自然口吻回应，并针对本次讲解中最关键的原理漏洞或容易混淆的细节，提出一个真正有启发性的深度追问。
3. 给出客观掌握度评分（40~98）与 1~5 颗星。

严格输出纯 JSON（禁止 Markdown 代码块）：
{
  "mastery_score": 85,
  "stars": 4,
  "peer_reply": "小明以同桌口吻给出的具体、针对本次讲解内容的回应（60字以内）",
  "follow_up_question": "小明紧扣本题核心原理提出的一个高质量追问（40字以内）",
  "key_points_covered": ["学生实际讲到的核心概念词，最多4个，没讲到就留空数组"],
  "praise": "一句具体、有教学针对性的点评或纠偏建议（45字以内）",
  "logic_rating": "逻辑严密 | 清晰准确 | 需补关键步骤 | 存在概念偏差"
}`;

    try {
      const response = await fetchWithKeyRotation(buildChatURL, {
        method: 'POST',
        profileId,
        headers: {
          'Content-Type': 'application/json',
          ...extractClientAiHeaders(req)
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.4,
            maxOutputTokens: 600,
            responseMimeType: 'application/json',
            thinkingConfig: { thinkingBudget: 0 }
          }
        })
      }, 2, 12000);

      if (!response.ok) throw new Error(`Upstream status ${response.status}`);
      const rawJson = await response.json();
      const rawText = rawJson?.candidates?.[0]?.content?.parts?.[0]?.text || '';
      const parsed = extractAndParseJson(rawText);
      if (!parsed || typeof parsed.peer_reply !== 'string') {
        throw new Error('Malformed JSON from Feynman LLM');
      }

      const safeScore = Math.max(40, Math.min(98, Math.round(Number(parsed.mastery_score) || 75)));
      const safeStars = Math.max(1, Math.min(5, Math.round(Number(parsed.stars) || (safeScore >= 90 ? 5 : safeScore >= 80 ? 4 : safeScore >= 65 ? 3 : 2))));
      return res.json({
        success: true,
        engine: 'llm-feynman',
        data: {
          mastery_score: safeScore,
          stars: safeStars,
          peer_reply: parsed.peer_reply,
          follow_up_question: parsed.follow_up_question || '如果换一个条件，你觉得结论还会成立吗？',
          key_points_covered: Array.isArray(parsed.key_points_covered) ? parsed.key_points_covered.slice(0, 4) : [],
          praise: parsed.praise || '你能把知识讲给别人听，已经迈出了深度学习最关键的一步！',
          logic_rating: parsed.logic_rating || '清晰准确'
        }
      });
    } catch (llmErr) {
      logger.warn(`[Feynman] LLM unavailable (${llmErr.message}), falling back to local heuristic evaluator.`);
      const evaluation = evaluateFeynmanExplanation({
        question: cleanQuestion,
        explanation: cleanExplanation,
        studentName: student_name,
        subject
      });
      return res.json({
        success: true,
        engine: 'local-feynman-fallback',
        isFallback: true,
        data: evaluation
      });
    }
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
