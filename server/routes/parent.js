const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { fetch: undiciFetch } = require('undici');
const { getSqliteDb } = require('../db/init');
const { getStudentCognitiveMemory } = require('../services/studentMemory');
const { formatGradeName } = require('../prompts/guidelines');
const { isSafeExternalUrl, validateSafeUrlAsync, createPinnedDispatcher } = require('../utils/urlValidator');
const { API_TOKEN, PARENT_VIEW_SECRET, NODE_ENV } = require('../config');
const { decryptField } = require('../utils/crypto');
const { resolveAuthorizedProfileId } = require('../middleware/auth');
const { isVerifiedAdminRequest } = require('../utils/adminAuth');
const logger = require('../services/logger');

// Cryptographic signing secret dedicated to parent view tokens (domain-separated from general API_TOKEN)
const PARENT_HMAC_SECRET = process.env.PARENT_VIEW_SECRET || PARENT_VIEW_SECRET || crypto.createHmac('sha256', API_TOKEN).update('parent_remote_view_subsystem_v1').digest('hex');

/**
 * Generate cryptographically signed token for parent remote WeChat/mobile view
 */
function generateParentToken(profileId = 'default', daysValid = 30) {
  const exp = Date.now() + daysValid * 24 * 60 * 60 * 1000;
  const payload = `${profileId}:${exp}`;
  const sig = crypto.createHmac('sha256', PARENT_HMAC_SECRET).update(payload).digest('hex');
  return Buffer.from(`${payload}:${sig}`).toString('base64url');
}

/**
 * Verify signed parent remote token
 */
function verifyParentToken(token) {
  try {
    if (!token || typeof token !== 'string') return null;
    const decoded = Buffer.from(token, 'base64url').toString('utf8');
    const parts = decoded.split(':');
    if (parts.length !== 3) return null;
    const [profileId, expStr, sig] = parts;
    const exp = parseInt(expStr, 10);
    if (isNaN(exp) || Date.now() > exp) return null;
    const expectedSig = crypto.createHmac('sha256', PARENT_HMAC_SECRET).update(`${profileId}:${exp}`).digest('hex');
    if (typeof sig !== 'string' || sig.length !== expectedSig.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig))) {
      return null;
    }
    return { profileId, exp };
  } catch (err) {
    return null;
  }
}

// GET /api/parent/remote-token
// Generates a secure shareable token for WeChat / mobile browser viewing
router.get('/parent/remote-token', async (req, res) => {
  try {
    const requestedPid = req.query.profile_id || 'default';
    const isAdmin = await isVerifiedAdminRequest(req);
    const authCheck = resolveAuthorizedProfileId(req, requestedPid);
    if (!isAdmin && !authCheck.ok) {
      return res.status(authCheck.status || 403).json({ error: authCheck.error || '无权为该学生生成家长远程令牌' });
    }
    const targetPid = isAdmin ? String(requestedPid).trim() || 'default' : authCheck.profileId;
    const token = generateParentToken(targetPid);
    res.json({
      success: true,
      profile_id: targetPid,
      token,
      expires_in_days: 30
    });
  } catch (err) {
    logger.error('[ParentToken] Failed generating remote token:', err);
    res.status(500).json({ error: '生成家长访问令牌失败' });
  }
});

// GET /api/parent/remote-view
// Public read-only endpoint accessed via WeChat H5 / mobile browser with valid token
router.get('/parent/remote-view', async (req, res) => {
  try {
    const { token, switch_profile_id } = req.query;
    const verified = verifyParentToken(token);
    if (!verified) {
      return res.status(401).json({ error: '家长访问链接无效或已过期，请在伴学客户端重新扫码获取' });
    }

    // IDOR Protection: Token is cryptographically bound to verified.profileId.
    // Switching to an unauthorized profile without a matching token is strictly forbidden.
    let activeProfileId = verified.profileId;
    if (switch_profile_id && switch_profile_id.trim()) {
      const targetProfile = switch_profile_id.trim();
      if (targetProfile !== verified.profileId) {
        return res.status(403).json({ error: '无权访问其他学生的专属档案' });
      }
      activeProfileId = targetProfile;
    }

    const db = getSqliteDb();
    if (!db) {
      return res.status(503).json({ error: '伴学数据库尚未就绪' });
    }

    // 1. Fetch cognitive memory and student name (优先使用分享链接显式透传昵称，避免回退为通用「同学」)
    const explicitStudentName = typeof req.query.student_name === 'string' ? req.query.student_name.trim().slice(0, 30) : '';
    const memory = await getStudentCognitiveMemory(activeProfileId, '7_up', '数学', explicitStudentName || '同学');
    const studentName = explicitStudentName || (memory.studentName && memory.studentName !== '同学' ? memory.studentName : '学习者');

    // 2. Fetch Gamification & Rank (merge student_streaks as primary truth + user_gamification fallback)
    let gameRow = null;
    let streakRow = null;
    try {
      gameRow = await db.get('SELECT * FROM user_gamification WHERE profile_id = ?', [activeProfileId]);
      streakRow = await db.get('SELECT * FROM student_streaks WHERE profile_id = ?', [activeProfileId]);
    } catch (e) {
      logger.warn('[ParentRemote] Could not read gamification/streak tables:', e.message);
    }
    const computedPoints = streakRow
      ? ((streakRow.peer_intimacy_xp || 0) + (streakRow.total_sessions || 0) * 10)
      : (gameRow?.rank_points || 0);
    const rankPoints = Math.max(computedPoints, gameRow?.rank_points || 0);
    const streakDays = streakRow?.current_streak ?? gameRow?.streak_days ?? 0;
    const rankTier = gameRow?.rank_tier || (rankPoints >= 1500 ? '王者·通识宗师' : rankPoints >= 800 ? '钻石·敏思学者' : rankPoints >= 400 ? '黄金·明辨辨士' : rankPoints >= 150 ? '白银·躬行敏求' : '青铜·求知学童');

    // 3. Daily activity stats (strictly count real user turns in Beijing time UTC+8 to prevent midnight-8am timezone mismatch)
    let todayChatCount = 0;
    let todayMistakesSolved = 0;
    try {
      const chatRow = await db.get(
        `SELECT COUNT(*) as count FROM chat_history WHERE profile_id = ? AND role = 'user' AND date(timestamp, '+8 hours') = date('now', '+8 hours')`,
        [activeProfileId]
      );
      todayChatCount = chatRow ? chatRow.count : 0;

      const mistakeRow = await db.get(
        `SELECT COUNT(*) as count FROM mistakes WHERE profile_id = ? AND review_count > 0 AND date(COALESCE(last_reviewed_at, timestamp), '+8 hours') = date('now', '+8 hours')`,
        [activeProfileId]
      );
      todayMistakesSolved = mistakeRow ? mistakeRow.count : 0;
    } catch (e) {
      logger.warn('[ParentRemote] Daily activity query error:', e.message);
    }
    const activeMinutes = todayChatCount > 0 ? Math.max(Math.round(todayChatCount * 3), 3) : 0;

    // 4. Mistakes overview
    let totalMistakes = 0;
    let masteredMistakes = 0;
    try {
      const row = await db.get(
        `SELECT COUNT(*) as total, SUM(CASE WHEN review_count >= 3 THEN 1 ELSE 0 END) as mastered FROM mistakes WHERE profile_id = ?`,
        [activeProfileId]
      );
      totalMistakes = row?.total || 0;
      masteredMistakes = row?.mastered || 0;
    } catch (e) {
      logger.warn('[ParentRemote] Mistakes overview query error:', e.message);
    }
    const masteryRate = totalMistakes > 0 ? Math.round((masteredMistakes / totalMistakes) * 100) : 100;

    // 5. Weak knowledge tags
    let weakTags = [];
    try {
      const tagRows = await db.all(
        `SELECT tags, subject, COUNT(*) as count FROM mistakes 
         WHERE profile_id = ? AND tags IS NOT NULL AND tags != '' 
         GROUP BY tags ORDER BY count DESC LIMIT 10`,
        [activeProfileId]
      );
      const seen = new Set();
      for (const r of tagRows) {
        const decryptedTags = decryptField(r.tags || '');
        const splitTags = String(decryptedTags).split(/[,，、 ]+/).filter(Boolean);
        for (const t of splitTags) {
          if (!seen.has(t) && weakTags.length < 8) {
            seen.add(t);
            weakTags.push({
              tag: t,
              subject: r.subject || '数学',
              count: r.count
            });
          }
        }
      }
    } catch (e) {
      logger.warn('[ParentRemote] Weak tags query error:', e.message);
    }

    // 6. Recent mistakes review items
    let recentMistakes = [];
    try {
      const mistakeItems = await db.all(
        `SELECT id, subject, grade, query, answer, reason, review_count, next_review_date, timestamp 
         FROM mistakes 
         WHERE profile_id = ? 
         ORDER BY timestamp DESC LIMIT 5`,
        [activeProfileId]
      );
      recentMistakes = mistakeItems.map(m => {
        const queryText = decryptField(m.query || '');
        const reasonText = decryptField(m.reason || '');
        return {
          id: m.id,
          subject: m.subject || '数学',
          grade: formatGradeName(m.grade || '7_up'),
          rawGrade: m.grade || '7_up',
          snippet: queryText.length > 80 ? queryText.slice(0, 80) + '...' : queryText,
          reason: reasonText || '概念理解或审题失误',
          reviewCount: m.review_count || 0,
          nextReviewDate: m.next_review_date,
          isDue: m.next_review_date ? new Date(m.next_review_date) <= new Date() : false
        };
      });
    } catch (e) {
      logger.warn('[ParentRemote] Recent mistakes query error:', e.message);
    }

    // 6.5 7日窗口统一统计口径（与 AI 学习周报 / 学情统计看板 100% 对齐）
    let weekStats = { chatTurns: todayChatCount, newMistakes: 0, reviewedMistakes: 0, masteredMistakes: masteredMistakes };
    try {
      const [wChat, wNewMistakes, wRev] = await Promise.all([
        db.get(
          `SELECT COUNT(*) as c FROM chat_history WHERE profile_id = ? AND role = 'user' AND datetime(timestamp, '+8 hours') >= datetime('now', '+8 hours', '-7 days')`,
          [activeProfileId]
        ),
        db.get(
          `SELECT COUNT(*) as c FROM mistakes WHERE profile_id = ? AND datetime(timestamp, '+8 hours') >= datetime('now', '+8 hours', '-7 days')`,
          [activeProfileId]
        ),
        db.get(
          `SELECT SUM(CASE WHEN COALESCE(review_count, 0) >= 1 THEN 1 ELSE 0 END) as reviewed FROM mistakes WHERE profile_id = ?`,
          [activeProfileId]
        )
      ]);
      weekStats = {
        chatTurns: wChat?.c || 0,
        newMistakes: wNewMistakes?.c || 0,
        reviewedMistakes: wRev?.reviewed || 0,
        masteredMistakes
      };
    } catch (e) {
      logger.warn('[ParentRemote] Week stats query warning:', e.message);
    }

    // 7. Strict profile isolation: NEVER expose other users' profile_ids from database
    const availableProfiles = [activeProfileId];

    // 8. 5-Dimensional Cognitive Radar (honestly computed from real activity; 0 when no learning yet)
    const hasActivity = todayChatCount > 0 || totalMistakes > 0 || streakDays > 0;
    const radarData = hasActivity
      ? {
          conceptClarity: Math.min(100, Math.round(masteryRate * 0.8 + Math.min(masteredMistakes * 4, 20))),
          computationPrecision: Math.min(100, Math.round(masteryRate * 0.7 + Math.min(todayMistakesSolved * 6, 30))),
          logicDeduction: Math.min(100, Math.min(todayChatCount * 12, 95)),
          activeFocus: Math.min(100, Math.min(activeMinutes * 3, 98)),
          habitConsistency: Math.min(100, Math.min(streakDays * 14, 100))
        }
      : {
          conceptClarity: 0,
          computationPrecision: 0,
          logicDeduction: 0,
          activeFocus: 0,
          habitConsistency: 0
        };

    const comfortScore = todayChatCount > 0 || todayMistakesSolved > 0
      ? `${Math.min(99, 70 + Math.min(todayChatCount * 4 + todayMistakesSolved * 5, 29))} (今日已真实伴学)`
      : '待开启今日学习';

    // 9. Personalized honest summary memo
    const memoContent = [
      todayChatCount > 0
        ? `🌟 今日专注学习约 ${activeMinutes} 分钟，与 AI 私教真实互动设问 ${todayChatCount} 轮。`
        : `🌟 今日暂未产生有效互动学习记录，开启首道练习后将自动生成真实学情诊断。`,
      weakTags.length > 0
        ? `🎯 核心攻坚考点：【${weakTags.slice(0, 3).map(w => w.tag).join('、')}】。`
        : (todayChatCount > 0 ? `🎯 暂无明显高频薄弱标签，请继续保持稳健推导。` : `🎯 暂无薄弱考点数据，录入或批改错题后将自动构建薄弱点画像。`),
      todayMistakesSolved > 0
        ? `💡 抗遗忘复盘：今天成功复盘了 ${todayMistakesSolved} 道易错题，巩固扎实！`
        : `💡 建议晚间保持 10–15 分钟启发式问答或错题闪卡复盘，养成稳定学习节奏。`
    ];

    res.json({
      success: true,
      profileId: activeProfileId,
      studentName,
      date: new Date().toLocaleDateString('zh-CN', { timeZone: 'Asia/Shanghai' }),
      todayStats: {
        activeMinutes,
        chatCount: todayChatCount,
        mistakesSolved: todayMistakesSolved
      },
      weekStats,
      overallStats: {
        totalMistakes,
        masteredMistakes,
        masteryRate: totalMistakes > 0 ? masteryRate : 0,
        streakDays,
        rankTier,
        rankPoints
      },
      weakTags,
      recentMistakes,
      radarData,
      memoContent,
      comfortScore,
      availableProfiles
    });
  } catch (err) {
    logger.error('[ParentRemote] Failed serving remote view:', err);
    res.status(500).json({ error: '获取家长远程学情数据失败', ...(NODE_ENV === 'development' ? { details: err.message } : {}) });
  }
});

// GET /api/parent/daily-memo
router.get('/parent/daily-memo', async (req, res) => {
  try {
    const { profile_id = 'default', grade = '7_up', subject = '数学', student_name = '同学' } = req.query;
    const authCheck = resolveAuthorizedProfileId(req, profile_id);
    if (!authCheck.ok) {
      return res.status(authCheck.status || 403).json({ error: authCheck.error });
    }
    const targetPid = authCheck.profileId;
    const db = getSqliteDb();

    const memory = await getStudentCognitiveMemory(targetPid, grade, subject, student_name);
    const resolvedName = (student_name && student_name !== '同学') ? student_name : (memory.studentName || '同学');
    const gradeLabel = formatGradeName(grade);

    let todayChatCount = 0;
    let todayMistakesSolved = 0;
    let weekChatCount = 0;
    let totalMistakes = 0;
    let masteredMistakes = 0;

    if (db) {
      try {
        const [chatRow, mistakeRow, weekChatRow, overallMistakeRow] = await Promise.all([
          db.get(
            `SELECT COUNT(*) as count FROM chat_history WHERE profile_id = ? AND role = 'user' AND date(timestamp, '+8 hours') = date('now', '+8 hours')`,
            [targetPid]
          ),
          db.get(
            `SELECT COUNT(*) as count FROM mistakes WHERE profile_id = ? AND review_count > 0 AND date(COALESCE(last_reviewed_at, timestamp), '+8 hours') = date('now', '+8 hours')`,
            [targetPid]
          ),
          db.get(
            `SELECT COUNT(*) as count FROM chat_history WHERE profile_id = ? AND role = 'user' AND datetime(timestamp, '+8 hours') >= datetime('now', '+8 hours', '-7 days')`,
            [targetPid]
          ),
          db.get(
            `SELECT COUNT(*) as total, SUM(CASE WHEN COALESCE(review_count, 0) >= 3 THEN 1 ELSE 0 END) as mastered FROM mistakes WHERE profile_id = ?`,
            [targetPid]
          )
        ]);
        todayChatCount = chatRow ? chatRow.count : 0;
        todayMistakesSolved = mistakeRow ? mistakeRow.count : 0;
        weekChatCount = weekChatRow ? weekChatRow.count : 0;
        totalMistakes = overallMistakeRow?.total || 0;
        masteredMistakes = overallMistakeRow?.mastered || 0;
      } catch (e) {
        logger.warn('[ParentMemo] Failed counting daily activity:', e.message);
      }
    }

    const activeMinutes = todayChatCount > 0 ? Math.max(Math.round(todayChatCount * 3), 3) : 0;
    const comfortScore = (todayChatCount > 0 || todayMistakesSolved > 0)
      ? `${Math.min(99, 70 + Math.min(todayChatCount * 4 + todayMistakesSolved * 5, 29))} (今日已真实伴学)`
      : '暂无学习记录';

    const memoTitle = `家长您好，这是【${resolvedName}】今日专属学情家访便签 💌`;
    const memoContent = todayChatCount > 0 || todayMistakesSolved > 0
      ? [
          `🌟 今日伴学概况：${resolvedName} 同学今天在【${gradeLabel} · ${subject}】真实互动探讨 ${todayChatCount} 轮（近7天累计 ${weekChatCount} 轮），专注学习约 ${activeMinutes} 分钟。`,
          `🎯 能力与考点追踪：${memory.topWeakTags?.length ? `今日重点聚焦【${memory.topWeakTags.join('、')}】薄弱考点。` : '今日推导过程平稳，暂无新增高频薄弱标签。'}`,
          `💡 督学跟进建议：${todayMistakesSolved > 0 ? `今天顺利复盘了 ${todayMistakesSolved} 道错题（累计彻底消灭 ${masteredMistakes}/${totalMistakes} 题），抗遗忘巩固效果良好！` : `当前累计收录 ${totalMistakes} 道错题（已消灭 ${masteredMistakes} 题），建议晚间安排 10 分钟错题复盘后适度放松。`}`
        ]
      : [
          `🌟 今日伴学概况：${resolvedName} 同学今天在【${gradeLabel} · ${subject}】尚无有效对话或错题复盘记录（近7天累计互动 ${weekChatCount} 轮）。`,
          `🎯 能力与考点追踪：待孩子开始答疑、拍题批改或闪卡复习后，系统将基于真实作答生成薄弱点分析。`,
          `💡 督学跟进建议：建议晚间陪孩子一起打开 10 分钟趣味答疑、口算天天练或周末错题清零卷，轻松开启今日节奏。`
        ];

    res.json({
      success: true,
      studentName: resolvedName,
      date: new Date().toLocaleDateString('zh-CN', { timeZone: 'Asia/Shanghai' }),
      memoTitle,
      activeMinutes,
      todayChatCount,
      todayMistakesSolved,
      weekChatCount,
      totalMistakes,
      masteredMistakes,
      memoContent,
      comfortScore,
      hasRealActivity: todayChatCount > 0 || todayMistakesSolved > 0
    });
  } catch (err) {
    logger.error('[ParentMemo] Failed to generate parent memo:', err);
    res.status(500).json({ error: '生成家长家访便签失败', ...(NODE_ENV === 'development' ? { details: err.message } : {}) });
  }
});

// POST /api/parent/push-webhook
// Pushes daily memo directly to parent's WeChat / Enterprise WeChat / DingTalk Webhook
router.post('/parent/push-webhook', async (req, res) => {
  try {
    const isAdmin = await isVerifiedAdminRequest(req);
    if (!isAdmin && NODE_ENV === 'production') {
      return res.status(403).json({ error: '推送家长 Webhook 需要先完成家长 PIN 或管理员身份验证' });
    }

    const { webhook_url, memo_title, memo_content = [], student_name = '同学', date_str, comfort_score = '待开启学习' } = req.body;

    const urlCheck = await validateSafeUrlAsync(webhook_url);
    if (!urlCheck.safe) {
      return res.status(400).json({ error: `非法或不安全的 Webhook 链接: ${urlCheck.error}` });
    }

    const markdownText = `### ${memo_title || `名师晚间家访便签 💌`}\n**学员**：${student_name} | **日期**：${date_str || new Date().toLocaleDateString('zh-CN')}\n\n${memo_content.join('\n\n')}\n\n> 🛡️ **今日伴学指数**：${comfort_score}\n> 💡 *由 AI 专属私教自动归纳生成*`;

    let payload = {};
    if (webhook_url.includes('dingtalk.com')) {
      payload = {
        msgtype: 'markdown',
        markdown: {
          title: memo_title || '名师学情便签',
          text: markdownText
        }
      };
    } else if (webhook_url.includes('feishu.cn') || webhook_url.includes('larksuite.com')) {
      payload = {
        msg_type: 'interactive',
        card: {
          header: { title: { tag: 'plain_text', content: memo_title || '名师学情便签 💌' } },
          elements: [{ tag: 'div', text: { tag: 'lark_md', content: markdownText } }]
        }
      };
    } else {
      payload = {
        msgtype: 'markdown',
        markdown: {
          content: markdownText
        },
        text: markdownText
      };
    }

    const dispatcher = (urlCheck.hostname && Array.isArray(urlCheck.addresses) && urlCheck.addresses.length > 0)
      ? createPinnedDispatcher(urlCheck.hostname, urlCheck.addresses)
      : undefined;
    let fetchResponse;
    try {
      fetchResponse = await undiciFetch(webhook_url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        redirect: 'error',
        ...(dispatcher ? { dispatcher } : {}),
        signal: AbortSignal.timeout(10000)
      });
    } finally {
      try { await dispatcher?.close?.(); } catch {}
    }

    const respText = await fetchResponse.text();
    logger.info('[ParentMemo] Pushed memo to webhook:', webhook_url.slice(0, 35) + '...', respText.slice(0, 50));

    res.json({
      success: true,
      message: '便签已成功推送至家长手机！',
      status: fetchResponse.status
    });
  } catch (err) {
    logger.error('[ParentMemo] Failed to push webhook:', err);
    res.status(500).json({ error: '推送至家长端失败，请检查 Webhook 链接是否可用' });
  }
});

module.exports = router;
