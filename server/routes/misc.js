const express = require('express');
const multer = require('multer');
const router = express.Router();
const { getSqliteDb } = require('../db/init');
const { fetchWithKeyRotation, buildChatURL } = require('../services/embedding');
const { NODE_ENV, API_KEYS } = require('../config');
const logger = require('../services/logger');
const { encryptField, decryptField, generateFtsIndexText } = require('../utils/crypto');
const { formatGradeName, GRADE_ALIASES, getPromptGuidelines } = require('../prompts/guidelines');
const { verifyMultipartIntegrity } = require('../middleware/signature');

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
  const { getTable } = require('../db/init');
  const base = {
    status: 'ok',
    uptime: process.uptime(),
  };
  // Only expose sensitive details in development
  if (NODE_ENV === 'development') {
    base.db_ready = !!getTable();
    base.sqlite_ready = !!getSqliteDb();
    base.keys_available = API_KEYS.length;
    base.mode = NODE_ENV;
  }
  res.json(base);
});

// Chat history
router.get('/chat-history', async (req, res) => {
  try {
    const sqliteDb = getSqliteDb();
    if (!sqliteDb) return res.status(503).json({ error: "Database not ready" });
    const { profile_id = 'default', grade = 'unknown', subject = 'unknown' } = req.query;
    // Pagination: default last 100 messages, max 500
    const limit = Math.min(parseInt(req.query.limit || '100', 10), 500);
    const offset = parseInt(req.query.offset || '0', 10);
    const rows = await sqliteDb.all(
      'SELECT role, text FROM chat_history WHERE profile_id = ? AND grade = ? AND subject = ? ORDER BY timestamp ASC LIMIT ? OFFSET ?',
      [profile_id, grade, subject, limit, offset]
    );
    const decryptedRows = rows.map(r => ({ ...r, text: decryptField(r.text) }));
    res.json({ history: decryptedRows, limit, offset });
  } catch (e) {
    logger.error("Failed to fetch chat history:", e);
    res.status(500).json({ error: "获取对话历史记录失败" });
  }
});

const dbQueue = require('../services/dbQueue');

router.post('/chat-history', async (req, res) => {
  try {
    const sqliteDb = getSqliteDb();
    if (!sqliteDb) return res.status(503).json({ error: "Database not ready" });
    const { profile_id, messages, grade = 'unknown', subject = 'unknown' } = req.body;

    if (!profile_id || !messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: "Missing required parameters" });
    }

    await dbQueue.enqueue(async () => {
      await sqliteDb.run('BEGIN TRANSACTION');
      try {
        await sqliteDb.run(`
          DELETE FROM chat_history_fts 
          WHERE chat_id IN (
            SELECT id FROM chat_history 
            WHERE profile_id = ? AND grade = ? AND subject = ?
          )
        `, [profile_id, grade, subject]);
        await sqliteDb.run('DELETE FROM chat_history WHERE profile_id = ? AND grade = ? AND subject = ?', [profile_id, grade, subject]);
        for (const msg of messages) {
          if (msg.role !== 'system' && msg.text && msg.text.trim()) {
            const result = await sqliteDb.run('INSERT INTO chat_history (profile_id, grade, subject, role, text) VALUES (?, ?, ?, ?, ?)',
              [profile_id, grade, subject, msg.role, encryptField(msg.text)]);
            const chat_id = result.lastID;
            await sqliteDb.run('INSERT INTO chat_history_fts (chat_id, text) VALUES (?, ?)', [chat_id, generateFtsIndexText(msg.text)]);
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
    const params = [profile_id, matchQuery];
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

    await sqliteDb.run('DELETE FROM chat_history_fts WHERE chat_id IN (SELECT id FROM chat_history WHERE profile_id = ?)', [profile_id]);
    await sqliteDb.run('DELETE FROM chat_history WHERE profile_id = ?', [profile_id]);
    await sqliteDb.run('DELETE FROM mistakes WHERE profile_id = ?', [profile_id]);
    await sqliteDb.run('DELETE FROM profile_progress WHERE profile_id = ?', [profile_id]);

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
    const profile_id = req.query.profile_id || 'default';

    const totalRows = await sqliteDb.get('SELECT COUNT(*) as c FROM mistakes WHERE profile_id = ?', [profile_id]);
    const subjectRows = await sqliteDb.all(
      'SELECT subject, COUNT(*) as count FROM mistakes WHERE profile_id = ? AND subject != "unknown" GROUP BY subject',
      [profile_id]
    );
    const recentRows = await sqliteDb.all(
      `SELECT date(timestamp, 'localtime') as date, COUNT(*) as count
       FROM mistakes WHERE profile_id = ? AND timestamp >= datetime('now', '-7 days')
       GROUP BY date(timestamp, 'localtime') ORDER BY date DESC`,
      [profile_id]
    );

    res.json({ total: totalRows.c, bySubject: subjectRows, recent: recentRows });
  } catch (e) {
    res.status(500).json({ error: "获取统计数据失败", details: NODE_ENV === 'development' ? e.message : undefined });
  }
});

// Data export — requires valid API token to protect user data
router.get('/export/data', async (req, res) => {
  try {
    // Verify token — even localhost requests must provide a valid token for data export
    const { API_TOKEN } = require('../config');
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : req.query.token;
    if (!token || token !== API_TOKEN) {
      return res.status(403).json({ error: "导出数据需要有效的访问令牌" });
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

// Weekly report
router.post('/report/weekly', async (req, res) => {
  try {
    const sqliteDb = getSqliteDb();
    if (!sqliteDb) return res.status(503).json({ error: "Database not ready" });
    const { profile_id = 'default', grade = 'unknown' } = req.body;
    // Sanitize free-text user inputs to prevent prompt injection
    const parent_name = String(req.body.parent_name || '家长').replace(/[^a-zA-Z0-9一-龥_\-\s]/g, '').trim().slice(0, 30) || '家长';
    const student_name = String(req.body.student_name || '学生').replace(/[^a-zA-Z0-9一-龥_\-\s]/g, '').trim().slice(0, 30) || '学生';

    const gradeFilter = (grade && grade !== 'unknown') ? ` AND grade = ?` : '';
    const gradeParams = (grade && grade !== 'unknown') ? [grade] : [];

    const chatCount = await sqliteDb.get(
      `SELECT COUNT(*) as c FROM chat_history WHERE profile_id = ? AND datetime(timestamp) >= datetime('now', '-7 days')` + gradeFilter,
      [profile_id, ...gradeParams]
    );
    const mistakeCount = await sqliteDb.get(
      `SELECT COUNT(*) as c FROM mistakes WHERE profile_id = ? AND datetime(timestamp) >= datetime('now', '-7 days')` + gradeFilter,
      [profile_id, ...gradeParams]
    );

    const prompt = `你是一位认真负责的"教导主任"，现在要给家长【${parent_name}】发一份关于他的孩子【${student_name}】（${grade}）的【本周AI私教学习周报】。

本周客观数据如下：
- 师生对话互动总次数：${chatCount.c} 次
- 攻克/记录的核心错题数：${mistakeCount.c} 题

请你根据上述数据，用教导主任那种"严谨、负责、同时带有鼓励"的语气，撰写一份结构清晰的Markdown格式周报。
包括：
1. 本周学习数据总结
2. 数据背后的学习状态分析（比如：互动次数多说明求知欲强，错题多说明敢于暴露弱点）
3. 给家长（${parent_name}）的跟进建议

无需过于冗长，字数控制在300字左右即可，排版要精美（可以使用Emoji）。`;

    let text;
    try {
      const response = await fetchWithKeyRotation(buildChatURL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.6 }
        })
      }, 8, 90000);

      const data = await response.json();
      text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) throw new Error("Empty response from LLM");
    } catch (llmErr) {
      logger.warn("Weekly report LLM generation failed, falling back to static report:", llmErr.message);
      text = `### 📊 本周学习数据总结
- 师生对话互动总次数：**${chatCount.c}** 次
- 攻克/记录的核心错题数：**${mistakeCount.c}** 题

### 📝 学习状态分析
本周【${student_name}】同学完成了系统的学习交互。在对话中积极探讨问题，并在错题本中记录了关键薄弱点。

### 💡 家长跟进建议
建议家长【${parent_name}】多鼓励孩子对本周记录的 **${mistakeCount.c}** 道错题进行自主复习，通过“举一反三”变式训练进行巩固，养成良好的学习习惯。`;
    }

    res.json({ report: text });
  } catch (e) {
    logger.error("Weekly report error:", e);
    res.status(500).json({ error: "生成周报失败" });
  }
});

// Active learning plan
router.post('/active-plan/generate', async (req, res) => {
  try {
    const { profile_id, grade, subject, edition } = req.body;
    if (!grade || !subject) return res.status(400).json({ error: "Grade and subject are required" });

    const TEXTBOOK_CHAPTERS = require('../prompts/chapters.json');
    const key = edition ? `${grade}_${edition}` : grade;
    const gradeChapters = TEXTBOOK_CHAPTERS[key] || TEXTBOOK_CHAPTERS[grade] || {};
    const list = gradeChapters[subject] || [];

    // Don't waste API quota when no chapters exist for this grade/subject combination
    if (list.length === 0) {
      return res.status(400).json({ error: `No chapters found for ${grade}/${subject}` });
    }

    const chaptersStr = list.map((c, i) => `${i + 1}. ${c.name} (${c.description})`).join('\n');

    let gradeStr = '未知年级';
    if (grade) {
      const rawGrade = String(grade).split('_')[0];
      gradeStr = GRADE_ALIASES[rawGrade] ? GRADE_ALIASES[rawGrade][0] : `${rawGrade}年级`;
    }
    // Sanitize free-text user input to prevent prompt injection
    const name = String(req.body.student_name || '孩子').replace(/[^a-zA-Z0-9一-龥_\-\s]/g, '').trim().slice(0, 30) || '孩子';

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
      headers: { 'Content-Type': 'application/json' },
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
router.post('/generate-variation', async (req, res) => {
  try {
    const { query, answer, grade, subject } = req.body;
    if (!query) return res.status(400).json({ error: "Query is required" });
    // Truncate inputs to prevent prompt injection via oversized content
    const safeQuery = String(query).slice(0, 500);
    const safeAnswer = answer ? String(answer).slice(0, 1000) : '';

    const rawGrade = grade ? String(grade).split('_')[0] : '';
    let gradeStr = rawGrade ? (GRADE_ALIASES[rawGrade] ? GRADE_ALIASES[rawGrade][0] : `${rawGrade}年级`) : '未知年级';

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
      headers: { 'Content-Type': 'application/json' },
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
router.post('/grade-variation', async (req, res) => {
  try {
    const { question, solution, student_answer, grade } = req.body;
    if (!question || !student_answer) return res.status(400).json({ error: "Missing fields" });
    // Truncate inputs to prevent prompt injection
    const safeQuestion = String(question).slice(0, 500);
    const safeSolution = solution ? String(solution).slice(0, 1000) : null;
    const safeStudentAnswer = String(student_answer).slice(0, 500);

    const rawGrade = grade ? String(grade).split('_')[0] : '';
    let gradeStr = rawGrade ? (GRADE_ALIASES[rawGrade] ? GRADE_ALIASES[rawGrade][0] : `${rawGrade}年级`) : '未知年级';

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
      headers: { 'Content-Type': 'application/json' },
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

// Transcribe audio
router.post('/transcribe', upload.single('audio'), verifyMultipartIntegrity, async (req, res) => {
  try {
    const audioBuffer = req.file?.buffer;
    let mimeType = req.file?.mimetype || 'audio/webm';

    // Normalize MIME types for Gemini API compatibility
    if (mimeType === 'audio/x-m4a' || mimeType === 'audio/m4a' || mimeType === 'audio/mp4') {
      mimeType = 'audio/aac';
    }
    if (mimeType === 'audio/mpeg') {
      mimeType = 'audio/mp3';
    }

    if (!audioBuffer) return res.status(400).json({ error: '没有提供音频文件' });

    // Validate audio file size
    if (audioBuffer.length > 10 * 1024 * 1024) {
      return res.status(400).json({ error: '音频文件不能超过 10MB' });
    }

    const base64Audio = audioBuffer.toString('base64');

    const prompt = `请精确地将这段音频中的儿童语音内容转录为中文字幕文本。
要求：
1. 仅返回转录得到的文本内容，不要包含任何前导、后导的回复、标点符号、解释或说明。
2. 不要编造内容，如果完全听不清或没有声音，请只返回一个空字符串。
3. 自动纠正明显的普通话或粤语拼写、发音语病，保持语句通顺。`;

    const response = await fetchWithKeyRotation(buildChatURL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ inline_data: { mime_type: mimeType, data: base64Audio } }, { text: prompt }] }],
        generationConfig: { temperature: 0.0, maxOutputTokens: 1024 }
      })
    }, 8, 90000);

    const data = await response.json();
    if (data.error) {
      logger.error(`[Speech to Text] API error: ${data.error.message || JSON.stringify(data.error)}`);
      return res.status(500).json({ error: '语音转录服务异常', details: NODE_ENV === 'development' ? data.error.message : undefined });
    }
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";
    logger.info(`[Speech to Text] Transcribed ${text.length} chars`);
    res.json({ text });
  } catch (e) {
    logger.error('Transcription Error:', e);
    res.status(500).json({ error: '语音转录失败', details: NODE_ENV === 'development' ? e.message : undefined });
  }
});

// POST /api/admin/pin — Store parent PIN hash in database
router.post('/admin/pin', async (req, res) => {
  try {
    const sqliteDb = getSqliteDb();
    if (!sqliteDb) return res.status(503).json({ error: "Database not ready" });
    const { pin_hash } = req.body;
    if (!pin_hash) return res.status(400).json({ error: "PIN hash is required" });

    await sqliteDb.run(
      'INSERT INTO system_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
      ['parent_pin_hash', pin_hash]
    );
    res.json({ success: true });
  } catch (e) {
    logger.error("Failed to save parent PIN hash:", e);
    res.status(500).json({ error: "保存家长密码哈希失败" });
  }
});

// GET /api/admin/stats — Admin Operational Analytics
router.get('/admin/stats', async (req, res) => {
  try {
    const sqliteDb = getSqliteDb();
    if (!sqliteDb) return res.status(503).json({ error: "Database not ready" });

    // Verify Parental Gate PIN hash on server side if configured
    const savedPinHashRow = await sqliteDb.get("SELECT value FROM system_settings WHERE key = 'parent_pin_hash'");
    if (savedPinHashRow && savedPinHashRow.value) {
      const clientPinHash = req.headers['x-parent-pin-hash'];
      if (!clientPinHash || clientPinHash !== savedPinHashRow.value) {
        return res.status(403).json({ error: "拒绝访问：家长验证已失效或不匹配，请重新验证。" });
      }
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

    // 2. Daily active profiles (distinct profiles active today in chat_history, excluding 'default')
    const activeTodayResult = await sqliteDb.get(`
      SELECT COUNT(DISTINCT profile_id) as active_count 
      FROM chat_history 
      WHERE date(timestamp) = date('now') AND profile_id != 'default'
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
      SELECT date(timestamp, 'localtime') as date, SUM(prompt_tokens + completion_tokens) as tokens, COUNT(*) as calls
      FROM api_usage 
      WHERE timestamp >= datetime('now', '-7 days')
      GROUP BY date(timestamp, 'localtime')
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
    const { API_TOKEN } = require('../config');
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : req.query.token;
    if (!token || token !== API_TOKEN) {
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
    logger.error(`[Client-APM] Error from profile ${profile_id || 'unknown'} on ${url || 'unknown'}: ${message}\nStack: ${stack || 'no stack'}`);
    
    const fs = require('fs');
    const path = require('path');
    const clientLogDir = path.join(__dirname, '..', '..', 'logs');
    if (!fs.existsSync(clientLogDir)) {
      fs.mkdirSync(clientLogDir, { recursive: true });
    }
    const logEntry = JSON.stringify({
      timestamp: new Date().toISOString(),
      profile_id: profile_id || 'unknown',
      url: url || 'unknown',
      message: message || 'unknown',
      stack: stack || ''
    }) + '\n';
    fs.appendFileSync(path.join(clientLogDir, 'client_errors.log'), logEntry, 'utf8');

    res.json({ success: true });
  } catch (err) {
    logger.error('Failed to log client error:', err);
    res.status(500).json({ error: 'Failed to record error' });
  }
});

module.exports = router;
