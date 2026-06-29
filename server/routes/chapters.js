const express = require('express');
const router = express.Router();
const TEXTBOOK_CHAPTERS = require('../prompts/chapters.json');
const { getSqliteDb } = require('../db/init');
const { NODE_ENV } = require('../config');
const logger = require('../services/logger');

// GET /api/chapters
router.get('/chapters', async (req, res) => {
  try {
    const grade = req.query.grade;
    const subject = req.query.subject || '数学';
    const profile_id = req.query.profile_id || 'default';
    const edition = req.query.edition;

    // Do not apply a default grade — return empty list if grade is unspecified
    // to prevent showing wrong grade content to uninitialised profiles.
    if (!grade) return res.json({ chapters: [] });

    const key = edition ? `${grade}_${edition}` : grade;
    const gradeChapters = TEXTBOOK_CHAPTERS[key] || TEXTBOOK_CHAPTERS[grade] || {};
    const list = gradeChapters[subject] || [];

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

    await sqliteDb.run(`
      INSERT INTO profile_progress (profile_id, grade, subject, chapter_id, status, progress_pct)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(profile_id, grade, subject, chapter_id)
      DO UPDATE SET status=excluded.status, progress_pct=excluded.progress_pct, updated_at=CURRENT_TIMESTAMP
    `, [profile_id, grade, subject, chapter_id, status, progress_pct || 0]);

    res.json({ success: true });
  } catch (e) {
    logger.error("Failed to update progress:", e);
    res.status(500).json({ error: "更新进度失败", details: NODE_ENV === 'development' ? e.message : undefined });
  }
});

module.exports = router;
