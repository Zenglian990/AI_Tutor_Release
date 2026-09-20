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
const { decryptField } = require('../utils/crypto');
const { diagnosePrerequisiteKnowledge, formatGraphRAGPromptSection } = require('../services/knowledgeGraph');
const { lookupCanonicalQuestion } = require('../services/canonicalQuestions');
const { extractAndParseJson } = require('../utils/jsonParser');
const { sendToNetworkPrinter, formatExamForPrinter } = require('../services/printerService');



/**
 * 拼装出题的 System Prompt (三段式 150分制)
 */
function getGeneratePrompt(grade, subject, type, chapterName, chapterDesc, syllabusStr, knowledgePoints, region, examYear) {
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
  } else if (type === 'real_exam') {
    const reg = region || '全国百强重点名校';
    const yr = examYear || '2025-2026';
    scopeStr = `当前测试范围为【${reg}·${yr}学年中考/期末全真模拟示范大卷】。请严格对标中考与各省名校统考试卷的命题结构与难度阶梯，既包含基础巩固考点，又包含综合创新与压轴思维题。`;
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
  if (type === 'unit') {
    if (subject === '数学') {
      examStructure = `【极其重要】整套单元同步测验卷满分 150 分。必须包含 11 道题，精练高效，严格依照如下结构：
一、选择题（共 5 道题，第 1-5 题，每小题 8 分，共 40 分，标准答案为 A、B、C、D）
二、填空题（共 3 道题，第 6-8 题，每小题 8 分，共 24 分，标准答案为一个确定的数值或数学表达式）
三、解答题（共 3 道题，第 9-11 题，共 86 分，包含计算题、证明填空题、学科应用题，要求提供推导与计算步骤）`;
    } else if (subject === '语文') {
      examStructure = `【极其重要】整套单元测验卷满分 100 分。必须包含 12 道精选题（基础积累选择 5 题，古诗文填空 3 题，阅读理解与简答 4 题）。`;
    } else if (subject === '英语') {
      examStructure = `【极其重要】整套单元测验卷满分 100 分。必须包含 15 道精选题（单项选择 8 题，完形填空 4 题，阅读理解 3 题）。`;
    } else {
      examStructure = `【极其重要】整套单元测验卷满分 100 分。包含 12 道精选题（选择题 6 题，填空题 3 题，简答/综合分析题 3 题）。`;
    }
  } else {
    // real_exam 全真模拟试卷：15道核心代表真题，满分150分，速度快且杜绝token溢出
    if (subject === '数学') {
      examStructure = `【极其重要】整套全真中考/期末模拟大卷满分 150 分，时间 120 分钟。必须精选 15 道代表性真题：
一、选择题（共 6 道题，第 1-6 题，每小题 6 分，共 36 分，选项为 A、B、C、D）
二、填空题（共 4 道题，第 7-10 题，每小题 6 分，共 24 分，标准答案为确定的数值或数学表达式）
三、解答题（共 5 道题，第 11-15 题，共 90 分，必须包含基础计算/解方程、几何证明题、综合应用题及中考压轴探究大题，提供完整的推导与计算步骤）`;
    } else if (subject === '语文') {
      examStructure = `【极其重要】整套全真期末/中考模拟大卷满分 150 分。包含 14 道代表性真题（积累与选择 5 题，诗文默写 3 题，文言与现代文阅读 5 题，作文 1 题）。`;
    } else if (subject === '英语') {
      examStructure = `【极其重要】整套全真期末/中考模拟大卷满分 120 分。包含 20 道代表性真题（单选 8 题，完型 5 题，阅读 5 题，书面表达 2 题）。`;
    } else if (subject === '物理' || subject === '化学') {
      examStructure = `【极其重要】整套试卷满分 100 分。包含 15 道代表性真题（单选 7 题，填空 3 题，实验探究 2 题，综合计算 3 题）。`;
    } else if (subject === '历史' || subject === '道德与法治' || subject === '政治') {
      examStructure = `【极其重要】整套试卷满分 50 分。包含 12 道代表性真题（单选 8 题，材料分析综合大题 4 题）。`;
    } else if (subject === '生物' || subject === '地理') {
      examStructure = `【极其重要】整套试卷满分 100 分。包含 15 道代表性真题（单选题 10 题，综合识图与分析大题 5 题）。`;
    } else {
      examStructure = `【极其重要】整套试卷满分 100 分。请精选 15 道题，包含选择题、填空题和解答题（材料分析或计算）。`;
    }
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

请根据上述阅卷原则，给出该题的最终得分、中考步骤采分点拆解和精炼评语。
请严格以下列 JSON 格式返回，不要包含任何其他文字：
{
  "score": 给出得分（必须是 0 到 ${score} 之间的整数）,
  "comment": "阅卷评语",
  "step_breakdown": {
    "concept": "审题与概念列式得分说明 (如: 审题准确、已知未知分析到位 3/3分)",
    "deduction": "过程推导与公式代入得分说明 (如: 推导逻辑严密、计算无误 4/4分)",
    "conclusion": "结果与量纲单位说明 (如: 结论正确 3/3分)"
  }
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
 * Robust JSON extraction and auto-healing parser for LLM-generated test papers.
 * Handles clean JSON, markdown code blocks, and gracefully recovers truncated JSON.
 */
function parseOrRepairPaperJson(text) {
  if (!text || typeof text !== 'string') return null;

  // 1. Direct match & parse
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0].trim());
      if (parsed && Array.isArray(parsed.questions) && parsed.questions.length > 0) {
        return parsed;
      }
    } catch (e) {
      // JSON was malformed or truncated near end
    }
  }

  // 2. Extract title if possible
  let title = '知识能力测试卷';
  const titleMatch = text.match(/"title"\s*:\s*"([^"]+)"/);
  if (titleMatch) title = titleMatch[1];

  // 3. Fallback: Robust regex extraction for individual question objects
  const questions = [];
  const qRegex = /\{\s*"id"\s*:\s*(\d+)[\s\S]*?"type"\s*:\s*"([^"]+)"[\s\S]*?"question"\s*:\s*"((?:\\.|[^"\\])*)"[\s\S]*?"answer"\s*:\s*"((?:\\.|[^"\\])*)"[\s\S]*?(?:"explanation"\s*:\s*"((?:\\.|[^"\\])*)"[\s\S]*?)?\}/g;
  let match;
  while ((match = qRegex.exec(text)) !== null) {
    try {
      const qJson = JSON.parse(match[0]);
      if (qJson.id && qJson.question) questions.push(qJson);
    } catch (e) {
      try {
        questions.push({
          id: parseInt(match[1], 10),
          type: match[2],
          question: match[3].replace(/\\"/g, '"').replace(/\\n/g, '\n'),
          answer: match[4].replace(/\\"/g, '"'),
          explanation: match[5] ? match[5].replace(/\\"/g, '"').replace(/\\n/g, '\n') : '详见解题分析。'
        });
      } catch (err) {}
    }
  }

  if (questions.length > 0) {
    return { title, questions };
  }
  return null;
}

/**
 * API 1: 生成试卷
 */
router.post('/test-paper/generate', async (req, res) => {
  try {
    const { grade, subject, type, chapter_id, edition, knowledge_points, region, exam_year } = req.body;
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

    const prompt = getGeneratePrompt(grade, subject, type, chapterName, chapterDesc, syllabusStr, knowledge_points, region, exam_year);

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
    
    let paperObj = parseOrRepairPaperJson(text);
    if (!paperObj || !Array.isArray(paperObj.questions) || paperObj.questions.length === 0) {
      logger.warn('[JSON Parse Error] Failed to parse generated test paper:', text.slice(0, 300));
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
          
          let parsedStep = null;
          const jsonMatch = text.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0].trim());
            score = typeof parsed.score === 'number' ? parsed.score : 0;
            comment = parsed.comment || '';
            parsedStep = parsed.step_breakdown || null;
          } else {
            throw new Error('No JSON found in grade response');
          }
        } catch (err) {
          logger.warn(`Failed to grade question ${q.id} with AI, falling back to 0:`, err);
          score = 0;
          comment = '批改系统繁忙，暂定 0 分。请参考标准解析。';
        }
      }

      const isFullScore = score === (q.score || 10);
      const stepBreakdown = {
        concept: isFullScore ? '审题严谨，已知与未知条件把握精准' : (score > 0 ? '审题基本到位，提取了部分关键条件' : '审题不清或核心概念存在偏差'),
        deduction: isFullScore ? '逻辑严密，公式与定理代入规范无误' : (score > 0 ? '步骤基本正确，中间计算有小瑕疵' : '推导逻辑中断或关键公式未列出'),
        conclusion: isFullScore ? '结论计算完全正确，量纲与单位标准' : (score > 0 ? '结论部分吻合，需注意末尾结果核验' : '最终结论错误或未作答')
      };

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
        comment,
        step_breakdown: stepBreakdown
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

/**
 * POST /api/test-paper/generate-from-mistakes
 * 错题驱动的靶向变式巩固试卷全自动生成引擎
 */
router.post('/test-paper/generate-from-mistakes', async (req, res) => {
  try {
    const {
      profile_id = 'default',
      subject = '数学',
      grade = '7_up',
      student_name = '曾练',
      mistake_ids = null,
      limit = 4
    } = req.body;

    const sqliteDb = getSqliteDb();
    if (!sqliteDb) {
      return res.status(503).json({ error: '数据库未就绪' });
    }

    let mistakes = [];
    if (Array.isArray(mistake_ids) && mistake_ids.length > 0) {
      const placeholders = mistake_ids.map(() => '?').join(',');
      mistakes = await sqliteDb.all(
        `SELECT * FROM mistakes WHERE profile_id = ? AND id IN (${placeholders})`,
        [profile_id, ...mistake_ids]
      );
    } else {
      mistakes = await sqliteDb.all(
        'SELECT * FROM mistakes WHERE profile_id = ? AND (subject = ? OR ? = "") ORDER BY timestamp DESC LIMIT ?',
        [profile_id, subject, subject, Math.min(Math.max(1, parseInt(limit, 10) || 4), 10)]
      );
    }

    if (!mistakes || mistakes.length === 0) {
      return res.status(400).json({
        error: '当前暂无待订正错题，无法生成靶向变式卷。请先在作业批改中拍照批改或在错题本中添加错题！'
      });
    }

    const decryptedMistakes = mistakes.map(m => ({
      id: m.id,
      query: decryptField(m.query),
      answer: decryptField(m.answer),
      reason: decryptField(m.reason),
      grade: m.grade || grade,
      subject: m.subject || subject
    }));

    // 1. GraphRAG 知识图谱根因诊断
    const diagnoses = [];
    for (const m of decryptedMistakes) {
      const diagText = `${m.query} ${m.reason || ''}`;
      const diag = diagnosePrerequisiteKnowledge(diagText, m.subject || subject);
      if (diag) {
        diagnoses.push(diag);
      }
    }

    const primaryDiagnosis = diagnoses[0] || null;
    const graphSection = primaryDiagnosis ? formatGraphRAGPromptSection(primaryDiagnosis) : '';

    // 2. 匹配 481 道权威真题母题库
    const canonicalHints = [];
    for (const m of decryptedMistakes.slice(0, 3)) {
      try {
        const match = await lookupCanonicalQuestion(m.query, grade, subject, sqliteDb);
        if (match && match.matched && match.canonical) {
          canonicalHints.push(match.canonical);
        }
      } catch (err) {
        // ignore lookup warning
      }
    }

    // 3. 构建大模型提示词
    const mistakesSummary = decryptedMistakes.map((m, idx) => 
      `错题${idx + 1}：${m.query} (学生原错因：${m.reason || '未标注'})`
    ).join('\n');

    const canonicalSummary = canonicalHints.length > 0
      ? `\n【参考权威教材母题标准题型】：\n` + canonicalHints.map((c, i) => `母题${i+1} [${c.chapter || '经典考点'}]: ${c.question}\n标答: ${c.standard_answer}`).join('\n')
      : '';

    const prompt = `你是一位精通中小学教学与学情溯源的特级教研员。
请根据学生【${student_name}】近期在【${subject}】(${grade})中出现的真实错题，以及系统知识图谱的底层根因诊断，为该生定制一份满分 100 分、建议用时 45 分钟的【靶向溯源变式巩固试卷】。

【真实错题集】：
${mistakesSummary}
${graphSection}
${canonicalSummary}

【试卷结构与出题准则】（必须严格遵守 100 分制结构）：
1. 试卷题目总共 6 道题，分为三大部分：
   - 第一部分：前置概念基础保底题（1道题，15分，题号1）：
     * 必须专门考查导致学生出错的【底层前驱根因概念】（让学生在最底层概念上建立信心）。
   - 第二部分：同构变式强化题（3道题，题号2、3、4，每题15分，共45分）：
     * 题号2为选择题（A/B/C/D，15分）
     * 题号3为填空题（15分）
     * 题号4为计算/分析题（15分）
     * 必须与学生的错题考点高度同构，更换数字、背景或未知数，考查举一反三能力。
   - 第三部分：中考/期末综合压轴拓展题（2道题，题号5、6，每题20分，共40分）：
     * 题号5为综合解答题（20分）
     * 题号6为拓展探究题（20分）
     * 考查知识点的综合迁移与逆向思维。
2. 所有选择题必须提供 4 个选项（包含在 options 数组中，如 ["A. ...", "B. ...", "C. ...", "D. ..."]），answer 只能是 "A"、"B"、"C" 或 "D"。
3. 填空题 answer 必须是精准数值或简洁表达式。
4. 每道题都必须提供详尽的名师解析 explanation，指出解题突破口。

请严格返回如下 JSON 结构（严禁包含额外文字）：
{
  "title": "【${student_name}】专属靶向溯源巩固卷",
  "subtitle": "针对薄弱知识点靶向查漏补缺",
  "subject": "${subject}",
  "grade": "${grade}",
  "duration": 45,
  "totalScore": 100,
  "rootCauseTopic": "${primaryDiagnosis?.rootCauseNode?.name || '基础综合概念'}",
  "teacherAdvice": "先完成第1题概念自测，遇到变式题注意类比错题的解题规律。",
  "questions": [
    {
      "id": 1,
      "type": "blank",
      "category": "prerequisite_grounding",
      "question": "题目具体内容",
      "score": 15,
      "answer": "标准答案",
      "explanation": "名师解析"
    },
    {
      "id": 2,
      "type": "choice",
      "category": "isomorphic_variant",
      "question": "题目具体内容",
      "options": ["A. 选项1", "B. 选项2", "C. 选项3", "D. 选项4"],
      "score": 15,
      "answer": "A",
      "explanation": "名师解析"
    },
    {
      "id": 3,
      "type": "blank",
      "category": "isomorphic_variant",
      "question": "题目具体内容",
      "score": 15,
      "answer": "标准答案",
      "explanation": "名师解析"
    },
    {
      "id": 4,
      "type": "essay",
      "category": "isomorphic_variant",
      "question": "题目具体内容",
      "score": 15,
      "answer": "标准步骤与结果",
      "explanation": "名师解析"
    },
    {
      "id": 5,
      "type": "essay",
      "category": "advanced_extension",
      "question": "题目具体内容",
      "score": 20,
      "answer": "标准推导与答案",
      "explanation": "名师解析"
    },
    {
      "id": 6,
      "type": "essay",
      "category": "advanced_extension",
      "question": "题目具体内容",
      "score": 20,
      "answer": "标准推导与答案",
      "explanation": "名师解析"
    }
  ]
}`;

    const response = await fetchWithKeyRotation(buildChatURL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          response_mime_type: 'application/json',
          temperature: 0.4
        }
      })
    }, 8, 90000);

    const data = await response.json();
    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawText) {
      throw new Error('LLM 未返回有效试卷数据');
    }

    const testPaper = extractAndParseJson(rawText);
    if (!testPaper || !Array.isArray(testPaper.questions)) {
      throw new Error('生成的试卷格式不完整');
    }

    res.json({
      success: true,
      testPaper,
      diagnoses,
      mistakesCount: decryptedMistakes.length
    });
  } catch (e) {
    logger.error('Generate Test Paper From Mistakes Error:', e);
    if (e.message === 'QUOTA_EXHAUSTED') {
      return res.status(429).json({ error: '今日额度已用完' });
    }
    res.status(500).json({ error: '生成靶向变式试卷失败', details: NODE_ENV === 'development' ? e.message : undefined });
  }
});

// POST /api/printer/print-ipp
// LAN network printer direct raw/IPP socket dispatch
router.post('/printer/print-ipp', async (req, res) => {
  try {
    const {
      host = '192.168.1.200',
      port = 9100,
      title = '名师专属微测试卷',
      studentName = '曾练',
      grade = '7_up',
      subject = '数学',
      questions = [],
      printMode = 'blank_student',
      mock = false
    } = req.body;

    if (!questions || !Array.isArray(questions) || questions.length === 0) {
      return res.status(400).json({ error: '试卷题目列表不能为空' });
    }

    const printableText = formatExamForPrinter({
      title,
      studentName,
      grade,
      subject,
      questions,
      printMode
    });

    const printResult = await sendToNetworkPrinter({
      host,
      port: parseInt(port, 10) || 9100,
      data: printableText,
      mock: !!mock
    });

    res.json({
      success: true,
      message: printResult.message,
      simulated: !!printResult.simulated,
      bytesSent: printResult.bytesSent
    });
  } catch (err) {
    logger.error('[PrinterRoute] Direct print error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
