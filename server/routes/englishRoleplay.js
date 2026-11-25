const express = require('express');
const router = express.Router();
const logger = require('../services/logger');
const { fetchWithKeyRotation, buildChatURL } = require('../services/embedding');
const { extractClientAiHeaders } = require('../utils/aiHeaders');
const { extractAndParseJson } = require('../utils/jsonParser');
const { parseGradeNumber } = require('../utils/gradeParser');
const { requireQuotaOrVip } = require('../middleware/quota');

function getStageMeta(grade) {
  const num = parseGradeNumber(grade);
  if (num >= 10 && num <= 12) {
    return { stage: 'high', label: '高中新高考英语听说读写思辨标准', targetMinWords: 8 };
  }
  if (num >= 1 && num <= 6) {
    return { stage: 'primary', label: '小学英语启蒙交际标准', targetMinWords: 3 };
  }
  return { stage: 'middle', label: '初中中考英语听说标准', targetMinWords: 5 };
}

/**
 * 真实离线英文文法与语用诊断器（无 LLM Key 时诚实诊断，绝不对病句盲打 96 分）
 */
function diagnoseEnglishLocally(userText, scenarioTitle = '', grade = '7_up', history = []) {
  const text = String(userText || '').trim();
  const stageMeta = getStageMeta(grade);
  const words = text.match(/[A-Za-z]+(?:'[A-Za-z]+)?/g) || [];
  const wordCount = words.length;
  const issues = [];
  let deduction = 0;

  if (wordCount === 0) {
    return {
      reply: 'I did not catch any English words yet. Could you try expressing your idea in English?',
      replyCn: '我还没有收到有效的英文表达，请试着用英语说说你的想法吧！',
      score: 10,
      grammarIssues: ['未检测到有效英文词句，请输入英文表达。'],
      correctedText: '',
      feedback: '请使用完整英文句子作答。',
      isFallback: true
    };
  }

  // 1. 主谓一致检查（如 "I wants", "you goes", "they is", "he have"）
  if (/\b(i|you|we|they)\s+(wants|likes|goes|has|needs|thinks|makes|takes|is)\b/i.test(text)) {
    const m = text.match(/\b(i|you|we|they)\s+(wants|likes|goes|has|needs|thinks|makes|takes|is)\b/i);
    issues.push(`主谓一致错误：“${m[0]}” 中第一/二人称或复数主语后不应加第三人称单数动词后缀。`);
    deduction += 18;
  }
  if (/\b(he|she|it)\s+(want|like|go|have|need|are|were)\b/i.test(text)) {
    const m = text.match(/\b(he|she|it)\s+(want|like|go|have|need|are|were)\b/i);
    issues.push(`主谓一致错误：“${m[0]}” 中第三人称单数主语需配三单动词形式。`);
    deduction += 18;
  }

  // 2. 时态冲突检查（出现 yesterday / last week / ago 但仍用一般现在时动词）
  if (/\b(yesterday|last\s+(night|week|month|year)|ago)\b/i.test(text) &&
      /\b(want|wants|go|goes|buy|buys|see|sees|is|am|are|have|has|borrow|borrows)\b/i.test(text)) {
    issues.push('时态不一致：句中出现了过去时间状语（如 yesterday / last ...），谓语动词应使用一般过去时（如 wanted / went / borrowed）。');
    deduction += 18;
  }

  // 3. 可数单数名词漏冠词检查（如 "wants book", "read book", "borrow book"）
  if (/\b(want|wants|wanted|buy|bought|borrow|borrowed|read|need|have|has)\s+(book|pen|apple|ticket|room|library|teacher|question)\b/i.test(text)) {
    const m = text.match(/\b(want|wants|wanted|buy|bought|borrow|borrowed|read|need|have|has)\s+(book|pen|apple|ticket|room|library|teacher|question)\b/i);
    issues.push(`冠词缺失：“${m[0]}” 中的单数可数名词前缺少冠词（应为 a/an/the ${m[2]} 或复数形式）。`);
    deduction += 12;
  }

  // 4. 表达长度与学段匹配度
  if (wordCount < stageMeta.targetMinWords) {
    issues.push(`表达较短（仅 ${wordCount} 词，当前【${stageMeta.label}】建议至少 ${stageMeta.targetMinWords} 词以上），建议补充原因或细节。`);
    deduction += 14;
  }

  // 5. 基本句末标点与首字母
  if (/^[a-z]/.test(text)) {
    issues.push('句首首字母建议大写以保持规范书写。');
    deduction += 4;
  }

  // 生成纠错建议版本
  let corrected = text
    .replace(/\bI\s+wants\b/gi, 'I wanted')
    .replace(/\b(want|wants|wanted)\s+book\b/gi, (_, v) => `${v} a book`)
    .replace(/\bbook of\b/gi, 'book on');
  if (/^[a-z]/.test(corrected)) {
    corrected = corrected.charAt(0).toUpperCase() + corrected.slice(1);
  }
  if (!/[.!?]$/.test(corrected)) corrected += '.';

  const baseScore = wordCount >= stageMeta.targetMinWords + 4 ? 88 : (wordCount >= stageMeta.targetMinWords ? 82 : 70);
  const finalScore = Math.max(25, Math.min(95, baseScore - deduction));

  let reply = '';
  let replyCn = '';
  if (issues.length > 0) {
    reply = `Thanks for sharing! Notice a small grammar point: you could say "${corrected}" instead. Could you expand on why this topic matters to you?`;
    replyCn = `感谢表达！注意一处语法细节：更地道的说法是 "${corrected}"。你能继续补充说明一下原因吗？`;
  } else if (stageMeta.stage === 'high') {
    reply = `Well articulated! Your argument is clear. From a broader perspective in "${scenarioTitle || 'this topic'}", what potential counterargument or challenge should we also consider?`;
    replyCn = `表达很清晰！站在更高思辨视角，关于“${scenarioTitle || '这个话题'}”，你认为还需要考虑哪些反面观点或挑战？`;
  } else {
    reply = `Good job! Your sentence is clear and natural. Can you tell me one more detail about what you plan to do next?`;
    replyCn = `说得很自然！你能再补充一个细节，说说你接下来打算做什么吗？`;
  }

  const feedback = issues.length > 0
    ? `本次为本地基础语法核验（${stageMeta.label}）：发现 ${issues.length} 处改进点——${issues.join(' ')}`
    : `本次为本地基础语法核验（${stageMeta.label}）：句子主谓与时态无明显硬伤，可尝试引入从句或过渡词进一步提升。`;

  return {
    reply,
    replyCn,
    score: finalScore,
    grammarIssues: issues,
    correctedText: issues.length > 0 ? corrected : '',
    feedback,
    isFallback: true,
    fallbackNotice: '当前未配置可用 AI 大模型密钥，正在使用本地基础英文语法核验引擎（配置有效 AI Key 后可开启真实外教深度对话与逐词纠音）。'
  };
}

/**
 * POST /api/english/roleplay
 * 1-12 年级全学段真实 AI 英语情景对练与语法精准诊断接口
 */
router.post('/english/roleplay', requireQuotaOrVip('english_roleplay'), async (req, res) => {
  try {
    const {
      user_text,
      scenario_title = 'Free Talk',
      scenario_role = 'English Tutor',
      grade = '7_up',
      history = []
    } = req.body || {};

    if (!user_text || typeof user_text !== 'string' || !user_text.trim()) {
      return res.status(400).json({ error: '请输入英文回复内容' });
    }

    const cleanUserText = user_text.trim().slice(0, 1000);
    const stageMeta = getStageMeta(grade);
    const profileId = req.auth?.activeProfileId || 'default';

    const recentHistory = Array.isArray(history)
      ? history.slice(-6).map(h => `${h.role === 'user' ? 'Student' : 'Partner'}: ${String(h.text || '').slice(0, 200)}`).join('\n')
      : '';

    const prompt = `You are an encouraging yet rigorous English speaking examiner & roleplay partner (${scenario_role}) in the scenario "${scenario_title}".
Target Curriculum Standard: ${stageMeta.label} (Grade code: ${grade}).

Recent Dialogue:
${recentHistory || '(First turn)'}
Student just said: "${cleanUserText}"

CRITICAL GRADING RULES:
1. Honestly inspect grammar (subject-verb agreement, tense consistency, articles, prepositions, collocations) and relevance.
2. NEVER give a high score (e.g. 90+) if the student's sentence has obvious grammar mistakes like "I wants book ... yesterday"! Penalize real errors fairly (e.g., 45-70 for broken grammar).
3. Respond naturally in character to keep the conversation going, matching the student's grade level.

Return STRICT JSON only (no markdown fences):
{
  "reply": "Your natural English reply in character (1-3 sentences)",
  "replyCn": "Accurate Chinese translation of your reply",
  "score": 75,
  "grammarIssues": ["Specific grammar or collocation issue in Chinese, empty array if none"],
  "correctedText": "Natural corrected version of the student's sentence (empty string if already flawless)",
  "feedback": "Concise Chinese evaluation explaining the score and how to improve for ${stageMeta.label}"
}`;

    try {
      const response = await fetchWithKeyRotation(buildChatURL, {
        method: 'POST',
        profileId,
        headers: {
          'Content-Type': 'application/json',
          ...extractClientAiHeaders(req)
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.4,
            maxOutputTokens: 1024,
            responseMimeType: 'application/json'
          }
        })
      }, 3, 25000);

      if (!response.ok) throw new Error(`Upstream status ${response.status}`);
      const data = await response.json();
      const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
      const parsed = extractAndParseJson(rawText);
      if (!parsed || typeof parsed.reply !== 'string') {
        throw new Error('Malformed JSON from English roleplay LLM');
      }

      return res.json({
        success: true,
        engine: 'llm-roleplay',
        isFallback: false,
        data: {
          reply: parsed.reply,
          replyCn: parsed.replyCn || '',
          score: Math.max(0, Math.min(100, Math.round(Number(parsed.score) || 70))),
          grammarIssues: Array.isArray(parsed.grammarIssues) ? parsed.grammarIssues : [],
          correctedText: parsed.correctedText || '',
          feedback: parsed.feedback || '已完成真实 AI 语法与语用评估。'
        }
      });
    } catch (llmErr) {
      logger.warn(`[EnglishRoleplay] LLM unavailable (${llmErr.message}), using strict local grammar diagnostics.`);
      const localResult = diagnoseEnglishLocally(cleanUserText, scenario_title, grade, history);
      return res.json({
        success: true,
        engine: 'local-grammar-fallback',
        isFallback: true,
        fallbackNotice: localResult.fallbackNotice,
        data: localResult
      });
    }
  } catch (err) {
    logger.error('[EnglishRoleplay] Error:', err);
    res.status(500).json({ error: '英语情景对练评估失败，请稍后重试' });
  }
});

module.exports = {
  router,
  diagnoseEnglishLocally
};
