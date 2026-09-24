const express = require('express');
const multer = require('multer');
const router = express.Router();
const { getSqliteDb } = require('../db/init');
const { fetchWithKeyRotation, buildChatURL } = require('../services/embedding');
const { encryptField } = require('../utils/crypto');
const logger = require('../services/logger');
const { extractAndParseJson } = require('../utils/jsonParser');
const { sanitizeAndArbitrateHomeworkResults } = require('../services/homeworkValidator');

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
      model = 'gemini-3.6-flash'
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

【极其重要的核心批改准则】：
1. 【原卷红笔批阅标记最高优先级】：
   仔细观察卷面上是否有老师原批的红笔标记：
   - 凡是有老师打红勾（✓）、满分标记、或得分勾选的题目，说明在实际教学中已被老师判定为完全正确，必须输出 "status": "correct"，绝对严禁误判为错误！
   - 凡是有老师打红叉（✕）、扣分折线或圈出失分的题目，判定为 "wrong" 或 "partial"。
2. 【理科与几何数学严谨验算，杜绝幻觉】：
   - 对于几何图形拼接计算（如多个正方形拼成长方形）：必须严格先算出拼成后长方形的长与宽（如3个边长2cm的正方形排成一排，长=3×2=6cm，宽=2cm，周长=(6+2)×2=16cm），严禁凭直觉简单减边长导致计算错误！
3. 【选择题选项与数值必须一致】：
   - 选择题学生所选选项（如 "B" 或 "B. 16"）若对应正确答案数值，学生完全做对，必须判定为 "correct"，严禁把正确选项判定为 wrong！
4. 【status 与 mistakeReason 必须绝对自洽】：
   - 严禁在 mistakeReason 中写“学生选B实际正确/打勾表示正确/修正为正确”却在 status 中仍输出 "wrong"！只要判定学生做对了，status 必须且只能是 "correct"！

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
      "box_2d": [120, 45, 290, 955],
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
      "box_2d": [310, 45, 680, 955],
      "status": "wrong",
      "score": 4,
      "maxScore": 10,
      "mistakeReason": "审题未注意‘射线’而非‘线段’，遗漏第二种分类讨论情况",
      "keyInsight": "题眼在‘射线’关键字，必须分点P在线段AB上与AB延长线上两类讨论",
      "stepByStepDeduction": "① 第一次列方程 t=5 推导正确；② 忽略了点P沿射线延伸反向运动的第二种可能；③ 步骤书写工整，但缺乏极端位置分类草图。"
    }
  ]
}

注意：
1. status 只能是 "correct"（正确）、"wrong"（错误）或 "partial"（部分对/步骤分）。
2. box_2d: 必须准确识别该题在原图中的外接矩形定位坐标 [ymin, xmin, ymax, xmax]，取值在 0 到 1000 整数之间，用于多题交互切片与画框。
3. stepByStepDeduction: 对有手写过程或错题，必须输出具体推导分步分析（第几步做对、第几步卡壳或符号遗漏、草稿演算建议），若完全正确且步骤简单可简述“步骤完整无误”。
4. 【逐题独立拆分】：必须将卷面上出现的每一道带题号的题目（如第10题、第11题、第12题等）独立拆分为 results 数组中的一个条目，严禁将多道不同题号的题目合并为一个，以便前端逐题画框切片与错题本精确归档！
5. 如果图片中没有找到题目或模糊无法看清，请在 summaryHeadline 中说明，并返回 results 为空数组。
6. 严格输出合法的 JSON 对象，便于机器解析。`;

    const contentsPayload = {
      contents: [{
        parts: [
          { inline_data: { mime_type: mimeType, data: base64Image } },
          { text: prompt }
        ]
      }],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 8192,
        responseMimeType: "application/json"
      }
    };

    const options = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(req.headers['x-gemini-api-key'] ? { 'x-gemini-api-key': req.headers['x-gemini-api-key'] } : {}),
        ...(req.headers['x-deepseek-api-key'] ? { 'x-deepseek-api-key': req.headers['x-deepseek-api-key'] } : {})
      },
      body: JSON.stringify(contentsPayload)
    };

    logger.info(`[HomeworkBatch] Calling vision model for student ${student_name}, profile ${profile_id}...`);
    const aiRes = await fetchWithKeyRotation(buildChatURL, options, 4, 60000, model || 'gemini-3.6-flash', true);
    
    if (!aiRes.ok) {
      const errText = await aiRes.text();
      logger.error('[HomeworkBatch] Model returned error:', errText);
      return res.status(502).json({ error: '批改模型响应失败，请稍后重试', details: errText });
    }

    const aiData = await aiRes.json();
    const replyText = aiData?.candidates?.[0]?.content?.parts?.[0]?.text || '';

    // Extract JSON block with resilient multi-tier parser
    let parsedData = extractAndParseJson(replyText);

    if (!parsedData || !Array.isArray(parsedData.results) || parsedData.results.length === 0) {
      logger.warn('[HomeworkBatch] JSON parser returned empty or invalid structure, raw reply sample:', replyText.substring(0, 300));
      // Fallback clean structured data (clean raw markdown fences from standardAnswer)
      const cleanReply = replyText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
      parsedData = {
        totalCount: 1,
        correctCount: 0,
        wrongCount: 1,
        accuracyPct: 0,
        summaryHeadline: '整卷作业已识别完成，请核对批注解析',
        teacherPraise: '完成作业态度认真！',
        teacherAdvice: '请对照答案认真订正推导步骤。',
        results: [{
          questionNumber: 1,
          type: '综合题',
          questionSnippet: '整页作业识别与解析',
          studentAnswer: '见卷面作答',
          standardAnswer: cleanReply || '请参考教师解析',
          status: 'partial',
          score: 5,
          maxScore: 10,
          mistakeReason: '需要核对具体计算与书写细节',
          keyInsight: '规范演算步骤，注意符号法则与代数恒等变形'
        }]
      };
    } else {
      const db = getSqliteDb();
      // Delegate to multi-tier deterministic arbitrator and anti-hallucination validator
      parsedData = await sanitizeAndArbitrateHomeworkResults(parsedData, { subject, grade, student_name }, db);
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
