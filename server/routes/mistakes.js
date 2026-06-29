const express = require('express');
const router = express.Router();
const { getSqliteDb } = require('../db/init');
const { NODE_ENV } = require('../config');
const logger = require('../services/logger');
const { encryptField, decryptField } = require('../utils/crypto');

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
    const { query, answer, grade, subject, profile_id, source_info, tags } = req.body;
    if (!query || !answer) return res.status(400).json({ error: "Missing query or answer" });

    let sourceInfoStr = '[]';
    if (source_info) {
      if (typeof source_info === 'string') {
        sourceInfoStr = source_info;
      } else {
        sourceInfoStr = JSON.stringify(source_info);
      }
    }

    await sqliteDb.run(
      'INSERT INTO mistakes (query, answer, grade, subject, source_info, reason, profile_id, tags) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [encryptField(query), encryptField(answer), grade || 'unknown', subject || 'unknown', sourceInfoStr, encryptField('User manually marked'), profile_id || 'default', encryptField(tags || '')]
    );
    res.json({ success: true });
  } catch (e) {
    logger.error("Mark mistake error:", e);
    res.status(500).json({ error: "Failed to mark mistake" });
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

    const { fetchWithKeyRotation, buildChatURL } = require('../services/embedding');
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

    let { review_count = 0, easiness_factor = 2.5, last_interval = 0 } = mistake;
    let interval = 1;

    if (quality >= 3) {
      if (review_count === 0) interval = 1;
      else if (review_count === 1) interval = 6;
      else interval = Math.round(last_interval * easiness_factor);
      review_count += 1;
    } else {
      review_count = 0;
      interval = 1;
    }

    // SM-2: EF is updated regardless of quality score
    easiness_factor = Math.max(1.3, easiness_factor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)));

    await sqliteDb.run(
      `UPDATE mistakes SET review_count = ?, easiness_factor = ?, next_review_date = datetime('now', '+' || ? || ' days'), last_interval = ? WHERE id = ?`,
      [review_count, easiness_factor, interval, interval, mistake_id]
    );

    res.json({ success: true, next_interval_days: interval });
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

module.exports = router;
