const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { fetch: undiciFetch, ProxyAgent } = require('undici');
const config = require('../config');
const logger = require('../services/logger');
const { isSafeExternalUrl, validateSafeUrlAsync } = require('../utils/urlValidator');
const { isVerifiedAdminRequest } = require('../utils/adminAuth');

const proxyAgent = config.proxyUrl ? new ProxyAgent(config.proxyUrl) : null;

/**
 * GET /api/config/providers
 * Returns current provider configuration status (safely masked)
 */
router.get('/config/providers', (req, res) => {
  const geminiConfigured = config.API_KEYS.length > 0;
  const firstGeminiKey = geminiConfigured ? config.API_KEYS[0] : '';
  const maskedGeminiKey = geminiConfigured && firstGeminiKey
    ? `${firstGeminiKey.slice(0, 6)}***${firstGeminiKey.slice(-4)}`
    : '';
  const deepseekConfigured = Boolean(process.env.DEEPSEEK_API_KEY && process.env.DEEPSEEK_API_KEY.trim());

  const typesafeKey = (process.env.TYPESAFE_API_KEY || config.TYPESAFE_API_KEY || '').trim();
  const typesafeConfigured = Boolean(typesafeKey);
  const maskedTypesafeKey = typesafeConfigured
    ? `${typesafeKey.slice(0, 4)}***${typesafeKey.slice(-4)}`
    : '';

  res.json({
    gemini: {
      configured: geminiConfigured,
      keyCount: config.API_KEYS.length,
      defaultModel: config.CHAT_MODEL,
      maskedKey: maskedGeminiKey
    },
    deepseek: {
      configured: deepseekConfigured,
      apiUrl: process.env.DEEPSEEK_API_URL || config.DEEPSEEK_API_URL,
      defaultModel: process.env.DEEPSEEK_CHAT_MODEL || config.DEEPSEEK_CHAT_MODEL,
      maskedKey: deepseekConfigured ? `${process.env.DEEPSEEK_API_KEY.slice(0, 4)}***${process.env.DEEPSEEK_API_KEY.slice(-4)}` : ''
    },
    jev: {
      configured: typesafeConfigured,
      enabled: process.env.JEV_ENABLED === 'true' || config.JEV_ENABLED === true,
      confidenceThreshold: parseFloat(process.env.JEV_CONFIDENCE_THRESHOLD || config.JEV_CONFIDENCE_THRESHOLD || '0.85'),
      maskedKey: maskedTypesafeKey
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
router.post('/config/update-keys', async (req, res) => {
  try {
    // Enforce master token or admin PIN authorization for persisting system environment configurations
    if (config.API_TOKEN && process.env.REQUIRE_AUTH !== 'false') {
      const isVerified = await isVerifiedAdminRequest(req);
      if (!isVerified) {
        return res.status(403).json({ error: '无权修改系统环境配置：需要主管理员授权。' });
      }
    }

    const { deepseekApiKey, deepseekApiUrl, deepseekChatModel, geminiApiKey, typesafeApiKey, jevEnabled, jevConfidenceThreshold } = req.body || {};

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

    if (typeof deepseekChatModel === 'string' && deepseekChatModel.trim()) {
      const cleanModel = deepseekChatModel.trim();
      updateEnvFile('DEEPSEEK_CHAT_MODEL', cleanModel);
      updatedCount++;
    }

    if (typeof geminiApiKey === 'string' && geminiApiKey.trim()) {
      const cleanKey = geminiApiKey.trim();
      updateEnvFile('GEMINI_API_KEY', cleanKey);
      const existingIdx = config.API_KEYS.indexOf(cleanKey);
      if (existingIdx !== -1) {
        config.API_KEYS.splice(existingIdx, 1);
      }
      config.API_KEYS.unshift(cleanKey);

      try {
        const { unmarkInvalidKey } = require('../services/embedding');
        if (typeof unmarkInvalidKey === 'function') unmarkInvalidKey(cleanKey);
      } catch (e) {}

      updatedCount++;
    }

    if (typeof typesafeApiKey === 'string') {
      const cleanKey = typesafeApiKey.trim();
      updateEnvFile('TYPESAFE_API_KEY', cleanKey);
      try {
        const jev = require('../services/jevDecisionService');
        if (cleanKey) {
          const { TypeSafeClient } = require('@typesafe-ai/sdk');
          jev.setClient(new TypeSafeClient({ apiKey: cleanKey }));
        } else {
          jev.setClient(null);
        }
      } catch (e) {}
      updatedCount++;
    }

    if (typeof jevEnabled === 'boolean' || typeof jevEnabled === 'string') {
      const enabledVal = String(jevEnabled) === 'true';
      updateEnvFile('JEV_ENABLED', enabledVal ? 'true' : 'false');
      try {
        const jev = require('../services/jevDecisionService');
        jev.enabled = enabledVal;
      } catch (e) {}
      updatedCount++;
    }

    if (jevConfidenceThreshold !== undefined && !isNaN(parseFloat(jevConfidenceThreshold))) {
      const thresholdVal = parseFloat(jevConfidenceThreshold);
      updateEnvFile('JEV_CONFIDENCE_THRESHOLD', String(thresholdVal));
      try {
        const jev = require('../services/jevDecisionService');
        jev.confidenceThreshold = thresholdVal;
      } catch (e) {}
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
  const start = Date.now();
  let provider = 'unknown';

  try {
    const body = req.body || {};
    provider = body.provider || 'unknown';
    const { apiKey, apiUrl, model } = body;

    if (provider === 'deepseek') {
      const keyToUse = (apiKey || process.env.DEEPSEEK_API_KEY || '').trim();
      if (!keyToUse) {
        return res.json({
          success: false,
          provider: 'deepseek',
          error: '缺少 DeepSeek API Key',
          details: '请在上方输入有效的 DeepSeek API 密钥',
          latencyMs: 0
        });
      }

      const baseUrl = (apiUrl || process.env.DEEPSEEK_API_URL || 'https://api.deepseek.com/v1').replace(/\/+$/, '');
      const urlCheck = await validateSafeUrlAsync(baseUrl);
      if (!urlCheck.safe) {
        return res.json({
          success: false,
          provider: 'deepseek',
          error: `不安全的 API URL 地址: ${urlCheck.error}`,
          latencyMs: 0
        });
      }

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
        const status = response.status;
        let details = '';
        try {
          const errBody = await response.text();
          const parsed = JSON.parse(errBody);
          details = parsed.error?.message || errBody.slice(0, 300);
        } catch {
          // ignore parsing error
        }

        let friendlyError = `DeepSeek 响应异常 (${status})`;
        if (status === 401) {
          friendlyError = 'DeepSeek API Key 无效或未授权 (401)';
        } else if (status === 429) {
          friendlyError = 'DeepSeek 请求配额超限或账户余额不足 (429)';
        } else if (status === 404) {
          friendlyError = `未找到指定模型或接口路径 ${testModel} (404)`;
        }

        return res.json({
          success: false,
          provider: 'deepseek',
          model: testModel,
          latencyMs,
          error: friendlyError,
          details: details || (status === 401 ? '请检查 API 密钥是否输入完整且有效' : '上游接口请求失败')
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
        return res.json({
          success: false,
          provider: 'gemini',
          error: '缺少 Gemini API Key',
          details: '请在上方输入有效的 Google Gemini API 密钥',
          latencyMs: 0
        });
      }

      let testModel = model || config.CHAT_MODEL || 'gemini-2.5-flash';
      let url = `https://generativelanguage.googleapis.com/v1beta/models/${testModel}:generateContent?key=${keyToUse}`;

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

      let response = await undiciFetch(url, fetchOptions);

      // Mutual fallback between 2.5 and 3.6 if rate-limited or unavailable
      if (!response.ok && (response.status === 429 || response.status === 503 || response.status === 404)) {
        const fallbackModel = testModel === 'gemini-2.5-flash' ? 'gemini-3.6-flash' : 'gemini-2.5-flash';
        const fallbackUrl = `https://generativelanguage.googleapis.com/v1beta/models/${fallbackModel}:generateContent?key=${keyToUse}`;
        try {
          const fallbackRes = await undiciFetch(fallbackUrl, fetchOptions);
          if (fallbackRes.ok) {
            response = fallbackRes;
            testModel = fallbackModel;
          }
        } catch (_) {}
      }

      const latencyMs = Date.now() - start;

      if (!response.ok) {
        const status = response.status;
        let details = '';
        try {
          const errText = await response.text();
          const parsed = JSON.parse(errText);
          details = parsed.error?.message || errText.slice(0, 300);
        } catch {
          // ignore parsing error
        }

        let friendlyError = `Gemini 响应错误 (${status})`;
        if (status === 429) {
          friendlyError = 'Gemini API 请求配额已达上限 (429 RESOURCE_EXHAUSTED)';
          if (!details) {
            details = '免费层每日或每分钟配额已用完，请等待额度刷新或在控制台更换可用 API Key。';
          }
        } else if (status === 400) {
          friendlyError = 'Gemini API Key 无效或格式不正确 (400)';
        } else if (status === 403) {
          friendlyError = 'Gemini API 访问权限受限或国家/地区不支持 (403)';
        } else if (status === 404) {
          friendlyError = `未找到指定模型 ${testModel} (404)`;
        }

        return res.json({
          success: false,
          provider: 'gemini',
          model: testModel,
          latencyMs,
          error: friendlyError,
          details
        });
      }

      return res.json({
        success: true,
        provider: 'gemini',
        model: testModel,
        latencyMs,
        message: `Gemini 连接成功！(延迟: ${latencyMs}ms)`
      });

    } else if (provider === 'jev' || provider === 'typesafe') {
      const keyToUse = (apiKey || process.env.TYPESAFE_API_KEY || config.TYPESAFE_API_KEY || '').trim();
      if (!keyToUse) {
        return res.json({
          success: false,
          provider: 'jev',
          error: '缺少 TypeSafe (Jev) API Key',
          details: '请在上方输入有效的 TypeSafe API 密钥',
          latencyMs: 0
        });
      }

      let TypeSafeClient, noul;
      try {
        const typesafe = require('@typesafe-ai/sdk');
        TypeSafeClient = typesafe.TypeSafeClient;
        noul = typesafe.noul;
      } catch (sdkErr) {
        return res.json({
          success: false,
          provider: 'jev',
          error: 'TypeSafe SDK 未加载或未安装',
          details: sdkErr.message,
          latencyMs: 0
        });
      }

      const testClient = new TypeSafeClient({ apiKey: keyToUse });
      const result = await testClient.systemOne({
        state: '中国中小学智能教辅系统连通性测试',
        questions: {
          ping: noul('这是一次正常的系统连通性心跳检测吗？')
        }
      }, { timeout: 10000 });

      const latencyMs = Date.now() - start;
      return res.json({
        success: true,
        provider: 'jev',
        model: result.model || 'jev-latest',
        latencyMs,
        message: `Jev 系统一决策模型连接成功！(极速决策: ${latencyMs}ms)`
      });

    } else {
      return res.status(400).json({
        success: false,
        error: '未知的提供商类型',
        details: `不支持的 provider: ${provider}`,
        latencyMs: 0
      });
    }
  } catch (err) {
    logger.warn(`[ConfigAPI] Test LLM failed for ${provider}:`, err.message);
    const isTimeout = err.name === 'TimeoutError' || err.name === 'AbortError' || err.code === 'UND_ERR_CONNECT_TIMEOUT';
    return res.json({
      success: false,
      provider,
      error: isTimeout ? '网络连接超时（可能需要配置代理或检查国内网络）' : `连通性检测失败: ${err.message}`,
      details: err.message,
      latencyMs: Date.now() - start
    });
  }
});

module.exports = router;
