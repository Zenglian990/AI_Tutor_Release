const { getSqliteDb } = require('../db/init');
const dbQueue = require('./dbQueue');
const logger = require('./logger');

/**
 * Heuristic token estimation based on character length when API metadata is missing (e.g. in streams)
 */
function estimateTokens(text, isPrompt = true) {
  if (typeof text !== 'string' || !text) return 0;
  // Approximation: 1 Chinese character ~ 0.8 tokens, 1 English word ~ 1.3 tokens
  const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
  const englishWords = text.replace(/[\u4e00-\u9fa5]/g, '').trim().split(/\s+/).filter(Boolean).length;
  return Math.round(chineseChars * 0.85 + englishWords * 1.3) || 1;
}

/**
 * Log API usage in database
 */
async function logApiUsage(model, type, promptData, completionData, status = 'success') {
  try {
    const sqliteDb = getSqliteDb();
    if (!sqliteDb) return;

    let promptTokens = 0;
    let completionTokens = 0;

    // Handle token inputs: can be number, string (query/answer to estimate), or API usage objects
    if (typeof promptData === 'number') {
      promptTokens = promptData;
    } else if (typeof promptData === 'string') {
      promptTokens = estimateTokens(promptData, true);
    } else if (promptData && typeof promptData === 'object') {
      // Gemini format
      promptTokens = promptData.promptTokenCount || promptData.prompt_tokens || 0;
    }

    if (typeof completionData === 'number') {
      completionTokens = completionData;
    } else if (typeof completionData === 'string') {
      completionTokens = estimateTokens(completionData, false);
    } else if (completionData && typeof completionData === 'object') {
      // Gemini format
      completionTokens = completionData.candidatesTokenCount || completionData.completion_tokens || 0;
    }

    dbQueue.enqueue(async () => {
      await sqliteDb.run(
        'INSERT INTO api_usage (model, type, prompt_tokens, completion_tokens, status) VALUES (?, ?, ?, ?, ?)',
        [model || 'unknown-model', type || 'chat', promptTokens, completionTokens, status]
      );
    }).catch(err => {
      logger.error('[Usage] Database enqueue failed:', err);
    });
  } catch (err) {
    logger.error('[Usage] Failed to log API usage:', err);
  }
}

module.exports = {
  logApiUsage,
  estimateTokens
};
