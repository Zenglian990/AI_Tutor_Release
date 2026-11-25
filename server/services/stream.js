const { fetchWithKeyRotation, buildStreamURL } = require('./embedding');
const { getSqliteDb } = require('../db/init');
const { logApiUsage } = require('./usage');
const dbQueue = require('./dbQueue');
const { encryptField, generateFtsIndexText } = require('../utils/crypto');
const { recordStudyActivity } = require('./streakService');
const { isSafeProductionMode } = require('../utils/paramValidator');
const config = require('../config');
const logger = require('./logger');

const STREAM_TIMEOUT_MS = 120_000;
const MAX_LINE_BUFFER_BYTES = 512 * 1024; // 512KB SSE 行缓冲上限，防恶意超长单行 OOM
const MAX_ANSWER_CHARS = 200_000; // 200,000 字符总回答上限

/**
 * Stream a chat completion response to the client via SSE.
 */
async function streamChatToClient(contentsPayload, res, opts = {}) {
  const { query, grade, subject, sources = [], profile_id, model, clientHeaders = {} } = opts;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
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
    if (responseBody) {
      if (typeof responseBody.destroy === 'function') {
        try {
          responseBody.destroy();
        } catch (err) {
          logger.warn('Failed to destroy response body:', err);
        }
      } else if (typeof responseBody.return === 'function') {
        Promise.resolve(responseBody.return()).catch(() => {});
      } else if (typeof responseBody.cancel === 'function') {
        Promise.resolve(responseBody.cancel()).catch(() => {});
      }
    }
  };

  streamTimeout = setTimeout(() => {
    if (!res.writableEnded) {
      logger.warn('[Stream] Timeout reached, closing SSE connection');
      streamAborted = true;
      cleanupTimersAndStream();
      res.write(`data: ${JSON.stringify({ error: '请求超时，AI 响应时间过长，请重试。' })}\n\n`);
      res.write('data: [DONE]\n\n');
      res.end();
    }
  }, STREAM_TIMEOUT_MS);

  res.on('close', () => {
    streamAborted = true;
    cleanupTimersAndStream();
  });

  const safeSources = sources.map(s => ({
    ...s,
    text_snippet: s.text_snippet && s.text_snippet.length > 200
      ? s.text_snippet.substring(0, 200) + '...'
      : s.text_snippet
  }));
  if (!res.writableEnded) {
    res.write(`data: ${JSON.stringify({ sources: safeSources })}\n\n`);
  }

  let fullAnswer = '';

  const emitAnswerChunk = (text) => {
    if (!text || res.writableEnded) return false;
    const remaining = MAX_ANSWER_CHARS - fullAnswer.length;
    if (remaining <= 0) {
      return false;
    }
    if (text.length > remaining) {
      const sliced = text.slice(0, remaining);
      fullAnswer += sliced;
      res.write(`data: ${JSON.stringify({ text: sliced })}\n\n`);
      res.write(`data: ${JSON.stringify({ error: '响应内容达到安全长度上限，已自动截断。' })}\n\n`);
      return false;
    }
    fullAnswer += text;
    res.write(`data: ${JSON.stringify({ text })}\n\n`);
    return fullAnswer.length < MAX_ANSWER_CHARS;
  };

  try {
    const headers = {
      'Content-Type': 'application/json',
      ...clientHeaders
    };
    const response = await fetchWithKeyRotation(buildStreamURL, {
      method: 'POST',
      headers,
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

    resetChunkTimeout();
    let limitExceeded = false;

    for await (const chunk of responseBody) {
      if (streamAborted || res.writableEnded) break;
      resetChunkTimeout();

      const chunkStr = typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf-8');
      buffer += chunkStr;

      if (Buffer.byteLength(buffer, 'utf8') > MAX_LINE_BUFFER_BYTES) {
        logger.warn('[Stream] SSE line buffer exceeded 512KB limit, aborting upstream stream.');
        limitExceeded = true;
        streamAborted = true;
        cleanupTimersAndStream();
        if (!res.writableEnded) {
          res.write(`data: ${JSON.stringify({ error: '上游流单行缓冲超过安全上限，连接已终止。' })}\n\n`);
        }
        break;
      }

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
            if (!res.writableEnded) {
              const safeMsg = isSafeProductionMode() ? 'AI 上游流服务异常' : String(parsed.error.message || 'Stream error').slice(0, 200);
              res.write(`data: ${JSON.stringify({ error: safeMsg })}\n\n`);
            }
            continue;
          }
          const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
          if (text) {
            const canContinue = emitAnswerChunk(text);
            if (!canContinue) {
              logger.warn('[Stream] Answer exceeded 200k char limit, aborting upstream stream.');
              limitExceeded = true;
              streamAborted = true;
              cleanupTimersAndStream();
              break;
            }
          }
        } catch {
          // 跳过不可解析分片
        }
      }

      if (limitExceeded) break;
    }

    if (chunkTimeout) clearTimeout(chunkTimeout);

    if (!limitExceeded && !streamAborted && buffer.startsWith('data: ')) {
      const dataStr = buffer.slice(6).trim();
      if (dataStr !== '[DONE]') {
        try {
          const parsed = JSON.parse(dataStr);
          const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
          if (text) {
            emitAnswerChunk(text);
          }
        } catch (e) {
          logger.warn('SSE final chunk parse error:', e);
        }
      }
    }

    clearTimeout(streamTimeout);
    if (!res.writableEnded) {
      res.write('data: [DONE]\n\n');
      res.end();
    }

    try {
      logApiUsage(config.CHAT_MODEL, 'chat', query || '', fullAnswer || '', 'success', profile_id || 'default');
    } catch (usageErr) {
      logger.error('Failed to log streaming API usage:', usageErr);
    }
  } catch (e) {
    cleanupTimersAndStream();
    try {
      logApiUsage(config.CHAT_MODEL, 'chat', query || '', 0, 'error', profile_id || 'default');
    } catch (usageErr) {
      logger.error('Failed to log streaming API usage on error:', usageErr);
    }
    if (streamAborted) {
      logger.info('[Stream] Stream was aborted due to timeout, limit, or client disconnect.');
      if (!res.writableEnded) {
        res.write('data: [DONE]\n\n');
        res.end();
      }
    } else {
      logger.error('Streaming Chat Error:', e);
      if (!res.writableEnded) {
        let errorMsg = '服务器流式响应出错，请稍后重试。';
        const errStr = (e && e.message) ? e.message : String(e);
        if (e?.code === 'ERR_MISSING_API_KEY' || e?.isMissingKey || /缺少.*Key/i.test(errStr)) {
          errorMsg = '未检测到可用大模型 API Key，请点击右上角设置 (⚙️) 配置有效密钥。';
        } else if (e?.code === 'ERR_INVALID_CLIENT_KEY' || /API_KEY_INVALID|API key not valid|401/i.test(errStr)) {
          errorMsg = '您配置的 API Key 无效或权限受限，请在设置 (⚙️) 中检查密钥。';
        } else if (errStr.includes('QUOTA_EXHAUSTED') || errStr.includes('429')) {
          errorMsg = '今日 AI 调用额度已达上限。请稍后再试，或在设置 (⚙️) 中填入可用的自定义 API Key。';
        } else if (/insufficient_quota|balance|402/i.test(errStr)) {
          errorMsg = '当前 AI 大模型账户余额不足 (402)。请充值或点击右上角设置 (⚙️) 切换其他模型通道。';
        } else if (/API_KEY|auth|invalid|400|403|not configured/i.test(errStr)) {
          errorMsg = 'AI 密钥配置异常或当前所选模型未配置有效 Key。请点击右上角设置 (⚙️) 检查对应模型的密钥。';
        }
        res.write(`data: ${JSON.stringify({ error: errorMsg, details: isSafeProductionMode() ? undefined : e.message })}\n\n`);
        res.write('data: [DONE]\n\n');
        res.end();
      }
    }
  } finally {
    const sqliteDb = getSqliteDb();
    if (sqliteDb && (query || fullAnswer)) {
      const safeQuery = (query || '').slice(0, 2000);
      const safeAnswer = fullAnswer ? fullAnswer.slice(0, 8000) : '';
      const encQuery = encryptField(safeQuery);
      const ftsQuery = generateFtsIndexText(safeQuery);
      const encAnswer = safeAnswer ? encryptField(safeAnswer) : '';
      const ftsAnswer = safeAnswer ? generateFtsIndexText(safeAnswer) : '';

      dbQueue.enqueue(async () => {
        await sqliteDb.run('BEGIN IMMEDIATE TRANSACTION');
        try {
          const r1 = await sqliteDb.run(
            'INSERT INTO chat_history (profile_id, grade, subject, role, text) VALUES (?, ?, ?, ?, ?)',
            [profile_id || 'default', grade || 'unknown', subject || 'unknown', 'user', encQuery]
          );
          await sqliteDb.run(
            'INSERT INTO chat_history_fts (chat_id, text) VALUES (?, ?)',
            [r1.lastID, ftsQuery]
          );

          if (safeAnswer) {
            const r2 = await sqliteDb.run(
              'INSERT INTO chat_history (profile_id, grade, subject, role, text) VALUES (?, ?, ?, ?, ?)',
              [profile_id || 'default', grade || 'unknown', subject || 'unknown', 'ai', encAnswer]
            );
            await sqliteDb.run(
              'INSERT INTO chat_history_fts (chat_id, text) VALUES (?, ?)',
              [r2.lastID, ftsAnswer]
            );
          }
          await sqliteDb.run('COMMIT');

          try {
            await recordStudyActivity(sqliteDb, {
              profileId: profile_id || 'default',
              eventType: 'chat_turn',
              xpGain: 15
            });
          } catch (streakErr) {
            logger.warn('[Stream] Could not update streak activity:', streakErr.message);
          }
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

module.exports = {
  streamChatToClient,
  MAX_LINE_BUFFER_BYTES,
  MAX_ANSWER_CHARS
};
