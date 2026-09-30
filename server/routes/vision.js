const express = require('express');
const multer = require('multer');
const router = express.Router();
const { checkSafetyAndRedirect } = require('../trie');
const { streamChatToClient } = require('../services/stream');
const { getPromptGuidelines, GRADE_ALIASES, correctPageOffset } = require('../prompts/guidelines');
const { performHybridSearch } = require('../services/search');
const { getStudentCognitiveMemory, formatStudentMemoryForPrompt } = require('../services/studentMemory');
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
    const student_name = req.body.student_name;
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

    // Security Audit Log (Medium Risk: Unmoderated image content)
    logger.warn(`[Security Audit] User ${profile_id} uploaded an image for vision processing. Note: Image content is currently NOT scanned by a content moderation API. Monitor for inappropriate content.`);

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

    let studentMemoryStr = '';
    try {
      const memory = await getStudentCognitiveMemory(profile_id, grade, subject, student_name);
      studentMemoryStr = formatStudentMemoryForPrompt(memory);
    } catch (memErr) {
      logger.warn('[Vision] Could not load student memory:', memErr.message);
    }
    const memorySection = studentMemoryStr ? `\n${studentMemoryStr}\n` : '';

    const isPrimaryLower = ['1', '2', '3'].some(n => String(grade || '').startsWith(n));
    let stageVisionGuideline = '';
    if (isPrimaryLower) {
      stageVisionGuideline = `
【小学低段（1-3年级）认知适格关键约束（极重要）】：
- 面对 7-9 岁低年级儿童：语言必须极度通俗、亲切活泼、篇幅简明，严禁长篇大论或高年级生涩术语（如“拓扑要素、判别式、反比例”等）！
- 📝【第一步：原题精确还原】：用简练清晰的文字抄出原题与数字。
- 💡【第二步：生活趣味小故事】：把枯燥数字转化为孩子熟悉喜爱的生活故事（如分苹果、分糖果、魔法小积木、小动物排队）。
- ✍️【第三步：草稿纸第一步·动笔支架】：引导孩子在草稿纸上画圈圈、摆小木棍数一数。
- 📐【第四步：完整推导演算与标准答案】：用两到三句口语化讲清算式与步骤，给出标准答案。
- 🔄【第五步：举一反三·变式母题（微练过关）】：出一道同类型的趣味闯关小练习，让孩子自我闯关。
- 整体多用活泼 Emoji（🍎🎈🌟✏️），语气温柔鼓励。`;
    } else {
      stageVisionGuideline = `
【中高年级/初中攻坚阶段准则】：
- 逻辑严谨规范，严格使用 LaTeX 格式书写所有推导，几何图形明确辅助线与定理名称。
- 突出中考核心题眼突破口、草稿纸第一步动笔支架、严密分步证明与举一反三变式母题。`;
    }

    const prompt = `你是一位富有智慧与温度的 AI 专属特级名师私教（对标作业帮/小猿搜题高精度拍题解析）。
当前辅导对象：【${gradeStr}】【${subjectStr}】学生（姓名：${student_name || '同学'}）。
${memorySection}
【视觉拍照解析强制准则（极重要，严格执行）】：
${stageVisionGuideline}

1. 📝【第一步：原题精确还原（绝对必须首先输出）】：
   - 你必须首先完整转录图片中的题目题干、已知条件与待求问题。
   - 所有数学公式、物理量、化学方程式、上下标必须严格使用标准 LaTeX 格式（行内公式用 \\(...\\)，独立公式用 \\[...\\]）。
   - 若画面包含几何图形、函数图象或实验装置，必须用文字精确注明图形要素（如：“图中有直角三角形 ABC，其中 ∠C=90°，AB=5，D 为 BC 中点”）。
   - 【关键约束】：只有先完整准确地输出原题转录，才能消除视觉感知幻觉，严禁在未完整抄写原题前直接给答案！
2. 💡【第二步：名师题眼与考点破局】：
   - 一句话点破出题人的题眼套路、核心考点（如勾股定理逆定理、一元二次方程根的判别式等）与解题突破口。
3. ✍️【第三步：草稿纸第一步·动笔支架】：
   - 启发引导学生在草稿纸上如何动第一笔（如先连哪条辅助线、先设哪个未知数），降低动笔门槛。
4. 📐【第四步：完整推导演算与标准答案】：
   - 严格以第一步转录的原题为准，给出规范详尽的解题步骤、逻辑推导和明确的最终答案。
5. 🔄【第五步：举一反三·变式母题（微练过关）】：
   - 针对本题的核心模型，出一道相似但改变数值或条件的小变式题，附上简明答案或提示，供学生趁热打铁自我检验。

回复教学指引准则：
${guidelines}

${historySection}
${contextSection}学生随附提问/诉求：${query}

请按照上述五步规范，为学生提供兼具专业度、亲和力与启发性的特级教师图文精讲！`;

    const contentsPayload = {
      contents: [{
        parts: [
          { inline_data: { mime_type: mimeType, data: base64Image } },
          { text: prompt }
        ]
      }],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 8192,
        thinkingConfig: { thinkingBudget: 0 }
      }
    };

    // Stream response using shared SSE handler
    await streamChatToClient(contentsPayload, res, {
      query, grade, subject, sources,
      profile_id: profile_id || 'default',
      model: model || 'gemini-3.6-flash'
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

// POST /api/vision/detect-questions
// 对标小猿搜题：整页拍图自动分题与多题目外接框快速检测
router.post('/detect-questions', upload.single('image'), async (req, res) => {
  try {
    const imageBuffer = req.file?.buffer;
    const mimeType = req.file?.mimetype || 'image/jpeg';
    if (!imageBuffer) {
      return res.status(400).json({ error: '请上传需要分题检测的整页照片' });
    }

    const { fetchWithKeyRotation, buildChatURL } = require('../services/embedding');
    const { extractAndParseJson } = require('../utils/jsonParser');

    const base64Image = imageBuffer.toString('base64');

    const prompt = `你是一位专业的教育视觉版面分析专家（对标小猿搜题/作业帮多题自动框选系统）。
请仔细观察这张试卷或作业整页图片，识别出画面中出现的所有独立题目（如第1题、第2题、第3题...或者各个大题、小题）。
针对每一道题目，估算其在整张图片中的归一化矩形包围框（Bounding Box），坐标范围均为 0.0 到 1.0 之间：
- x: 题目左上角横坐标 (0.0 表示最左侧，1.0 表示最右侧)
- y: 题目左上角纵坐标 (0.0 表示最顶部，1.0 表示最底部)
- width: 题目的宽度 (0.0 到 1.0)
- height: 题目的高度 (0.0 到 1.0)

【严格输出纯 JSON 格式，绝不允许带有任何额外开场白】：
{
  "total_questions": 2,
  "question_boxes": [
    {
      "id": 1,
      "title": "第 1 题",
      "snippet": "题目开头简述（15字以内）",
      "box": { "x": 0.05, "y": 0.06, "width": 0.90, "height": 0.22 }
    }
  ]
}`;

    const contentsPayload = {
      contents: [{
        parts: [
          { inline_data: { mime_type: mimeType, data: base64Image } },
          { text: prompt }
        ]
      }],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 1024,
        thinkingConfig: { thinkingBudget: 0 }
      }
    };

    const response = await fetchWithKeyRotation(buildChatURL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(contentsPayload)
    }, 2, 30000, 'gemini-2.5-flash', true);

    const data = await response.json();
    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    const parsed = extractAndParseJson(rawText);

    if (parsed && Array.isArray(parsed.question_boxes) && parsed.question_boxes.length > 0) {
      // 坐标范围合法性消毒 (确保 0 <= val <= 1)
      const sanitizedBoxes = parsed.question_boxes.map((q, idx) => {
        const b = q.box || {};
        let x = Math.max(0, Math.min(1, Number(b.x) || 0.05));
        let y = Math.max(0, Math.min(1, Number(b.y) || 0.05));
        let w = Math.max(0.05, Math.min(1 - x, Number(b.width) || 0.9));
        let h = Math.max(0.05, Math.min(1 - y, Number(b.height) || 0.2));
        return {
          id: q.id || (idx + 1),
          title: q.title || `第 ${idx + 1} 题`,
          snippet: q.snippet || '题目内容',
          box: { x, y, width: w, height: h }
        };
      });

      return res.json({
        success: true,
        question_boxes: sanitizedBoxes
      });
    }

    // 默认兜底：若未识别出多题，返回一个居中的标准选框
    return res.json({
      success: true,
      question_boxes: [
        {
          id: 1,
          title: "整题选区",
          snippet: "单题聚焦",
          box: { x: 0.05, y: 0.08, width: 0.9, height: 0.84 }
        }
      ]
    });
  } catch (err) {
    logger.error('Detect questions error:', err);
    res.status(500).json({ error: '自动分题识别失败，请使用手动框选' });
  }
});

module.exports = router;
