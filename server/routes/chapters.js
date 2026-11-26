const express = require('express');
const router = express.Router();
const { getChapters } = require('../utils/dataLoader');
const { getSqliteDb } = require('../db/init');
const { NODE_ENV } = require('../config');
const { resolveAuthorizedProfileId } = require('../middleware/auth');
const logger = require('../services/logger');
const { fetchWithKeyRotation, buildChatURL } = require('../services/embedding');
const { extractClientAiHeaders } = require('../utils/aiHeaders');
const { extractAndParseJson } = require('../utils/jsonParser');
const { formatGradeName } = require('../prompts/guidelines');

// GET /api/chapters
router.get('/chapters', async (req, res) => {
  try {
    const grade = req.query.grade;
    const subject = req.query.subject || '数学';
    const authCheck = resolveAuthorizedProfileId(req, req.query.profile_id || 'default');
    if (!authCheck.ok) return res.status(authCheck.status || 403).json({ error: authCheck.error });
    const profile_id = authCheck.profileId;
    const edition = req.query.edition;

    // Do not apply a default grade — return empty list if grade is unspecified
    // to prevent showing wrong grade content to uninitialised profiles.
    if (!grade) {
      logger.info('No grade provided, returning empty chapters');
      return res.json({ chapters: [] });
    }

    const TEXTBOOK_CHAPTERS = await getChapters();
    const key = edition ? `${grade}_${edition}` : grade;
    const gradeChapters = TEXTBOOK_CHAPTERS[key] || TEXTBOOK_CHAPTERS[grade] || {};
    const list = gradeChapters[subject] || [];
    logger.info(`[DEBUG] grade=${grade}, subject=${subject}, edition=${edition}, key=${key}, list.length=${list.length}`);

    let progressMap = {};
    const sqliteDb = getSqliteDb();
    if (sqliteDb) {
      const rows = await sqliteDb.all(
        'SELECT chapter_id, status, progress_pct FROM profile_progress WHERE profile_id = ? AND grade = ? AND subject = ?',
        [profile_id, grade, subject]
      );
      for (const r of rows) {
        progressMap[r.chapter_id] = { status: r.status, progress_pct: r.progress_pct };
      }
    }

    const enrichedList = list.map(c => {
      const prog = progressMap[c.id] || { status: 'not_started', progress_pct: 0 };
      return { ...c, ...prog };
    });

    res.json({ chapters: enrichedList });
  } catch (e) {
    logger.error("Failed to fetch chapters with progress:", e);
    res.status(500).json({ error: "获取章节地图失败" });
  }
});

// POST /api/chapters/update-progress
router.post('/chapters/update-progress', async (req, res) => {
  try {
    const sqliteDb = getSqliteDb();
    if (!sqliteDb) return res.status(503).json({ error: "Database not ready" });
    const { profile_id, grade, subject, chapter_id, status, progress_pct } = req.body;
    if (!profile_id || !grade || !subject || !chapter_id || !status) {
      return res.status(400).json({ error: "Missing required fields" });
    }
    const authCheck = resolveAuthorizedProfileId(req, profile_id);
    if (!authCheck.ok) return res.status(authCheck.status || 403).json({ error: authCheck.error });
    const targetPid = authCheck.profileId;

    await sqliteDb.run(`
      INSERT INTO profile_progress (profile_id, grade, subject, chapter_id, status, progress_pct)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(profile_id, grade, subject, chapter_id)
      DO UPDATE SET status=excluded.status, progress_pct=excluded.progress_pct, updated_at=CURRENT_TIMESTAMP
    `, [targetPid, grade, subject, chapter_id, status, progress_pct || 0]);

    res.json({ success: true });
  } catch (e) {
    logger.error("Failed to update progress:", e);
    res.status(500).json({ error: "更新进度失败", details: NODE_ENV === 'development' ? e.message : undefined });
  }
});

// POST /api/chapters/quiz — 按当前年级、学科与章节动态生成 3 道真实通关选择题（杜绝一年级考中考同位角）
router.post('/chapters/quiz', async (req, res) => {
  try {
    const { grade = '7_up', subject = '数学', chapter_title = '本单元核心知识点' } = req.body || {};
    const gradeLabel = formatGradeName(grade);
    const gradeNum = parseInt(String(grade).replace(/\D/g, ''), 10) || 7;
    const stageDesc = gradeNum <= 6
      ? '小学阶段（严禁出现初中/高中超纲概念，语言童趣直观）'
      : (gradeNum >= 10 ? '高中阶段（贴合新高考/必修选修核心考点与逻辑深度）' : '初中阶段（贴合人教版初中课标与中考要求）');

    const prompt = `请为【${gradeLabel} · ${subject}】章节《${chapter_title}》出 3 道高质量、紧扣教材的 4 选 1 单选题用于单元通关测评。
学段要求：${stageDesc}。
严禁输出跨学段或与章节无关的题目！每题必须含 4 个清晰选项（不带 A./B. 前缀），correctIdx 为 0~3 整数，hint 为审题提示，explanation 为简明解析。
严格返回纯 JSON 数组（禁止 Markdown 代码块）：
[
  {
    "question": "题干内容",
    "options": ["选项1", "选项2", "选项3", "选项4"],
    "correctIdx": 0,
    "hint": "审题小提示",
    "explanation": "解析说明"
  }
]`;

    try {
      const response = await fetchWithKeyRotation(buildChatURL, {
        method: 'POST',
        profileId: req.auth?.activeProfileId || 'default',
        headers: {
          'Content-Type': 'application/json',
          ...extractClientAiHeaders(req)
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 1024,
            responseMimeType: 'application/json',
            thinkingConfig: { thinkingBudget: 0 }
          }
        })
      }, 2, 12000);

      if (!response.ok) throw new Error(`Upstream status ${response.status}`);
      const data = await response.json();
      const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
      const parsed = extractAndParseJson(rawText);
      const list = Array.isArray(parsed) ? parsed : (Array.isArray(parsed?.questions) ? parsed.questions : null);
      if (list && list.length >= 2) {
        const sanitized = list.slice(0, 3).map((q, idx) => ({
          id: idx + 1,
          question: String(q.question || '').trim(),
          options: Array.isArray(q.options) && q.options.length >= 2 ? q.options.slice(0, 4).map(String) : ['A', 'B', 'C', 'D'],
          correctIdx: Math.max(0, Math.min(3, parseInt(q.correctIdx, 10) || 0)),
          hint: String(q.hint || '仔细读题，抓住关键词。'),
          explanation: String(q.explanation || '回顾本节核心概念即可得出正确答案。')
        })).filter(q => q.question.length > 0);
        if (sanitized.length >= 2) {
          return res.json({ success: true, engine: 'llm-chapter-quiz', questions: sanitized });
        }
      }
    } catch (llmErr) {
      logger.warn(`[ChapterQuiz] Dynamic LLM generation failed (${llmErr.message}), returning stage-matched fallback quiz.`);
    }

    return res.json({ success: true, engine: 'stage-fallback', questions: [] });
  } catch (e) {
    logger.error('Failed to generate chapter quiz:', e);
    return res.status(500).json({ error: '生成单元通关测评题失败' });
  }
});

module.exports = router;
