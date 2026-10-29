/**
 * streakService.js
 * 
 * Duolingo-style Behavioral Motivation & Habit Formation Engine
 * Manages:
 *  1. Consecutive Daily Study Streaks (Loss Aversion Flywheel)
 *  2. Streak Freeze Shields (Anti-frustration Churn Protection)
 *  3. Peer Student ("同桌小明") Intimacy XP & Level Progression
 */

const logger = require('./logger');

const PEER_LEVEL_CONFIG = [
  { level: 1, title: '初识小同桌', minXp: 0, maxXp: 99, perk: '解锁好奇提问与基础草稿' },
  { level: 2, title: '课后学习搭子', minXp: 100, maxXp: 299, perk: '解锁互动几何画板联想' },
  { level: 3, title: '默契黄金同桌', minXp: 300, maxXp: 699, perk: '解锁费曼以教代学双向辩论' },
  { level: 4, title: '班级学霸搭档', minXp: 700, maxXp: 1499, perk: '解锁中高考压轴母题变式' },
  { level: 5, title: '知己满分智囊', minXp: 1500, maxXp: Infinity, perk: '解锁全学科知识图谱洞察' }
];

function getPeerLevelInfo(xp) {
  const currentXp = Math.max(0, xp || 0);
  for (let i = PEER_LEVEL_CONFIG.length - 1; i >= 0; i--) {
    const tier = PEER_LEVEL_CONFIG[i];
    if (currentXp >= tier.minXp) {
      const nextTier = PEER_LEVEL_CONFIG[i + 1] || null;
      const progressPercent = nextTier 
        ? Math.min(100, Math.round(((currentXp - tier.minXp) / (nextTier.minXp - tier.minXp)) * 100))
        : 100;
      return {
        level: tier.level,
        title: tier.title,
        perk: tier.perk,
        currentXp,
        nextLevelXp: nextTier ? nextTier.minXp : tier.minXp,
        progressPercent
      };
    }
  }
  return { level: 1, title: '初识小同桌', currentXp, progressPercent: 0 };
}

function getTodayString() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function getDaysDifference(dateStr1, dateStr2) {
  if (!dateStr1 || !dateStr2) return Infinity;
  const d1 = new Date(dateStr1);
  const d2 = new Date(dateStr2);
  const diffMs = Math.abs(d2.setHours(0,0,0,0) - d1.setHours(0,0,0,0));
  return Math.round(diffMs / (1000 * 60 * 60 * 24));
}

/**
 * Retrieve student's current streak and gamification status
 */
async function getStudentStreak(db, profileId = 'default') {
  if (!db) return null;
  const today = getTodayString();

  let row = await db.get('SELECT * FROM student_streaks WHERE profile_id = ?', [profileId]);
  if (!row) {
    await db.run(`
      INSERT OR IGNORE INTO student_streaks (profile_id, current_streak, longest_streak, last_active_date, streak_freeze_count, peer_intimacy_xp, peer_level, total_sessions)
      VALUES (?, 0, 0, NULL, 2, 0, 1, 0)
    `, [profileId]);
    row = await db.get('SELECT * FROM student_streaks WHERE profile_id = ?', [profileId]);
  }

  // Check if streak was broken (missed more than 1 day without freeze)
  let currentStreak = row.current_streak;
  let freezeCount = row.streak_freeze_count;
  let freezeAutoConsumed = false;

  if (row.last_active_date) {
    const daysSince = getDaysDifference(row.last_active_date, today);
    if (daysSince === 2) {
      // Missed yesterday! Check for freeze
      if (freezeCount > 0) {
        freezeCount -= 1;
        freezeAutoConsumed = true;
        await db.run(
          'UPDATE student_streaks SET streak_freeze_count = ?, updated_at = CURRENT_TIMESTAMP WHERE profile_id = ?',
          [freezeCount, profileId]
        );
        logger.info(`[Streak] Profile ${profileId} missed yesterday, consumed 1 streak freeze shield.`);
      } else {
        currentStreak = 0;
      }
    } else if (daysSince > 2) {
      currentStreak = 0;
    }
  }

  const levelInfo = getPeerLevelInfo(row.peer_intimacy_xp);

  // Get active dates in past 7 days for the weekly calendar
  const recentHistory = await db.all(`
    SELECT DISTINCT activity_date FROM streak_history 
    WHERE profile_id = ? 
    ORDER BY activity_date DESC LIMIT 7
  `, [profileId]);

  const activeDates = recentHistory.map(h => h.activity_date);
  const isTodayCompleted = row.last_active_date === today;

  return {
    profileId,
    currentStreak,
    longestStreak: row.longest_streak,
    lastActiveDate: row.last_active_date,
    isTodayCompleted,
    streakFreezeCount: freezeCount,
    freezeAutoConsumed,
    peerIntimacy: levelInfo,
    activeDatesWeek: activeDates,
    totalSessions: row.total_sessions
  };
}

/**
 * Record a valid study activity, extend streak, and award Peer Intimacy XP
 */
async function recordStudyActivity(db, { profileId = 'default', eventType = 'study_session', xpGain = 15 } = {}) {
  if (!db) return null;
  const today = getTodayString();

  let row = await db.get('SELECT * FROM student_streaks WHERE profile_id = ?', [profileId]);
  if (!row) {
    await db.run(`
      INSERT OR IGNORE INTO student_streaks (profile_id, current_streak, longest_streak, last_active_date, streak_freeze_count, peer_intimacy_xp, peer_level, total_sessions)
      VALUES (?, 0, 0, NULL, 2, 0, 1, 0)
    `, [profileId]);
    row = await db.get('SELECT * FROM student_streaks WHERE profile_id = ?', [profileId]);
  }

  let newStreak = row.current_streak;
  let freezeCount = row.streak_freeze_count;
  let freezeSaved = false;
  let streakExtended = false;

  if (!row.last_active_date) {
    // First ever activity
    newStreak = 1;
    streakExtended = true;
  } else {
    const days = getDaysDifference(row.last_active_date, today);
    if (days === 0) {
      // Already active today, streak count maintained
      streakExtended = false;
    } else if (days === 1) {
      // Perfect consecutive day!
      newStreak += 1;
      streakExtended = true;
    } else if (days === 2) {
      // Missed 1 day: use freeze if available
      if (freezeCount > 0) {
        freezeCount -= 1;
        newStreak += 1; // Saved by freeze!
        freezeSaved = true;
        streakExtended = true;
      } else {
        newStreak = 1; // Restarted
        streakExtended = true;
      }
    } else {
      newStreak = 1;
      streakExtended = true;
    }
  }

  const newLongest = Math.max(newStreak, row.longest_streak || 0);
  const newXp = (row.peer_intimacy_xp || 0) + xpGain;
  const newLevelInfo = getPeerLevelInfo(newXp);
  const newTotalSessions = (row.total_sessions || 0) + 1;

  await db.run(`
    UPDATE student_streaks 
    SET current_streak = ?, longest_streak = ?, last_active_date = ?, 
        streak_freeze_count = ?, peer_intimacy_xp = ?, peer_level = ?, 
        total_sessions = ?, updated_at = CURRENT_TIMESTAMP
    WHERE profile_id = ?
  `, [newStreak, newLongest, today, freezeCount, newXp, newLevelInfo.level, newTotalSessions, profileId]);

  // Record into history
  await db.run(`
    INSERT OR IGNORE INTO streak_history (profile_id, activity_date, event_type, xp_awarded)
    VALUES (?, ?, ?, ?)
  `, [profileId, today, eventType, xpGain]);

  return {
    success: true,
    currentStreak: newStreak,
    longestStreak: newLongest,
    streakExtended,
    freezeSaved,
    xpAwarded: xpGain,
    peerIntimacy: newLevelInfo
  };
}

module.exports = {
  getStudentStreak,
  recordStudyActivity,
  getPeerLevelInfo,
  getTodayString,
  getDaysDifference
};
