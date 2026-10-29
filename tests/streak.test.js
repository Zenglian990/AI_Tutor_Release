const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const { open } = require('sqlite');
const sqlite3 = require('sqlite3');
const {
  getStudentStreak,
  recordStudyActivity,
  getPeerLevelInfo,
  getDaysDifference
} = require('../server/services/streakService');

describe('Duolingo-style Streak & Gamification Engine', () => {
  let db;

  before(async () => {
    db = await open({
      filename: ':memory:',
      driver: sqlite3.Database
    });

    await db.exec(`
      CREATE TABLE student_streaks (
        profile_id TEXT PRIMARY KEY,
        current_streak INTEGER DEFAULT 0,
        longest_streak INTEGER DEFAULT 0,
        last_active_date TEXT,
        streak_freeze_count INTEGER DEFAULT 2,
        peer_intimacy_xp INTEGER DEFAULT 0,
        peer_level INTEGER DEFAULT 1,
        total_sessions INTEGER DEFAULT 0,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE streak_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        profile_id TEXT NOT NULL,
        activity_date TEXT NOT NULL,
        event_type TEXT DEFAULT 'study_session',
        xp_awarded INTEGER DEFAULT 10,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(profile_id, activity_date, event_type)
      );
    `);
  });

  after(async () => {
    if (db) await db.close();
  });

  it('getPeerLevelInfo: progression tiers scale correctly', () => {
    const l1 = getPeerLevelInfo(50);
    assert.strictEqual(l1.level, 1);
    assert.strictEqual(l1.title, '初识小同桌');

    const l2 = getPeerLevelInfo(150);
    assert.strictEqual(l2.level, 2);
    assert.strictEqual(l2.title, '课后学习搭子');

    const l3 = getPeerLevelInfo(500);
    assert.strictEqual(l3.level, 3);
    assert.strictEqual(l3.title, '默契黄金同桌');

    const l5 = getPeerLevelInfo(2000);
    assert.strictEqual(l5.level, 5);
    assert.strictEqual(l5.title, '知己满分智囊');
  });

  it('recordStudyActivity: first time study initializes streak to 1 and awards XP', async () => {
    const res = await recordStudyActivity(db, { profileId: 'student_alice', xpGain: 20 });
    assert.strictEqual(res.currentStreak, 1);
    assert.strictEqual(res.longestStreak, 1);
    assert.strictEqual(res.streakExtended, true);
    assert.strictEqual(res.peerIntimacy.currentXp, 20);

    const status = await getStudentStreak(db, 'student_alice');
    assert.strictEqual(status.currentStreak, 1);
    assert.strictEqual(status.isTodayCompleted, true);
    assert.strictEqual(status.streakFreezeCount, 2);
  });

  it('recordStudyActivity: same day activity does not double count streak but adds XP', async () => {
    const res = await recordStudyActivity(db, { profileId: 'student_alice', xpGain: 30 });
    assert.strictEqual(res.currentStreak, 1);
    assert.strictEqual(res.streakExtended, false);
    assert.strictEqual(res.peerIntimacy.currentXp, 50);
  });

  it('recordStudyActivity: auto consumes streak freeze when missing yesterday', async () => {
    // Manually backdate student's last_active_date to 2 days ago
    const twoDaysAgo = new Date();
    twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
    const dateStr = twoDaysAgo.toISOString().split('T')[0];

    await db.run(`
      INSERT OR REPLACE INTO student_streaks (profile_id, current_streak, longest_streak, last_active_date, streak_freeze_count, peer_intimacy_xp, peer_level, total_sessions)
      VALUES ('student_bob', 5, 5, ?, 2, 100, 2, 5)
    `, [dateStr]);

    // Bob records activity today -> freeze shield should protect Bob's streak!
    const res = await recordStudyActivity(db, { profileId: 'student_bob', xpGain: 25 });
    assert.strictEqual(res.freezeSaved, true);
    assert.strictEqual(res.currentStreak, 6); // 5 + 1 saved!

    const bobStatus = await getStudentStreak(db, 'student_bob');
    assert.strictEqual(bobStatus.streakFreezeCount, 1); // 1 freeze used
  });

});
