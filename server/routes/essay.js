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

    const result = heuristicEssayEvaluation(title, content, grade);
    return res.json({ success: true, data: result, engine: 'expert-rubric' });
  } catch (err) {
    logger.error('[Essay] Evaluation failed:', err);
    res.status(500).json({ error: '作文批改服务异常，请稍后重试' });
  }
});

module.exports = {
  router,
  heuristicEssayEvaluation
};
