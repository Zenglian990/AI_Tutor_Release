const express = require('express');
const router = express.Router();
const { fetchWithKeyRotation, buildChatURL } = require('../services/embedding');
const { getSqliteDb } = require('../db/init');
const logger = require('../services/logger');
const { NODE_ENV } = require('../config');
const TEXTBOOK_CHAPTERS = require('../prompts/chapters.json');

// 年级别名映射
const GRADE_ALIASES = {
  '1': ['一年级', '1年级', '小学一年级'],
  '2': ['二年级', '2年级', '小学二年级'],
  '3': ['三年级', '3年级', '小学三年级'],
  '4': ['四年级', '4年级', '小学四年级'],
  '5': ['五年级', '5年级', '小学五年级'],
  '6': ['六年级', '6年级', '小学六年级'],
  '7': ['七年级', '7年级', '初一', '初中一年级'],
  '8': ['八年级', '8年级', '初二', '初中二年级'],
  '9': ['九年级', '9年级', '初三', '初中三年级']
};

/**
 * 拼装出题的 System Prompt (三段式 150分制)
 */
function getGeneratePrompt(grade, subject, type, chapterName, chapterDesc, syllabusStr) {
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
  if (type === 'unit' && chapterName) {
    scopeStr = `当前测试范围为特定单元章节：《${chapterName}》（章节描述：${chapterDesc}）。请紧扣本单元知识点出题，严禁超出本单元范围。`;
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

  return `你是一位专业且严密的中小学教研员。现在，你需要为一位学习【${subject}】的【${friendlyGrade}】学生出一套高水平的知识测试卷。
${scopeStr}
${syllabusGuideline}

${cognitiveGuidelines}

【极其重要】整套试卷满分 150 分，时间 120 分钟。试卷必须包含 11 道题，严格按照以下三段式结构出题和设置分值：

一、选择题（单选，共 5 道题，第 1-5 题，每小题 8 分，共 40 分）
  - 标准答案必须是 A、B、C、D 之一。选项要清晰、严谨。
二、填空题（共 3 道题，第 6-8 题，每小题 8 分，共 24 分）
  - 标准答案应该是一个确定的词语、短语或具体数值。
三、解答题（共 3 道题，第 9-11 题，共 86 分）
  - 第 9 题（计算或解方程组/不等式组题，满分 20 分）：包含基础的步骤要求。
  - 第 10 题（几何证明/逻辑填空题，满分 26 分）：提供完整的几何图描述或推导步骤，要求设置横线让学生填写推理的角（如 ∠BOD）或依据定理（如 对顶角相等），横线用“______”表示。
  - 第 11 题（综合应用题/统计图表读取/实际问题，满分 40 分）：给出具体的生活或数学综合应用场景。

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
    const { grade, subject, type, chapter_id, edition } = req.body;
    if (!grade || !subject || !type) {
      return res.status(400).json({ error: '缺少必需的年级、科目或测试类型' });
    }

    let chapterName = '';
    let chapterDesc = '';
    let syllabusStr = '';

    // 从 prompts/chapters.json 配置文件中查询章节大纲信息
    try {
      const key = edition ? `${grade}_${edition}` : grade;
      const gradeChapters = TEXTBOOK_CHAPTERS[key] || TEXTBOOK_CHAPTERS[grade] || {};
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

    const prompt = getGeneratePrompt(grade, subject, type, chapterName, chapterDesc, syllabusStr);

    const response = await fetchWithKeyRotation(buildChatURL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.3 } // 稍微降低温度，使得题目更稳定且符合大纲
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
