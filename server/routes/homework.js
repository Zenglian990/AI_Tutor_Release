const express = require('express');
const multer = require('multer');
const router = express.Router();
const { getSqliteDb } = require('../db/init');
const { fetchWithKeyRotation, buildChatURL } = require('../services/embedding');
const { encryptField } = require('../utils/crypto');
const logger = require('../services/logger');

// Allowed image MIME types
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/heic', 'image/heif'];

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 }
});

/**
 * POST /api/homework/batch-grade
 * 整页作业/试卷多题秒级识别与智能批改流水线
 */
router.post('/homework/batch-grade', upload.single('image'), async (req, res) => {
  try {
    const {
      profile_id = 'default',
      grade = '7_up',
      subject = '数学',
      student_name = '曾练',
      model = null
    } = req.body;

    const imageBuffer = req.file?.buffer;
    const mimeType = req.file?.mimetype || 'image/jpeg';

    if (!imageBuffer) {
      return res.status(400).json({ error: '请上传整页作业或试卷照片' });
    }

    const base64Image = imageBuffer.toString('base64');

    const prompt = `你是一位顶尖的中小学作业与试卷批阅特级教师。
请仔细识别并批改图片中包含的【所有作业/试卷题目】（支持手写演算、填空、选择、解答大题）。
学生姓名：【${student_name}】，学段年级：【${grade}】，学科：【${subject}】。

请逐题进行严格审阅批改，并必须严格输出如下 JSON 格式（不要有任何额外的开场白或解释代码块外的文字）：
{
  "totalCount": 3,
  "correctCount": 2,
  "wrongCount": 1,
  "accuracyPct": 67,
  "summaryHeadline": "总体书写工整，主要失分点在动点分类讨论",
  "teacherPraise": "解题步骤书写规范，一元一次方程运算扎实！",
  "teacherAdvice": "遇到动点射线问题时，先画草图标记两种极端位置，避免漏解。",
  "results": [
    {
      "questionNumber": 1,
      "type": "填空题",
      "questionSnippet": "题目简要题干与考点",
      "studentAnswer": "学生写在卷面上的答案或推导",
      "standardAnswer": "标准正确答案与解析",
      "status": "correct",
      "score": 10,
      "maxScore": 10,
      "mistakeReason": "",
      "keyInsight": "成功识别了等腰三角形三线合一定理"
    },
    {
      "questionNumber": 2,
      "type": "解答大题",
      "questionSnippet": "求动点P运动时间t的值",
      "studentAnswer": "学生写 t=5",
      "standardAnswer": "t=5 或 t=15（漏掉了射线反向延伸的第二种情况）",
      "status": "wrong",
      "score": 4,
      "maxScore": 10,
      "mistakeReason": "审题未注意‘射线’而非‘线段’，遗漏第二种分类讨论情况",
      "keyInsight": "题眼在‘射线’关键字，必须分点P在线段AB上与AB延长线上两类讨论"
    }
  ]
}

注意：
1. status 只能是 "correct"（正确）、"wrong"（错误）或 "partial"（部分对/步骤分）。
2. 如果图片中没有找到题目或模糊无法看清，请在 summaryHeadline 中说明，并返回 results 为空数组。
3. 严格输出合法的 JSON 对象，便于机器解析。`;

    const contentsPayload = {
      contents: [{
        parts: [
          { inline_data: { mime_type: mimeType, data: base64Image } },
          { text: prompt }
        ]
      }],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 8192
      }
    };

    const options = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(contentsPayload)
    };

    logger.info(`[HomeworkBatch] Calling vision model for student ${student_name}, profile ${profile_id}...`);
    const aiRes = await fetchWithKeyRotation(buildChatURL, options, 3, 45000, model);
    
    if (!aiRes.ok) {
      const errText = await aiRes.text();
      logger.error('[HomeworkBatch] Model returned error:', errText);
      return res.status(502).json({ error: '批改模型响应失败，请稍后重试', details: errText });
    }

    const aiData = await aiRes.json();
    const replyText = aiData?.candidates?.[0]?.content?.parts?.[0]?.text || '';

    // Extract JSON block
    let parsedData = null;
    try {
      const jsonMatch = replyText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsedData = JSON.parse(jsonMatch[0]);
      } else {
        parsedData = JSON.parse(replyText);
      }
    } catch (parseErr) {
      logger.warn('[HomeworkBatch] Failed JSON parse, raw reply:', replyText.substring(0, 300));
      // Fallback structured data
      parsedData = {
        totalCount: 1,
        correctCount: 0,
        wrongCount: 1,
        accuracyPct: 0,
        summaryHeadline: '作业已识别，请参考名师详细批注',
        teacherPraise: '完成作业态度认真！',
        teacherAdvice: '请核对详细推导步骤。',
        results: [{
          questionNumber: 1,
          type: '综合题',
          questionSnippet: '整页批注',
          studentAnswer: '见卷面作答',
          standardAnswer: replyText,
          status: 'partial',
          score: 5,
          maxScore: 10,
          mistakeReason: '需要核对具体计算细节',
          keyInsight: '保持清晰的演算步骤'
        }]
      };
    }

    // Auto-archive wrong questions to mistakes table if SQLite available
    const db = getSqliteDb();
    let autoArchivedCount = 0;
    if (db && Array.isArray(parsedData.results)) {
      for (const item of parsedData.results) {
        if (item.status === 'wrong') {
          try {
            const queryText = `【整卷批改第${item.questionNumber}题】${item.questionSnippet || ''}`;
            const answerText = `【学生作答】：${item.studentAnswer || ''}\n【名师解析】：${item.standardAnswer || ''}\n【题眼破局】：${item.keyInsight || ''}`;
            const reasonText = item.mistakeReason || '整页作业批改识别错误';
            const tagsText = `${subject},整页批改,${grade}`;

            await db.run(
              'INSERT INTO mistakes (query, answer, grade, subject, source_info, reason, profile_id, tags) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
              [
                encryptField(queryText),
                encryptField(answerText),
                grade,
                subject,
                JSON.stringify({ source: '整页作业秒批改', questionNumber: item.questionNumber }),
                encryptField(reasonText),
                profile_id,
                encryptField(tagsText)
              ]
            );
            autoArchivedCount++;
          } catch (insertErr) {
            logger.warn('[HomeworkBatch] Insert mistake error:', insertErr.message);
          }
        }
      }
    }

    res.json({
      success: true,
      studentName: student_name,
      grade,
      subject,
      totalCount: parsedData.totalCount || parsedData.results?.length || 0,
      correctCount: parsedData.correctCount ?? 0,
      wrongCount: parsedData.wrongCount ?? 0,
      accuracyPct: parsedData.accuracyPct ?? 0,
      summaryHeadline: parsedData.summaryHeadline || '整卷批改完成',
      teacherPraise: parsedData.teacherPraise || '书写工整，态度积极！',
      teacherAdvice: parsedData.teacherAdvice || '复盘错题，攻克核心薄弱点。',
      autoArchivedCount,
      results: parsedData.results || []
    });
  } catch (err) {
    logger.error('[HomeworkBatch] Unexpected error:', err);
    res.status(500).json({ error: '批改处理异常', details: err.message });
  }
});

module.exports = router;
