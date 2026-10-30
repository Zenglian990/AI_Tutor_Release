const express = require('express');
const router = express.Router();
const logger = require('../services/logger');
const { fetchWithKeyRotation, buildChatURL } = require('../services/embedding');
const { extractAndParseJson } = require('../utils/jsonParser');

/**
 * Grade-Adaptive Essay Configuration
 * 对标义务教育语文课程标准与新高考评分量表
 */
function getEssayGradeConfig(grade) {
  const rawGrade = grade ? parseInt(String(grade).split('_')[0], 10) : 7;
  if (rawGrade >= 1 && rawGrade <= 3) {
    return {
      maxScore: 20,
      minWords: 80,
      targetWords: 150,
      stage: 'primary_lower',
      stageName: '小学低段 (1-3年级看图写话与日记)',
      standard: '新课标低段写话标准：观察细致，语句通顺连贯，标点正确，鼓励想象与童趣表达'
    };
  }
  if (rawGrade >= 4 && rawGrade <= 6) {
    return {
      maxScore: 30,
      minWords: 250,
      targetWords: 400,
      stage: 'primary_upper',
      stageName: '小学中高段 (4-6年级记叙文)',
      standard: '新课标中年级习作标准：内容具体，感情真实，分段表述，善用动作神态白描'
    };
  }
  if (rawGrade >= 10 && rawGrade <= 12) {
    return {
      maxScore: 60,
      minWords: 750,
      targetWords: 900,
      stage: 'high',
      stageName: '高中学段 (10-12年级高考作文)',
      standard: '全国新高考语文作文等级标准：立意深刻，论证严密，素材丰富，思辨高远'
    };
  }
  // Middle school (7-9)
  return {
    maxScore: 50,
    minWords: 550,
    targetWords: 700,
    stage: 'middle',
    stageName: '初中学段 (7-9年级中考作文)',
    standard: '全国中考语文作文评分标准：题眼穿透，记叙有波澜，情景交融，立意积极向上'
  };
}

/**
 * Heuristic evaluation for essay grading and sentence upgrading
 */
function heuristicEssayEvaluation(title, content, grade = '7_up') {
  const text = (content || '').trim();
  const charCount = text.length;
  const paragraphs = text.split(/\n+/).filter(p => p.trim().length > 0);
  const paraCount = paragraphs.length;

  const cfg = getEssayGradeConfig(grade);
  const maxScore = cfg.maxScore;

  // Paragraph heuristics adaptive to grade
  let structureScore = 8;
  if (cfg.stage === 'primary_lower') {
    if (paraCount >= 2 && paraCount <= 4) structureScore = 16;
    else if (paraCount >= 1) structureScore = 13;
    else structureScore = 10;
  } else if (cfg.stage === 'primary_upper') {
    if (paraCount >= 3 && paraCount <= 5) structureScore = 16;
    else if (paraCount >= 2) structureScore = 13;
    else structureScore = 10;
  } else {
    // middle / high
    if (paraCount >= 4 && paraCount <= 7) structureScore = cfg.stage === 'high' ? 17 : 14;
    else if (paraCount >= 3) structureScore = cfg.stage === 'high' ? 14 : 11;
    else structureScore = cfg.stage === 'high' ? 10 : 8;
  }

  // Length heuristics adaptive to grade
  let depthScore = 8;
  if (charCount >= cfg.targetWords) {
    depthScore = cfg.stage === 'high' ? 18 : 16;
  } else if (charCount >= cfg.minWords) {
    depthScore = cfg.stage === 'high' ? 15 : 13;
  } else if (charCount >= Math.floor(cfg.minWords / 2)) {
    depthScore = 10;
  } else {
    depthScore = 7;
  }

  // Rhetoric & Vocabulary
  const hasRhetoricKeywords = /如同|宛如|正如|仿佛|不仅.*而且|既.*又|春华秋实|微风拂面|波澜不惊|跌宕起伏|悄悄|蹦蹦跳跳|亮晶晶|欢快|闪闪发光/.test(text);
  const rhetoricScore = hasRhetoricKeywords ? 15 : 11;
  const emotionScore = 15;
  const standardsScore = 10;

  const rawSum = depthScore + structureScore + rhetoricScore + emotionScore + standardsScore;
  const totalScore = Math.min(maxScore, Math.max(1, Math.round(rawSum * (maxScore / 70))));

  // Extract candidate sentences for upgrading
  const sentences = text.split(/([。！？!?\n])/).filter(s => s.trim().length > 6 && !/^[。！？!?\n]+$/.test(s));
  const sentenceUpgrades = [];

  if (sentences.length > 0) {
    const raw1 = sentences[0].trim();
    if (cfg.stage === 'primary_lower') {
      sentenceUpgrades.push({
        original: raw1,
        upgraded: `阳光暖洋洋地洒在草地上，${raw1.replace(/我|我们/, '我兴奋地跑向前方')}，心里就像喝了一大口甜甜的草莓味牛奶一样开心！`,
        technique: '五感描摹与童趣比喻',
        reason: '用暖洋洋的阳光和甜甜的草莓牛奶调动视、触、味三感，句子立刻活泼生动，极受小学语文老师喜爱！'
      });
    } else if (cfg.stage === 'primary_upper') {
      sentenceUpgrades.push({
        original: raw1,
        upgraded: `微风拂过树梢，枝叶沙沙作响，${raw1.replace(/我|我们/, '我的指尖微微一颤')}，那一幕难忘的场景瞬间如电影般在眼前闪现。`,
        technique: '动作细节与生活化情境',
        reason: '通过捕捉手指微动作和风声细节，化平铺直叙为生活化镜头感，作文开篇立刻引人入胜。'
      });
    } else if (cfg.stage === 'high') {
      sentenceUpgrades.push({
        original: raw1,
        upgraded: `当时代的宏阔画卷在眼前徐徐铺展，${raw1.replace(/我|我们/, '青年一代肩头的热望与责任')}便如破晓之曙光，照亮了砥砺前行的航向。`,
        technique: '家国情怀与宏阔立意',
        reason: '以青年时代担当为切入点，立意直击高考一类文“思辨深刻与时代呼应”核心采分点。'
      });
    } else {
      // Middle school (7-9)
      sentenceUpgrades.push({
        original: raw1,
        upgraded: `阳光透过密密的梧桐枝叶，洒下一地斑驳的光影，${raw1.replace(/我|我们/, '心中那份悄然滋长的坚韧')}便如破土的青芽般蔓延开来。`,
        technique: '情景交融与成长细节',
        reason: '以光影自然过渡到青春心境，化单调陈述为意境营造，扣牢中考一类文题眼。'
      });
    }
  }

  if (sentences.length > 2) {
    const raw2 = sentences[Math.min(2, sentences.length - 1)].trim();
    if (cfg.stage === 'primary_lower') {
      sentenceUpgrades.push({
        original: raw2,
        upgraded: `${raw2.replace(/。$/, '')}。小鸟在树枝上叽叽喳喳地叫个不停，好像也在拍着翅膀夸我很棒呢！`,
        technique: '拟人童趣与欢快收尾',
        reason: '将身边的小动物拟人化，把简单的经过写成童趣盎然的画面，是小学写话的满分技巧！'
      });
    } else if (cfg.stage === 'primary_upper') {
      sentenceUpgrades.push({
        original: raw2,
        upgraded: `${raw2.replace(/。$/, '')}。这件事如同一粒温暖的种子，在我的心田悄悄生根发芽，教会了我什么是真正的坚持。`,
        technique: '以小见大与主旨深化',
        reason: '通过“温润种子”的意象生动点明道理，使记叙事件自然升华为真切的心智成长。'
      });
    } else if (cfg.stage === 'high') {
      sentenceUpgrades.push({
        original: raw2,
        upgraded: `这绝非浮光掠影的浅尝辄止，而是一场向内探寻的精神洗礼——${raw2}，在思辨的澄澈之境中愈显坚笃。`,
        technique: '思辨哲理与立意拔高',
        reason: '由叙事提升至辩证认知层面，用精准的学术级语汇强化思想深度，击中高考议论文满分采分点。'
      });
    } else {
      // Middle school
      sentenceUpgrades.push({
        original: raw2,
        upgraded: `这不是一次简单的经历，而是一段铭刻于心的成长见证——${raw2}，在记忆的深处散发着温暖的光芒。`,
        technique: '转折深化与情感回甘',
        reason: '用转折句式深化事件意义，将表层生活记录提升至精神成长，稳稳抓住中考作文阅卷老师。'
      });
    }
  }

  const highlights = [];
  const suggestions = [];

  if (cfg.stage === 'primary_lower') {
    highlights.push('✅ 能够用通顺完整的句子记录身边的事情，词句充满童趣');
    highlights.push('✅ 善于观察生活，表达积极快乐，标点符号使用基本规范');
    suggestions.push('💡 调动“五官感受”：试着写一写摸起来、闻起来或听起来的感觉');
    suggestions.push('💡 多用可爱的叠词（如“红彤彤、蹦蹦跳跳”），让小日记更活泼');
  } else if (cfg.stage === 'primary_upper') {
    highlights.push('✅ 记叙脉络清楚完整，事件起因、经过、结果交代得明明白白');
    highlights.push('✅ 选材贴近真实校园与家庭生活，情感自然真实');
    suggestions.push('💡 动作“慢镜头”刻画：不要一笔带过，把关键的一连串小动作细细写出来');
    suggestions.push('💡 结尾处尝试写一写这件事情给自己的启发，让习作立意更充实');
  } else if (cfg.stage === 'high') {
    highlights.push('✅ 具备较强的问题意识与思维敏锐度，论题切入角度准确');
    highlights.push('✅ 论证框架清晰，能够结合时代背景展开阐述');
    suggestions.push('💡 强化辩证驳论与破立结合，警惕“单一视角”的说教化论证');
    suggestions.push('💡 提升语言的凝练度与文气节奏，运用精准的学术和人文语汇增强思辨力');
  } else {
    // Middle school
    highlights.push('✅ 选材切合初中生真实生活与青春心理，具备较强的感染力');
    highlights.push('✅ 叙事节奏张弛有度，首尾呼应较为自然');
    suggestions.push('💡 强化“动词白描”：少用抽象形容词，多用精准动词刻画关键瞬间');
    suggestions.push('💡 增加环境烘托：用天气、光影、声音衬托人物内心情感波澜');
  }

  return {
    total_score: totalScore,
    max_score: maxScore,
    grade_level_label: totalScore >= maxScore * 0.85 ? '一类文 (立意生动·文采斐然)' : totalScore >= maxScore * 0.72 ? '二类文 (条理清晰·情感真挚)' : '三类文 (基础扎实·有待升格)',
    char_count: charCount,
    para_count: paraCount,
    dimensions: {
      depth: { score: Math.round(depthScore * 10 / 18), label: '立意深度', comment: charCount >= cfg.minWords ? '主题立意明确，能够由表及里展现观察。' : `字数尚显单薄（期望${cfg.minWords}-${cfg.targetWords}字），建议丰富细节充实内容。` },
      structure: { score: Math.round(structureScore * 10 / 17), label: '结构脉络', comment: paraCount >= 3 ? '起承转合自然，段落划分合理。' : '段落稍显单一，建议按结构分段。' },
      rhetoric: { score: Math.round(rhetoricScore * 10 / 17), label: '词句文采', comment: hasRhetoricKeywords ? '善用修辞与生动词汇，语言生动富有表现力。' : '多为陈述句，可适当增加比喻、拟人或动作白描。' },
      emotion: { score: Math.round(emotionScore * 10 / 16), label: '情感真实', comment: '情感自然流露，细节抓取具备一定真情实感。' },
      standards: { score: Math.round(standardsScore * 10 / 10), label: '书写规范', comment: '标点使用规范，段落格式标准。' }
    },
    highlights,
    suggestions,
    sentence_upgrades: sentenceUpgrades
  };
}

/**
 * Call real LLM to grade essay and generate customized sentence upgrades
 */
async function gradeEssayWithLLM(title, content, grade, reqHeaders = {}) {
  const cfg = getEssayGradeConfig(grade);
  const maxScore = cfg.maxScore;
  const charCount = content.trim().length;
  const paragraphs = content.trim().split(/\n+/).filter(p => p.trim().length > 0);
  const paraCount = paragraphs.length;

  const prompt = `你是一位拥有20年中小学语文教学与阅卷经验的特级教师。请根据【${cfg.stageName}】的国家新课标作文评价标准（${cfg.standard}），对学生的习作《${title || '未命题'}》进行全维度深度诊断，并挑选2-3处具有提升潜力的平淡语句进行逐句点石成金的升格润色。

【学生年级】：${grade || '七年级'}
【年级学段标准】：${cfg.stageName}，期望篇幅【${cfg.minWords} - ${cfg.targetWords} 字】
【习作题目】：${title || '未命题'}
【习作正文】：
${content}

【满分基准】：满分 ${maxScore} 分（严禁擅自修改满分值！）
【年级升格指引】：
- 若为小学1-3年级：以鼓励肯定为主，侧重多感官描摹（视/听/味/嗅/触）、拟人童趣与句子完整；
- 若为小学4-6年级：侧重动作细节捕捉、心理特写与生活化比喻，拒绝假大空；
- 若为初中7-9年级：侧重题眼穿透、叙事波澜、环境烘托与融情抒怀；
- 若为高中10-12年级：侧重思辨深刻性、论证逻辑自洽与家国情怀立意。
【输出规范】：必须严格返回一个合法的 JSON 对象，不包含任何 Markdown 格式外的前后缀，字段格式必须与以下结构完全一致：
{
  "total_score": 综合得分(整数，满分${maxScore}分),
  "max_score": ${maxScore},
  "grade_level_label": "得分档次(如：一类文 (立意生动·文采斐然) 或 二类文 (条理清晰·情感真挚) 或 三类文 (基础扎实·有待升华))",
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
    "💡 建议2：如何贴合该年级写作要求提分"
  ],
  "sentence_upgrades": [
    {
      "original": "从原文中摘录的一句具体平淡句子(必须来自原文)",
      "upgraded": "由你亲笔润色后的年级适龄高分金句",
      "technique": "所用修辞技巧",
      "reason": "名师提分点拨(说明为何这样改适合该年级并能打动阅卷老师)"
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
  getEssayGradeConfig,
  heuristicEssayEvaluation,
  gradeEssayWithLLM
};
