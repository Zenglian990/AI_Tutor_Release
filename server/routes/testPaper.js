const express = require('express');
const router = express.Router();
const { fetchWithKeyRotation, buildChatURL } = require('../services/embedding');
const { getSqliteDb } = require('../db/init');
const logger = require('../services/logger');
const { NODE_ENV } = require('../config');
const fs = require('fs');
const path = require('path');
const { getChapters } = require('../utils/dataLoader');
const { GRADE_ALIASES } = require('../prompts/guidelines');



/**
 * 拼装出题的 System Prompt (三段式 150分制)
 */
function getGeneratePrompt(grade, subject, type, chapterName, chapterDesc, syllabusStr, knowledgePoints) {
  const gradeNames = {
    '1_up': '一年级上册', '1_down': '一年级下册',
    '2_up': '二年级上册', '2_down': '二年级下册',
    '3_up': '三年级上册', '3_down': '三年级下册',
    '4_up': '四年级上册', '4_down': '四年级下册',
    '5_up': '五年级上册', '5_down': '五年级下册',
    '6_up': '六年级上册', '6_down': '六年级下册',
    '7_up': '七年级上册', '7_down': '七年级下册',
    '8_up': '八年级上册', '8_down': '八年级下册',
    '9_up': '九年级上册', '9_down': '九年级下册',
  };
  const friendlyGrade = gradeNames[grade] || grade;
  const rawGrade = grade ? String(grade).split('_')[0] : '';
  const isLowerGrade = ['1', '2', '3'].includes(rawGrade); // 1-3年级为低年级

  let scopeStr = '';
  if (type === 'custom' && knowledgePoints) {
    // Sanitize knowledge points to prevent prompt injection
    const sanitizedPoints = String(knowledgePoints)
      .slice(0, 100) // limit length
      .replace(/[^\w\u4e00-\u9fa5\s,，.。;；、-]/gi, '') // only allow alphanumeric, CJK, and basic punctuation
      .replace(/(ignore|prompt|system|instruction|bypass|forget)/gi, ''); // remove injection keywords

    scopeStr = `当前测试范围为用户主动要求的知识点：【${sanitizedPoints}】。请紧扣这些自定义知识点出题，确保全面覆盖用户的学习需求。`;
  } else if (type === 'unit' && chapterName) {
    scopeStr = `当前测试范围为特定单元章节：《${chapterName}》（章节描述：${chapterDesc}）。
【重中之重】虽然这是单元测试，但你必须**严格保持下方规定的大考题量和总分（绝不允许删减题数！）**。如果本单元缺少某种题型的素材（例如本单元没有古诗文或文言文），请你引入相关的课外拓展素材，或者将其他考点的题量翻倍填补，务必凑齐规定的总题目数和总分值，保证试卷的体量足够庞大和严肃！`;
  } else if (type === 'midterm') {
    scopeStr = '当前测试范围为期中（半期）综合测试。请综合考查该学期前半段的核心考点。';
  } else {
    scopeStr = '当前测试范围为期末综合测试。请进行全册综合大考查，题目要有层次和综合性。';
  }

  let syllabusGuideline = '';
  if (syllabusStr) {
    let targetSyllabus = syllabusStr;
    if (type === 'midterm') {
      const lines = syllabusStr.split('\n');
      const halfLength = Math.ceil(lines.length / 2);
      targetSyllabus = lines.slice(0, halfLength).join('\n');
    }
    
    syllabusGuideline = `
【极重要：官方教学大纲与知识范围限制（严禁超纲出题）】
以下是该学期对应的课程单元目录：
${targetSyllabus}

【出题约束】
1. 所有题目考查的知识点，必须严格限制在上述列出的单元目录范围内，绝不能超出该范围。
2. 严禁出任何大纲之外的超前/超纲概念！例如，如果当前是三年级（3_up 或 3_down），绝对不能在题目中出现四年级或以上才学的内容（如“三角形内角和等于180度”、“平移与平行线交线角”、“二元一次方程组”等高年级考点）。
3. 题目设计需分布合理，重点突出。
`;
  }

  let cognitiveGuidelines = '';
  if (isLowerGrade) {
    cognitiveGuidelines = `学生处于低年级（${friendlyGrade}）阶段。
出题要求：
1. 语言表达要生动具体，多使用贴近学生生活或学习的具体场景（例如：“小明带了10元钱去文具店买铅笔...”、“池塘里有5只青蛙...”）。
2. 客观选择题选项干扰项描述不要过于晦涩或复杂，选项要直观。
3. 解答题主要考查基础的综合应用，要求步骤简单明了，配有亲切的指引语。`;
  } else {
    cognitiveGuidelines = `学生处于中高年级（${friendlyGrade}）阶段，题目必须科学、严密、严谨，符合正式考试的表达风格。
出题要求：
1. 概念表述必须绝对准确，题意清晰无歧义，符合人教版教学大纲要求。
2. 试卷设计必须严谨、细致。`;
  }

  let examStructure = '';
  if (subject === '数学') {
    examStructure = `【极其重要】整套试卷满分 150 分，时间 120 分钟。必须包含 25 道题，严格按照如下真实期中期末考试结构：
一、选择题（共 10 道题，第 1-10 题，每小题 4 分，共 40 分）
  - 考查代数、几何、图形等基础知识，标准答案必须是 A、B、C、D。
二、填空题（共 6 道题，第 11-16 题，每小题 4 分，共 24 分）
  - 标准答案应该是一个确定的数值或数学表达式。
三、解答题（共 9 道题，第 17-25 题，共 86 分）
  - 必须包含基础计算/化简、解方程/不等式、几何推导与证明、综合应用大题，最后一道为压轴大题。要求提供完整的推导与计算步骤，如果是几何证明题，请设置横线让学生填写推理定理或角（如：因为 ______，所以 ∠A = ∠B ）。`;
  } else if (subject === '语文') {
    examStructure = `【极其重要】整套试卷满分 150 分，时间 120 分钟。必须包含约 22 道题，严格按照如下真实期中期末考试结构：
一、积累与运用（共 5 道选择题，第 1-5 题，包含字音字形、成语、病句、标点符号、文学常识等，共 20 分）
二、古诗文默写（共 3 道填空题，第 6-8 题，每题写出上下句，共 10 分）
三、文言文阅读（共 4 题，第 9-12 题，包含实词解释、句子翻译、文意理解，共 20 分，请在第9题题干中提供完整的文言文选段）
四、现代文阅读（两篇长文，共 9 题，第 13-21 题，包含说明文/议论文及记叙文/散文，请在第13题及相关题干中提供完整的长篇阅读文章，并针对文章设计选择和简答题，共 50 分）
五、作文（最后1道解答题，第 22 题，提供命题或半命题材料，要求写一篇600-800字文章，分值 50 分）。`;
  } else if (subject === '英语') {
    examStructure = `【极其重要】整套试卷满分 150 分，时间 120 分钟。必须包含约 35 道题，严格按照如下真实英语考试结构：
一、单项选择（语法和词汇，共 10 题，第 1-10 题，每题 1.5 分，共 15 分）
二、完形填空（提供一篇约200字的短文，挖空 10 处，共 10 题，第 11-20 题，每题 1.5 分，共 15 分。请在第11题的question中给出完整短文）
三、阅读理解（提供 3 篇不同体裁的英文短文，每篇配 3-4 道选择题，共 10 题，第 21-30 题，每题 3 分，共 30 分。请在每篇的首题中给出完整短文内容）
四、词汇运用与句子翻译（填空与解答形式，共 4 题，第 31-34 题，共 40 分）
五、书面表达（最后1题，第 35 题，提供具体的情景要求写一篇80-100词的英语作文，分值 50 分）。`;
  } else if (subject === '物理' || subject === '化学') {
    examStructure = `【极其重要】整套试卷满分 100 分，时间 90 分钟。必须包含约 25 道题，严格按照如下真实期中期末考试结构：
一、单项选择题（共 12 题，每题 3 分，共 36 分）
二、填空题（共 6 题，每空 1 分，约 14 分，结合生活实际场景）
三、实验探究题（共 4 大题，围绕核心实验展开，约 24 分。需要在题目中详细描述实验步骤或现象）
四、计算与综合应用题（共 3 大题，约 26 分。要求写出公式和详细计算步骤）。`;
  } else if (subject === '历史') {
    examStructure = `【极其重要】整套试卷满分 50 分（与道法共用90分钟）。必须严格按照您提供的【真实期末考试结构】出题：
一、单项选择题（本大题共 15 小题，第 1-15 题，每小题 1 分，共 15 分）
二、非选择题（本大题共 3 小题，第 16 题 14 分，第 17 题 14 分，第 18 题 7 分，共 35 分。必须给出丰富详实的阅读材料，重点考查归纳分析能力。）`;
  } else if (subject === '道德与法治' || subject === '政治') {
    examStructure = `【极其重要】整套试卷满分 50 分（与历史共用90分钟）。必须严格按照您提供的【真实期末考试结构】出题：
一、选择题（本大题共 10 小题，第 1-10 题，每小题 2 分，共 20 分）
二、非选择题（本大题共 3 小题，第 11 题 6 分，第 12 题 10 分，第 13 题 14 分，共 30 分。必须包含情境分析或图表材料，结合材料回答。）`;
  } else if (subject === '生物') {
    examStructure = `【极其重要】整套试卷满分 100 分，考试时间 60 分钟。必须严格按照您提供的【真实期末考试结构】出题：
一、单选题（每小题只有一个最佳答案，第 1-20 题，每小题 2 分，共 40 分）
二、非选择题（每空 2 分，共 60 分。包含第 21 题 10 分，第 22 题 12 分，第 23 题 10 分，第 24 题 14 分，第 25 题 14 分。请强烈结合 Mermaid 画出细胞/人体系统/实验等结构示意图，设置填空或简答。）`;
  } else if (subject === '地理') {
    examStructure = `【极其重要】整套试卷满分 100 分，时间 60 分钟。必须包含 25 道题，结构类似生物：
一、单项选择题（20题，每题2分，共40分）
二、综合识图与分析题（5大题，第21-25题，共60分。需结合 Mermaid 绘制等高线、大洲分布图等）`;
  } else {
    examStructure = `【极其重要】整套试卷满分 100 分。请提供至少 25 道题，包含选择题、填空题和解答题（材料分析或计算），涵盖基础与综合应用。`;
  }

  return `你是一位专业且严密的中小学教研员。现在，你需要为一位学习【${subject}】的【${friendlyGrade}】学生出一套高水平的知识测试卷。
${scopeStr}
${syllabusGuideline}

${cognitiveGuidelines}

${examStructure}

【排版与 JSON 致命规定】
1. 你的 JSON 数组长度必须完全等同于我在上文 \`examStructure\` 中为你规定的“总题数”（例如语文必须是精确的 22 个 JSON 对象，数学必须是 25 个，历史必须是 18 个，生物必须是 25 个）。
2. 关于阅读大题/材料大题的拆分与合并：
   - 像**语文、英语**这种，大纲明确规定了“阅读理解占第13-21题”的，说明**每一个小问都有自己独立的题号**（13, 14...），所以**绝对不允许把它们合并**！必须为 13、14、15 各自生成独立的 JSON 对象！第一道小题放阅读材料，后面的小题直接写具体问题。
   - 像**历史、生物、物理**这种，大纲规定“第16题（14分）包含连环小问”的，说明这道大题只有一个总题号（16）。这种情况下，你**必须把所有小问 (1)xxx (2)xxx 合并在这一个 JSON 对象里**。但是在 \`question\` 文本里，**千万千万不要挤成一团**，必须使用 Markdown 的优美换行符（\\n\\n），把材料和下面的各个小问分段排版得清清楚楚！

【Mermaid 几何图形支持】
对于需要图形辅助理解的题目（如：平行线、相交线、三角形、坐标系平移、或者条形/扇形统计图），你必须在 question 文本中内嵌标准的 \`\`\`mermaid 代码块，这样前端能自动渲染出高水准的几何线段图或图表。
- 例如：绘制三角形 ABC，可以使用 \`\`\`mermaid\\ngraph TD; A((A))---B((B)); B((B))---C((C)); C((C))---A((A));\`\`\`
- 绘制相交线、平行线与截线类似，用节点及连线来表达几何拓扑关系。

请严格以以下标准的 JSON 格式返回试卷。不要返回任何其他内容（如 markdown 标记之外的废话）：
{
  "title": "试卷标题（例如：七年级数学下册期末检测题）",
  "questions": [
    {
      "id": 1,
      "type": "choice",
      "question": "题目描述（如需画图可在此处内嵌 \`\`\`mermaid 块）",
      "options": ["A. 选项A内容", "B. 选项B内容", "C. 选项C内容", "D. 选项D内容"],
      "score": 8,
      "answer": "A",
      "explanation": "本题的详细解析"
    },
    ...
    {
      "id": 6,
      "type": "blank",
      "question": "题目描述（如需画图可内嵌 \`\`\`mermaid 块）",
      "score": 8,
      "answer": "标准答案",
      "explanation": "本题的详细解析"
    },
    ...
    {
      "id": 9,
      "type": "essay",
      "question": "第 9 题描述（计算题）",
      "score": 20,
      "answer": "步骤和答案",
      "explanation": "详细步骤解析"
    },
    {
      "id": 10,
      "type": "essay",
      "question": "第 10 题描述（证明填空题，必须包含数个“______”供填空）",
      "score": 26,
      "answer": "填空位置的正确答案",
      "explanation": "完整的证明过程及理由"
    },
    {
      "id": 11,
      "type": "essay",
      "question": "第 11 题描述（实际统计或综合应用题）",
      "score": 40,
      "answer": "解答要点与最终答案",
      "explanation": "详细的公式及运算解析"
    }
  ]
}
`;
}

/**
 * 拼装 AI 单题批改 Prompt
 */
function getGradePrompt(question, studentAnswer, standardAnswer, score, explanation, grade) {
  const rawGrade = grade ? String(grade).split('_')[0] : '';
  const gradeNames = {
    '1_up': '一年级上册', '1_down': '一年级下册',
    '2_up': '二年级上册', '2_down': '二年级下册',
    '3_up': '三年级上册', '3_down': '三年级下册',
    '4_up': '四年级上册', '4_down': '四年级下册',
    '5_up': '五年级上册', '5_down': '五年级下册',
    '6_up': '六年级上册', '6_down': '六年级下册',
    '7_up': '七年级上册', '7_down': '七年级下册',
    '8_up': '八年级上册', '8_down': '八年级下册',
    '9_up': '九年级上册', '9_down': '九年级下册',
  };
  const friendlyGrade = gradeNames[grade] || (rawGrade ? `${rawGrade}年级` : '中小学');
  const isLowerGrade = ['1', '2', '3'].includes(rawGrade); // 1-3年级为低年级
  
  let gradingPhilosophy = '';
  if (isLowerGrade) {
    gradingPhilosophy = `
【低年级（1-3年级）温和鼓励阅卷原则】
学生处于低年级阶段（当前为：${friendlyGrade}）。
1. 侧重考查学生的数学逻辑和解题思路，而不是死板的书写格式或写法。
2. 若学生最终计算出的结果数值是完全正确的，且解题大体思路清晰，即使在算式书写中出现了个别书写笔误（例如把除号“/”或“÷”误写为乘号“*”、或者中间步骤有不影响最终结果的冗余描述），**严禁扣除大量分数**。最多扣除 1-2 分作为规范性提醒。
3. 阅卷评语必须语气温和、充满鼓励，像大姐姐或大哥哥一样亲切，多使用积极词汇，避免冷冰冰的教训语气。
`;
  } else {
    gradingPhilosophy = `
【中高年级（4-9年级）严谨规范阅卷原则】
学生处于中高年级阶段（当前为：${friendlyGrade}）。
1. 阅卷要标准、规范、客观。
2. 除了考查结果正确性，还需严格对照解题步骤。对于推导逻辑有偏差或有明显算式错误的步骤，应酌情扣除对应步骤分。
3. 阅卷评语要客观、清晰地指出扣分点 and 改进建议，语气要求亲切但专业。
`;
  }

  return `你是一位专业的 ${friendlyGrade} 阅卷老师。你需要批改一道满分为 ${score} 分的测试题。

【本题信息】
题目：${question}
标准答案/得分要点：${standardAnswer}
详细解析：${explanation}

【学生答卷】
学生给出的答案：${studentAnswer}

${gradingPhilosophy}

请根据上述阅卷原则，给出该题的最终得分和精炼评语。
请严格以下列 JSON 格式返回，不要包含任何其他文字：
{
  "score": 给出得分（必须是 0 到 ${score} 之间的整数）,
  "comment": "阅卷评语"
}
`;
}

/**
 * 拼装整卷学情报告 Prompt
 */
function getOverallReportPrompt(studentName, score, questionsReport) {
  return `你是一位亲切的 AI 私教。学生【${studentName}】刚刚完成了一套测试卷，总分为 ${score} 分（满分 150 分）。
以下是各题的批改情况：
${questionsReport}

请为这位学生写一段 100-150 字的学情诊断与鼓励性评语。
要求：
1. 语气亲切，富有启发性。
2. 结合他做错的题目指出他的薄弱点和需要加强的地方（如果有错题的话）。
3. 给出切实的学习建议。`;
}

/**
 * API 1: 生成试卷
 */
router.post('/test-paper/generate', async (req, res) => {
  try {
    const { grade, subject, type, chapter_id, edition, knowledge_points } = req.body;
    if (!grade || !subject || !type) {
      return res.status(400).json({ error: '缺少必需的年级、科目或测试类型' });
    }

    let chapterName = '';
    let chapterDesc = '';
    let syllabusStr = '';

    // 从 prompts/chapters.json 配置文件中查询章节大纲信息
    try {
      const key = edition ? `${grade}_${edition}` : grade;
      const chaptersData = await getChapters();
      const gradeChapters = chaptersData[key] || chaptersData[grade] || {};
      const list = gradeChapters[subject] || [];
      
      if (list.length > 0) {
        syllabusStr = list.map((c, i) => `${i + 1}. ${c.name} (${c.description})`).join('\n');
      }

      if (type === 'unit' && chapter_id) {
        const chapter = list.find(c => String(c.id) === String(chapter_id));
        if (chapter) {
          chapterName = chapter.name;
          chapterDesc = chapter.description;
        } else {
          logger.warn(`Chapter not found in JSON config for id: ${chapter_id}, grade: ${grade}, subject: ${subject}`);
        }
      }
    } catch (err) {
      logger.error('Failed to parse chapter info from JSON config:', err);
    }

    const prompt = getGeneratePrompt(grade, subject, type, chapterName, chapterDesc, syllabusStr, knowledge_points);

    const response = await fetchWithKeyRotation(buildChatURL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 8192 } // 稍微降低温度，使得题目更稳定且符合大纲，扩大token上限以支持复杂长试卷
      })
    }, 8, 120000);

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    
    let paperObj = null;
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        paperObj = JSON.parse(jsonMatch[0].trim());
      } else {
        throw new Error('No JSON object found in response');
      }
    } catch (e) {
      logger.warn('[JSON Parse Error] Failed to parse generated test paper:', e);
      logger.debug('Raw response was:', text);
      return res.status(500).json({ error: 'AI 生成试卷格式有误，请重新尝试' });
    }

    res.json({ paper: paperObj });
  } catch (e) {
    logger.error('Generate Test Paper Error:', e);
    if (e.message === 'QUOTA_EXHAUSTED') {
      return res.status(429).json({ error: '今日额度已用完' });
    }
    res.status(500).json({ error: '生成试卷失败', details: NODE_ENV === 'development' ? e.message : undefined });
  }
});

/**
 * API 2: 批改试卷
 */
router.post('/test-paper/grade', async (req, res) => {
  try {
    const { student_name, answers, questions, grade } = req.body;
    if (!answers || !questions || !Array.isArray(questions)) {
      return res.status(400).json({ error: '缺少提交的答案或题目数据' });
    }

    const results = [];
    let totalScore = 0;

    for (const q of questions) {
      const studentAns = String(answers[q.id] || '').trim();
      const standardAns = String(q.answer || '').trim();

      // 本地简单客观题匹配判定（完全一致时省去 AI 资源消耗，提高处理速度）
      let score = 0;
      let comment = '';
      let gradedByAI = false;

      if (q.type === 'choice') {
        const cleanStudent = studentAns.toUpperCase().charAt(0);
        const cleanStandard = standardAns.toUpperCase().charAt(0);
        if (cleanStudent === cleanStandard) {
          score = q.score || 8;
          comment = '选择题答案正确！';
        } else {
          score = 0;
          comment = `选择题答案错误。标准答案是：${cleanStandard}。`;
        }
      } else if (q.type === 'blank') {
        const cleanStudent = studentAns.replace(/\s+/g, '').toLowerCase();
        const cleanStandard = standardAns.replace(/\s+/g, '').toLowerCase();
        if (cleanStudent === cleanStandard && cleanStandard !== '') {
          score = q.score || 8;
          comment = '填空题答案正确！';
        } else {
          gradedByAI = true; // 填空题如果不完全一致，交由 AI 进行模糊或数值大小判定
        }
      } else {
        gradedByAI = true; // 主观题/简答题必须由 AI 批改
      }

      if (gradedByAI) {
        try {
          const prompt = getGradePrompt(q.question, studentAns, standardAns, q.score, q.explanation, grade);
          const response = await fetchWithKeyRotation(buildChatURL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig: { temperature: 0.1 }
            })
          }, 8, 90000);

          const data = await response.json();
          const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
          
          const jsonMatch = text.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0].trim());
            score = typeof parsed.score === 'number' ? parsed.score : 0;
            comment = parsed.comment || '';
          } else {
            throw new Error('No JSON found in grade response');
          }
        } catch (err) {
          logger.warn(`Failed to grade question ${q.id} with AI, falling back to 0:`, err);
          score = 0;
          comment = '批改系统繁忙，暂定 0 分。请参考标准解析。';
        }
      }

      totalScore += score;
      results.push({
        id: q.id,
        type: q.type,
        question: q.question,
        score,
        maxScore: q.score,
        studentAnswer: studentAns,
        standardAnswer: standardAns,
        explanation: q.explanation,
        comment
      });
    }

    // 生成整卷评语 (以 150 分满分折算)
    const studentName = student_name || '曾小侠';
    const questionsReport = results.map(r => `题号${r.id} (${r.type === 'choice' ? '选择' : r.type === 'blank' ? '填空' : '简答'}): 满分${r.maxScore}分，学生得${r.score}分。评语：${r.comment}`).join('\n');
    const reportPrompt = getOverallReportPrompt(studentName, totalScore, questionsReport);
    
    let overallComment = `曾小侠，你本次获得了 ${totalScore} 分。加油，继续努力！`;
    try {
      const reportResponse = await fetchWithKeyRotation(buildChatURL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: reportPrompt }] }],
          generationConfig: { temperature: 0.5 }
        })
      }, 8, 90000);
      const reportData = await reportResponse.json();
      overallComment = reportData.candidates?.[0]?.content?.parts?.[0]?.text || overallComment;
    } catch (err) {
      logger.warn('Failed to generate overall report with AI:', err);
    }

    res.json({
      score: totalScore,
      overallComment,
      results
    });
  } catch (e) {
    logger.error('Grade Test Paper Error:', e);
    if (e.message === 'QUOTA_EXHAUSTED') {
      return res.status(429).json({ error: '今日额度已用完' });
    }
    res.status(500).json({ error: '批改试卷失败', details: NODE_ENV === 'development' ? e.message : undefined });
  }
});

module.exports = router;
