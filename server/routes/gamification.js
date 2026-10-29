const express = require('express');
const router = express.Router();
const { getSqliteDb } = require('../db/init');
const { getStudentStreak, recordStudyActivity } = require('../services/streakService');
const logger = require('../services/logger');

// In-memory counter cache for interactive pedagogical actions
const actionCounters = new Map(); // profileId -> { feynmanCount, scratchpadCount }

// POST /api/gamification/record-action
// Records user gamification actions (Feynman roleplay, scratchpad drawing, streak heartbeat)
router.post('/gamification/record-action', async (req, res) => {
  try {
    const { profile_id = 'default', student_name = '曾练', action_type = 'study_session' } = req.body;
    const db = getSqliteDb();

    let counter = actionCounters.get(profile_id);
    if (!counter) {
      counter = { feynmanCount: 0, scratchpadCount: 0 };
      actionCounters.set(profile_id, counter);
    }

    let gainedPoints = 15;
    let badgeGained = null;

    if (action_type === 'feynman_challenge') {
      counter.feynmanCount += 1;
      gainedPoints = 25;
      badgeGained = '费曼小导师';
    } else if (action_type === 'scratchpad_draw') {
      counter.scratchpadCount += 1;
      gainedPoints = 20;
      badgeGained = '草稿大师';
    }

    let streakResult = null;
    if (db) {
      streakResult = await recordStudyActivity(db, {
        profileId: profile_id,
        eventType: action_type,
        xpGain: gainedPoints
      });
    }

    const currentXp = (streakResult?.peerIntimacy?.currentXp || 0) + gainedPoints;

    res.json({
      success: true,
      gainedPoints,
      newPoints: currentXp,
      badgeGained,
      feynmanCount: counter.feynmanCount,
      scratchpadCount: counter.scratchpadCount
    });
  } catch (err) {
    logger.error('[Gamification] Record action error:', err);
    res.status(500).json({ error: '记录行为失败' });
  }
});

// GET /api/gamification/profile
// Comprehensive gamification profile combining Rank Tiers, Badges, Streaks, and Peer Intimacy
router.get('/gamification/profile', async (req, res) => {
  try {
    const profileId = req.query.profile_id || 'default';
    const studentName = req.query.student_name || '曾练';
    const db = getSqliteDb();
    if (!db) {
      return res.status(503).json({ error: '数据库尚未就绪' });
    }

    const streakData = await getStudentStreak(db, profileId);
    const counter = actionCounters.get(profileId) || { feynmanCount: 0, scratchpadCount: 0 };

    // Calculate total points and rank tier based on sessions and XP
    const basePoints = (streakData?.peerIntimacy?.currentXp || 0) + (streakData?.totalSessions || 0) * 10;

    let rankTier = { name: '青铜·求知学童', icon: '🥉', color: '#94a3b8', nextGoal: 200 };
    if (basePoints >= 1500) {
      rankTier = { name: '王者·通识宗师', icon: '👑', color: '#f59e0b', nextGoal: 3000 };
    } else if (basePoints >= 800) {
      rankTier = { name: '钻石·敏思学者', icon: '💎', color: '#38bdf8', nextGoal: 1500 };
    } else if (basePoints >= 400) {
      rankTier = { name: '黄金·明辨辨士', icon: '🥇', color: '#fbbf24', nextGoal: 800 };
    } else if (basePoints >= 150) {
      rankTier = { name: '白银·躬行敏求', icon: '🥈', color: '#cbd5e1', nextGoal: 400 };
    }

    // Dynamic badges unlocked
    const badges = ['初露锋芒'];
    if (streakData?.currentStreak >= 3) badges.push('名师门徒');
    if (counter.scratchpadCount >= 1 || (streakData?.totalSessions || 0) >= 5) badges.push('草稿大师');
    if (counter.feynmanCount >= 1 || (streakData?.peerIntimacy?.level || 1) >= 2) badges.push('费曼小导师');
    if (basePoints >= 300) badges.push('错题粉碎机');
    if (basePoints >= 600) badges.push('黄金学者');

    res.json({
      success: true,
      studentName,
      rankPoints: basePoints,
      rankTier,
      badges,
      streak: streakData,
      streakDays: streakData?.currentStreak || 0,
      feynmanCount: counter.feynmanCount,
      scratchpadCount: counter.scratchpadCount
    });
  } catch (err) {
    logger.error('[Gamification] GET profile error:', err);
    res.status(500).json({ error: '获取学霸成长档案失败' });
  }
});

// GET /api/gamification/streak
router.get('/gamification/streak', async (req, res) => {
  try {
    const profileId = req.query.profile_id || 'default';
    const db = getSqliteDb();
    if (!db) {
      return res.status(503).json({ error: '数据库尚未就绪' });
    }

    const data = await getStudentStreak(db, profileId);
    res.json({ success: true, streak: data });
  } catch (err) {
    logger.error('[Gamification] GET streak error:', err);
    res.status(500).json({ error: '获取学习连胜信息失败' });
  }
});

// POST /api/gamification/heartbeat
router.post('/gamification/heartbeat', async (req, res) => {
  try {
    const { profile_id = 'default', event_type = 'study_session', xp_gain = 15 } = req.body;
    const db = getSqliteDb();
    if (!db) {
      return res.status(503).json({ error: '数据库尚未就绪' });
    }

    const result = await recordStudyActivity(db, {
      profileId: profile_id,
      eventType: event_type,
      xpGain: parseInt(xp_gain, 10) || 15
    });

    res.json(result);
  } catch (err) {
    logger.error('[Gamification] POST heartbeat error:', err);
    res.status(500).json({ error: '记录学习行为失败' });
  }
});

// POST /api/gamification/claim-freeze
router.post('/gamification/claim-freeze', async (req, res) => {
  try {
    const { profile_id = 'default' } = req.body;
    const db = getSqliteDb();
    if (!db) {
      return res.status(503).json({ error: '数据库尚未就绪' });
    }

    // Award 1 streak freeze shield (capped at 5)
    const current = await db.get('SELECT streak_freeze_count FROM student_streaks WHERE profile_id = ?', [profile_id]);
    const currentCount = current ? (current.streak_freeze_count || 0) : 2;
    const newCount = Math.min(5, currentCount + 1);

    await db.run(
      'UPDATE student_streaks SET streak_freeze_count = ?, updated_at = CURRENT_TIMESTAMP WHERE profile_id = ?',
      [newCount, profile_id]
    );

    res.json({ success: true, streakFreezeCount: newCount });
  } catch (err) {
    logger.error('[Gamification] Claim freeze error:', err);
    res.status(500).json({ error: '领取连胜冰冻卡失败' });
  }
});

module.exports = router;
