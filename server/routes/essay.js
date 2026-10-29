const express = require('express');
const router = express.Router();
const logger = require('../services/logger');

/**
 * Heuristic evaluation for essay grading and sentence upgrading
 */
function heuristicEssayEvaluation(title, content, grade = '7_up') {
  const text = (content || '').trim();
  const charCount = text.length;
  const paragraphs = text.split(/\n+/).filter(p => p.trim().length > 0);
  const paraCount = paragraphs.length;

  const isHighSchool = ['10', '11', '12'].some(g => String(grade).startsWith(g));
  const maxScore = isHighSchool ? 60 : 50;

  // Paragraph length heuristics
  let structureScore = 8;
  if (paraCount >= 4 && paraCount <= 7) structureScore = isHighSchool ? 17 : 14;
  else if (paraCount >= 3) structureScore = isHighSchool ? 14 : 11;
  else structureScore = isHighSchool ? 10 : 8;

  // Length heuristics
  let depthScore = 8;
  if (charCount >= (isHighSchool ? 750 : 550)) depthScore = isHighSchool ? 18 : 14;
  else if (charCount >= (isHighSchool ? 500 : 400)) depthScore = isHighSchool ? 14 : 11;
  else depthScore = isHighSchool ? 10 : 8;

  // Rhetoric & Vocabulary heuristics
  const hasRhetoricKeywords = /如同|宛如|正如|仿佛|不仅.*而且|既.*又|春华秋实|微风拂面|波澜不惊|跌宕起伏/.test(text);
  const rhetoricScore = hasRhetoricKeywords ? (isHighSchool ? 17 : 14) : (isHighSchool ? 12 : 10);
  const emotionScore = isHighSchool ? 16 : 13;
  const standardsScore = isHighSchool ? 9 : 8;

  const totalScore = Math.min(maxScore, Math.round((depthScore + structureScore + rhetoricScore + emotionScore + standardsScore) * (maxScore / 70)));

  // Extract candidate sentences for upgrading
  const sentences = text.split(/([。！？!?\n])/).filter(s => s.trim().length > 8 && !/^[。！？!?\n]+$/.test(s));
  const sentenceUpgrades = [];

  if (sentences.length > 0) {
    const raw1 = sentences[0].trim();
    sentenceUpgrades.push({
      original: raw1,
      upgraded: `当晨曦的第一缕微光悄然拨开薄雾，${raw1.replace(/我|我们/, '心中那份沉甸甸的热忱')}便如破土的青芽般蔓延开来。`,
      technique: '环境烘托与比喻生动化',
      reason: '以具象的微光与薄雾营造沉浸式开头，化平铺直叙为情景交融，瞬间抓住阅卷老师眼球。'
    });
  }

  if (sentences.length > 2) {
    const raw2 = sentences[Math.min(2, sentences.length - 1)].trim();
    sentenceUpgrades.push({
      original: raw2,
      upgraded: `这不是一次偶然的停留，而是一场灵魂深处的叩问——${raw2}，在时光的褶皱里熠熠生辉。`,
      technique: '转折排比与立意拔高',
      reason: '增加哲思深度，将事件从表层生活经历升华为精神层面的感悟，直击中考一类文采分点。'
    });
  }

  return {
    total_score: totalScore,
    max_score: maxScore,
    grade_level_label: totalScore >= maxScore * 0.85 ? '一类文 (立意高远·文采斐然)' : totalScore >= maxScore * 0.75 ? '二类文 (条理清晰·情感真挚)' : '三类文 (需加强细节白描)',
    char_count: charCount,
    para_count: paraCount,
    dimensions: {
      depth: { score: Math.round(depthScore * 10 / 18), label: '立意深度', comment: charCount > 500 ? '主题立意明确，能够由表及里展现生活观察。' : '立意尚显平淡，建议结合社会生活深化精神内核。' },
      structure: { score: Math.round(structureScore * 10 / 17), label: '结构脉络', comment: paraCount >= 4 ? '起承转合结构严谨，首尾呼应自然。' : '段落稍显单一，建议按“点题-波澜-高潮-升华”分段。' },
      rhetoric: { score: Math.round(rhetoricScore * 10 / 17), label: '词句文采', comment: hasRhetoricKeywords ? '善用修辞与成语，语言具有一定感染力。' : '多为陈述句，可适当增加排比、拟人与通感修辞。' },
      emotion: { score: Math.round(emotionScore * 10 / 16), label: '情感真实', comment: '情感自然流露，细节抓取具备一定真情实感。' },
      standards: { score: Math.round(standardsScore * 10 / 9), label: '书写规范', comment: '标点使用规范，段首空两格格式标准。' }
    },
    highlights: [
      '✅ 选材切合学生生活实际，具备天然的真实感染力',
      '✅ 文章叙事脉络较为完整，能够清楚表达事件起因与经过'
    ],
    suggestions: [
      '💡 建议强化“动词白描”：少用抽象形容词，多用“攥、掠、凝视、抽打”等精准动词刻画瞬间。',
      '💡 结尾段落增加“议论抒情”句式，将个案经历升华为人生哲理，提高得分档次。'
    ],
    sentence_upgrades: sentenceUpgrades
  };
}

const { fetchWithKeyRotation, buildChatURL } = require('../services/embedding');
const { extractAndParseJson } = require('../utils/jsonParser');

/**
 * Call real LLM to grade essay and generate customized sentence upgrades
 */
async function gradeEssayWithLLM(title, content, grade, reqHeaders = {}) {
  const isHighSchool = ['10', '11', '12'].some(g => String(grade).startsWith(g));
  const maxScore = isHighSchool ? 60 : 50;
  const charCount = content.trim().length;
  const paragraphs = content.trim().split(/\n+/).filter(p => p.trim().length > 0);
  const paraCount = paragraphs.length;

  const prompt = `你是一位拥有20年中高考语文阅卷经验的特级教师。请根据全国中高考作文评分标准，对学生的习作《${title || '未命题'}》进行全维度深度诊断，并挑选2-3处具有提升潜力的平淡语句进行逐句点石成金的升格润色。

【学生年级】：${grade || '七年级'}
【习作题目】：${title || '未命题'}
【习作正文】：
${content}

【满分基准】：${maxScore}分
【输出规范】：必须严格返回一个合法的 JSON 对象，不包含任何 Markdown 格式外的前后缀，字段格式必须与以下结构完全一致：
{
  "total_score": 综合得分(整数，满分${maxScore}分),
  "max_score": ${maxScore},
  "grade_level_label": "得分档次(如：一类文 (立意高远·文采斐然) 或 二类文 (条理清晰·情感真挚) 或 三类文 (基础扎实·有待升华))",
  "char_count": ${charCount},
  "para_count": ${paraCount},
  "dimensions": {
    "depth": { "score": 9, "label": "立意深度", "comment": "立意评语(20-40字)" },
    "structure": { "score": 8, "label": "结构脉络", "comment": "结构评语(20-40字)" },
    "rhetoric": { "score": 8, "label": "词句文采", "comment": "文采评语(20-40字)" },
    "emotion": { "score": 9, "label": "情感真实", "comment": "情感评语(20-40字)" },
    "standards": { "score": 9, "label": "书写规范", "comment": "规范评语(20-40字)" }
  },
  "highlights": [
    "✅ 亮点1：具体点评文章最出彩的地方",
    "✅ 亮点2：具体点评细节或立意"
  ],
  "suggestions": [
    "💡 建议1：针对扣分痛点给出针对性可操作建议",
    "💡 建议2：如何在高压考场上快速提分"
  ],
  "sentence_upgrades": [
    {
      "original": "从原文中摘录的一句具体平淡句子(必须来自原文)",
      "upgraded": "由你亲笔润色后的高分金句(运用动词白描、比喻通感或哲思升华)",
      "technique": "所用修辞技巧(如：动词白描与环境烘托 / 虚实相生与立意升华)",
      "reason": "名师提分点拨(说明为何这样改能抓住阅卷老师眼球)"
    }
  ]
}`;

  const options = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-deepseek-api-key': reqHeaders['x-deepseek-api-key'] || reqHeaders['X-DeepSeek-Api-Key'] || '',
      'x-deepseek-api-url': reqHeaders['x-deepseek-api-url'] || reqHeaders['X-DeepSeek-Api-Url'] || '',
      'x-gemini-api-key': reqHeaders['x-gemini-api-key'] || reqHeaders['X-Gemini-Api-Key'] || ''
    },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.4,
        maxOutputTokens: 2048,
        responseMimeType: 'application/json'
      }
    })
  };

  const response = await fetchWithKeyRotation(buildChatURL, options, 3, 40000);
  if (!response.ok) {
    throw new Error(`LLM upstream returned status ${response.status}`);
  }
  const rawData = await response.json();
  const text = rawData?.candidates?.[0]?.content?.parts?.[0]?.text || rawData?.choices?.[0]?.message?.content;
  if (!text) throw new Error('Empty text from LLM response');

  const parsed = extractAndParseJson(text);
  if (!parsed || typeof parsed.total_score !== 'number' || !parsed.dimensions) {
    throw new Error('Malformed JSON structure from LLM essay grader');
  }

  parsed.total_score = Math.min(maxScore, Math.max(1, Math.round(parsed.total_score)));
  parsed.max_score = maxScore;
  parsed.char_count = charCount;
  parsed.para_count = paraCount;
  if (!Array.isArray(parsed.sentence_upgrades) || parsed.sentence_upgrades.length === 0) {
    const fallback = heuristicEssayEvaluation(title, content, grade);
    parsed.sentence_upgrades = fallback.sentence_upgrades;
  }
  return parsed;
}

/**
 * POST /api/essay/grade-and-upgrade
 * 中高考作文全维度名师精批与逐句升格接口
 */
router.post('/essay/grade-and-upgrade', async (req, res) => {
  try {
    const { title, content, grade, prompt_theme } = req.body;

    if (!content || typeof content !== 'string' || content.trim().length < 20) {
      return res.status(400).json({ error: '作文内容过短，请至少输入 20 字以上以便名师深入批阅！' });
    }

    try {
      const llmResult = await gradeEssayWithLLM(title, content, grade, req.headers);
      logger.info(`[Essay] Successfully graded essay "${title || '未命题'}" via LLM rubric.`);
      return res.json({ success: true, data: llmResult, engine: 'llm-rubric' });
    } catch (llmErr) {
      logger.warn(`[Essay] LLM grading failed or unavailable (${llmErr.message}), falling back to expert rubric heuristics.`);
      const heuristicResult = heuristicEssayEvaluation(title, content, grade);
      return res.json({ success: true, data: heuristicResult, engine: 'expert-rubric-fallback' });
    }
  } catch (err) {
    logger.error('[Essay] Evaluation failed:', err);
    res.status(500).json({ error: '作文批改服务异常，请稍后重试' });
  }
});

module.exports = {
  router,
  heuristicEssayEvaluation,
  gradeEssayWithLLM
};
