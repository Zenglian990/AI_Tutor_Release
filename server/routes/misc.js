const express = require('express');
const crypto = require('crypto');
const multer = require('multer');
const router = express.Router();
const { getSqliteDb } = require('../db/init');
const { fetchWithKeyRotation, buildChatURL } = require('../services/embedding');
const { NODE_ENV, API_KEYS, CHAT_MODEL } = require('../config');
const logger = require('../services/logger');
const { encryptField, decryptField, generateFtsIndexText } = require('../utils/crypto');
const { formatGradeName, GRADE_ALIASES, getPromptGuidelines } = require('../prompts/guidelines');
const { sanitizeName } = require('../utils/sanitize');
const { verifyMultipartIntegrity } = require('../middleware/signature');
const { getTable } = require('../db/init');
const { API_TOKEN } = require('../config');
const fs = require('fs');
const path = require('path');
const { getChapters } = require('../utils/dataLoader');
const dbQueue = require('../services/dbQueue');
const { extractClientAiHeaders, mapAiErrorToHttp } = require('../utils/aiHeaders');
const { clampInt } = require('../utils/paramValidator');
const { isVerifiedAdminRequest, isValidMasterApiToken, isWeakPinHash, isSetupSecretValid, generateParentSessionToken, ADMIN_SESSION_COOKIE } = require('../utils/adminAuth');
const { resolveAuthorizedProfileId, buildCookieHeaderValue, appendSetCookie } = require('../middleware/auth');
const { requireQuotaOrVip, hasByokKey, FREE_DAILY_AI_QUOTA } = require('../middleware/quota');
const { extractLlmText } = require('../utils/jsonParser');
const { getTodayString } = require('../services/streakService');
const dataUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024, files: 1 } });

// Allowed audio MIME types
const ALLOWED_AUDIO_TYPES = [
  'audio/webm',
  'audio/mp4',
  'audio/mpeg',
  'audio/wav',
  'audio/ogg',
  'audio/aac',
  'audio/x-m4a',
  'audio/m4a',
  'audio/flac',
  'audio/opus',
];

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => {
    // Accept all audio types and image types (upload reuse)
    if (file.mimetype.startsWith('audio/') || ALLOWED_AUDIO_TYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('不支持的音频格式'), false);
    }
  }
});

// Health check — restricted info in production
router.get('/health', (req, res) => {

  const base = {
    status: 'ok',
    uptime: process.uptime(),
  };
  base.vector_db_ready = !!getTable();
  base.sqlite_ready = !!getSqliteDb();
  base.keys_available = typeof API_KEYS !== 'undefined' ? API_KEYS.length : 0;
  base.cloud_ai_ready = Boolean(
    (typeof API_KEYS !== 'undefined' && API_KEYS.length > 0) ||
    (process.env.DEEPSEEK_API_KEY && process.env.DEEPSEEK_API_KEY.trim()) ||
    (process.env.SILICONFLOW_API_KEY && process.env.SILICONFLOW_API_KEY.trim()) ||
    (process.env.DASHSCOPE_API_KEY && process.env.DASHSCOPE_API_KEY.trim()) ||
    (process.env.ZHIPU_API_KEY && process.env.ZHIPU_API_KEY.trim())
  );
  base.mode = NODE_ENV;
  res.json(base);
});

// GET /api/system/network-info — Get server host LAN IP for mobile phone QR code scanning
const os = require('os');
function getPrimaryLanIp() {
  try {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
      for (const iface of interfaces[name]) {
        if (iface.family === 'IPv4' && !iface.internal) {
          if (iface.address.startsWith('192.168.') || iface.address.startsWith('10.') || /^172\.(1[6-9]|2\d|3[01])\./.test(iface.address)) {
            return iface.address;
          }
        }
      }
    }
  } catch (e) {
    // fallback
  }
  return '127.0.0.1';
}

router.get('/system/network-info', async (req, res) => {
  const isCloudPublic = process.env.CLOUD_PUBLIC_MODE === 'true';
  const isProd = (process.env.NODE_ENV || NODE_ENV) === 'production';
  const isAdmin = req.auth?.isAdmin || await isVerifiedAdminRequest(req);
  // 公网模式或非管理员访问时返回安全空值 200 OK，既防止暴露主机内网 IP/主机名，又消除普通用户打开家访便签触发 401
  if ((isCloudPublic || isProd) && !isAdmin) {
    return res.json({
      publicMode: true,
      lanIp: null,
      port: null,
      lanUrl: '',
      hostname: ''
    });
  }
  const lanIp = getPrimaryLanIp();
  const port = process.env.PORT || 3001;
  res.json({
    publicMode: false,
    lanIp,
    port,
    lanUrl: `http://${lanIp}:${port}`,
    hostname: os.hostname()
  });
});

// GET /api/system/version — Version and update info for client apps
router.get('/system/version', (req, res) => {
  const pkg = require('../../package.json');
  res.json({
    version: pkg.version || '1.7.6',
    buildDate: '2026-11-26',
    appName: 'AI 智慧私教 (1-12年级)',
    minAppVersion: '1.0.0',
    hasUpdate: false,
    updateType: 'pwa_hot_update',
    apkFileName: `AI_Tutor_v${pkg.version || '1.7.6'}.apk`,
    releaseNotes: '放通 Android APK 全站通信、家庭家长锁与站长超管双锁解耦、独立设备免费配额、四大理科科学纠偏与 1-12 年级全学段升级'
  });
});

// Chat history
router.get('/chat-history', async (req, res) => {
  try {
    const sqliteDb = getSqliteDb();
    if (!sqliteDb) return res.status(503).json({ error: "Database not ready" });
    const { profile_id = 'default', grade = 'unknown', subject = 'unknown' } = req.query;
    const authCheck = resolveAuthorizedProfileId(req, profile_id);
    if (!authCheck.ok) return res.status(authCheck.status || 403).json({ error: authCheck.error });
    const targetPid = authCheck.profileId;
    // Pagination: default last 100 messages, clamped strictly to [1, 500]
    const limit = clampInt(req.query.limit, 100, 1, 500);
    const offset = clampInt(req.query.offset, 0, 0, 100000);
    const rows = await sqliteDb.all(
      'SELECT role, text FROM chat_history WHERE profile_id = ? AND grade = ? AND subject = ? ORDER BY timestamp ASC LIMIT ? OFFSET ?',
      [targetPid, grade, subject, limit, offset]
    );
    const decryptedRows = rows.map(r => ({ ...r, text: decryptField(r.text) }));
    res.json({ history: decryptedRows, limit, offset });
  } catch (e) {
    logger.error("Failed to fetch chat history:", e);
    res.status(500).json({ error: "获取对话历史记录失败" });
  }
});


router.post('/chat-history', async (req, res) => {
  try {
    const sqliteDb = getSqliteDb();
    if (!sqliteDb) return res.status(503).json({ error: "Database not ready" });
    const { profile_id, messages, grade = 'unknown', subject = 'unknown' } = req.body;

    if (!profile_id || !messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: "Missing required parameters" });
    }
    const authCheck = resolveAuthorizedProfileId(req, profile_id);
    if (!authCheck.ok) return res.status(authCheck.status || 403).json({ error: authCheck.error });
    const targetPid = authCheck.profileId;

    const boundedMessages = messages.slice(-500);

    await dbQueue.enqueue(async () => {
      await sqliteDb.run('BEGIN IMMEDIATE TRANSACTION');
      try {
        await sqliteDb.run(`
          DELETE FROM chat_history_fts 
          WHERE chat_id IN (
            SELECT id FROM chat_history 
            WHERE profile_id = ? AND grade = ? AND subject = ?
          )
        `, [targetPid, grade, subject]);
        await sqliteDb.run('DELETE FROM chat_history WHERE profile_id = ? AND grade = ? AND subject = ?', [targetPid, grade, subject]);
        let savedCount = 0;
        for (const msg of boundedMessages) {
          // Security / Data hygiene: skip transient offline fallback messages
          if (msg.isTransient) continue;
          if (msg.role !== 'system' && msg.text && msg.text.trim()) {
            let cleanText = msg.text;
            // Prevent oversized base64 images from bloating SQLite and corrupting multi-turn context
            if (cleanText.includes('data:image/')) {
              cleanText = cleanText.replace(/data:image\/[a-zA-Z0-9+.-]+;base64,[A-Za-z0-9+/=]+/g, '[题目图片]');
            }
            if (cleanText.length > 8000) {
              cleanText = cleanText.slice(0, 8000) + '...[已截断]';
            }
            const result = await sqliteDb.run('INSERT INTO chat_history (profile_id, grade, subject, role, text) VALUES (?, ?, ?, ?, ?)',
              [targetPid, grade, subject, msg.role, encryptField(cleanText)]);
            const chat_id = result.lastID;
            await sqliteDb.run('INSERT INTO chat_history_fts (chat_id, text) VALUES (?, ?)', [chat_id, generateFtsIndexText(cleanText)]);
            savedCount++;
          }
        }
        await sqliteDb.run('COMMIT');
      } catch (err) {
        try {
          await sqliteDb.run('ROLLBACK');
        } catch (rollbackErr) {
          logger.error('Failed to rollback chat-history sync transaction:', rollbackErr);
        }
        throw err;
      }
    });

    res.json({ success: true, count: messages.length });
  } catch (e) {
    logger.error("Failed to sync chat history:", e);
    res.status(500).json({ error: "同步对话历史记录失败" });
  }
});

// GET /api/chat-history/search — Full-text search of chat history
router.get('/chat-history/search', async (req, res) => {
  try {
    const sqliteDb = getSqliteDb();
    if (!sqliteDb) return res.status(503).json({ error: "Database not ready" });
    const { profile_id = 'default', q = '', grade, subject } = req.query;
    const authCheck = resolveAuthorizedProfileId(req, profile_id);
    if (!authCheck.ok) return res.status(authCheck.status || 403).json({ error: authCheck.error });
    const targetPid = authCheck.profileId;
    if (!q.trim()) return res.json({ results: [] });

    const hashQuery = generateFtsIndexText(q);
    if (!hashQuery) return res.json({ results: [] });

    // SQLite FTS5 MATCH syntax: "hash1" AND "hash2"
    const matchQuery = hashQuery.split(' ').filter(Boolean).map(h => `"${h}"`).join(' AND ');

    let sql = `
      SELECT ch.id, ch.role, ch.text, ch.timestamp, ch.grade, ch.subject 
      FROM chat_history ch
      JOIN chat_history_fts fts ON ch.id = fts.chat_id
      WHERE ch.profile_id = ? AND chat_history_fts MATCH ?
    `;
    const params = [targetPid, matchQuery];
    if (grade && grade !== 'unknown') {
      sql += ' AND ch.grade = ?';
      params.push(grade);
    }
    if (subject && subject !== 'unknown') {
      sql += ' AND ch.subject = ?';
      params.push(subject);
    }
    sql += ' ORDER BY ch.timestamp DESC LIMIT 1000';

    const rows = await sqliteDb.all(sql, params);

    const results = [];
    for (const row of rows) {
      const decryptedText = decryptField(row.text);
      results.push({
        id: row.id,
        role: row.role,
        text: decryptedText,
        timestamp: row.timestamp,
        grade: row.grade,
        subject: row.subject
      });
    }

    res.json({ results: results.slice(0, 100) });
  } catch (e) {
    logger.error("Failed to search chat history:", e);
    res.status(500).json({ error: "搜索历史对话失败" });
  }
});
router.delete('/profile', async (req, res) => {
  try {
    const sqliteDb = getSqliteDb();
    if (!sqliteDb) return res.status(503).json({ error: "Database not ready" });
    const profile_id = req.query.profile_id;
    if (!profile_id) return res.status(400).json({ error: "Missing profile_id" });
    if (profile_id === 'default') return res.status(400).json({ error: "Cannot delete default profile" });

    const authCheck = resolveAuthorizedProfileId(req, profile_id);
    if (!authCheck.ok) return res.status(authCheck.status || 403).json({ error: authCheck.error });
    const targetPid = authCheck.profileId;

    await dbQueue.enqueue(async () => {
      await sqliteDb.run('BEGIN IMMEDIATE TRANSACTION');
      try {
        await sqliteDb.run('DELETE FROM chat_history_fts WHERE chat_id IN (SELECT id FROM chat_history WHERE profile_id = ?)', [targetPid]);
        const tablesToClean = [
          'chat_history', 'mistakes', 'profile_progress', 'memberships',
          'user_gamification', 'cognitive_knowledge_state', 'cognitive_events',
          'study_checkpoints', 'student_streaks', 'streak_history'
        ];
        for (const tbl of tablesToClean) {
          try {
            await sqliteDb.run(`DELETE FROM ${tbl} WHERE profile_id = ?`, [targetPid]);
          } catch {}
        }
        await sqliteDb.run('COMMIT');
      } catch (txErr) {
        try { await sqliteDb.run('ROLLBACK'); } catch {}
        throw txErr;
      }
    });

    res.json({ success: true });
  } catch (e) {
    logger.error("Failed to delete profile:", e);
    res.status(500).json({ error: "删除档案失败" });
  }
});

// Stats
router.get('/stats', async (req, res) => {
  try {
    const sqliteDb = getSqliteDb();
    if (!sqliteDb) return res.status(503).json({ error: "Database not ready" });
    const authCheck = resolveAuthorizedProfileId(req, req.query.profile_id || 'default');
    if (!authCheck.ok) return res.status(authCheck.status || 403).json({ error: authCheck.error });
    const profile_id = authCheck.profileId;

    const totalRows = await sqliteDb.get('SELECT COUNT(*) as c FROM mistakes WHERE profile_id = ?', [profile_id]);
    const masteryRows = await sqliteDb.get(
      `SELECT
         SUM(CASE WHEN COALESCE(review_count, 0) >= 1 THEN 1 ELSE 0 END) as reviewed,
         SUM(CASE WHEN COALESCE(review_count, 0) >= 3 THEN 1 ELSE 0 END) as mastered
       FROM mistakes WHERE profile_id = ?`,
      [profile_id]
    );
    const subjectRows = await sqliteDb.all(
      'SELECT subject, COUNT(*) as count FROM mistakes WHERE profile_id = ? AND subject != "unknown" GROUP BY subject',
      [profile_id]
    );
    const recentRows = await sqliteDb.all(
      `SELECT date(timestamp, '+8 hours') as date, COUNT(*) as count
       FROM mistakes WHERE profile_id = ? AND datetime(timestamp, '+8 hours') >= datetime('now', '+8 hours', '-7 days')
       GROUP BY date(timestamp, '+8 hours') ORDER BY date DESC`,
      [profile_id]
    );

    res.json({
      total: totalRows.c,
      reviewedCount: masteryRows?.reviewed || 0,
      masteredCount: masteryRows?.mastered || 0,
      todayBeijingDate: getTodayString(),
      bySubject: subjectRows,
      recent: recentRows
    });
  } catch (e) {
    res.status(500).json({ error: "获取统计数据失败", details: NODE_ENV === 'development' ? e.message : undefined });
  }
});

// GET /api/quota/status — Phase 3：返回当前用户今日免费 AI 额度余量、VIP 会员及 BYOK 状态
router.get('/quota/status', async (req, res) => {
  try {
    const sqliteDb = getSqliteDb();
    const requestedPid = req.query.profile_id || 'default';
    const authCheck = req.auth ? resolveAuthorizedProfileId(req, requestedPid) : null;
    if (authCheck && !authCheck.ok) {
      return res.status(authCheck.status || 403).json({ error: authCheck.error });
    }
    const resolvedPid = (authCheck?.profileId || req.auth?.activeProfileId || String(requestedPid || 'default').trim() || 'default');
    const sessionPrimaryPid = req.auth?.activeProfileId && req.auth.activeProfileId !== 'default'
      ? req.auth.activeProfileId
      : resolvedPid;
    const quotaPid = (resolvedPid === 'default' && sessionPrimaryPid !== 'default') ? sessionPrimaryPid : resolvedPid;

    const isAdmin = Boolean(req.auth?.isAdmin) || await isVerifiedAdminRequest(req);
    const hasByok = hasByokKey(req);
    let isVip = false;
    let vipDaysRemaining = 0;
    let todayUsed = 0;

    if (sqliteDb) {
      try {
        const member = await sqliteDb.get(
          `SELECT tier, expire_at FROM memberships WHERE profile_id IN (?, ?) ORDER BY expire_at DESC LIMIT 1`,
          [quotaPid, resolvedPid]
        );
        if (member && member.tier && member.tier !== 'free' && member.expire_at) {
          const expireMs = new Date(member.expire_at).getTime();
          if (!Number.isNaN(expireMs) && expireMs > Date.now()) {
            isVip = true;
            vipDaysRemaining = Math.max(1, Math.ceil((expireMs - Date.now()) / (1000 * 60 * 60 * 24)));
          }
        }
        const usageRow = await sqliteDb.get(
          `SELECT COUNT(*) as cnt FROM api_usage WHERE profile_id = ? AND date(timestamp, '+8 hours') = date('now', '+8 hours')`,
          [quotaPid]
        );
        todayUsed = usageRow?.cnt || 0;
      } catch (qErr) {
        logger.warn('[QuotaStatus] Query warning:', qErr.message);
      }
    }

    const unlimited = isAdmin || isVip || hasByok;
    const remaining = unlimited ? null : Math.max(0, FREE_DAILY_AI_QUOTA - todayUsed);

    res.json({
      success: true,
      profileId: quotaPid,
      date: getTodayString(),
      dailyLimit: FREE_DAILY_AI_QUOTA,
      todayUsed,
      remaining,
      unlimited,
      isVip,
      vipDaysRemaining,
      isAdmin,
      hasByok
    });
  } catch (e) {
    logger.error('[QuotaStatus] Error:', e);
    res.status(500).json({ error: '获取额度状态失败' });
  }
});

// Data export — requires valid API token to protect user data
router.get('/export/data', async (req, res) => {
  try {
    // Verify token — even localhost requests must provide a valid token for data export

    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : String(req.query.token || '').trim();
    const isAdmin = (await isVerifiedAdminRequest(req)) || isValidMasterApiToken(token);
    if (!isAdmin) {
      return res.status(403).json({ error: "导出数据需要有效的管理员访问令牌" });
    }

    const sqliteDb = getSqliteDb();
    if (!sqliteDb) return res.status(503).json({ error: "Database not ready" });
    const profile_id = req.query.profile_id || 'default';

    const mistakes = await sqliteDb.all('SELECT * FROM mistakes WHERE profile_id = ?', [profile_id]);
    const chat_history = await sqliteDb.all(
      'SELECT * FROM chat_history WHERE profile_id = ? ORDER BY timestamp DESC LIMIT 500',
      [profile_id]
    );

    const decryptedMistakes = mistakes.map(m => ({
      ...m,
      query: decryptField(m.query),
      answer: decryptField(m.answer),
      reason: decryptField(m.reason)
    }));
    const decryptedHistory = chat_history.map(c => ({
      ...c,
      text: decryptField(c.text)
    }));

    const exportData = { profile_id, exported_at: new Date().toISOString(), mistakes: decryptedMistakes, chat_history: decryptedHistory };

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="AI_Tutor_Backup_${profile_id}_${Date.now()}.json"`);
    res.send(JSON.stringify(exportData, null, 2));
  } catch (e) {
    logger.error("Data export error:", e);
    res.status(500).json({ error: "Failed to export data" });
  }
});

// Data import — requires valid API token to protect user data
router.post('/import/data', dataUpload.single('file'), async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : String(req.body?.token || '').trim();
    const isAdmin = (await isVerifiedAdminRequest(req)) || isValidMasterApiToken(token);
    if (!isAdmin) {
      return res.status(403).json({ error: "导入数据需要有效的管理员访问令牌" });
    }

    if (!req.file) {
      return res.status(400).json({ error: "未上传数据文件" });
    }

    const sqliteDb = getSqliteDb();
    if (!sqliteDb) return res.status(503).json({ error: "Database not ready" });

    const importData = JSON.parse(req.file.buffer.toString('utf8'));
    const { profile_id = 'default', mistakes = [], chat_history = [] } = importData;

    // Process and insert mistakes (encrypt tags and avoid cross-profile ID hijacking)
    for (const m of mistakes.slice(0, 1000)) {
      await dbQueue.enqueue(async () => {
        const encryptedQuery = encryptField(m.query || '');
        const encryptedAnswer = encryptField(m.answer || '');
        const encryptedReason = encryptField(m.reason || '');
        const encryptedTags = encryptField(m.tags || '');

        await sqliteDb.run(
          `INSERT INTO mistakes 
          (profile_id, timestamp, subject, grade, query, answer, reason, review_count, easiness_factor, next_review_date, last_interval, tags, source_info)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            profile_id, m.timestamp || new Date().toISOString(), m.subject || null, m.grade || null,
            encryptedQuery, encryptedAnswer, encryptedReason,
            m.review_count || 0, m.easiness_factor || 2.5, m.next_review_date || null, m.last_interval || 0, encryptedTags, m.source_info || null
          ]
        );
      });
    }

    // Process and insert chat history (with FTS synchronization)
    for (const c of chat_history.slice(0, 1000)) {
      await dbQueue.enqueue(async () => {
        const cleanText = String(c.text || '');
        const encryptedText = encryptField(cleanText);
        const grade = c.grade || 'unknown';
        const subject = c.subject || 'unknown';
        const resInsert = await sqliteDb.run(
          `INSERT INTO chat_history (profile_id, grade, subject, role, text, timestamp) VALUES (?, ?, ?, ?, ?, ?)`,
          [profile_id, grade, subject, c.role || 'user', encryptedText, c.timestamp || new Date().toISOString()]
        );
        if (resInsert?.lastID) {
          await sqliteDb.run(
            'INSERT INTO chat_history_fts (chat_id, text) VALUES (?, ?)',
            [resInsert.lastID, generateFtsIndexText(cleanText)]
          );
        }
      });
    }

    res.json({ success: true, imported: { mistakes: mistakes.length, chat_history: chat_history.length } });
  } catch (e) {
    logger.error("Data import error:", e);
    res.status(500).json({ error: "Failed to import data" });
  }
});

// Weekly report
router.post('/report/weekly', requireQuotaOrVip('weekly_report'), async (req, res) => {
  try {
    const sqliteDb = getSqliteDb();
    if (!sqliteDb) return res.status(503).json({ error: "Database not ready" });
    const { profile_id = 'default', grade = 'unknown' } = req.body;
    const authCheck = resolveAuthorizedProfileId(req, profile_id);
    if (!authCheck.ok) return res.status(authCheck.status || 403).json({ error: authCheck.error });
    const targetPid = authCheck.profileId;
    const parent_name = sanitizeName(req.body.parent_name, '家长');
    const student_name = sanitizeName(req.body.student_name, '学生');
    const safeGrade = formatGradeName(grade);
    const gradeFilter = (grade && grade !== 'unknown') ? ` AND grade = ?` : '';
    const gradeParams = (grade && grade !== 'unknown') ? [grade] : [];

    // 统一与家长远程视图口径：仅统计 role = 'user' 的真实互动轮次，并使用北京时间（UTC+8）
    const chatCount = await sqliteDb.get(
      `SELECT COUNT(*) as c FROM chat_history WHERE profile_id = ? AND role = 'user' AND datetime(timestamp, '+8 hours') >= datetime('now', '+8 hours', '-7 days')`,
      [targetPid]
    );
    const mistakeCount = await sqliteDb.get(
      `SELECT COUNT(*) as c FROM mistakes WHERE profile_id = ? AND datetime(timestamp, '+8 hours') >= datetime('now', '+8 hours', '-7 days')` + gradeFilter,
      [targetPid, ...gradeParams]
    );
    const reviewedCountRow = await sqliteDb.get(
      `SELECT
         SUM(CASE WHEN COALESCE(review_count, 0) >= 1 THEN 1 ELSE 0 END) as reviewed,
         SUM(CASE WHEN COALESCE(review_count, 0) >= 3 THEN 1 ELSE 0 END) as mastered
       FROM mistakes WHERE profile_id = ?` + gradeFilter,
      [targetPid, ...gradeParams]
    );
    const reviewedNum = reviewedCountRow?.reviewed || 0;
    const masteredNum = reviewedCountRow?.mastered || 0;

    // 严格注入当前真实北京时间日期，彻底杜绝模型胡写“202X年X月X日”占位符
    const bjNowStr = getTodayString(); // YYYY-MM-DD
    const [bjY, bjM, bjD] = bjNowStr.split('-');
    const realDateCn = `${bjY}年${parseInt(bjM, 10)}月${parseInt(bjD, 10)}日`;

    const prompt = `你是一位认真负责的"教导主任"，现在要给家长【${parent_name}】发一份关于他的孩子【${student_name}】（${safeGrade}）的【本周AI私教学习周报】。

本周客观数据如下（统计截止日期：${realDateCn}）：
- 师生真实互动探讨轮次：${chatCount.c} 轮
- 本周新收录核心错题：${mistakeCount.c} 题
- 累计已复盘错题：${reviewedNum} 题（其中已彻底消灭掌握：${masteredNum} 题）

请你根据上述数据，用教导主任那种"严谨、负责、同时带有鼓励"的语气，撰写一份结构清晰的Markdown格式周报。
包括：
1. 本周学习数据总结
2. 数据背后的学习状态分析（如互动轮次少或为 0 请如实说明并温和鼓励，绝不夸大虚构）
3. 给家长（${parent_name}）的跟进建议

要求：
- 无需过于冗长，字数控制在300字左右即可，排版要精美（可以使用Emoji）。
- 若文末有落款日期，必须严格写为【${realDateCn}】，严禁出现 "202X年X月X日" 或任何占位符！`;

    let text;
    try {
      const response = await fetchWithKeyRotation(buildChatURL, {
        method: 'POST',
        profileId: targetPid,
        headers: { 'Content-Type': 'application/json', ...extractClientAiHeaders(req) },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.5,
            maxOutputTokens: 1024,
            thinkingConfig: { thinkingBudget: 0 }
          }
        })
      }, 4, 30000);

      const data = await response.json();
      text = extractLlmText(data);
      if (!text) throw new Error("Empty response from LLM");
      // 二次保险：若上游偶发仍输出 202X年X月X日 占位符，直接替换为真实北京时间日期
      text = text.replace(/202[Xx]年[Xx\d]{1,2}月[Xx\d]{1,2}日/g, realDateCn);
    } catch (llmErr) {
      logger.warn("Weekly report LLM generation failed, falling back to static report:", llmErr.message);
      text = `### 📊 本周学习数据总结（截至 ${realDateCn}）
- 师生真实互动探讨轮次：**${chatCount.c}** 轮
- 本周新收录核心错题：**${mistakeCount.c}** 题
- 累计复盘巩固错题：**${reviewedNum}** 题（已彻底消灭 **${masteredNum}** 题）

### 📝 学习状态分析
本周【${student_name}】同学在【${safeGrade}】保持了清晰的学习记录。${chatCount.c > 0 ? '在对话中积极追问思考，敢于暴露知识薄弱点。' : '本周互动刚刚起步，建议每天安排 10–15 分钟启发式问答建立节奏。'}

### 💡 家长跟进建议
建议家长【${parent_name}】周末陪伴孩子打印「周末错题清零 A4 卷」，对本周 **${mistakeCount.c}** 道错题做一次纸笔复盘，形成学—练—测闭环。

—— 教导主任 · ${realDateCn}`;
    }

    res.json({
      report: text,
      date: realDateCn,
      stats: {
        chatTurns: chatCount.c,
        newMistakes: mistakeCount.c,
        reviewedMistakes: reviewedNum,
        masteredMistakes: masteredNum
      }
    });
  } catch (e) {
    logger.error("Weekly report error:", e);
    res.status(500).json({ error: "生成周报失败" });
  }
});

// Active learning plan
router.post('/active-plan/generate', requireQuotaOrVip('active_plan'), async (req, res) => {
  try {
    const { profile_id, grade, subject, edition } = req.body;
    const authCheck = resolveAuthorizedProfileId(req, profile_id);
    if (!authCheck.ok) return res.status(authCheck.status || 403).json({ error: authCheck.error });
    const targetPid = authCheck.profileId;
    if (!grade || !subject) return res.status(400).json({ error: "Grade and subject are required" });


    const key = edition ? `${grade}_${edition}` : grade;
    const chaptersData = await getChapters();
    const gradeChapters = chaptersData[key] || chaptersData[grade] || {};
    const list = gradeChapters[subject] || [];

    // Don't waste API quota when no chapters exist for this grade/subject combination
    // Actually, let's generate a general plan instead of throwing an error so the feature still works.
    let chaptersStr = '本学期通用核心大纲（系统暂未录入该科目的具体章节，请按通用学习规划进行指导）。';
    if (list.length > 0) {
      chaptersStr = list.map((c, i) => `${i + 1}. ${c.name} (${c.description})`).join('\n');
    }

    const gradeStr = formatGradeName(grade);
    const name = sanitizeName(req.body.student_name, '孩子');

    const prompt = `你是一位极其优秀的 AI 专属伴读私教。现在你要为学生【${name}】（处于【${gradeStr}】【${subject}】阶段）制定一份【全学期主动通关学习规划方案】。
根据该教材的章节大纲目录：
${chaptersStr}

请为他/她量身定制一份生动、实用且极具吸引力的主动学习指南！
要求：
1. 语气与该学段的心理特征高度贴合；
2. 规划方案需包含：【学期通关路线图】、【伴读学习习惯建议】、【苏格拉底通关小任务】；
3. 格式：排版精美、层次清晰，使用 Markdown 格式输出。`;

    const response = await fetchWithKeyRotation(buildChatURL, {
      method: 'POST',
      profileId: targetPid,
      headers: { 'Content-Type': 'application/json', ...extractClientAiHeaders(req) },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.3 }
      })
    }, 8, 90000);

    const data = await response.json();
    const plan = data.candidates?.[0]?.content?.parts?.[0]?.text || "抱歉，无法生成规划。";
    res.json({ plan });
  } catch (e) {
    logger.error("Active Plan Generation Error:", e);
    res.status(500).json({ error: "生成主动规划方案失败", details: NODE_ENV === 'development' ? e.message : undefined });
  }
});

// Generate variation
router.post('/generate-variation', requireQuotaOrVip('variation'), async (req, res) => {
  try {
    const { query, answer, grade, subject } = req.body;
    const targetPid = req.auth?.activeProfileId || 'default';
    if (!query) return res.status(400).json({ error: "Query is required" });
    // Truncate inputs to prevent prompt injection via oversized content
    const safeQuery = String(query).slice(0, 500);
    const safeAnswer = answer ? String(answer).slice(0, 1000) : '';

    const gradeStr = formatGradeName(grade);

    const prompt = `你是一位专业的 AI 助教。学生在做以下题目时遇到困难并收录到了错题本：

题目/问题：${safeQuery}
原解析：${safeAnswer}

为了检验学生（处于【${gradeStr}】阶段）是否真正掌握了该考点，请你"举一反三"，为他出 1 道同类型的变式题。
要求：
1. 难度与原题相当，或略微增加。
2. 题目要严谨，最好贴近生活或符合该年级的认知特点。
3. 【极其重要】：请以严格的 JSON 格式返回，包含 "question" 和 "solution" 两个字段。不要返回任何其他内容。`;

    const response = await fetchWithKeyRotation(buildChatURL, {
      method: 'POST',
      profileId: targetPid,
      headers: { 'Content-Type': 'application/json', ...extractClientAiHeaders(req) },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.5 }
      })
    }, 8, 90000);

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
    let resultObj = { question: "抱歉，生成变式题失败。", solution: "" };
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const cleanText = jsonMatch[0].trim();
        resultObj = JSON.parse(cleanText);
      } else {
        throw new Error("No JSON structure found in response");
      }
    } catch (e) {
      logger.warn("[JSON Parse Fallback] Failed to parse variation JSON, falling back to full text:", e);
      resultObj.question = text;
    }
    res.json({ variation: resultObj.question, solution: resultObj.solution });
  } catch (e) {
    logger.error("Variation Error:", e);
    if (e.message === 'QUOTA_EXHAUSTED') return res.status(429).json({ error: "今日额度已用完" });
    res.status(500).json({ error: "服务器内部错误", details: NODE_ENV === 'development' ? e.message : undefined });
  }
});

// Grade variation
router.post('/grade-variation', requireQuotaOrVip('grade_variation'), async (req, res) => {
  try {
    const { question, solution, student_answer, grade } = req.body;
    const targetPid = req.auth?.activeProfileId || 'default';
    if (!question || !student_answer) return res.status(400).json({ error: "Missing fields" });
    // Truncate inputs to prevent prompt injection
    const safeQuestion = String(question).slice(0, 500);
    const safeSolution = solution ? String(solution).slice(0, 1000) : null;
    const safeStudentAnswer = String(student_answer).slice(0, 500);

    const gradeStr = formatGradeName(grade);

    const prompt = `你是一位耐心且专业的 AI 助教。现在你要批改学生的题目解答（学生处于【${gradeStr}】阶段）。

题目内容：${safeQuestion}
标准答案与解析参考：${safeSolution || '无标准参考，请自行判断'}
学生的解答：${safeStudentAnswer}

请对学生的解答进行点评。要求：
1. 明确告诉学生回答是"完全正确"、"部分正确"还是"错误"。
2. 如果错了或不完整，请像老师一样温和地指出问题所在，并给出完整的正确解析。
3. 语气要极度鼓励。`;

    const response = await fetchWithKeyRotation(buildChatURL, {
      method: 'POST',
      profileId: targetPid,
      headers: { 'Content-Type': 'application/json', ...extractClientAiHeaders(req) },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.2 }
      })
    }, 8, 90000);

    const data = await response.json();
    const feedback = data.candidates?.[0]?.content?.parts?.[0]?.text || "抱歉，批改失败。";
    res.json({ feedback });
  } catch (e) {
    logger.error("Grade Error:", e);
    res.status(500).json({ error: "批改失败", details: NODE_ENV === 'development' ? e.message : undefined });
  }
});

// Helper to detect audio MIME type via magic bytes
function detectAudioMimeType(buffer, fallbackMime = 'audio/webm') {
  if (!buffer || buffer.length < 4) return fallbackMime;

  // WebM: 0x1A 0x45 0xDF 0xA3
  if (buffer[0] === 0x1A && buffer[1] === 0x45 && buffer[2] === 0xDF && buffer[3] === 0xA3) {
    return 'audio/webm';
  }
  // RIFF .... WAVE
  if (buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WAVE') {
    return 'audio/wav';
  }
  // OGG: OggS
  if (buffer.toString('ascii', 0, 4) === 'OggS') {
    return 'audio/ogg';
  }
  // MP3: ID3 or MPEG sync
  if (buffer.toString('ascii', 0, 3) === 'ID3' || (buffer[0] === 0xFF && (buffer[1] & 0xE0) === 0xE0)) {
    return 'audio/mp3';
  }
  // MP4 / M4A / AAC: ftyp
  if (buffer.length >= 12) {
    const chunk = buffer.toString('ascii', 4, 12);
    if (chunk.includes('ftyp') || chunk.includes('M4A ') || chunk.includes('mp42') || chunk.includes('isom')) {
      return 'audio/aac';
    }
  }

  // Normalize fallback MIME types for Gemini API compatibility
  if (fallbackMime === 'audio/x-m4a' || fallbackMime === 'audio/m4a' || fallbackMime === 'audio/mp4') {
    return 'audio/aac';
  }
  if (fallbackMime === 'audio/mpeg') {
    return 'audio/mp3';
  }
  return fallbackMime;
}

// Transcribe audio
router.post('/transcribe', requireQuotaOrVip('transcribe'), upload.single('audio'), verifyMultipartIntegrity, async (req, res) => {
  try {
    const audioBuffer = req.file?.buffer;
    if (!audioBuffer) return res.status(400).json({ error: '没有提供音频文件' });

    // Validate audio file size
    if (audioBuffer.length > 10 * 1024 * 1024) {
      return res.status(400).json({ error: '音频文件不能超过 10MB' });
    }

    const mimeType = detectAudioMimeType(audioBuffer, req.file?.mimetype || 'audio/webm');
    const base64Audio = audioBuffer.toString('base64');

    const prompt = `请精确将音频中的语音转录为中文文本。要求：
1. 仅输出识别得到的纯文本内容，严禁任何前导或后导的说明、标点符号。
2. 若无声音或听不清，仅返回空字符串。
3. 自动纠正普通话常见同音错字，保持语句通顺完整。`;

    const fetchHeaders = {
      'Content-Type': 'application/json',
      ...extractClientAiHeaders(req)
    };

    const response = await fetchWithKeyRotation(buildChatURL, {
      method: 'POST',
      profileId: req.auth?.activeProfileId || 'default',
      headers: fetchHeaders,
      body: JSON.stringify({
        contents: [{ parts: [{ inline_data: { mime_type: mimeType, data: base64Audio } }, { text: prompt }] }],
        generationConfig: {
          temperature: 0.0,
          maxOutputTokens: 96,
          thinkingConfig: { thinkingBudget: 0 }
        }
      })
    }, 8, 30000, CHAT_MODEL || 'gemini-3-flash-preview', true); // skipDeepSeek = true, fast STT

    const data = await response.json();
    if (data.error) {
      logger.error(`[Speech to Text] API error: ${data.error.message || JSON.stringify(data.error)}`);
      return res.status(500).json({ error: '语音转录服务异常', details: NODE_ENV === 'development' ? data.error.message : undefined });
    }
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";
    logger.info(`[Speech to Text] Transcribed ${text.length} chars (detected mime: ${mimeType})`);
    res.json({ text });
  } catch (e) {
    logger.error('Transcription Error:', e);
    return mapAiErrorToHttp(e, res, '语音转录失败');
  }
});

// ============================================================
// 一、家庭家长安全锁（按学习档案独立隔离，完全与站长超管密钥解耦）
// 控制直答模式切换、清空记录等家庭内监督操作，普通家长开箱即设 6 位 PIN + 密保
// ============================================================
const familyPinAttempts = new Map();
setInterval(() => {
  const now = Date.now();
  for (const [k, entry] of familyPinAttempts.entries()) {
    if (now > entry.resetTime) familyPinAttempts.delete(k);
  }
}, 10 * 60 * 1000).unref();

function getFamilyLockKey(req) {
  const requestedPid = req.body?.profile_id || req.query?.profile_id;
  const authCheck = req.auth ? resolveAuthorizedProfileId(req, requestedPid) : null;
  const pid = (authCheck?.ok && authCheck.profileId)
    ? authCheck.profileId
    : (req.auth?.activeProfileId || String(requestedPid || 'default').trim() || 'default');
  return String(pid).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64);
}

function checkFamilyPinRateLimit(req, res, next) {
  const ip = req.ip || req.connection?.remoteAddress || 'unknown';
  const pid = getFamilyLockKey(req);
  const bucketKey = `${ip}:${pid}`;
  const now = Date.now();
  if (familyPinAttempts.size > 10000) familyPinAttempts.clear();
  const entry = familyPinAttempts.get(bucketKey) || { count: 0, resetTime: now + 5 * 60 * 1000 };
  if (now > entry.resetTime) {
    entry.count = 0;
    entry.resetTime = now + 5 * 60 * 1000;
  }
  if (entry.count >= 5) {
    const retryAfter = Math.max(1, Math.ceil((entry.resetTime - now) / 1000));
    res.set('Retry-After', String(retryAfter));
    return res.status(429).json({
      valid: false,
      locked: true,
      retry_after_seconds: retryAfter,
      error: `家长密码错误次数过多，请在 ${retryAfter} 秒后重试`
    });
  }
  familyPinAttempts.set(bucketKey, entry);
  req._familyPinAttemptEntry = entry;
  req._familyPinBucketKey = bucketKey;
  next();
}

// GET /api/family/pin-status — 查询当前家庭档案的家长锁状态（绝不要求站长初始化密钥）
router.get('/family/pin-status', async (req, res) => {
  try {
    const sqliteDb = getSqliteDb();
    if (!sqliteDb) return res.status(503).json({ error: 'Database not ready' });
    const pid = getFamilyLockKey(req);
    const pinRow = await sqliteDb.get('SELECT value FROM system_settings WHERE key = ?', [`family_pin:${pid}`]);
    const secRow = await sqliteDb.get('SELECT value FROM system_settings WHERE key = ?', [`family_sec:${pid}`]);
    const hasValidPin = Boolean(pinRow && pinRow.value && !isWeakPinHash(pinRow.value));
    let questionId = null;
    if (secRow && secRow.value) {
      const parts = String(secRow.value).split(':');
      if (parts.length >= 2) questionId = parts[0];
    }
    const ip = req.ip || req.connection?.remoteAddress || 'unknown';
    const entry = familyPinAttempts.get(`${ip}:${pid}`);
    const now = Date.now();
    const isLocked = Boolean(entry && entry.count >= 5 && now < entry.resetTime);
    const retryAfter = isLocked ? Math.max(1, Math.ceil((entry.resetTime - now) / 1000)) : 0;

    return res.json({
      scope: 'family',
      profile_id: pid,
      has_pin: hasValidPin,
      needs_setup: !hasValidPin,
      requires_setup_secret: false,
      has_security_question: Boolean(secRow && secRow.value),
      question_id: questionId,
      locked: isLocked,
      retry_after_seconds: retryAfter,
      remaining_attempts: isLocked ? 0 : Math.max(0, 5 - (entry && now < entry.resetTime ? entry.count : 0))
    });
  } catch (e) {
    logger.error('Failed to get family PIN status:', e);
    return res.status(500).json({ error: '获取家庭家长锁状态失败' });
  }
});

// POST /api/family/pin — 设置或修改家庭家长 6 位 PIN 与密保（首次无需站长密钥，修改需验证原 PIN）
router.post('/family/pin', async (req, res) => {
  try {
    const sqliteDb = getSqliteDb();
    if (!sqliteDb) return res.status(503).json({ error: 'Database not ready' });
    const pid = getFamilyLockKey(req);
    const { pin_hash, security_answer_hash, current_pin_hash } = req.body || {};
    if (!pin_hash || typeof pin_hash !== 'string') {
      return res.status(400).json({ error: '请提供 6 位安全密码哈希' });
    }
    if (isWeakPinHash(pin_hash)) {
      return res.status(400).json({ error: '安全拦截：禁止使用 888888、000000、123456 等弱口令，请设置自定义 6 位家长密码。' });
    }

    const existingRow = await sqliteDb.get('SELECT value FROM system_settings WHERE key = ?', [`family_pin:${pid}`]);
    const hasConfigured = Boolean(existingRow && existingRow.value && !isWeakPinHash(existingRow.value));
    if (hasConfigured) {
      if (!current_pin_hash || typeof current_pin_hash !== 'string') {
        return res.status(403).json({ error: '当前已设置家庭家长密码，修改需先验证原密码。' });
      }
      const savedBuf = Buffer.from(String(existingRow.value));
      const inputBuf = Buffer.from(String(current_pin_hash));
      const matched = savedBuf.length === inputBuf.length && crypto.timingSafeEqual(savedBuf, inputBuf);
      if (!matched) {
        return res.status(401).json({ error: '原家庭家长密码不正确，无法修改。' });
      }
    } else if (!security_answer_hash || !String(security_answer_hash).includes(':')) {
      return res.status(400).json({ error: '首次设置家庭家长密码必须同时设置密保问题与答案，便于后续找回。' });
    }

    await dbQueue.enqueue(async () => {
      await sqliteDb.run(
        'INSERT INTO system_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
        [`family_pin:${pid}`, pin_hash]
      );
      if (security_answer_hash && String(security_answer_hash).includes(':')) {
        await sqliteDb.run(
          'INSERT INTO system_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
          [`family_sec:${pid}`, String(security_answer_hash)]
        );
      }
    });

    return res.json({ success: true, scope: 'family', profile_id: pid });
  } catch (e) {
    logger.error('Failed to save family PIN:', e);
    return res.status(500).json({ error: '保存家庭家长密码失败' });
  }
});

// POST /api/family/verify-pin — 验证家庭家长 6 位 PIN
router.post('/family/verify-pin', checkFamilyPinRateLimit, async (req, res) => {
  try {
    const sqliteDb = getSqliteDb();
    if (!sqliteDb) return res.status(503).json({ error: 'Database not ready' });
    const pid = getFamilyLockKey(req);
    const { pin_hash } = req.body || {};
    if (!pin_hash || typeof pin_hash !== 'string') {
      return res.status(400).json({ valid: false, error: '请输入 6 位家长密码' });
    }
    if (isWeakPinHash(pin_hash)) {
      if (req._familyPinAttemptEntry) req._familyPinAttemptEntry.count += 1;
      const remaining = Math.max(0, 5 - (req._familyPinAttemptEntry?.count || 0));
      return res.status(400).json({ valid: false, remaining_attempts: remaining, error: '弱口令已被禁用，请输入自定义 6 位家长密码。' });
    }
    const savedRow = await sqliteDb.get('SELECT value FROM system_settings WHERE key = ?', [`family_pin:${pid}`]);
    if (!savedRow || !savedRow.value || isWeakPinHash(savedRow.value)) {
      return res.status(403).json({ valid: false, unconfigured: true, error: '尚未设置家庭家长密码，请先完成首次设置。' });
    }
    const savedBuf = Buffer.from(String(savedRow.value));
    const inputBuf = Buffer.from(String(pin_hash));
    const isValid = savedBuf.length === inputBuf.length && crypto.timingSafeEqual(savedBuf, inputBuf);
    if (isValid) {
      if (req._familyPinAttemptEntry) req._familyPinAttemptEntry.count = 0;
      return res.json({ valid: true, scope: 'family', profile_id: pid });
    }
    if (req._familyPinAttemptEntry) req._familyPinAttemptEntry.count += 1;
    const count = req._familyPinAttemptEntry?.count || 1;
    const remaining = Math.max(0, 5 - count);
    if (count >= 5) {
      const retryAfter = Math.max(1, Math.ceil(((req._familyPinAttemptEntry?.resetTime || Date.now()) - Date.now()) / 1000));
      return res.status(429).json({
        valid: false,
        locked: true,
        retry_after_seconds: retryAfter,
        remaining_attempts: 0,
        error: `家长密码错误次数过多，请在 ${retryAfter} 秒后重试`
      });
    }
    return res.status(401).json({
      valid: false,
      remaining_attempts: remaining,
      error: `密码不正确（还可尝试 ${remaining} 次）`
    });
  } catch (e) {
    logger.error('Failed to verify family PIN:', e);
    return res.status(500).json({ valid: false, error: '验证家庭家长密码失败' });
  }
});

// POST /api/family/reset-pin — 严格校验密保后重置家庭家长 PIN（未设密保或答案错误坚决拦截）
router.post('/family/reset-pin', checkFamilyPinRateLimit, async (req, res) => {
  try {
    const sqliteDb = getSqliteDb();
    if (!sqliteDb) return res.status(503).json({ error: 'Database not ready' });
    const pid = getFamilyLockKey(req);
    const { question_id, answer_hash, new_pin_hash } = req.body || {};
    if (!question_id || !answer_hash || !new_pin_hash) {
      return res.status(400).json({ error: '请填写完整的密保答案与新密码' });
    }
    if (isWeakPinHash(new_pin_hash)) {
      return res.status(400).json({ error: '安全拦截：禁止重置为 888888、000000、123456 等弱口令' });
    }
    const secRow = await sqliteDb.get('SELECT value FROM system_settings WHERE key = ?', [`family_sec:${pid}`]);
    if (!secRow || !secRow.value) {
      return res.status(400).json({ error: '当前家庭档案尚未设置密保问题，无法通过密保重置' });
    }
    const expected = `${question_id}:${answer_hash}`;
    const savedBuf = Buffer.from(String(secRow.value));
    const inputBuf = Buffer.from(String(expected));
    const matched = savedBuf.length === inputBuf.length && crypto.timingSafeEqual(savedBuf, inputBuf);
    if (!matched) {
      if (req._familyPinAttemptEntry) req._familyPinAttemptEntry.count += 1;
      const remaining = Math.max(0, 5 - (req._familyPinAttemptEntry?.count || 0));
      return res.status(401).json({ error: `密保答案不正确（还可尝试 ${remaining} 次）`, remaining_attempts: remaining });
    }
    await dbQueue.enqueue(async () => {
      await sqliteDb.run(
        'INSERT INTO system_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
        [`family_pin:${pid}`, new_pin_hash]
      );
    });
    if (req._familyPinAttemptEntry) req._familyPinAttemptEntry.count = 0;
    return res.json({ success: true, scope: 'family', profile_id: pid });
  } catch (e) {
    logger.error('Failed to reset family PIN:', e);
    return res.status(500).json({ error: '重置家庭家长密码失败' });
  }
});

// ============================================================
// 二、站长超管安全锁（保护全站数据、服务端 API Key 池与 VIP 激活码生成）
// ============================================================
// POST /api/admin/pin — Store admin PIN hash and security question in database
router.post('/admin/pin', async (req, res) => {
  try {
    const sqliteDb = getSqliteDb();
    if (!sqliteDb) return res.status(503).json({ error: "Database not ready" });
    const { pin_hash, security_answer_hash } = req.body;
    if (!pin_hash) return res.status(400).json({ error: "PIN hash is required" });

    if (isWeakPinHash(pin_hash)) {
      return res.status(400).json({ error: "安全拦截：禁止使用 888888、000000、123456 等默认弱口令作为 PIN 码，请设置自定义 6 位安全密码。" });
    }

    // If a valid (non-weak) PIN already exists in DB, modifying it requires admin verification
    const existingPinRow = await sqliteDb.get("SELECT value FROM system_settings WHERE key = 'parent_pin_hash'");
    const needsSetupRow = await sqliteDb.get("SELECT value FROM system_settings WHERE key = 'needs_parent_pin_setup'");
    const hasConfiguredPin = Boolean(existingPinRow && existingPinRow.value && !isWeakPinHash(existingPinRow.value) && !needsSetupRow);
    const isStrictEnv = process.env.NODE_ENV === 'production' || process.env.REQUIRE_AUTH === 'true';

    if (hasConfiguredPin && isStrictEnv) {
      const isAdmin = await isVerifiedAdminRequest(req);
      if (!isAdmin) {
        return res.status(403).json({ error: "当前已设置家长 PIN 码，修改密码需先通过原密码验证。" });
      }
    } else if (!hasConfiguredPin && isStrictEnv) {
      // 安全加固：生产环境首次初始化管理员 PIN 必须提供 ADMIN_SETUP_SECRET 或已通过主令牌认证，防止公网匿名抢注接管全站
      const setupSecretCandidate = req.headers['x-setup-secret'] || req.body?.setup_secret || '';
      const isAuthorizedBootstrap = isSetupSecretValid(setupSecretCandidate) || await isVerifiedAdminRequest(req);
      if (!isAuthorizedBootstrap) {
        return res.status(403).json({ error: "生产环境首次设置管理员 PIN 必须提供有效的初始化密钥 (x-setup-secret) 或主管理员访问令牌。" });
      }
    }

    await dbQueue.enqueue(async () => {
      await sqliteDb.run(
        'INSERT INTO system_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
        ['parent_pin_hash', pin_hash]
      );
      await sqliteDb.run("DELETE FROM system_settings WHERE key = 'needs_parent_pin_setup'");

      if (security_answer_hash) {
        await sqliteDb.run(
          'INSERT INTO system_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
          ['security_answer_hash', security_answer_hash]
        );
      }
    });
    res.json({ success: true });
  } catch (e) {
    logger.error("Failed to save parent PIN hash:", e);
    res.status(500).json({ error: "保存家长密码哈希失败" });
  }
});

// GET /api/admin/pin & /api/admin/pin-status — Get PIN status without leaking hashes
const getPinStatusHandler = async (req, res) => {
  try {
    const sqliteDb = getSqliteDb();
    if (!sqliteDb) return res.status(503).json({ error: "Database not ready" });

    const pinRow = await sqliteDb.get("SELECT value FROM system_settings WHERE key = 'parent_pin_hash'");
    const answerRow = await sqliteDb.get("SELECT value FROM system_settings WHERE key = 'security_answer_hash'");
    const needsSetupRow = await sqliteDb.get("SELECT value FROM system_settings WHERE key = 'needs_parent_pin_setup'");
    
    const { isWeakPinHash } = require('../utils/adminAuth');
    const hasValidPin = Boolean(pinRow && pinRow.value && !isWeakPinHash(pinRow.value) && !needsSetupRow);

    let questionId = null;
    if (answerRow && answerRow.value) {
      const parts = answerRow.value.split(':');
      if (parts.length >= 2) questionId = parts[0];
    }

    const isStrictEnv = process.env.NODE_ENV === 'production' || process.env.REQUIRE_AUTH === 'true';
    res.json({
      has_pin: hasValidPin,
      needs_setup: Boolean(needsSetupRow || !hasValidPin),
      requires_setup_secret: Boolean(isStrictEnv && !hasValidPin),
      has_security_question: Boolean(answerRow && answerRow.value),
      question_id: questionId
    });
  } catch (e) {
    logger.error("Failed to get parent PIN info:", e);
    res.status(500).json({ error: "获取家长安全设置失败" });
  }
};

router.get('/admin/pin', getPinStatusHandler);
router.get('/admin/pin-status', getPinStatusHandler);

// In-memory brute force rate limiter for PIN verification with periodic garbage collection
const pinAttempts = new Map();

// Periodic sweep every 10 minutes to evict expired IP rate-limit records
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of pinAttempts.entries()) {
    if (now > entry.resetTime) {
      pinAttempts.delete(ip);
    }
  }
}, 10 * 60 * 1000).unref();

function checkPinRateLimit(req, res, next) {
  const ip = req.ip || req.connection?.remoteAddress || 'unknown';
  const now = Date.now();

  // Guard against unbound Map expansion
  if (pinAttempts.size > 10000) {
    pinAttempts.clear();
  }

  const entry = pinAttempts.get(ip) || { count: 0, resetTime: now + 15 * 60 * 1000 };

  if (now > entry.resetTime) {
    entry.count = 0;
    entry.resetTime = now + 15 * 60 * 1000;
  }

  // 5 failed attempts locks for 15 minutes
  if (entry.count >= 5) {
    const retryAfter = Math.max(1, Math.ceil((entry.resetTime - now) / 1000));
    res.set('Retry-After', String(retryAfter));
    return res.status(429).json({
      valid: false,
      locked: true,
      retry_after_seconds: retryAfter,
      remaining_attempts: 0,
      error: `管理员验证错误次数过多，为保障安全请在 ${retryAfter} 秒后重试`
    });
  }

  pinAttempts.set(ip, entry);
  req._pinAttemptEntry = entry;
  next();
}

// POST /api/admin/secret-login — 站长通过初始化密钥 (ADMIN_SETUP_SECRET) 或主令牌 (API_TOKEN) 直登管理员台（并可选同步初始化/重设站长 PIN 与密保）
router.post('/admin/secret-login', checkPinRateLimit, async (req, res) => {
  try {
    const secret = String(req.body?.secret || req.headers['x-setup-secret'] || '').trim();
    if (!secret) {
      return res.status(400).json({ valid: false, error: '请输入站长管理密钥' });
    }
    const isAuthorized = isSetupSecretValid(secret) || isValidMasterApiToken(secret);
    if (!isAuthorized) {
      if (req._pinAttemptEntry) req._pinAttemptEntry.count += 1;
      const remaining = Math.max(0, 5 - (req._pinAttemptEntry?.count || 0));
      return res.status(401).json({
        valid: false,
        remaining_attempts: remaining,
        error: `站长管理密钥不正确（还可尝试 ${remaining} 次）`
      });
    }

    if (req._pinAttemptEntry) req._pinAttemptEntry.count = 0;

    // 若同时提交了新的站长 PIN 哈希（且非弱口令），一并保存，避免手机端二次配置
    const { new_pin_hash, security_answer_hash } = req.body || {};
    const sqliteDb = getSqliteDb();
    if (sqliteDb && new_pin_hash && typeof new_pin_hash === 'string' && !isWeakPinHash(new_pin_hash)) {
      await dbQueue.enqueue(async () => {
        await sqliteDb.run(
          'INSERT INTO system_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
          ['parent_pin_hash', new_pin_hash]
        );
        await sqliteDb.run("DELETE FROM system_settings WHERE key = 'needs_parent_pin_setup'");
        if (security_answer_hash && String(security_answer_hash).includes(':')) {
          await sqliteDb.run(
            'INSERT INTO system_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
            ['security_answer_hash', String(security_answer_hash)]
          );
        }
      });
    }

    const session_token = generateParentSessionToken('admin', 1800);
    appendSetCookie(
      res,
      buildCookieHeaderValue(ADMIN_SESSION_COOKIE, session_token, 1800, '/api', req)
    );
    return res.json({
      valid: true,
      success: true,
      session_token,
      expires_in_seconds: 1800
    });
  } catch (e) {
    logger.error('Failed admin secret login:', e);
    return res.status(500).json({ valid: false, error: '站长密钥认证失败' });
  }
});

// POST /api/admin/verify-pin — Verify admin PIN hash and issue short-lived session token
router.post('/admin/verify-pin', checkPinRateLimit, async (req, res) => {
  try {
    const sqliteDb = getSqliteDb();
    if (!sqliteDb) return res.status(503).json({ error: "Database not ready" });
    const { pin_hash } = req.body;
    if (!pin_hash) return res.status(400).json({ error: "PIN hash is required" });

    if (isWeakPinHash(pin_hash)) {
      if (req._pinAttemptEntry) req._pinAttemptEntry.count += 1;
      const remaining = Math.max(0, 5 - (req._pinAttemptEntry?.count || 0));
      return res.status(400).json({ valid: false, remaining_attempts: remaining, error: "系统已强制停用 888888、000000 等弱口令，请重设安全密码。" });
    }

    const savedPinRow = await sqliteDb.get("SELECT value FROM system_settings WHERE key = 'parent_pin_hash'");
    if (!savedPinRow || !savedPinRow.value || isWeakPinHash(savedPinRow.value)) {
      if (process.env.NODE_ENV === 'production' || process.env.REQUIRE_AUTH === 'true') {
        return res.status(403).json({ valid: false, unconfigured: true, error: "站长 PIN 尚未初始化，请点击下方「站长密钥直登」或完成首次配置。" });
      }
      return res.json({ valid: true, unconfigured: true });
    }

    const savedBuf = Buffer.from(String(savedPinRow.value));
    const inputBuf = Buffer.from(String(pin_hash));
    const isValid = savedBuf.length === inputBuf.length && crypto.timingSafeEqual(savedBuf, inputBuf);

    if (isValid) {
      if (req._pinAttemptEntry) req._pinAttemptEntry.count = 0;
      const session_token = generateParentSessionToken('admin', 1800);
      appendSetCookie(
        res,
        buildCookieHeaderValue(ADMIN_SESSION_COOKIE, session_token, 1800, '/api', req)
      );
      return res.json({ valid: true, session_token, expires_in_seconds: 1800 });
    } else {
      if (req._pinAttemptEntry) req._pinAttemptEntry.count += 1;
      const count = req._pinAttemptEntry?.count || 1;
      const remaining = Math.max(0, 5 - count);
      if (count >= 5) {
        const retryAfter = Math.max(1, Math.ceil(((req._pinAttemptEntry?.resetTime || Date.now()) - Date.now()) / 1000));
        return res.status(429).json({
          valid: false,
          locked: true,
          retry_after_seconds: retryAfter,
          remaining_attempts: 0,
          error: `密码错误次数过多，请在 ${retryAfter} 秒后重试`
        });
      }
      return res.status(401).json({ valid: false, remaining_attempts: remaining, error: `密码不正确（还可尝试 ${remaining} 次）` });
    }
  } catch (e) {
    logger.error("Failed to verify parent PIN:", e);
    res.status(500).json({ error: "验证管理员密码失败" });
  }
});

// POST /api/parent/auth-session — Verify parent PIN and issue Parent-Session-Token
router.post('/parent/auth-session', checkPinRateLimit, async (req, res) => {
  try {
    const sqliteDb = getSqliteDb();
    if (!sqliteDb) return res.status(503).json({ error: "Database not ready" });
    const { pin_hash } = req.body;
    if (!pin_hash) return res.status(400).json({ error: "PIN hash is required" });

    const { isWeakPinHash, generateParentSessionToken } = require('../utils/adminAuth');
    if (isWeakPinHash(pin_hash)) {
      if (req._pinAttemptEntry) req._pinAttemptEntry.count += 1;
      return res.status(400).json({ success: false, error: "系统已强制停用 888888 等默认弱口令，请重设安全密码。" });
    }

    const savedPinRow = await sqliteDb.get("SELECT value FROM system_settings WHERE key = 'parent_pin_hash'");
    if (!savedPinRow || !savedPinRow.value || isWeakPinHash(savedPinRow.value)) {
      return res.status(400).json({ success: false, unconfigured: true, error: "尚未配置家长 PIN 码，请先初始化安全密码。" });
    }

    const savedBuf = Buffer.from(String(savedPinRow.value));
    const inputBuf = Buffer.from(String(pin_hash));
    const isValid = savedBuf.length === inputBuf.length && crypto.timingSafeEqual(savedBuf, inputBuf);

    if (isValid) {
      if (req._pinAttemptEntry) req._pinAttemptEntry.count = 0;
      const session_token = generateParentSessionToken('admin', 1800);
      return res.json({ success: true, session_token, expires_in_seconds: 1800 });
    } else {
      if (req._pinAttemptEntry) req._pinAttemptEntry.count += 1;
      return res.status(401).json({ success: false, error: "密码不正确" });
    }
  } catch (e) {
    logger.error("Failed to authenticate parent session:", e);
    res.status(500).json({ error: "认证家长会话失败" });
  }
});

// GET /api/admin/anti-cheat — Get server-side anti-cheat status
router.get('/admin/anti-cheat', async (req, res) => {
  try {
    const sqliteDb = getSqliteDb();
    if (!sqliteDb) return res.json({ locked: false });
    const row = await sqliteDb.get("SELECT value FROM system_settings WHERE key = 'parent_anti_cheat_locked'");
    res.json({ locked: row ? row.value === 'true' : false });
  } catch (e) {
    res.json({ locked: false });
  }
});

// POST /api/admin/anti-cheat — Set server-side anti-cheat status (requires admin authorization)
router.post('/admin/anti-cheat', async (req, res) => {
  try {
    const { isVerifiedAdminRequest } = require('../utils/adminAuth');
    if (!await isVerifiedAdminRequest(req)) {
      return res.status(403).json({ error: "无权修改防抄题监督锁：需要家长管理员认证" });
    }
    const { locked } = req.body;
    const sqliteDb = getSqliteDb();
    if (!sqliteDb) return res.status(503).json({ error: "Database not ready" });
    await sqliteDb.run(
      "INSERT INTO system_settings (key, value) VALUES ('parent_anti_cheat_locked', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      [locked ? 'true' : 'false']
    );
    res.json({ success: true, locked: !!locked });
  } catch (e) {
    logger.error("Failed to update anti-cheat status:", e);
    res.status(500).json({ error: "更新防抄题设置失败" });
  }
});

// POST /api/admin/reset-pin — Reset admin PIN via verified security question OR valid admin setup_secret / master token
router.post('/admin/reset-pin', checkPinRateLimit, async (req, res) => {
  try {
    const sqliteDb = getSqliteDb();
    if (!sqliteDb) return res.status(503).json({ error: "Database not ready" });
    const { question_id, answer_hash, new_pin_hash, setup_secret, security_answer_hash } = req.body || {};
    if (!new_pin_hash) {
      return res.status(400).json({ error: "缺少新密码参数" });
    }

    if (isWeakPinHash(new_pin_hash)) {
      if (req._pinAttemptEntry) req._pinAttemptEntry.count += 1;
      return res.status(400).json({ error: "安全拦截：禁止重置为 888888、000000 等默认弱口令" });
    }

    const secretCandidate = String(setup_secret || req.headers['x-setup-secret'] || '').trim();
    const hasValidSecret = Boolean(secretCandidate && (isSetupSecretValid(secretCandidate) || isValidMasterApiToken(secretCandidate)));
    // 站长已通过直登密钥/管理员会话认证进入控制台时，允许直接重设管理员 PIN，无需二次索要 setup_secret
    const isAlreadyVerifiedAdmin = hasValidSecret || await isVerifiedAdminRequest(req);

    if (!isAlreadyVerifiedAdmin) {
      if (!question_id || !answer_hash) {
        return res.status(400).json({ error: "缺少密保验证参数或站长管理密钥" });
      }
      const answerRow = await sqliteDb.get("SELECT value FROM system_settings WHERE key = 'security_answer_hash'");
      if (!answerRow || !answerRow.value) {
        return res.status(400).json({ error: "管理员尚未设置密保问题，请使用站长管理密钥重置。" });
      }

      const expected = `${question_id}:${answer_hash}`;
      const savedBuf = Buffer.from(String(answerRow.value));
      const inputBuf = Buffer.from(String(expected));
      const matched = savedBuf.length === inputBuf.length && crypto.timingSafeEqual(savedBuf, inputBuf);
      if (!matched) {
        if (req._pinAttemptEntry) req._pinAttemptEntry.count += 1;
        return res.status(401).json({ error: "密保答案不正确，无法重置管理员密码" });
      }
    }

    await dbQueue.enqueue(async () => {
      await sqliteDb.run(
        "INSERT INTO system_settings (key, value) VALUES ('parent_pin_hash', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        [new_pin_hash]
      );
      await sqliteDb.run("DELETE FROM system_settings WHERE key = 'needs_parent_pin_setup'");
      if (security_answer_hash && String(security_answer_hash).includes(':')) {
        await sqliteDb.run(
          "INSERT INTO system_settings (key, value) VALUES ('security_answer_hash', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
          [String(security_answer_hash)]
        );
      }
    });

    if (req._pinAttemptEntry) req._pinAttemptEntry.count = 0;
    const session_token = generateParentSessionToken('admin', 1800);
    appendSetCookie(
      res,
      buildCookieHeaderValue(ADMIN_SESSION_COOKIE, session_token, 1800, '/api', req)
    );
    res.json({ success: true, session_token, expires_in_seconds: 1800 });
  } catch (e) {
    logger.error("Failed to reset parent PIN:", e);
    res.status(500).json({ error: "重置管理员密码失败" });
  }
});

// GET /api/admin/stats — Admin Operational Analytics
router.get('/admin/stats', async (req, res) => {
  try {
    const sqliteDb = getSqliteDb();
    if (!sqliteDb) return res.status(503).json({ error: "Database not ready" });

    // Verify Admin / Parent Gate authorization uniformly
    const isAdmin = await isVerifiedAdminRequest(req);
    if (!isAdmin && (process.env.NODE_ENV === 'production' || process.env.REQUIRE_AUTH === 'true')) {
      return res.status(403).json({ error: "拒绝访问：家长或管理员验证已失效或不匹配，请重新验证。" });
    }

    // 1. Get total active profiles count (excluding 'default')
    const profilesResult = await sqliteDb.all(`
      SELECT DISTINCT profile_id FROM chat_history
      UNION
      SELECT DISTINCT profile_id FROM mistakes
      UNION
      SELECT DISTINCT profile_id FROM profile_progress
    `);
    const totalProfiles = profilesResult.filter(p => p.profile_id && p.profile_id !== 'default').length;

    // 2. Daily active profiles (distinct profiles active today in Beijing time)
    const activeTodayResult = await sqliteDb.get(`
      SELECT COUNT(DISTINCT profile_id) as active_count 
      FROM chat_history 
      WHERE date(timestamp, '+8 hours') = date('now', '+8 hours') AND profile_id != 'default'
    `);
    const dailyActive = activeTodayResult?.active_count || 0;

    // 3. Total mistakes count
    const totalMistakesResult = await sqliteDb.get('SELECT COUNT(*) as count FROM mistakes');
    const totalMistakes = totalMistakesResult?.count || 0;

    // 4. Mistakes by subject
    const mistakesBySubject = await sqliteDb.all(`
      SELECT COALESCE(subject, '未知') as subject, COUNT(*) as count 
      FROM mistakes 
      GROUP BY subject
    `);

    // 5. Details of profiles (distinct profile_ids with last active timestamp and mistake count)
    const profileDetails = await sqliteDb.all(`
      SELECT 
        p.profile_id,
        (SELECT MAX(timestamp) FROM chat_history WHERE profile_id = p.profile_id) as last_active,
        (SELECT COUNT(*) FROM mistakes WHERE profile_id = p.profile_id) as mistake_count
      FROM (
        SELECT DISTINCT profile_id FROM chat_history WHERE profile_id != 'default'
        UNION
        SELECT DISTINCT profile_id FROM mistakes WHERE profile_id != 'default'
      ) p
      ORDER BY last_active DESC
    `);

    // 6. Token usage statistics
    const totalUsage = await sqliteDb.get('SELECT COUNT(*) as count, SUM(prompt_tokens + completion_tokens) as total_tokens FROM api_usage');
    const totalCalls = totalUsage?.count || 0;
    const totalTokens = totalUsage?.total_tokens || 0;

    const usageByType = await sqliteDb.all(`
      SELECT type, SUM(prompt_tokens) as prompt, SUM(completion_tokens) as completion 
      FROM api_usage 
      GROUP BY type
    `);

    const usageStatus = await sqliteDb.all(`
      SELECT status, COUNT(*) as count 
      FROM api_usage 
      GROUP BY status
    `);

    const dailyUsage = await sqliteDb.all(`
      SELECT date(timestamp, '+8 hours') as date, SUM(prompt_tokens + completion_tokens) as tokens, COUNT(*) as calls
      FROM api_usage 
      WHERE timestamp >= datetime('now', '-7 days')
      GROUP BY date(timestamp, '+8 hours')
      ORDER BY date ASC
    `);

    res.json({
      totalProfiles,
      dailyActive,
      totalMistakes,
      mistakesBySubject,
      profiles: profileDetails,
      tokenStats: {
        totalCalls,
        totalTokens,
        byType: usageByType,
        byStatus: usageStatus,
        daily: dailyUsage
      }
    });

  } catch (e) {
    logger.error("Failed to fetch admin stats:", e);
    res.status(500).json({ error: "获取管理统计数据失败" });
  }
});

// POST /api/admin/shutdown — Graceful shutdown
router.post('/admin/shutdown', async (req, res) => {
  try {

    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : String(req.query.token || '').trim();
    const isAdmin = (await isVerifiedAdminRequest(req)) || isValidMasterApiToken(token);
    if (!isAdmin) {
      return res.status(403).json({ error: "关机操作需要有效的访问令牌" });
    }

    res.json({ success: true, message: 'Server is shutting down gracefully...' });
    logger.info('[Shutdown] Received API request for graceful shutdown.');
    
    // Trigger graceful shutdown in the next tick
    setTimeout(() => {
      process.kill(process.pid, 'SIGTERM');
    }, 100);
  } catch (e) {
    logger.error("Failed to shutdown server:", e);
    res.status(500).json({ error: "Failed to shutdown server" });
  }
});

// POST /api/admin/errors — Client-side error reporting APM
router.post('/admin/errors', async (req, res) => {
  try {
    const { message, stack, url, profile_id } = req.body;
    const safeMessage = String(message || 'unknown').slice(0, 500);
    const safeStack = String(stack || '').slice(0, 2000);
    const safeUrl = String(url || 'unknown').slice(0, 500);
    const safeProfileId = String(profile_id || 'unknown').slice(0, 100);

    logger.error(`[Client-APM] Error from profile ${safeProfileId} on ${safeUrl}: ${safeMessage}\nStack: ${safeStack}`);
    
    const clientLogDir = path.join(__dirname, '..', '..', 'logs');
    if (!fs.existsSync(clientLogDir)) {
      fs.mkdirSync(clientLogDir, { recursive: true });
    }
    const logEntry = JSON.stringify({
      timestamp: new Date().toISOString(),
      profile_id: safeProfileId,
      url: safeUrl,
      message: safeMessage,
      stack: safeStack
    }) + '\n';
    
    fs.appendFile(path.join(clientLogDir, 'client_errors.log'), logEntry, 'utf8', (err) => {
      if (err) logger.error('Failed to write client_errors.log:', err);
    });

    res.json({ success: true });
  } catch (err) {
    logger.error('Failed to log client error:', err);
    res.status(500).json({ error: 'Failed to record error' });
  }
});

module.exports = router;
