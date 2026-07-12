const { fetchWithKeyRotation, buildChatURL, buildStreamURL } = require('./embedding');
const { getSqliteDb } = require('../db/init');
const { logApiUsage } = require('./usage');
const dbQueue = require('./dbQueue');
const { encryptField, generateFtsIndexText } = require('../utils/crypto');
const config = require('../config');
const { NODE_ENV } = config;
const logger = require('./logger');

const STREAM_TIMEOUT_MS = 120_000; // 2 minutes max for streaming response

/**
 * Stream a chat completion response to the client via SSE.
 * Shared by both text chat and vision chat routes.
 *
 * @param {object} contentsPayload - Gemini API request body
 * @param {object} res - Express response object
 * @param {object} opts
 * @param {string} opts.query - User query text
 * @param {string} opts.grade - Grade identifier
 * @param {string} opts.subject - Subject name
 * @param {Array} opts.sources - RAG sources array
 * @param {string} opts.profile_id - Profile identifier
 */
async function streamChatToClient(contentsPayload, res, opts = {}) {
  const { query, grade, subject, sources = [], profile_id, model } = opts;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.flushHeaders();

  let responseBody = null;
  let chunkTimeout = null;
  let streamTimeout = null;
  let streamAborted = false;
  const abortController = new AbortController();

  const cleanupTimersAndStream = () => {
    if (chunkTimeout) {
      clearTimeout(chunkTimeout);
      chunkTimeout = null;
    }
    if (streamTimeout) {
      clearTimeout(streamTimeout);
      streamTimeout = null;
    }
    try {
      abortController.abort();
    } catch (err) {
      logger.warn('Failed to abort controller:', err);
    }
    if (responseBody && typeof responseBody.destroy === 'function') {
      try {
        responseBody.destroy();
      } catch (err) {
        logger.warn('Failed to destroy response body:', err);
      }
    }
  };

  // Set a timeout to close the connection if it hangs
  streamTimeout = setTimeout(() => {
    if (!res.writableEnded) {
      logger.warn('[Stream] Timeout reached, closing SSE connection');
      streamAborted = true;
      cleanupTimersAndStream();
      res.write(`data: ${JSON.stringify({ error: '请求超时，AI 响应时间过长，请重试。' })}\n\n`);
      res.end();
    }
  }, STREAM_TIMEOUT_MS);

  // Clear timeout and abort fetch when client disconnects
  res.on('close', () => {
    streamAborted = true;
    cleanupTimersAndStream();
  });

  // Send sources immediately (truncate to avoid huge SSE payloads)
  const safeSources = sources.map(s => ({
    ...s,
    text_snippet: s.text_snippet && s.text_snippet.length > 200 
      ? s.text_snippet.substring(0, 200) + '...' 
      : s.text_snippet
  }));
  res.write(`data: ${JSON.stringify({ sources: safeSources })}\n\n`);

  let fullAnswer = '';

  try {
    const response = await fetchWithKeyRotation(buildStreamURL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(contentsPayload),
      signal: abortController.signal
    }, 8, 120000, model);

    responseBody = response.body;

    let buffer = '';
    const resetChunkTimeout = () => {
      if (chunkTimeout) clearTimeout(chunkTimeout);
      chunkTimeout = setTimeout(() => {
        logger.warn('[Stream] Chunk timeout reached (60s), closing SSE connection');
        streamAborted = true;
        cleanupTimersAndStream();
        if (!res.writableEnded) {
          res.write(`data: ${JSON.stringify({ error: '流响应超时，连接已断开。', text: '\n\n*(响应中断，已显示全部接收到的内容)*' })}\n\n`);
          res.write('data: [DONE]\n\n');
          res.end();
        }
      }, 60000);
    };

    // Start timer before first chunk
    resetChunkTimeout();

    for await (const chunk of responseBody) {
      // Reset timer on every incoming chunk
      resetChunkTimeout();

      const chunkStr = typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf-8');
      buffer += chunkStr;
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const dataStr = line.slice(6).trim();
        if (dataStr === '[DONE]') continue;

        try {
          const parsed = JSON.parse(dataStr);
          if (parsed.error) {
            logger.error('[Stream Error]', parsed.error);
            res.write(`data: ${JSON.stringify({ error: parsed.error.message || 'Stream error' })}\n\n`);
            continue;
          }
          const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
          if (text) {
            fullAnswer += text;
            res.write(`data: ${JSON.stringify({ text })}\n\n`);
          }
        } catch (e) {
          // Skip unparseable chunks silently
        }
      }
    }

    if (chunkTimeout) clearTimeout(chunkTimeout);

    // Handle remaining buffer
    if (buffer.startsWith('data: ')) {
      const dataStr = buffer.slice(6).trim();
      if (dataStr !== '[DONE]') {
        try {
          const parsed = JSON.parse(dataStr);
          const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
          if (text) {
            fullAnswer += text;
            res.write(`data: ${JSON.stringify({ text })}\n\n`);
          }
        } catch (e) {
          logger.warn('SSE final chunk parse error:', e);
        }
      }
    }

    clearTimeout(streamTimeout);
    res.write('data: [DONE]\n\n');
    res.end();

    // Log API Token usage statistics in database
    try {
      logApiUsage(config.CHAT_MODEL, 'chat', query || '', fullAnswer || '', 'success');
    } catch (usageErr) {
      logger.error('Failed to log streaming API usage:', usageErr);
    }
  } catch (e) {
    cleanupTimersAndStream();
    try {
      logApiUsage(config.CHAT_MODEL, 'chat', query || '', 0, 'error');
    } catch (usageErr) {
      logger.error('Failed to log streaming API usage on error:', usageErr);
    }
    if (streamAborted) {
      logger.info('[Stream] Stream was aborted due to timeout or client disconnect.');
    } else {
      logger.error('Streaming Chat Error:', e);
      if (!res.writableEnded) {
        let errorMsg = '服务器流式响应出错。';
        if (e.message === 'QUOTA_EXHAUSTED') {
          errorMsg = '今日额度已用完。由于使用的是免费版 API，今日的 4000 次查询额度已耗尽。请明天早上 8 点后再试。';
        }
        res.write(`data: ${JSON.stringify({ error: errorMsg, details: NODE_ENV === 'development' ? e.message : undefined })}\n\n`);
        res.end();
      }
    }
  } finally {
    // Save chat history in background with transaction protection
    const sqliteDb = getSqliteDb();
    if (sqliteDb && (query || fullAnswer)) {
      dbQueue.enqueue(async () => {
        await sqliteDb.run('BEGIN IMMEDIATE TRANSACTION');
        try {
          const r1 = await sqliteDb.run(
            'INSERT INTO chat_history (profile_id, grade, subject, role, text) VALUES (?, ?, ?, ?, ?)',
            [profile_id || 'default', grade || 'unknown', subject || 'unknown', 'user', encryptField((query || '').slice(0, 2000))]
          );
          await sqliteDb.run(
            'INSERT INTO chat_history_fts (chat_id, text) VALUES (?, ?)',
            [r1.lastID, generateFtsIndexText((query || '').slice(0, 2000))]
          );

          if (fullAnswer) {
            const r2 = await sqliteDb.run(
              'INSERT INTO chat_history (profile_id, grade, subject, role, text) VALUES (?, ?, ?, ?, ?)',
              // Cap AI answer at 8000 chars to prevent oversized SQLite rows
              [profile_id || 'default', grade || 'unknown', subject || 'unknown', 'ai', encryptField(fullAnswer.slice(0, 8000))]
            );
            await sqliteDb.run(
              'INSERT INTO chat_history_fts (chat_id, text) VALUES (?, ?)',
              [r2.lastID, generateFtsIndexText(fullAnswer.slice(0, 8000))]
            );
          }
          await sqliteDb.run('COMMIT');
        } catch (err) {
          try {
            await sqliteDb.run('ROLLBACK');
          } catch (rollbackErr) {
            logger.error('Failed to rollback transaction:', rollbackErr);
          }
          throw err;
        }
      }).catch(err => {
        logger.error('Failed to save chat history (transaction rolled back):', err);
      });
    }
  }
}

module.exports = { streamChatToClient };
