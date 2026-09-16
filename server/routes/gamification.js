const express = require('express');
const router = express.Router();
const { getSqliteDb } = require('../db/init');
const logger = require('../services/logger');

/**
 * Helper to compute rank tier based on points
 */
function getRankTier(points) {
  if (points >= 1500) return { name: '最强王者·数理院士', icon: '👑', color: '#f59e0b', nextGoal: 2000 };
  if (points >= 1000) return { name: '钻石·特级逻辑师', icon: '💎', color: '#06b6d4', nextGoal: 1500 };
  if (points >= 600) return { name: '铂金·母题破局官', icon: '🎖️', color: '#8b5cf6', nextGoal: 1000 };
  if (points >= 300) return { name: '黄金·思维探索者', icon: '🥇', color: '#eab308', nextGoal: 600 };
  if (points >= 150) return { name: '白银·解题先锋', icon: '🥈', color: '#94a3b8', nextGoal: 300 };
  return { name: '青铜·求知学童', icon: '🥉', color: '#b45309', nextGoal: 150 };
}

/**
 * GET /api/gamification/profile
 * Returns student rank, streak days, badges, and points
 */
router.get('/gamification/profile', async (req, res) => {
  try {
    const { profile_id = 'default', student_name = '曾练' } = req.query;
    const db = getSqliteDb();
    if (!db) {
      return res.json({
        success: true,
        rankPoints: 160,
        rankTier: getRankTier(160),
        streakDays: 3,
        badges: ['初露锋芒', '草稿达人'],
        solvedCount: 12,
        feynmanCount: 4
      });
    }

    let record = await db.get('SELECT * FROM user_gamification WHERE profile_id = ?', [profile_id]);
    const todayStr = new Date().toISOString().slice(0, 10);

    if (!record) {
      // Calculate initial baseline from past mistakes/chats
      const mistakeRow = await db.get('SELECT COUNT(*) as cnt FROM mistakes WHERE profile_id = ?', [profile_id]);
      const pastMistakesCount = mistakeRow ? mistakeRow.cnt : 0;
      const initialPoints = Math.max(120 + pastMistakesCount * 15, 120);
      const initialTier = getRankTier(initialPoints).name;
      const initialBadges = JSON.stringify(['初露锋芒', '名师门徒']);

      await db.run(
        `INSERT INTO user_gamification (profile_id, rank_points, rank_tier, streak_days, solved_count, feynman_count, scratchpad_count, badges, last_active_date)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [profile_id, initialPoints, initialTier, 1, pastMistakesCount, 1, 1, initialBadges, todayStr]
      );

      record = await db.get('SELECT * FROM user_gamification WHERE profile_id = ?', [profile_id]);
    }

    let parsedBadges = [];
    try {
      parsedBadges = JSON.parse(record.badges || '[]');
    } catch {
      parsedBadges = ['初露锋芒'];
    }

    const tierInfo = getRankTier(record.rank_points);

    res.json({
      success: true,
      profileId: profile_id,
      studentName: student_name,
      rankPoints: record.rank_points,
      rankTier: tierInfo,
      streakDays: record.streak_days,
      solvedCount: record.solved_count,
      feynmanCount: record.feynman_count,
      scratchpadCount: record.scratchpad_count,
      badges: parsedBadges
    });
  } catch (err) {
    logger.error('[Gamification] Failed to get profile:', err);
    res.status(500).json({ error: '获取学霸段位数据失败', details: err.message });
  }
});

/**
 * POST /api/gamification/record-action
 * Records learning events (e.g. solved_problem, feynman_challenge, scratchpad_draw)
 */
router.post('/gamification/record-action', async (req, res) => {
  try {
    const { profile_id = 'default', action_type = 'solved_problem' } = req.body;
    const db = getSqliteDb();
    if (!db) return res.json({ success: true, gainedPoints: 10 });

    let gain = 10;
    let colToIncrement = 'solved_count';

    if (action_type === 'feynman_challenge') {
      gain = 25;
      colToIncrement = 'feynman_count';
    } else if (action_type === 'scratchpad_draw') {
      gain = 15;
      colToIncrement = 'scratchpad_count';
    } else if (action_type === 'batch_homework') {
      gain = 30;
      colToIncrement = 'solved_count';
    }

    // Atomic update of rank_points and respective counter
    await db.run(
      `UPDATE user_gamification
       SET rank_points = rank_points + ?,
           ${colToIncrement} = ${colToIncrement} + 1,
           updated_at = CURRENT_TIMESTAMP
       WHERE profile_id = ?`,
      [gain, profile_id]
    );

    const row = await db.get('SELECT * FROM user_gamification WHERE profile_id = ?', [profile_id]);
    if (row) {
      const newPoints = row.rank_points;
      const newTierObj = getRankTier(newPoints);
      let badges = [];
      try { badges = JSON.parse(row.badges || '[]'); } catch {}

      let badgeGained = null;
      if (action_type === 'feynman_challenge' && !badges.includes('费曼小导师')) {
        badges.push('费曼小导师');
        badgeGained = '费曼小导师';
      }
      if (action_type === 'scratchpad_draw' && !badges.includes('草稿大师')) {
        badges.push('草稿大师');
        badgeGained = '草稿大师';
      }
      if (newPoints >= 600 && !badges.includes('黄金学者')) {
        badges.push('黄金学者');
        badgeGained = '黄金学者';
      }

      await db.run(
        `UPDATE user_gamification
         SET rank_tier = ?, badges = ?
         WHERE profile_id = ?`,
        [newTierObj.name, JSON.stringify(badges), profile_id]
      );

      return res.json({
        success: true,
        gainedPoints: gain,
        newPoints,
        newTier: newTierObj,
        badgeGained
      });
    }

    res.json({ success: true, gainedPoints: gain });
  } catch (err) {
    logger.error('[Gamification] Failed to record action:', err);
    res.status(500).json({ error: '记录学霸积分失败' });
  }
});

module.exports = router;
