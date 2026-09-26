const express = require('express');
const router = express.Router();
const { checkSafetyAndRedirect } = require('../trie');
const { streamChatToClient } = require('../services/stream');
const { getChatPrompt, getChapterStartPrompt, correctPageOffset } = require('../prompts/guidelines');
const { performHybridSearch } = require('../services/search');
const { getStudentCognitiveMemory, formatStudentMemoryForPrompt } = require('../services/studentMemory');
const { diagnosePrerequisiteKnowledge, formatGraphRAGPromptSection } = require('../services/knowledgeGraph');
const { NODE_ENV, RAG_TOP_K } = require('../config');
const logger = require('../services/logger');
const jev = require('../services/jevDecisionService');

// POST /api/chat — main chat endpoint with SSE streaming
router.post('/chat', async (req, res) => {
  try {
    const { query, grade, subject, history, profile_id, socratic, edition, model, student_name } = req.body;
    if (!query) return res.status(400).json({ error: "Query is required", code: "ERR_VALIDATION" });
    if (query.length > 2000) return res.status(400).json({ error: "Query is too long (max 2000 characters)", code: "ERR_VALIDATION" });

    // Trie Safety Check
    const safetyRedirect = checkSafetyAndRedirect(query);
    if (safetyRedirect) {
      logger.info(`[Safety Check] Query blocked: "${query}"`);
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders();
      res.write(`data: ${JSON.stringify({ sources: [] })}\n\n`);
      res.write(`data: ${JSON.stringify({ text: safetyRedirect })}\n\n`);
      res.write('data: [DONE]\n\n');
      return res.end();
    }

    // Context-aware query expansion for conversational greetings & short follow-ups
    const cleanQuery = (query || '').trim();
    const isGreeting = /^(你好|您好|哈喽|hello|hi|在吗|在么|早上好|中午好|晚上好|老师好)[\s!！?？~～]*$/i.test(cleanQuery);
    const isShortFollowUp = cleanQuery.length <= 4 && /^(好的|对|不对|是的|不是|不懂|不会|为什么|然后呢|下一步|算完了|做完了)$/.test(cleanQuery);

    let searchQuery = query;
    if ((isGreeting || isShortFollowUp) && Array.isArray(history) && history.length > 0) {
      for (let i = history.length - 1; i >= 0; i--) {
        const hMsg = history[i];
        if (hMsg && hMsg.role === 'user' && hMsg.text && hMsg.text.trim().length > 5) {
          searchQuery = hMsg.text.trim();
          break;
        }
      }
    }

    let results = [];
    let isQuotaExhausted = false;
    let memory = null;
    let studentMemoryStr = '';
    let graphRAGStr = '';

    // Parallelize RAG Search and Student Cognitive Memory Retrieval
    const searchPromise = (async () => {
      if (isGreeting) return []; // Greeting skips heavy RAG search for instant response
      try {
        return await performHybridSearch(searchQuery, grade, subject, RAG_TOP_K, edition);
      } catch (err) {
        logger.error("[RAG Error] Hybrid search failed:", err);
        if (err.message === 'EMBED_QUOTA_EXHAUSTED' || err.message === 'QUOTA_EXHAUSTED' || (err.message && err.message.includes('Quota exceeded'))) {
          isQuotaExhausted = true;
          if (err.partialResults && Array.isArray(err.partialResults)) {
            return err.partialResults;
          }
        }
        return [];
      }
    })();

    const memoryPromise = (async () => {
      try {
        const mem = await getStudentCognitiveMemory(profile_id, grade, subject, student_name);
        const memStr = formatStudentMemoryForPrompt(mem);
        let gStr = '';
        const diagnosis = diagnosePrerequisiteKnowledge(query, subject, mem?.recentWeakPoints);
        if (diagnosis) {
          gStr = formatGraphRAGPromptSection(diagnosis);
        }
        return { mem, memStr, gStr };
      } catch (memErr) {
        logger.warn('[Chat] Could not load student memory or GraphRAG:', memErr.message);
        return { mem: null, memStr: '', gStr: '' };
      }
    })();

    const [searchResults, memoryResult] = await Promise.all([searchPromise, memoryPromise]);
    results = searchResults || [];
    memory = memoryResult?.mem || null;
    studentMemoryStr = memoryResult?.memStr || '';
    graphRAGStr = memoryResult?.gStr || '';

    // Apply page offset correction and filename cleanup
    const correctedResults = results.map(r => {
      const { source, page } = correctPageOffset(r.source, r.page);
      return {
        ...r,
        source,
        page
      };
    });

    const sources = correctedResults.map(r => ({
      source: r.source,
      page: r.page || '未知',
      text_snippet: r.text ? (r.text.length > 100 ? r.text.substring(0, 100) + "..." : r.text) : "无文本"
    }));

    if (isQuotaExhausted) {
      sources.push({
        source: "系统提示",
        page: 0,
        text_snippet: "⚠️ 警告：AI 教材关联服务（Embedding）额度已耗尽，当前回答将无法结合教材内容，仅使用 AI 本地知识库解答。"
      });
    } else if (sources.length === 0 && !isGreeting) {
      sources.push({
        source: "系统提示",
        page: 0,
        text_snippet: "⚠️ 提示：未能在本地教材库中找到相关内容（数据库为空或无匹配），当前回答基于 AI 通识知识库。"
      });
    }

    const slicedHistory = Array.isArray(history) ? history.slice(-10) : [];
    const fullContextMemory = `${studentMemoryStr}${graphRAGStr}`;

    // ── Jev Decision Layer ──────────────────────────────────────────
    // Fast (~70ms) structured decisions before hitting the LLM
    let jevDecision = null;
    let jevRetrievalEval = null;
    let jevStrategy = null;

    if (jev.isEnabled() && !isGreeting && !isShortFollowUp) {
      try {
        // 1) Route: classify question intent
        jevDecision = await jev.routeQuestion(query, grade, subject);
        logger.info(`[Jev Route] ${query.slice(0, 30)}... → ${jevDecision.route} (confidence: ${jevDecision.confidence})`);

        // Off-topic interception — politely refuse non-educational queries
        if (jevDecision.route === 'off_topic' && jevDecision.confidence >= 0.85) {
          logger.info(`[Jev] Off-topic interception for: "${query.slice(0, 50)}"`);
          res.setHeader('Content-Type', 'text/event-stream');
          res.setHeader('Cache-Control', 'no-cache');
          res.setHeader('Connection', 'keep-alive');
          res.flushHeaders();
          res.write(`data: ${JSON.stringify({ sources: [] })}\n\n`);
          res.write(`data: ${JSON.stringify({ text: '😊 这个问题好像不属于我们的课堂范围哦～我是你的专属学科辅导老师，咱们还是聊聊学习上的问题吧！有什么不懂的题目尽管问我～' })}\n\n`);
          res.write('data: [DONE]\n\n');
          return res.end();
        }

        // 2) Evaluate RAG retrieval quality (only if we have results)
        if (correctedResults.length > 0) {
          jevRetrievalEval = await jev.evaluateRetrievalQuality(query, correctedResults);
          logger.info(`[Jev RAG Eval] relevant=${jevRetrievalEval.isRelevant}, sufficient=${jevRetrievalEval.isSufficient}`);
        }

        // 3) Select teaching strategy based on grade + student memory
        const memoryForJev = {
          recentAccuracy: memory?.topWeakTags?.length > 0 ? 'has_weak_points' : 'unknown',
          consecutiveErrors: memory?.totalMistakes || 0,
          weakPoints: memory?.recentWeakPoints?.join('、') || 'none'
        };
        jevStrategy = await jev.selectTeachingStrategy(grade, jevDecision.route, memoryForJev);
        logger.info(`[Jev Strategy] strategy=${jevStrategy.strategy}, hintLevel=${jevStrategy.hintLevel}`);

      } catch (jevErr) {
        logger.warn('[Jev] Decision layer error (falling back to default flow):', jevErr.message);
        // Graceful degradation: continue with original flow
      }
    }

    // Build Jev context enrichment for prompt
    let jevContextStr = '';
    if (jevDecision && !jevDecision.fallback) {
      jevContextStr += `\n【Jev 智能决策参考（本段信息用于指导你的回答策略，不要对学生提及）】：\n`;
      jevContextStr += `- 问题类型路由：${jevDecision.route}（置信度：${(jevDecision.confidence * 100).toFixed(0)}%）\n`;
      jevContextStr += `- 估算难度：${jevDecision.difficulty}/10\n`;
      if (jevDecision.needsEncouragement) {
        jevContextStr += `- ⚠️ 检测到学生可能感到困惑或沮丧，请在回答开头给予温暖的情感鼓励\n`;
      }
      if (jevRetrievalEval && !jevRetrievalEval.fallback) {
        jevContextStr += `- 教材检索相关性：${jevRetrievalEval.isRelevant ? '✅ 命中' : '⚠️ 未命中'}`;
        jevContextStr += `，充分性：${jevRetrievalEval.isSufficient ? '✅ 足够' : '需要你补充推理'}\n`;
      }
      if (jevStrategy && !jevStrategy.fallback) {
        const strategyNames = {
          visual_decompose: '可视化拆解（适合低年级）',
          scenario_memorize: '场景化记忆（适合低年级）',
          mind_map: '思维导图结构化（适合高年级）',
          error_correction_loop: '错题闭环纠正',
          dialogue_practice: '情景对话练习',
          step_by_step_scaffold: '分步脚手架引导'
        };
        jevContextStr += `- 推荐教学策略：${strategyNames[jevStrategy.strategy] || jevStrategy.strategy}\n`;
        jevContextStr += `- 提示等级：${jevStrategy.hintLevel}/5（1=仅给方向，5=接近完整答案）\n`;
      }
    }

    const enrichedContextMemory = `${fullContextMemory}${jevContextStr}`;
    let prompt = getChatPrompt(query, correctedResults, slicedHistory, grade, subject, socratic, enrichedContextMemory);

    // Intercept Active Chapter Start Action
    if (query.startsWith('[ACTION_START_CHAPTER]')) {
      const chapterName = query.match(/《([^》]+)》/)?.[1] || query.replace('[ACTION_START_CHAPTER]', '').trim() || '未知章节';
      prompt = getChapterStartPrompt(chapterName, correctedResults, grade, subject);
    }

    const generationConfig = {
      temperature: 0.2,
      maxOutputTokens: 8192,
      thinkingConfig: { thinkingBudget: 0 }
    };

    const contentsPayload = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig
    };

    await streamChatToClient(contentsPayload, res, { query, grade, subject, sources, profile_id, model });

  } catch (e) {
    logger.error("Chat Error:", e);
    if (e.message === 'QUOTA_EXHAUSTED' || e.message === 'EMBED_QUOTA_EXHAUSTED') {
      return res.status(429).json({
        error: "今日额度已用完",
        details: "由于使用的是免费版 API，今日的 4000 次查询额度已耗尽。请明天早上 8 点后再试，或联系管理员增加 API Key。"
      });
    }
    res.status(500).json({
      error: "服务器内部错误",
      details: NODE_ENV === 'development' ? e.message : undefined
    });
  }
});

module.exports = router;
