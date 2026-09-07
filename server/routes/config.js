const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { fetch: undiciFetch, ProxyAgent } = require('undici');
const config = require('../config');
const logger = require('../services/logger');

const proxyAgent = config.proxyUrl ? new ProxyAgent(config.proxyUrl) : null;

/**
 * GET /api/config/providers
 * Returns current provider configuration status (safely masked)
 */
router.get('/config/providers', (req, res) => {
  const geminiConfigured = config.API_KEYS.length > 0;
  const deepseekConfigured = Boolean(process.env.DEEPSEEK_API_KEY && process.env.DEEPSEEK_API_KEY.trim());

  res.json({
    gemini: {
      configured: geminiConfigured,
      keyCount: config.API_KEYS.length,
      defaultModel: config.CHAT_MODEL
    },
    deepseek: {
      configured: deepseekConfigured,
      apiUrl: process.env.DEEPSEEK_API_URL || config.DEEPSEEK_API_URL,
      defaultModel: process.env.DEEPSEEK_CHAT_MODEL || config.DEEPSEEK_CHAT_MODEL,
      maskedKey: deepseekConfigured ? `${process.env.DEEPSEEK_API_KEY.slice(0, 4)}***${process.env.DEEPSEEK_API_KEY.slice(-4)}` : ''
    },
    proxyUrl: config.proxyUrl || null
  });
});

/**
 * Helper to update or append key-value in .env file
 */
function updateEnvFile(key, value) {
  const envPath = path.join(__dirname, '..', '..', '.env');
  let envContent = '';
  if (fs.existsSync(envPath)) {
    envContent = fs.readFileSync(envPath, 'utf8');
  }

  const regex = new RegExp(`^\s*${key}\s*=.*$`, 'm');
  const newLine = `${key}=${value}`;

  if (regex.test(envContent)) {
    envContent = envContent.replace(regex, newLine);
  } else {
    envContent = envContent ? `${envContent.trim()}\n${newLine}\n` : `${newLine}\n`;
  }

  fs.writeFileSync(envPath, envContent, 'utf8');
  process.env[key] = value;
}

/**
 * POST /api/config/update-keys
 * Update DeepSeek or Gemini API Keys and persist to .env
 */
router.post('/config/update-keys', (req, res) => {
  try {
    const { deepseekApiKey, deepseekApiUrl, geminiApiKey } = req.body;

    let updatedCount = 0;

    if (typeof deepseekApiKey === 'string') {
      const cleanKey = deepseekApiKey.trim();
      updateEnvFile('DEEPSEEK_API_KEY', cleanKey);
      updatedCount++;
    }

    if (typeof deepseekApiUrl === 'string' && deepseekApiUrl.trim()) {
      const cleanUrl = deepseekApiUrl.trim();
      updateEnvFile('DEEPSEEK_API_URL', cleanUrl);
      updatedCount++;
    }

    if (typeof geminiApiKey === 'string' && geminiApiKey.trim()) {
      const cleanKey = geminiApiKey.trim();
      updateEnvFile('GEMINI_API_KEY', cleanKey);
      if (!config.API_KEYS.includes(cleanKey)) {
        config.API_KEYS.push(cleanKey);
      }
      updatedCount++;
    }

    logger.info(`[ConfigAPI] Updated ${updatedCount} keys and persisted to .env`);
    res.json({
      success: true,
      message: '配置已成功保存并立即生效'
    });
  } catch (err) {
    logger.error('[ConfigAPI] Failed to update keys:', err);
    res.status(500).json({ error: '保存配置失败', details: err.message });
  }
});

/**
 * POST /api/config/test-llm
 * Ping test for Gemini or DeepSeek connectivity
 */
router.post('/config/test-llm', async (req, res) => {
  const { provider, apiKey, apiUrl, model } = req.body;
  const start = Date.now();

  try {
    if (provider === 'deepseek') {
      const keyToUse = (apiKey || process.env.DEEPSEEK_API_KEY || '').trim();
      if (!keyToUse) {
        return res.status(400).json({ success: false, error: '缺少 DeepSeek API Key' });
      }

      const baseUrl = (apiUrl || process.env.DEEPSEEK_API_URL || 'https://api.deepseek.com/v1').replace(/\/+$/, '');
      const testModel = model || 'deepseek-chat';

      const response = await undiciFetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${keyToUse}`
        },
        body: JSON.stringify({
          model: testModel,
          messages: [{ role: 'user', content: 'hi' }],
          max_tokens: 5
        }),
        signal: AbortSignal.timeout(10000)
      });

      const latencyMs = Date.now() - start;

      if (!response.ok) {
        const errText = await response.text();
        return res.status(response.status).json({
          success: false,
          error: `DeepSeek 响应错误 (${response.status})`,
          details: errText.slice(0, 200)
        });
      }

      return res.json({
        success: true,
        provider: 'deepseek',
        model: testModel,
        latencyMs,
        message: `DeepSeek 极速直连成功！(延迟: ${latencyMs}ms)`
      });

    } else if (provider === 'gemini') {
      const keyToUse = (apiKey || (config.API_KEYS.length > 0 ? config.API_KEYS[0] : '')).trim();
      if (!keyToUse) {
        return res.status(400).json({ success: false, error: '缺少 Gemini API Key' });
      }

      const testModel = model || config.CHAT_MODEL || 'gemini-flash-lite-latest';
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${testModel}:generateContent?key=${keyToUse}`;

      const fetchOptions = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: 'hi' }] }],
          generationConfig: { maxOutputTokens: 2 }
        }),
        signal: AbortSignal.timeout(10000)
      };
      if (proxyAgent) fetchOptions.dispatcher = proxyAgent;

      const response = await undiciFetch(url, fetchOptions);
      const latencyMs = Date.now() - start;

      if (!response.ok) {
        const errText = await response.text();
        return res.status(response.status).json({
          success: false,
          error: `Gemini 响应错误 (${response.status})`,
          details: errText.slice(0, 200)
        });
      }

      return res.json({
        success: true,
        provider: 'gemini',
        model: testModel,
        latencyMs,
        message: `Gemini 连接成功！(延迟: ${latencyMs}ms)`
      });
    } else {
      return res.status(400).json({ success: false, error: '未知的提供商类型' });
    }
  } catch (err) {
    logger.warn(`[ConfigAPI] Test LLM failed for ${provider}:`, err.message);
    return res.status(500).json({
      success: false,
      error: err.name === 'TimeoutError' ? '网络连接超时（可能需要配置代理或检查国内网络）' : err.message,
      latencyMs: Date.now() - start
    });
  }
});

module.exports = router;
