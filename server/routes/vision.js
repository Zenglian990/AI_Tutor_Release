const express = require('express');
const multer = require('multer');
const router = express.Router();
const { checkSafetyAndRedirect } = require('../../trie');
const { streamChatToClient } = require('../services/stream');
const { getPromptGuidelines, GRADE_ALIASES, correctPageOffset } = require('../prompts/guidelines');
const { performHybridSearch } = require('../services/search');
const { NODE_ENV, RAG_TOP_K } = require('../config');
const logger = require('../services/logger');
const { verifyMultipartIntegrity } = require('../middleware/signature');

// Allowed image MIME types (whitelist)
const ALLOWED_IMAGE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/bmp',
  'image/heic',
  'image/heif',
];

// Allowed image file extensions
const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.heic', '.heif'];

function validateImageFile(file) {
  if (!file) return '没有提供图片文件';

  // Check MIME type
  if (!ALLOWED_IMAGE_TYPES.includes(file.mimetype)) {
    // Also check HEIC variants that browsers may report differently
    if (!file.mimetype.startsWith('image/')) {
      return `不支持的图片格式: ${file.mimetype}`;
    }
  }

  // Check file extension
  // If MIME is an image but extension is unknown, still allow it (the MIME check above is the primary validation)

  // Check file size (multer already limits to 10MB, but double-check)
  if (file.size > 10 * 1024 * 1024) {
    return '图片文件不能超过 10MB';
  }

  return null; // valid
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => {
    const error = validateImageFile(file);
    if (error) {
      cb(new Error(error), false);
    } else {
      cb(null, true);
    }
  }
});

function detectImageFormat(buffer) {
  if (!buffer || buffer.length < 4) return null;
  const b0 = buffer[0], b1 = buffer[1], b2 = buffer[2], b3 = buffer[3];
  
  if (b0 === 0xFF && b1 === 0xD8 && b2 === 0xFF) return 'image/jpeg';
  if (b0 === 0x89 && b1 === 0x50 && b2 === 0x4E && b3 === 0x47) return 'image/png';
  if (b0 === 0x47 && b1 === 0x49 && b2 === 0x46) return 'image/gif';
  if (b0 === 0x42 && b1 === 0x4D) return 'image/bmp';
  
  if (b0 === 0x52 && b1 === 0x49 && b2 === 0x46 && b3 === 0x46) {
    if (buffer.length >= 12) {
      if (buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50) {
        return 'image/webp';
      }
    }
  }
  
  if (buffer.length >= 12) {
    if (buffer[4] === 0x66 && buffer[5] === 0x74 && buffer[6] === 0x79 && buffer[7] === 0x70) {
      const brand = buffer.slice(8, 12).toString('ascii').toLowerCase();
      if (['heic', 'heix', 'hevc', 'heim', 'heis', 'mif1', 'msf1'].includes(brand)) {
        return 'image/heic';
      }
    }
  }
  return null;
}

router.post('/chat-vision', upload.single('image'), verifyMultipartIntegrity, async (req, res) => {
  try {
    const query = req.body.query || '请帮我解答这张图片里的题目，并给出详细步骤。';

    const safetyRedirect = checkSafetyAndRedirect(query);
    if (safetyRedirect) {
      logger.info(`[Safety Check] Vision query blocked: "${query}"`);
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders();
      res.write(`data: ${JSON.stringify({ sources: [] })}\n\n`);
      res.write(`data: ${JSON.stringify({ text: safetyRedirect })}\n\n`);
      res.write('data: [DONE]\n\n');
      return res.end();
    }

    let history = [];
    try { const h = JSON.parse(req.body.history || '[]'); if (Array.isArray(h)) history = h; } catch { }
    const grade = req.body.grade;
    const subject = req.body.subject;
    const profile_id = req.body.profile_id || 'default';
    let socratic = req.body.socratic;
    if (socratic === 'true') socratic = true;
    if (socratic === 'false') socratic = false;
    const imageBuffer = req.file?.buffer;
    const mimeType = req.file?.mimetype || 'image/jpeg';
    const edition = req.body.edition;
    const model = req.body.model;

    if (!imageBuffer) return res.status(400).json({ error: 'No image provided' });

    // Double-check: validate the image hasn't been tampered post-upload (strict signature check)
    const detectedType = detectImageFormat(imageBuffer);
    if (!detectedType) {
      logger.warn(`[Security] Suspicious file upload: failed binary image validation, claimed MIME: ${mimeType}`);
      return res.status(400).json({ error: '无法识别的图片格式，请上传 JPG/PNG/GIF/WebP/HEIC 格式的图片。' });
    }

    const base64Image = imageBuffer.toString('base64');
    let sources = [];
    let contextString = '';

    let results = [];
    let isQuotaExhausted = false;
    try {
      results = await performHybridSearch(query, grade, subject, RAG_TOP_K, edition);

      // Apply page offset correction and filename cleanup
      const correctedResults = results.map(r => {
        const { source, page } = correctPageOffset(r.source, r.page);
        return {
          ...r,
          source,
          page
        };
      });

      sources = correctedResults.map(r => ({
        source: r.source,
        page: r.page || '未知',
        text_snippet: r.text ? (r.text.length > 100 ? r.text.substring(0, 100) + '...' : r.text) : "无文本"
      }));
      contextString = correctedResults.map((c, i) => `参考资料 ${i + 1}: [${c.source}] 第 ${c.page} 页\n${c.text ? c.text.substring(0, 800) : ''}`).join('\n\n');
    } catch (e) {
      logger.error('RAG hybrid search failed for vision:', e);
      if (e.message === 'EMBED_QUOTA_EXHAUSTED' || e.message === 'QUOTA_EXHAUSTED' || (e.message && e.message.includes('Quota exceeded'))) {
        isQuotaExhausted = true;
      }
    }

    if (isQuotaExhausted) {
      sources.push({
        source: "系统提示",
        page: 0,
        text_snippet: "⚠️ 警告：AI 教材关联服务（Embedding）额度已耗尽，当前回答将无法结合教材内容，仅使用 AI 本地知识库解答。"
      });
    }

    const slicedHistory = history.slice(-10);
    const historySection = slicedHistory.length > 0
      ? "\n对话历史:\n" + slicedHistory.map(h => `${h.role === 'user' ? '学生' : '老师'}: ${h.text}`).join('\n') + "\n"
      : "";

    const guidelines = getPromptGuidelines(grade, socratic);
    const rawGrade = grade ? String(grade).split('_')[0] : '';
    let gradeStr = rawGrade ? (GRADE_ALIASES[rawGrade] ? GRADE_ALIASES[rawGrade][0] : `${rawGrade}年级`) : '未知年级';
    const subjectStr = subject || '未知学科';

    const contextSection = contextString
      ? `参考资料库内容：\n${contextString}\n\n`
      : `【注意：课本资料库中暂未搜索到强相关内容。请基于你的专业通识知识库解答。】\n\n`;

    const prompt = `你是一位耐心且专业的 AI 助教。请分析这张图片中的内容并回答学生的提问。
当前学生的学习状态：【${gradeStr}】【${subjectStr}】。请直接针对该年级和学科进行专属解答。

回复准则：
${guidelines}

${historySection}
${contextSection}学生提问：${query}

如果是题目，请在上述准则的基础上，给出详细的解题逻辑和最后答案；如果是课外内容，请基于资料库或常识进行温和引导。`;

    const contentsPayload = {
      contents: [{
        parts: [
          { inline_data: { mime_type: mimeType, data: base64Image } },
          { text: prompt }
        ]
      }],
      generationConfig: { temperature: 0.2, maxOutputTokens: 8192 }
    };

    // Stream response using shared SSE handler
    await streamChatToClient(contentsPayload, res, {
      query, grade, subject, sources,
      profile_id: profile_id || 'default',
      model
    });
  } catch (e) {
    logger.error('Vision Chat Error:', e);
    if (res.headersSent) return;
    if (e.message === 'QUOTA_EXHAUSTED' || e.message === 'EMBED_QUOTA_EXHAUSTED') {
      return res.status(429).json({ error: "今日额度已用完", details: "由于使用的是免费版 API，今日的 4000 次查询额度已耗尽。" });
    }
    res.status(500).json({ error: '服务器内部错误', details: NODE_ENV === 'development' ? e.message : undefined });
  }
});

module.exports = router;
