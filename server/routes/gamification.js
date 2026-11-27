const express = require('express');
const router = express.Router();
const { getSqliteDb } = require('../db/init');
const { getStudentStreak, recordStudyActivity, getTodayString } = require('../services/streakService');
const { resolveAuthorizedProfileId } = require('../middleware/auth');
const dbQueue = require('../services/dbQueue');
const logger = require('../services/logger');

function computeRankTier(basePoints) {
  if (basePoints >= 1500) {
    return { name: '王者·通识宗师', icon: '👑', color: '#f59e0b', nextGoal: 3000 };
  }
  if (basePoints >= 800) {
    return { name: '钻石·敏思学者', icon: '💎', color: '#38bdf8', nextGoal: 1500 };
  }
  if (basePoints >= 400) {
    return { name: '黄金·明辨辨士', icon: '🥇', color: '#fbbf24', nextGoal: 800 };
  }
  if (basePoints >= 150) {
    return { name: '白银·躬行敏求', icon: '🥈', color: '#cbd5e1', nextGoal: 400 };
  }
  return { name: '青铜·求知学童', icon: '🥉', color: '#94a3b8', nextGoal: 200 };
}

async function ensureGamificationRow(db, profileId) {
  if (!db) return { feynman_count: 0, scratchpad_count: 0, rank_points: 0, streak_days: 0 };
  let row = await db.get('SELECT * FROM user_gamification WHERE profile_id = ?', [profileId]);
  if (!row) {
    await dbQueue.enqueue(async () => {
      await db.run(
        `INSERT OR IGNORE INTO user_gamification
         (profile_id, rank_points, rank_tier, streak_days, solved_count, feynman_count, scratchpad_count, badges)
         VALUES (?, 0, '青铜·求知学童', 0, 0, 0, 0, '["初露锋芒"]')`,
        [profileId]
      );
    });
    row = await db.get('SELECT * FROM user_gamification WHERE profile_id = ?', [profileId]);
  }
  return row || { feynman_count: 0, scratchpad_count: 0, rank_points: 0, streak_days: 0 };
}

async function syncGamificationSnapshot(db, profileId, streakData, feynmanDelta = 0, scratchpadDelta = 0) {
  if (!db) {
    return {
      feynmanCount: 0,
      scratchpadCount: 0,
      reviewedMistakesCount: 0,
      masteredMistakesCount: 0,
      basePoints: 0,
      rankTier: computeRankTier(0),
      badges: ['初露锋芒']
    };
  }
  const row = await ensureGamificationRow(db, profileId);
  const feynmanCount = (row.feynman_count || 0) + feynmanDelta;
  const scratchpadCount = (row.scratchpad_count || 0) + scratchpadDelta;

  // Phase 3：真实查询 mistakes 表已复盘 / 已消灭错题数，让“错题粉碎机”与真实学习结果绑定
  let reviewedMistakesCount = 0;
  let masteredMistakesCount = 0;
  try {
    const mStats = await db.get(
      `SELECT
         SUM(CASE WHEN COALESCE(review_count, 0) >= 1 THEN 1 ELSE 0 END) as reviewed,
         SUM(CASE WHEN COALESCE(review_count, 0) >= 3 THEN 1 ELSE 0 END) as mastered
       FROM mistakes WHERE profile_id = ?`,
      [profileId]
    );
    reviewedMistakesCount = mStats?.reviewed || 0;
    masteredMistakesCount = mStats?.mastered || 0;
  } catch (e) {
    logger.warn('[Gamification] Mistake stats query warning:', e.message);
  }

  const mistakeBonusPoints = reviewedMistakesCount * 15 + masteredMistakesCount * 35;
  const basePoints = (streakData?.peerIntimacy?.currentXp || 0) + (streakData?.totalSessions || 0) * 10 + mistakeBonusPoints;
  const rankTier = computeRankTier(basePoints);

  const badges = ['初露锋芒'];
  if ((streakData?.currentStreak || 0) >= 3) badges.push('名师门徒');
  if (scratchpadCount >= 1 || (streakData?.totalSessions || 0) >= 5) badges.push('草稿大师');
  if (feynmanCount >= 1 || (streakData?.peerIntimacy?.level || 1) >= 2) badges.push('费曼小导师');
  if (reviewedMistakesCount >= 3 || masteredMistakesCount >= 1) badges.push('错题粉碎机');
  if (masteredMistakesCount >= 5) badges.push('周末清零王');
  if (basePoints >= 600) badges.push('黄金学者');

  if (
    feynmanDelta > 0 ||
    scratchpadDelta > 0 ||
    row.rank_points !== basePoints ||
    row.streak_days !== (streakData?.currentStreak || 0) ||
    (row.solved_count || 0) !== masteredMistakesCount
  ) {
    await dbQueue.enqueue(async () => {
      await db.run(
        `UPDATE user_gamification
         SET rank_points = ?, rank_tier = ?, streak_days = ?, solved_count = ?, feynman_count = ?, scratchpad_count = ?,
             badges = ?, last_active_date = ?, updated_at = CURRENT_TIMESTAMP
         WHERE profile_id = ?`,
        [
          basePoints,
          rankTier.name,
          streakData?.currentStreak || 0,
          masteredMistakesCount,
          feynmanCount,
          scratchpadCount,
          JSON.stringify(badges),
          streakData?.lastActiveDate || null,
          profileId
        ]
      );
    });
  }

  return {
    feynmanCount,
    scratchpadCount,
    reviewedMistakesCount,
    masteredMistakesCount,
    basePoints,
    rankTier,
    badges
  };
}

// POST /api/gamification/record-action
// Records user gamification actions (Feynman roleplay, scratchpad drawing, streak heartbeat)
router.post('/gamification/record-action', async (req, res) => {
  try {
    const { profile_id = 'default', action_type = 'study_session' } = req.body;
    const authCheck = resolveAuthorizedProfileId(req, profile_id);
    if (!authCheck.ok) return res.status(authCheck.status || 403).json({ error: authCheck.error });
    const targetPid = authCheck.profileId;
    const db = getSqliteDb();

    let gainedPoints = 15;
    let badgeGained = null;
    let feynmanDelta = 0;
    let scratchpadDelta = 0;

    if (action_type === 'feynman_challenge') {
      feynmanDelta = 1;
      gainedPoints = 25;
      badgeGained = '费曼小导师';
    } else if (action_type === 'scratchpad_draw') {
      scratchpadDelta = 1;
      gainedPoints = 20;
      badgeGained = '草稿大师';
    }

    let streakResult = null;
    let snapshot = { feynmanCount: feynmanDelta, scratchpadCount: scratchpadDelta };
    if (db) {
      streakResult = await recordStudyActivity(db, {
        profileId: targetPid,
        eventType: action_type,
        xpGain: gainedPoints
      });
      const freshStreak = await getStudentStreak(db, targetPid);
      snapshot = await syncGamificationSnapshot(db, targetPid, freshStreak, feynmanDelta, scratchpadDelta);
    }

    const currentXp = streakResult?.peerIntimacy?.currentXp ?? gainedPoints;

    res.json({
      success: true,
      gainedPoints,
      newPoints: currentXp,
      badgeGained,
      feynmanCount: snapshot.feynmanCount,
      scratchpadCount: snapshot.scratchpadCount
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
    const authCheck = resolveAuthorizedProfileId(req, req.query.profile_id || 'default');
    if (!authCheck.ok) return res.status(authCheck.status || 403).json({ error: authCheck.error });
    const profileId = authCheck.profileId;
    const studentName = req.query.student_name || '同学';
    const db = getSqliteDb();
    if (!db) {
      return res.status(503).json({ error: '数据库尚未就绪' });
    }

    const streakData = await getStudentStreak(db, profileId);
    const snapshot = await syncGamificationSnapshot(db, profileId, streakData, 0, 0);

    res.json({
      success: true,
      studentName,
      rankPoints: snapshot.basePoints,
      rankTier: snapshot.rankTier,
      badges: snapshot.badges,
      streak: streakData,
      streakDays: streakData?.currentStreak || 0,
      feynmanCount: snapshot.feynmanCount,
      scratchpadCount: snapshot.scratchpadCount,
      reviewedMistakesCount: snapshot.reviewedMistakesCount,
      masteredMistakesCount: snapshot.masteredMistakesCount
    });
  } catch (err) {
    logger.error('[Gamification] GET profile error:', err);
    res.status(500).json({ error: '获取学霸成长档案失败' });
  }
});

// GET /api/gamification/streak
router.get('/gamification/streak', async (req, res) => {
  try {
    const authCheck = resolveAuthorizedProfileId(req, req.query.profile_id || 'default');
    if (!authCheck.ok) return res.status(authCheck.status || 403).json({ error: authCheck.error });
    const profileId = authCheck.profileId;
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
    const authCheck = resolveAuthorizedProfileId(req, profile_id);
    if (!authCheck.ok) return res.status(authCheck.status || 403).json({ error: authCheck.error });
    const targetPid = authCheck.profileId;
    const db = getSqliteDb();
    if (!db) {
      return res.status(503).json({ error: '数据库尚未就绪' });
    }

    // 防止任意传 xp_gain=999999 恶意刷分：严格钳制在 [1, 50]
    const parsedXp = parseInt(xp_gain, 10);
    const safeXpGain = Number.isFinite(parsedXp) ? Math.min(50, Math.max(1, parsedXp)) : 15;

    const result = await recordStudyActivity(db, {
      profileId: targetPid,
      eventType: String(event_type || 'study_session').slice(0, 40),
      xpGain: safeXpGain
    });

    const freshStreak = await getStudentStreak(db, targetPid);
    await syncGamificationSnapshot(db, targetPid, freshStreak, 0, 0);

    res.json(result);
  } catch (err) {
    logger.error('[Gamification] POST heartbeat error:', err);
    res.status(500).json({ error: '记录学习行为失败' });
  }
});

// POST /api/gamification/claim-freeze
// 每日限领 1 张且需当前未满 5 张，防止连点无限白嫖
router.post('/gamification/claim-freeze', async (req, res) => {
  try {
    const { profile_id = 'default' } = req.body;
    const authCheck = resolveAuthorizedProfileId(req, profile_id);
    if (!authCheck.ok) return res.status(authCheck.status || 403).json({ error: authCheck.error });
    const targetPid = authCheck.profileId;
    const db = getSqliteDb();
    if (!db) {
      return res.status(503).json({ error: '数据库尚未就绪' });
    }

    await getStudentStreak(db, targetPid);
    const today = getTodayString();
    const claimKey = `freeze_claim_date:${targetPid}`;

    const [current, lastClaimRow] = await Promise.all([
      db.get('SELECT streak_freeze_count FROM student_streaks WHERE profile_id = ?', [targetPid]),
      db.get('SELECT value FROM system_settings WHERE key = ?', [claimKey])
    ]);
    const currentCount = current ? (current.streak_freeze_count || 0) : 2;
    if (currentCount >= 5) {
      return res.status(400).json({ error: '连胜冰冻卡已达上限（5 张），无需重复领取', streakFreezeCount: currentCount });
    }
    if (lastClaimRow && lastClaimRow.value === today) {
      return res.status(429).json({ error: '今日已领取过连胜冰冻卡，明天坚持学习后可再次领取', streakFreezeCount: currentCount });
    }

    const newCount = Math.min(5, currentCount + 1);
    await dbQueue.enqueue(async () => {
      await db.run(
        'UPDATE student_streaks SET streak_freeze_count = ?, updated_at = CURRENT_TIMESTAMP WHERE profile_id = ?',
        [newCount, targetPid]
      );
      await db.run(
        'INSERT INTO system_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
        [claimKey, today]
      );
    });

    res.json({ success: true, streakFreezeCount: newCount, claimedDate: today });
  } catch (err) {
    logger.error('[Gamification] Claim freeze error:', err);
    res.status(500).json({ error: '领取连胜冰冻卡失败' });
  }
});

module.exports = router;
