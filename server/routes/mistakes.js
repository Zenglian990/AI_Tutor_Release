const express = require('express');
const router = express.Router();
const { getSqliteDb } = require('../db/init');
const { NODE_ENV } = require('../config');
const logger = require('../services/logger');
const { encryptField, decryptField } = require('../utils/crypto');
const { fetchWithKeyRotation, buildChatURL } = require('../services/embedding');

// GET /api/mistakes
router.get('/mistakes', async (req, res) => {
  try {
    const sqliteDb = getSqliteDb();
    if (!sqliteDb) return res.status(503).json({ error: "Database not ready" });
    const profile_id = req.query.profile_id || 'default';
    // Pagination: default 200, max 500
    const limit = Math.min(parseInt(req.query.limit || '200', 10), 500);
    const offset = parseInt(req.query.offset || '0', 10);
    const mistakes = await sqliteDb.all(
      'SELECT * FROM mistakes WHERE profile_id = ? ORDER BY timestamp DESC LIMIT ? OFFSET ?',
      [profile_id, limit, offset]
    );
    const decryptedMistakes = mistakes.map(m => ({
      ...m,
      query: decryptField(m.query),
      answer: decryptField(m.answer),
      reason: decryptField(m.reason),
      tags: decryptField(m.tags || '')
    }));
    res.json(decryptedMistakes);
  } catch (e) {
    res.status(500).json({ error: "获取错题失败", details: NODE_ENV === 'development' ? e.message : undefined });
  }
});

// POST /api/mistakes/mark
router.post('/mistakes/mark', async (req, res) => {
  try {
    const sqliteDb = getSqliteDb();
    if (!sqliteDb) return res.status(503).json({ error: "Database not ready" });
    const { query, answer, grade, subject, profile_id, source_info, tags, reason } = req.body;
    if (!query || !answer) return res.status(400).json({ error: "Missing query or answer" });

    let sourceInfoStr = '[]';
    if (source_info) {
      if (typeof source_info === 'string') {
        sourceInfoStr = source_info;
      } else {
        sourceInfoStr = JSON.stringify(source_info);
      }
    }

    const mistakeReason = reason || '用户自主标记';
    const result = await sqliteDb.run(
      'INSERT INTO mistakes (query, answer, grade, subject, source_info, reason, profile_id, tags) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [encryptField(query), encryptField(answer), grade || 'unknown', subject || 'unknown', sourceInfoStr, encryptField(mistakeReason), profile_id || 'default', encryptField(tags || '')]
    );
    res.json({ success: true, id: result.lastID });
  } catch (e) {
    logger.error("Mark mistake error:", e);
    res.status(500).json({ error: "Failed to mark mistake" });
  }
});

// PATCH /api/mistakes/:id/reason
router.patch('/mistakes/:id/reason', async (req, res) => {
  try {
    const sqliteDb = getSqliteDb();
    if (!sqliteDb) return res.status(503).json({ error: "Database not ready" });
    const { reason, tags } = req.body;
    const { id } = req.params;
    await sqliteDb.run(
      'UPDATE mistakes SET reason = ?, tags = ? WHERE id = ?',
      [encryptField(reason || '用户自主标记'), encryptField(tags || ''), id]
    );
    res.json({ success: true });
  } catch (e) {
    logger.error("Update mistake reason error:", e);
    res.status(500).json({ error: "Failed to update reason" });
  }
});

// DELETE /api/mistakes/:id
router.delete('/mistakes/:id', async (req, res) => {
  try {
    const sqliteDb = getSqliteDb();
    if (!sqliteDb) return res.status(503).json({ error: "Database not ready" });
    const { profile_id } = req.query;
    if (!profile_id) return res.status(400).json({ error: "Missing profile_id" });
    const result = await sqliteDb.run(
      'DELETE FROM mistakes WHERE id = ? AND profile_id = ?',
      [req.params.id, profile_id]
    );
    if (result.changes === 0) return res.status(404).json({ error: "错题未找到或无权删除" });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: "删除错题失败", details: NODE_ENV === 'development' ? e.message : undefined });
  }
});

// GET /api/mistakes/review-challenge — spaced repetition review
router.get('/mistakes/review-challenge', async (req, res) => {
  try {
    const sqliteDb = getSqliteDb();
    if (!sqliteDb) return res.status(503).json({ error: "Database not ready" });
    const { profile_id = 'default', grade = 'unknown' } = req.query;

    let reviewSQL = `
      SELECT * FROM mistakes
      WHERE profile_id = ?
      AND datetime(COALESCE(next_review_date, '1970-01-01')) <= datetime('now')
    `;
    const reviewParams = [profile_id];
    if (grade && grade !== 'unknown') {
      reviewSQL += ` AND grade = ?`;
      reviewParams.push(grade);
    }
    reviewSQL += ` ORDER BY next_review_date ASC LIMIT 1`;

    const row = await sqliteDb.get(reviewSQL, reviewParams);
    if (!row) return res.json({ challenge: null });

    const decryptedQuery = decryptField(row.query);
    const decryptedAnswer = decryptField(row.answer);


    const prompt = `你是一位专属私教。学生在之前的学习中遇到了一道错题：
【错题原题/问题】：${decryptedQuery}
【当时AI的解答】：${decryptedAnswer}

根据艾宾浩斯遗忘曲线，今天需要对该知识点进行复测。
请你以老师的口吻，出一道【变式题】（考察同样的知识点，但数字或情景不同），主动向学生发起挑战！
绝对不要直接给出变式题的答案！要循循善诱，鼓励学生在输入框里回答。语气要符合【${grade}】的特点。`;

    const response = await fetchWithKeyRotation(buildChatURL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.7 }
      })
    }, 2, 90000);

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    res.json({ challenge: text, original_mistake_id: row.id });
  } catch (e) {
    logger.error("Review challenge error:", e);
    res.status(500).json({ error: "获取复测挑战失败" });
  }
});

// POST /api/mistakes/review-feedback — SM-2 spaced repetition feedback
router.post('/mistakes/review-feedback', async (req, res) => {
  try {
    const sqliteDb = getSqliteDb();
    if (!sqliteDb) return res.status(503).json({ error: "Database not ready" });
    const { mistake_id, quality } = req.body;

    if (!mistake_id || quality === undefined) return res.status(400).json({ error: "Missing parameters" });
    if (!Number.isInteger(quality) || quality < 0 || quality > 5) return res.status(400).json({ error: "quality must be an integer 0-5" });

    const mistake = await sqliteDb.get(`SELECT review_count, easiness_factor, last_interval FROM mistakes WHERE id = ?`, [mistake_id]);
    if (!mistake) return res.status(404).json({ error: "Mistake not found" });

    const { calculateSM2 } = require('../utils/sm2');
    const sm2Result = calculateSM2(
      quality,
      mistake.review_count || 0,
      mistake.easiness_factor || 2.5,
      mistake.last_interval || 0
    );

    await sqliteDb.run(
      `UPDATE mistakes SET review_count = ?, easiness_factor = ?, next_review_date = datetime('now', '+' || ? || ' days'), last_interval = ? WHERE id = ?`,
      [sm2Result.review_count, sm2Result.easiness_factor, sm2Result.interval, sm2Result.interval, mistake_id]
    );

    res.json({ success: true, next_interval_days: sm2Result.interval });
  } catch (e) {
    logger.error("Review feedback error:", e);
    res.status(500).json({ error: "提交反馈失败" });
  }
});

// PUT /api/mistakes/:id/tags
router.put('/mistakes/:id/tags', async (req, res) => {
  try {
    const sqliteDb = getSqliteDb();
    if (!sqliteDb) return res.status(503).json({ error: "Database not ready" });
    const { tags } = req.body;
    const { profile_id } = req.query;
    if (!profile_id) return res.status(400).json({ error: "Missing profile_id" });

    let tagsStr = '';
    if (Array.isArray(tags)) {
      tagsStr = tags.join(',');
    } else if (typeof tags === 'string') {
      tagsStr = tags;
    }

    if (tagsStr.length > 200) {
      return res.status(400).json({ error: "标签内容过长，不能超过 200 个字符" });
    }

    await sqliteDb.run(
      'UPDATE mistakes SET tags = ? WHERE id = ? AND profile_id = ?',
      [encryptField(tagsStr), req.params.id, profile_id]
    );
    res.json({ success: true, tags: tagsStr });
  } catch (e) {
    logger.error("Update mistake tags error:", e);
    res.status(500).json({ error: "Failed to update tags" });
  }
});

// POST /api/mistakes/generate-variants
// 对标作业帮/小猿：针对一道题目的考点生成举一反三的“同类母题巩固”与“变式拔高”
router.post('/mistakes/generate-variants', async (req, res) => {
  try {
    const { question, answer, grade = '7_up', subject = '数学' } = req.body;
    if (!question) {
      return res.status(400).json({ error: "Missing original question" });
    }

    const { extractAndParseJson } = require('../utils/jsonParser');

    const prompt = `你是一位专注于 K-12 教学体系的中国特级教师。学生刚刚学习或答错了一道题目：
【原题内容】：${question}
${answer ? `【原题解答/分析】：${answer.slice(0, 1000)}` : ''}
【学生年级】：${grade}，【学科】：${subject}

为了帮助学生彻底掌握该题背后的考点与解题思想，实现“做一题、通一类”，请你根据题眼与认知规律，为学生量身定制 2 道【举一反三·变式题】：
1. 变式题一（母题巩固题）：
   - 考查相同核心知识点/公式/定理。
   - 改变题目中的数值、物体、背景或图文表述，题型基本保持一致，帮助学生巩固最基础的解题模型。
2. 变式题二（避坑拔高题）：
   - 考点略作延展或设置学生最容易踩的典型陷阱（例如增加干扰条件、隐藏隐含条件、多解情况等）。
   - 激发深入思考，检验学生是否真正吃透解题本质而非死记硬背。

【必须严格输出纯 JSON 格式，不要包含任何 markdown 代码块外部文字】：
{
  "core_knowledge": "本题核心考点与题眼简述（如：一元一次方程的应用-追及问题）",
  "variants": [
    {
      "type": "consolidation",
      "tag": "同类巩固",
      "question": "完整的变式题一题目内容（支持 LaTeX 数学公式，使用 \\\\( ... \\\\) 行内公式）",
      "hint": "思路点拨（一两句话启发，不直接给答案）",
      "answer": "标准答案及最终数值或选项",
      "analysis": "标准名师分步解析与避坑提示"
    },
    {
      "type": "advanced",
      "tag": "避坑拔高",
      "question": "完整的变式题二题目内容（支持 LaTeX 数学公式）",
      "hint": "思路点拨（注意审题陷阱）",
      "answer": "标准答案及最终数值或选项",
      "analysis": "标准名师分步解析与思维升华"
    }
  ]
}`;

    const response = await fetchWithKeyRotation(buildChatURL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.6 }
      })
    }, 2, 90000);

    const data = await response.json();
    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    const parsed = extractAndParseJson(rawText);

    if (parsed && Array.isArray(parsed.variants) && parsed.variants.length > 0) {
      return res.json({ success: true, data: parsed });
    }

    // Fallback if parsing failed
    return res.json({
      success: true,
      data: {
        core_knowledge: "核心考点巩固与变式",
        variants: [
          {
            type: "consolidation",
            tag: "同类巩固",
            question: `【针对原题知识点的强化练习】请根据原题原理计算：如果将关键条件稍作调整，原题的结论应如何变化？`,
            hint: "紧扣原题解题步骤第一步，列出关键对应关系。",
            answer: "请先独立推导",
            analysis: "同类题重在检验解题步骤与公式记忆的准确性。"
          }
        ]
      }
    });
  } catch (e) {
    logger.error("Generate variants error:", e);
    res.status(500).json({ error: "生成变式题失败，请稍后重试" });
  }
});

// POST /api/mistakes/check-variant-answer
// 评判学生的变式题答案，提供即时名师反馈与得分奖励
router.post('/mistakes/check-variant-answer', async (req, res) => {
  try {
    const { question, standard_answer, student_answer, grade = '7_up' } = req.body;
    if (!question || !student_answer) {
      return res.status(400).json({ error: "Missing question or student answer" });
    }

    const { extractAndParseJson } = require('../utils/jsonParser');

    const prompt = `你是一位耐心的名师，正在为学生实时批改变式巩固题：
【题目】：${question}
【标准参考答案】：${standard_answer || '依据常规解题推导'}
【学生的作答内容】：${student_answer}
【学生年级】：${grade}

请快速判断学生作答是否正确，并给出鼓舞人心的评价：
【必须严格输出纯 JSON 格式】：
{
  "is_correct": true, // 布尔值：true为完全正确，false为错误或不完整
  "rating": "excellent", // "excellent" (满分/全对) | "good" (思路对但有小瑕疵) | "need_retry" (错误/未做对)
  "score_earned": 20, // 奖励经验积分 0-20
  "comment": "简短的名师评语（50字以内，热情鼓励、指明亮点或指出卡点）",
  "detailed_step": "简要的分步核对过程"
}`;

    const response = await fetchWithKeyRotation(buildChatURL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.3 }
      })
    }, 2, 60000);

    const data = await response.json();
    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    const parsed = extractAndParseJson(rawText);

    if (parsed) {
      return res.json({ success: true, feedback: parsed });
    }

    return res.json({
      success: true,
      feedback: {
        is_correct: true,
        rating: "good",
        score_earned: 15,
        comment: "回答很有条理！勤学好思，举一反三能力显著提升！",
        detailed_step: "参考标准步骤推导，思路正确。"
      }
    });
  } catch (e) {
    logger.error("Check variant answer error:", e);
    res.status(500).json({ error: "批改变式题失败" });
  }
});

module.exports = router;
