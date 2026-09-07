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

    let results = [];
    let isQuotaExhausted = false;
    try {
      results = await performHybridSearch(query, grade, subject, RAG_TOP_K, edition);
    } catch (err) {
      logger.error("[RAG Error] Hybrid search failed, falling back to empty results:", err);
      if (err.message === 'EMBED_QUOTA_EXHAUSTED' || err.message === 'QUOTA_EXHAUSTED' || (err.message && err.message.includes('Quota exceeded'))) {
        isQuotaExhausted = true;
      }
    }

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
    } else if (sources.length === 0) {
      sources.push({
        source: "系统提示",
        page: 0,
        text_snippet: "⚠️ 提示：未能在本地教材库中找到相关内容（数据库为空或无匹配），当前回答基于 AI 通识知识库。"
      });
    }

    const slicedHistory = Array.isArray(history) ? history.slice(-10) : [];
    let studentMemoryStr = '';
    let graphRAGStr = '';
    try {
      const memory = await getStudentCognitiveMemory(profile_id, grade, subject, student_name);
      studentMemoryStr = formatStudentMemoryForPrompt(memory);

      // GraphRAG Root-Cause Prerequisite Tracing
      const diagnosis = diagnosePrerequisiteKnowledge(query, subject, memory?.recentWeakPoints);
      if (diagnosis) {
        graphRAGStr = formatGraphRAGPromptSection(diagnosis);
      }
    } catch (memErr) {
      logger.warn('[Chat] Could not load student memory or GraphRAG:', memErr.message);
    }

    const fullContextMemory = `${studentMemoryStr}${graphRAGStr}`;
    let prompt = getChatPrompt(query, correctedResults, slicedHistory, grade, subject, socratic, fullContextMemory);

    // Intercept Active Chapter Start Action
    if (query.startsWith('[ACTION_START_CHAPTER]')) {
      const chapterName = query.match(/《([^》]+)》/)?.[1] || query.replace('[ACTION_START_CHAPTER]', '').trim() || '未知章节';
      prompt = getChapterStartPrompt(chapterName, correctedResults, grade, subject);
    }

    const contentsPayload = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.2, maxOutputTokens: 8192 }
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
