const undici = require('undici');
const { ProxyAgent } = undici;
const { API_KEYS, proxyUrl, EMBED_MODEL, CHAT_MODEL, DEEPSEEK_API_KEY, DEEPSEEK_API_URL, DEEPSEEK_CHAT_MODEL } = require('../config');
const logger = require('./logger');
const { logApiUsage } = require('./usage');
const { validateSafeUrlAsync, createPinnedDispatcher } = require('../utils/urlValidator');
const { isSafeProductionMode } = require('../utils/paramValidator');

const proxyAgent = proxyUrl ? new ProxyAgent(proxyUrl) : null;
if (proxyAgent) logger.info(`[Proxy] Using ${proxyUrl} for API requests`);

const MAX_SSE_LINE_BUFFER_BYTES = 512 * 1024;
const MAX_SSE_OUTPUT_CHARS = 200_000;

const maskKey = (key) => process.env.NODE_ENV === 'test' ? 'mock_gemini_key_***' : key.slice(0, 6) + '...';
const keyLastUsed = new Map();

function getNextKey() {
  const activeKeys = API_KEYS.filter(k => !invalidKeys.has(k));
  if (activeKeys.length === 0) return API_KEYS[0];

  const now = Date.now();
  const available = activeKeys.filter(k => {
    const cd = keyCooldown.get(k);
    return !cd || now > cd;
  });

  const candidatePool = available.length > 0 ? available : activeKeys;

  let selectedKey = candidatePool[0];
  let oldestTime = keyLastUsed.get(selectedKey) || 0;

  for (const k of candidatePool) {
    const lastUsed = keyLastUsed.get(k) || 0;
    if (lastUsed < oldestTime) {
      oldestTime = lastUsed;
      selectedKey = k;
    }
  }

  keyLastUsed.set(selectedKey, now);
  return selectedKey;
}

function buildEmbedURL(modelName) {
  const m = (modelName && String(modelName).includes('embedding')) ? modelName : EMBED_MODEL;
  return `https://generativelanguage.googleapis.com/v1beta/models/${m}:embedContent`;
}

function buildChatURL(modelName) {
  return `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent`;
}

function buildStreamURL(modelName) {
  return `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:streamGenerateContent?alt=sse`;
}

const keyCooldown = new Map();
const invalidKeys = new Set();

async function checkKeysHealth() {
  logger.info('[HealthCheck] Starting Gemini API keys validation...');
  for (const key of API_KEYS) {
    try {
      const modelToPing = CHAT_MODEL || 'gemini-3-flash-preview';
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelToPing}:generateContent?key=${key}`;
      const payload = {
        contents: [{ parts: [{ text: 'ping' }] }],
        generationConfig: { maxOutputTokens: 1 }
      };

      const fetchOptions = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      };
      if (proxyAgent) fetchOptions.dispatcher = proxyAgent;

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);
      fetchOptions.signal = controller.signal;

      const res = await undici.fetch(url, fetchOptions);
      clearTimeout(timeoutId);

      if (res.status === 400 || res.status === 403) {
        let errBody = '';
        try { errBody = await res.text(); } catch {}
        const isRealAuthError = /API_KEY_INVALID|API key not valid|CONSUMER_SUSPENDED|PERMISSION_DENIED/i.test(errBody);
        if (isRealAuthError) {
          logger.error(`[HealthCheck] Key ${maskKey(key)} is INVALID (status ${res.status}). Marking as disabled.`);
          invalidKeys.add(key);
          keyLastUsed.delete(key);
          keyCooldown.delete(key);
        } else {
          logger.warn(`[HealthCheck] Key ${maskKey(key)} returned ${res.status} (${errBody.slice(0, 100)}), key remains enabled.`);
        }
      } else {
        if (invalidKeys.has(key)) {
          logger.info(`[HealthCheck] Key ${maskKey(key)} recovered. Re-enabling.`);
          invalidKeys.delete(key);
        }
      }
    } catch (err) {
      logger.error(`[HealthCheck] Network check failed for key ${maskKey(key)}: ${err.message}`);
    }
  }
  logger.info(`[HealthCheck] Completed. Active keys: ${API_KEYS.filter(k => !invalidKeys.has(k)).length}/${API_KEYS.length}`);
}

function startEmbeddingCheck() {
  setInterval(checkKeysHealth, 10 * 60 * 1000).unref();
  setTimeout(checkKeysHealth, 15000).unref();
}

function isOpenAiVisionModel(modelName) {
  if (!modelName) return false;
  const m = String(modelName).toLowerCase();
  return m.includes('vl') || m.includes('vision') || m.includes('glm-4v') || m.includes('step-1v') || m.includes('qwen-vl') || m.includes('qwen2.5-vl');
}

function convertGeminiToDeepSeekPayload(geminiPayload, isStream, modelName = null) {
  const selectedModel = modelName && modelName !== 'default' ? modelName : (process.env.DEEPSEEK_CHAT_MODEL || DEEPSEEK_CHAT_MODEL || 'deepseek-chat');
  const isVisionModel = isOpenAiVisionModel(selectedModel);

  const contents = geminiPayload.contents || [];
  let userMessageContent = '';
  const imageParts = [];

  if (contents.length > 0 && contents[0].parts) {
    const textParts = contents[0].parts.filter(p => p.text).map(p => p.text);
    userMessageContent = textParts.join('\n');

    for (const p of contents[0].parts) {
      if (p.inline_data && p.inline_data.data) {
        imageParts.push(p.inline_data);
      }
    }
  }

  const hasImage = imageParts.length > 0;
  let messages = [];

  if (hasImage && isVisionModel) {
    const contentItems = [];
    for (const img of imageParts) {
      const mime = img.mime_type || 'image/jpeg';
      contentItems.push({
        type: 'image_url',
        image_url: {
          url: `data:${mime};base64,${img.data}`
        }
      });
    }
    contentItems.push({
      type: 'text',
      text: userMessageContent
    });
    messages = [{ role: 'user', content: contentItems }];
  } else {
    if (hasImage && !isVisionModel) {
      userMessageContent += '\n(注意：备用大模型收到了图片描述提问，但由于运行在纯文本模型模式，无法直接看图，已基于上下文文本进行回答)';
    }

    const splitKey = '学生提问：\n';
    const splitIdx = userMessageContent.indexOf(splitKey);
    if (splitIdx !== -1) {
      let systemPrompt = userMessageContent.substring(0, splitIdx).trim();
      systemPrompt += '\n\n【极其重要：Mermaid 脑图渲染规范】\n当你在回答中需要绘制思维导图时，必须且只能使用 ```mermaid 代码块包裹（内部写标准的 mindmap 或 graph TD 语法，如 mindmap\n  root\n    ...），绝对不要使用 ```mindmap 或 ```mermaid-mindmap 等非标准的 Markdown 语言标签，以便客户端能够正常编译和渲染图表。';
      const userPrompt = userMessageContent.substring(splitIdx + splitKey.length).trim();
      messages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ];
    } else {
      messages = [{ role: 'user', content: userMessageContent }];
    }
  }

  const deepseekPayload = {
    model: selectedModel,
    messages,
    temperature: geminiPayload.generationConfig?.temperature ?? 0.2,
    stream: isStream
  };

  if (selectedModel.includes('reasoner') || selectedModel.includes('r1') || (geminiPayload.generationConfig?.thinkingConfig?.thinkingBudget > 0)) {
    deepseekPayload.thinking = { type: 'enabled' };
  }

  if (geminiPayload.generationConfig?.responseMimeType === 'application/json') {
    deepseekPayload.response_format = { type: 'json_object' };
  }

  if (geminiPayload.generationConfig?.maxOutputTokens) {
    deepseekPayload.max_tokens = geminiPayload.generationConfig.maxOutputTokens;
  }

  return deepseekPayload;
}

/**
 * 将 DeepSeek / OpenAI SSE 流实时转为 Gemini SSE 格式（带行缓冲与总输出上限防 OOM）。
 */
async function* translateDeepSeekStream(originalBody) {
  let buffer = '';
  let isThinking = false;
  let totalOutputChars = 0;

  function processDataLine(dataStr) {
    if (dataStr === '[DONE]') {
      return 'data: [DONE]\n\n';
    }
    try {
      const parsed = JSON.parse(dataStr);
      const delta = parsed.choices?.[0]?.delta;
      const text = delta?.content;
      const reasoning = delta?.reasoning_content;

      let outputText = '';
      if (reasoning !== undefined && reasoning !== null && reasoning !== '') {
        if (!isThinking) {
          isThinking = true;
          outputText += '<think>';
        }
        outputText += reasoning;
      } else if (text !== undefined && text !== null && text !== '') {
        if (isThinking) {
          isThinking = false;
          outputText += '</think>\n\n';
        }
        outputText += text;
      }

      if (outputText !== '') {
        const remaining = MAX_SSE_OUTPUT_CHARS - totalOutputChars;
        if (remaining <= 0) {
          return null;
        }
        const safeText = outputText.length > remaining ? outputText.slice(0, remaining) : outputText;
        totalOutputChars += safeText.length;

        const translated = {
          candidates: [{
            content: {
              parts: [{ text: safeText }]
            }
          }]
        };
        return `data: ${JSON.stringify(translated)}\n\n`;
      }
    } catch {
      return 'data: ' + dataStr + '\n\n';
    }
    return null;
  }

  try {
    for await (const chunk of originalBody) {
      const chunkStr = typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf-8');
      buffer += chunkStr;

      if (Buffer.byteLength(buffer, 'utf8') > MAX_SSE_LINE_BUFFER_BYTES) {
        logger.warn('[Gateway] Upstream DeepSeek SSE line buffer exceeded 512KB, terminating stream.');
        break;
      }

      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) {
          yield line + '\n';
          continue;
        }
        const dataStr = line.slice(6).trim();
        const processed = processDataLine(dataStr);
        if (processed) {
          yield processed;
        }
        if (totalOutputChars >= MAX_SSE_OUTPUT_CHARS) {
          logger.warn('[Gateway] Upstream DeepSeek SSE reached 200k output char limit, stopping stream.');
          return;
        }
      }
    }

    if (totalOutputChars < MAX_SSE_OUTPUT_CHARS && buffer && buffer.startsWith('data: ')) {
      const dataStr = buffer.slice(6).trim();
      const processed = processDataLine(dataStr);
      if (processed) {
        yield processed;
      }
    }
  } finally {
    if (isThinking) {
      isThinking = false;
      const closeTag = {
        candidates: [{
          content: {
            parts: [{ text: '</think>\n\n' }]
          }
        }]
      };
      yield `data: ${JSON.stringify(closeTag)}\n\n`;
    }
    if (originalBody) {
      if (typeof originalBody.cancel === 'function') {
        await Promise.resolve(originalBody.cancel()).catch(() => {});
      } else if (typeof originalBody.destroy === 'function') {
        try { originalBody.destroy(); } catch {}
      }
    }
  }
}

/**
 * 直连 DeepSeek / OpenAI 兼容模型网关（含 SSRF 阻断、Pinned IP 防 DNS Rebinding、禁止重定向与严格密钥隔离）。
 */
async function fetchDeepSeek(urlType, originalOptions, modelName = null, timeoutMs = 60000) {
  const headers = originalOptions?.headers || {};
  const selectedModel = modelName && modelName !== 'default' ? modelName : (process.env.DEEPSEEK_CHAT_MODEL || DEEPSEEK_CHAT_MODEL || 'deepseek-chat');

  const getHeader = (targetName) => {
    const t = targetName.toLowerCase();
    for (const [k, v] of Object.entries(headers)) {
      if (k.toLowerCase() === t && v) return String(v).trim();
    }
    return '';
  };

  const clientSfKey = getHeader('x-siliconflow-api-key');
  const clientDsKey = getHeader('x-dashscope-api-key');
  const clientZpKey = getHeader('x-zhipu-api-key');
  const clientDeepseekKey = getHeader('x-deepseek-api-key');
  const clientOpenaiKey = getHeader('x-openai-api-key');
  const clientCustomUrl = getHeader('x-custom-api-url');
  const clientDeepseekUrl = getHeader('x-deepseek-api-url');

  const hasClientDomesticKey = Boolean(clientSfKey || clientDsKey || clientZpKey || clientDeepseekKey || clientOpenaiKey);
  const hasClientUrl = Boolean(clientCustomUrl || clientDeepseekUrl);

  let targetUrl = '';
  let targetKey = '';
  let providerName = 'DeepSeek';
  let userSuppliedUrl = '';

  const mLower = selectedModel.toLowerCase();
  if (
    clientSfKey ||
    selectedModel.startsWith('deepseek-ai/') ||
    selectedModel.startsWith('Qwen/') ||
    selectedModel.startsWith('Pro/') ||
    selectedModel.startsWith('TeleMM/') ||
    selectedModel.startsWith('internlm/') ||
    mLower.includes('siliconflow') ||
    (mLower.includes('qwen') && (clientSfKey || (!hasClientDomesticKey && process.env.SILICONFLOW_API_KEY)) && !clientDsKey) ||
    ((clientSfKey || (!hasClientDomesticKey && process.env.SILICONFLOW_API_KEY)) && !clientDsKey && !clientDeepseekKey && !clientZpKey)
  ) {
    providerName = 'SiliconFlow';
    userSuppliedUrl = clientCustomUrl;
    targetUrl = (userSuppliedUrl || process.env.SILICONFLOW_API_URL || 'https://api.siliconflow.cn/v1').replace(/\/+$/, '');
    targetKey = hasClientDomesticKey
      ? (clientSfKey || clientOpenaiKey)
      : (process.env.SILICONFLOW_API_KEY || process.env.OPENAI_API_KEY || '').trim();
  } else if (
    clientDsKey ||
    mLower.includes('dashscope') ||
    (mLower.includes('qwen') && (clientDsKey || (!hasClientDomesticKey && process.env.DASHSCOPE_API_KEY))) ||
    ((clientDsKey || (!hasClientDomesticKey && process.env.DASHSCOPE_API_KEY)) && !clientSfKey && !clientDeepseekKey && !clientZpKey)
  ) {
    providerName = 'DashScope';
    userSuppliedUrl = clientCustomUrl;
    targetUrl = (userSuppliedUrl || process.env.DASHSCOPE_API_URL || 'https://dashscope.aliyuncs.com/compatible-mode/v1').replace(/\/+$/, '');
    targetKey = hasClientDomesticKey
      ? (clientDsKey || clientOpenaiKey)
      : (process.env.DASHSCOPE_API_KEY || process.env.OPENAI_API_KEY || '').trim();
  } else if (
    clientZpKey ||
    mLower.includes('glm') ||
    mLower.includes('zhipu') ||
    ((clientZpKey || (!hasClientDomesticKey && process.env.ZHIPU_API_KEY)) && !clientSfKey && !clientDsKey && !clientDeepseekKey)
  ) {
    providerName = 'Zhipu';
    userSuppliedUrl = clientCustomUrl;
    targetUrl = (userSuppliedUrl || process.env.ZHIPU_API_URL || 'https://open.bigmodel.cn/api/paas/v4').replace(/\/+$/, '');
    targetKey = hasClientDomesticKey
      ? (clientZpKey || clientOpenaiKey)
      : (process.env.ZHIPU_API_KEY || process.env.OPENAI_API_KEY || '').trim();
  } else {
    providerName = 'DeepSeek';
    userSuppliedUrl = clientDeepseekUrl || clientCustomUrl;
    targetUrl = (userSuppliedUrl || process.env.DEEPSEEK_API_URL || DEEPSEEK_API_URL || 'https://api.deepseek.com/v1').replace(/\/+$/, '');
    targetKey = hasClientDomesticKey
      ? (clientDeepseekKey || clientOpenaiKey)
      : (process.env.DEEPSEEK_API_KEY || DEEPSEEK_API_KEY || process.env.OPENAI_API_KEY || '').trim();
  }

  // 1. SSRF 强制防线：对任何用户自定义或非默认地址进行严格 IPv6/DNS 解析校验，并禁止非官方域名携带服务端密钥
  let urlCheck = null;
  if (hasClientUrl || userSuppliedUrl) {
    urlCheck = await validateSafeUrlAsync(targetUrl, { requireHttps: isSafeProductionMode() });
    if (!urlCheck.safe) {
      const ssrfErr = new Error(`非法的模型接口地址: ${urlCheck.error}`);
      ssrfErr.code = 'ERR_SSRF_BLOCKED';
      ssrfErr.status = 400;
      ssrfErr.publicMessage = `自定义模型接口地址不安全: ${urlCheck.error}`;
      throw ssrfErr;
    }

    // 非官方地址严禁读取/附带任何服务端环境变量 API Key（防止 SSRF + Key 窃取）
    if (!urlCheck.isOfficial) {
      targetKey = clientDeepseekKey || clientOpenaiKey || clientSfKey || clientDsKey || clientZpKey || '';
    }
  } else {
    urlCheck = await validateSafeUrlAsync(targetUrl, { requireHttps: false });
    if (!urlCheck.safe) {
      const ssrfErr = new Error(`模型接口地址不可用: ${urlCheck.error}`);
      ssrfErr.code = 'ERR_SSRF_BLOCKED';
      ssrfErr.status = 400;
      throw ssrfErr;
    }
  }

  if (!targetKey) {
    const missingErr = new Error(`缺少 ${providerName} API Key，请在设置中配置有效密钥。`);
    missingErr.code = 'ERR_MISSING_API_KEY';
    missingErr.status = 400;
    missingErr.isMissingKey = true;
    missingErr.publicMessage = `未配置 ${providerName} API Key，请在设置中填写可用密钥。`;
    throw missingErr;
  }

  logger.info(`[Gateway] Routing request to ${providerName} (${selectedModel}) at ${targetUrl}...`);

  const geminiPayload = JSON.parse(originalOptions.body);
  const isStream = urlType === 'stream';
  const deepseekPayload = convertGeminiToDeepSeekPayload(geminiPayload, isStream, selectedModel);

  const url = `${targetUrl}/chat/completions`;
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  const finalSignal = originalOptions?.signal
    ? AbortSignal.any([originalOptions.signal, timeoutSignal])
    : timeoutSignal;

  let pinnedDispatcher = null;
  const fetchOptions = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept-Encoding': 'gzip, deflate, br',
      'Authorization': `Bearer ${targetKey}`
    },
    body: JSON.stringify(deepseekPayload),
    redirect: 'error',
    signal: finalSignal
  };

  if (hasClientUrl && urlCheck && !urlCheck.isOfficial) {
    // 非官方自定义端点：强制绑定 pinned DNS IP，绝不走可能绕过 SSRF 的 proxyAgent
    pinnedDispatcher = createPinnedDispatcher(urlCheck.hostname, urlCheck.addresses);
    fetchOptions.dispatcher = pinnedDispatcher;
  } else if (proxyAgent && process.env.PROXY_DOMESTIC === 'true') {
    fetchOptions.dispatcher = proxyAgent;
  } else if (urlCheck && urlCheck.addresses && urlCheck.addresses.length > 0) {
    pinnedDispatcher = createPinnedDispatcher(urlCheck.hostname, urlCheck.addresses);
    fetchOptions.dispatcher = pinnedDispatcher;
  }

  let response;
  try {
    response = await undici.fetch(url, fetchOptions);
  } catch (err) {
    if (pinnedDispatcher) {
      pinnedDispatcher.close?.().catch(() => {});
    }
    throw err;
  }

  if (!response.ok) {
    const errorBody = await response.text();
    if (pinnedDispatcher) {
      pinnedDispatcher.close?.().catch(() => {});
    }
    if (response.status === 401 || response.status === 403) {
      const authErr = new Error(`${providerName} API auth failed (${response.status}): ${errorBody.slice(0, 200)}`);
      authErr.code = hasClientDomesticKey ? 'ERR_INVALID_CLIENT_KEY' : 'ERR_UPSTREAM_AUTH';
      authErr.status = 401;
      throw authErr;
    }
    if (response.status === 429) {
      const quotaErr = new Error('QUOTA_EXHAUSTED');
      quotaErr.code = 'ERR_QUOTA_EXHAUSTED';
      quotaErr.status = 429;
      throw quotaErr;
    }
    throw new Error(`${providerName} API failed: ${response.status} ${errorBody.slice(0, 300)}`);
  }

  if (isStream) {
    logger.info(`[Gateway] Connected to ${providerName} streaming API.`);
    const translatedGenerator = translateDeepSeekStream(response.body);
    const wrappedGenerator = (async function* () {
      try {
        for await (const item of translatedGenerator) {
          yield item;
        }
      } finally {
        if (pinnedDispatcher) {
          pinnedDispatcher.close?.().catch(() => {});
        }
      }
    })();

    return {
      ok: true,
      status: 200,
      body: wrappedGenerator,
      headers: response.headers
    };
  } else {
    const data = await response.json();
    if (pinnedDispatcher) {
      pinnedDispatcher.close?.().catch(() => {});
    }
    logger.info('[Gateway] Received non-streaming response from DeepSeek.');
    const text = data.choices?.[0]?.message?.content || '';

    const usageProfileId = originalOptions?.profileId || originalOptions?.headers?.['x-internal-profile-id'] || 'default';
    try {
      logApiUsage(selectedModel, 'chat', geminiPayload.contents?.[0]?.parts?.[0]?.text || '', text, 'success', usageProfileId);
    } catch (err) {
      logger.error('[API Usage Log Failed]', err);
    }

    const geminiMockData = {
      candidates: [{
        content: {
          parts: [{ text }]
        }
      }],
      fallback_provider: 'deepseek'
    };

    return {
      ok: true,
      status: 200,
      json: async () => geminiMockData,
      text: async () => JSON.stringify(geminiMockData),
      headers: response.headers
    };
  }
}

/**
 * 带自动密钥轮换与客户端 Key 严格隔离的 AI 网关调度器。
 * - 一旦请求携带任何客户端自定义 Key 或自定义 URL（isIsolatedClient），全程隔离：
 *   1) 绝不回退使用服务端 API_KEYS 或服务端 DEEPSEEK_API_KEY / 国内 Key 池
 *   2) 绝不将客户端 Key 写入全局 invalidKeys / keyCooldown / keyLastUsed
 */
async function fetchWithKeyRotation(buildURL, options, maxRetries = 8, timeoutMs = 30000, modelName = null, skipDeepSeek = false) {
  let rawModel = modelName && modelName !== 'default' ? modelName : CHAT_MODEL;
  if (!/^[a-zA-Z0-9./_-]+$/.test(rawModel)) {
    logger.warn(`Invalid model name format provided: ${rawModel}, falling back to default`);
    rawModel = CHAT_MODEL;
  }
  const primaryGeminiModel = CHAT_MODEL || 'gemini-3-flash-preview';
  const liteGeminiModel = process.env.CHAT_LITE_MODEL || 'gemini-3.1-flash-lite';
  if (rawModel === 'gemini' || rawModel === 'gemini-flash' || rawModel === 'gemini-2.5' || rawModel === 'gemini-3.6-flash') {
    rawModel = primaryGeminiModel;
  }
  if (rawModel === 'deepseek' || rawModel === 'deepseek-v3') {
    rawModel = 'deepseek-chat';
  }
  if (rawModel.includes('gemini-2.0-flash') || rawModel.includes('gemini-1.5') || rawModel === 'gemini-2.5-flash' || rawModel === 'gemini-2.5-flash-lite') {
    rawModel = primaryGeminiModel;
  }
  let currentModel = rawModel;

  const getClientHeader = (name) => {
    const lower = name.toLowerCase();
    for (const [k, v] of Object.entries(options?.headers || {})) {
      if (k.toLowerCase() === lower && v) return String(v).trim();
    }
    return '';
  };

  const clientGeminiKey = getClientHeader('x-gemini-api-key');
  const clientSfKey = getClientHeader('x-siliconflow-api-key');
  const clientDsKey = getClientHeader('x-dashscope-api-key');
  const clientZpKey = getClientHeader('x-zhipu-api-key');
  const clientDeepseekKey = getClientHeader('x-deepseek-api-key');
  const clientOpenaiKey = getClientHeader('x-openai-api-key');
  const clientCustomUrl = getClientHeader('x-custom-api-url');
  const clientDeepseekUrl = getClientHeader('x-deepseek-api-url');

  const hasClientGeminiKey = Boolean(clientGeminiKey);
  const hasClientDomesticKey = Boolean(clientSfKey || clientDsKey || clientZpKey || clientDeepseekKey || clientOpenaiKey);
  const normalizedDeepseekUrl = clientDeepseekUrl ? clientDeepseekUrl.replace(/\/+$/, '').toLowerCase() : '';
  // 孤立的默认 x-deepseek-api-url (未携带任何自定义 Key) 不应触发客户端隔离锁而架空服务端 Gemini 密钥池
  const hasNonDefaultCustomUrl = Boolean(
    clientCustomUrl ||
    (clientDeepseekUrl && normalizedDeepseekUrl !== 'https://api.deepseek.com/v1')
  );
  const hasClientUrl = Boolean(clientCustomUrl || (clientDeepseekUrl && hasClientDomesticKey));
  const isIsolatedClient = hasClientGeminiKey || hasClientDomesticKey || Boolean(clientCustomUrl);

  let hasImage = false;
  try {
    if (options && options.body) {
      const parsedBody = typeof options.body === 'string' ? JSON.parse(options.body) : options.body;
      if (parsedBody && Array.isArray(parsedBody.contents)) {
        for (const content of parsedBody.contents) {
          if (content.parts && content.parts.some(p => p.inline_data)) {
            hasImage = true;
            break;
          }
        }
      }
    }
  } catch {}

  if (hasImage && !isOpenAiVisionModel(currentModel)) {
    const isGeminiVision = currentModel.toLowerCase().includes('gemini');
    if (!isGeminiVision || (hasClientDomesticKey && !hasClientGeminiKey)) {
      const sfKey = isIsolatedClient ? clientSfKey : (clientSfKey || process.env.SILICONFLOW_API_KEY || '').trim();
      const dsKey = isIsolatedClient ? clientDsKey : (clientDsKey || process.env.DASHSCOPE_API_KEY || '').trim();
      const zpKey = isIsolatedClient ? clientZpKey : (clientZpKey || process.env.ZHIPU_API_KEY || '').trim();

      if (sfKey) {
        currentModel = 'deepseek-ai/deepseek-vl2';
        logger.info(`[Model Router] Auto-switched to SiliconFlow vision model '${currentModel}'.`);
      } else if (dsKey) {
        currentModel = 'qwen2.5-vl-72b-instruct';
        logger.info(`[Model Router] Auto-switched to DashScope vision model '${currentModel}'.`);
      } else if (zpKey) {
        currentModel = 'glm-4v-flash';
        logger.info(`[Model Router] Auto-switched to Zhipu vision model '${currentModel}'.`);
      } else if (!hasClientDomesticKey) {
        currentModel = primaryGeminiModel;
      }
    }
  } else if (!hasImage && hasClientDomesticKey && !hasClientGeminiKey && currentModel.toLowerCase().includes('gemini') && !skipDeepSeek) {
    // 若客户端仅提供了国内/OpenAI Key 且默认路由了 Gemini 模型，优先路由到国内通道
    if (clientDeepseekKey) currentModel = process.env.DEEPSEEK_CHAT_MODEL || DEEPSEEK_CHAT_MODEL || 'deepseek-chat';
    else if (clientSfKey) currentModel = 'deepseek-ai/DeepSeek-V3';
    else if (clientDsKey) currentModel = 'qwen-plus';
    else if (clientZpKey) currentModel = 'glm-4-flash';
  }

  const fallbackModel = process.env.DEEPSEEK_CHAT_MODEL || DEEPSEEK_CHAT_MODEL || 'deepseek-chat';
  const fallbackCanSeeImage = isOpenAiVisionModel(fallbackModel);
  const effectiveSkipDeepSeek = skipDeepSeek || (hasImage && !fallbackCanSeeImage && !clientSfKey && !clientDsKey && !clientZpKey);

  // 客户端隔离模式下，Gemini 可用密钥仅限请求自带的 clientGeminiKey（绝不回退服务端 API_KEYS）
  const validKeys = isIsolatedClient
    ? (clientGeminiKey ? [clientGeminiKey] : [])
    : API_KEYS.filter(k => !invalidKeys.has(k));

  const isOpenAiCompatible = currentModel.toLowerCase().includes('deepseek') ||
                             currentModel.toLowerCase().includes('qwen') ||
                             currentModel.toLowerCase().includes('glm') ||
                             currentModel.toLowerCase().includes('step-') ||
                             currentModel.startsWith('Qwen/') ||
                             currentModel.startsWith('Pro/') ||
                             (hasNonDefaultCustomUrl && !hasClientGeminiKey);

  let url = buildURL(currentModel);
  const urlType = url.includes('streamGenerateContent') ? 'stream' : (url.includes('embedContent') ? 'embed' : 'chat');

  if ((isOpenAiCompatible || (hasClientDomesticKey && !hasClientGeminiKey && !effectiveSkipDeepSeek)) && (urlType === 'chat' || urlType === 'stream')) {
    try {
      return await fetchDeepSeek(urlType, options, currentModel, timeoutMs);
    } catch (dsErr) {
      if (dsErr?.code === 'ERR_SSRF_BLOCKED' || (isIsolatedClient && !hasClientGeminiKey)) {
        throw dsErr;
      }
      if (validKeys.length > 0) {
        logger.warn(`[Gateway] ${currentModel} failed (${dsErr.message}). Falling back to Gemini...`);
        currentModel = primaryGeminiModel;
        url = buildURL(currentModel);
      } else {
        throw dsErr;
      }
    }
  }

  if (validKeys.length === 0) {
    const canTryDomestic = (urlType === 'chat' || urlType === 'stream') && !effectiveSkipDeepSeek &&
      (!isIsolatedClient || hasClientDomesticKey || hasClientUrl);

    if (canTryDomestic) {
      const hasAnyDomesticConfig = isIsolatedClient
        ? (hasClientDomesticKey || hasClientUrl)
        : Boolean(process.env.SILICONFLOW_API_KEY || process.env.DASHSCOPE_API_KEY || process.env.ZHIPU_API_KEY || process.env.DEEPSEEK_API_KEY || DEEPSEEK_API_KEY || process.env.OPENAI_API_KEY);

      if (hasAnyDomesticConfig) {
        return await fetchDeepSeek(urlType, options, currentModel, timeoutMs);
      }
    }

    const noServerKeyConfigured = API_KEYS.length === 0 && !clientGeminiKey;
    const quotaErr = new Error('EMBED_QUOTA_EXHAUSTED');
    if (noServerKeyConfigured) {
      quotaErr.code = 'ERR_MISSING_API_KEY';
      quotaErr.status = 400;
      quotaErr.isMissingKey = true;
    } else {
      quotaErr.code = 'EMBED_QUOTA_EXHAUSTED';
      quotaErr.status = 429;
    }
    throw quotaErr;
  }

  let lastError = null;
  const loopLimit = hasClientGeminiKey ? Math.min(maxRetries, 3) : Math.min(maxRetries, 6);
  let consecutiveErrors = 0;

  for (let attempt = 0; attempt < loopLimit; attempt++) {
    if (consecutiveErrors >= 3) {
      logger.warn('[KeyPool] Circuit breaker triggered after 3 consecutive network/API failures.');
      break;
    }

    if (options.signal && options.signal.aborted) {
      throw new DOMException('The operation was aborted.', 'AbortError');
    }

    // 隔离锁：携带客户端 Gemini Key 时全程锁定该 Key，绝不调用 getNextKey() 偷用服务端池
    let key = hasClientGeminiKey ? clientGeminiKey : getNextKey();
    if (!hasClientGeminiKey && (invalidKeys.has(key) || (keyCooldown.get(key) && Date.now() <= keyCooldown.get(key)))) {
      key = null;
      for (const candidate of validKeys) {
        if (!invalidKeys.has(candidate)) {
          const cooldownUntil = keyCooldown.get(candidate);
          if (!cooldownUntil || Date.now() > cooldownUntil) {
            key = candidate;
            break;
          }
        }
      }
    }

    if (!key) {
      if ((urlType === 'chat' || urlType === 'stream') && !effectiveSkipDeepSeek && !isIsolatedClient) {
        return await fetchDeepSeek(urlType, options, null, timeoutMs);
      }
      const activeCooldowns = [...keyCooldown.entries()]
        .filter(([k, expiry]) => validKeys.includes(k) && expiry && expiry > Date.now())
        .map(([_, expiry]) => expiry);

      if (activeCooldowns.length > 0) {
        const earliestExpiry = Math.min(...activeCooldowns);
        const waitMs = earliestExpiry - Date.now();
        if (waitMs > 0 && waitMs < 30000) {
          await new Promise(r => setTimeout(r, waitMs));
        }
      }
      for (const candidate of validKeys) {
        if (!invalidKeys.has(candidate)) {
          const cooldownUntil = keyCooldown.get(candidate);
          if (!cooldownUntil || Date.now() > cooldownUntil) {
            key = candidate;
            break;
          }
        }
      }
      if (!key) key = validKeys[0];
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      try { controller.abort(); } catch (err) { logger.warn('Failed to abort controller on timeout:', err); }
    }, timeoutMs);

    const onExternalAbort = () => {
      try { controller.abort(); } catch (err) { logger.warn('Failed to abort controller on external abort:', err); }
    };

    if (options.signal) {
      if (options.signal.aborted) {
        controller.abort();
      } else {
        options.signal.addEventListener('abort', onExternalAbort);
      }
    }

    const cleanup = () => {
      clearTimeout(timeoutId);
      if (options.signal) {
        options.signal.removeEventListener('abort', onExternalAbort);
      }
    };

    const cleanOutboundHeaders = {};
    for (const [k, v] of Object.entries(options?.headers || {})) {
      if (k.toLowerCase() === 'x-internal-profile-id') continue;
      cleanOutboundHeaders[k] = v;
    }
    const usageProfileId = options?.profileId || getClientHeader('x-internal-profile-id') || 'default';

    try {
      const fetchOptions = {
        ...options,
        headers: { ...cleanOutboundHeaders, 'x-goog-api-key': key },
        signal: controller.signal
      };
      if (proxyAgent) fetchOptions.dispatcher = proxyAgent;

      const response = await undici.fetch(url, fetchOptions);
      if (response.ok) {
        cleanup();
        consecutiveErrors = 0;
        // 补全非流式 Gemini 计费记账（作文/组卷/批卷/整页作业/识题/错题变式等），确保免费配额真实累加且按 profileId 隔离
        if (urlType === 'chat' && !isIsolatedClient) {
          let promptText = '';
          try {
            const parsedReq = typeof options?.body === 'string' ? JSON.parse(options.body) : options?.body;
            promptText = parsedReq?.contents?.[0]?.parts?.find(p => typeof p?.text === 'string')?.text || '';
          } catch {}
          logApiUsage(currentModel, 'chat', promptText || 'non_stream_prompt', 0, 'success', usageProfileId);
        }
        return response;
      }

      const body = await response.text();
      cleanup();
      lastError = new Error(`API error ${response.status}: ${body}`);

      if (response.status === 404) {
        if (urlType === 'embed' && currentModel !== 'gemini-embedding-001') {
          currentModel = 'gemini-embedding-001';
          url = buildURL(currentModel);
          continue;
        }
        if (urlType !== 'embed' && !isOpenAiCompatible) {
          if (currentModel !== primaryGeminiModel) {
            currentModel = primaryGeminiModel;
            url = buildURL(currentModel);
            continue;
          }
          if (currentModel !== liteGeminiModel) {
            currentModel = liteGeminiModel;
            url = buildURL(currentModel);
            continue;
          }
        }
        throw new Error(`MODEL_NOT_FOUND: Model '${currentModel}' is not supported or not found.`);
      }

      if (response.status === 429 || response.status === 503) {
        if (/quota/i.test(body)) {
          if (urlType !== 'embed' && currentModel !== liteGeminiModel && !isOpenAiCompatible) {
            currentModel = liteGeminiModel;
            url = buildURL(currentModel);
            continue;
          }
          if (!hasClientGeminiKey) {
            keyCooldown.set(key, Date.now() + 60_000);
          }
          logger.warn(`[KeyPool] Key ${maskKey(key)} quota exhausted.`);
          continue;
        }

        if (urlType !== 'embed' && !isOpenAiCompatible) {
          const alternateModel = currentModel === primaryGeminiModel ? liteGeminiModel : primaryGeminiModel;
          currentModel = alternateModel;
          url = buildURL(currentModel);
          if (!hasClientGeminiKey) keyCooldown.set(key, Date.now() + 5000);
          await new Promise(resolve => setTimeout(resolve, 800));
          continue;
        }

        if (!hasClientGeminiKey) keyCooldown.set(key, Date.now() + 5000);
        await new Promise(resolve => setTimeout(resolve, 1500));
      } else {
        const isKeyAuthError = response.status === 401 ||
          /API_KEY_INVALID|API key not valid|PERMISSION_DENIED|key.*invalid|CONSUMER_SUSPENDED/i.test(body);
        if (isKeyAuthError) {
          if (hasClientGeminiKey) {
            const clientAuthErr = new Error(`Client API key rejected (${response.status})`);
            clientAuthErr.code = 'ERR_INVALID_CLIENT_KEY';
            clientAuthErr.status = 401;
            throw clientAuthErr;
          }
          invalidKeys.add(key);
          logger.error(`[KeyPool] Key ${maskKey(key)} returned critical key auth error ${response.status}. Key disabled.`);
          continue;
        } else {
          logger.warn(`[KeyPool] API returned ${response.status} (${body.slice(0, 120)}), key remains valid.`);
          break;
        }
      }
    } catch (e) {
      cleanup();
      if (e?.code === 'ERR_INVALID_CLIENT_KEY') throw e;
      lastError = e;
      consecutiveErrors++;
      logger.warn(`Network error on key ${maskKey(key)}: ${e.message}, retrying... (Attempt ${attempt + 1}/${loopLimit}).`);
      if (!hasClientGeminiKey) {
        keyCooldown.set(key, Date.now() + 10_000);
      }
      await new Promise(resolve => setTimeout(resolve, 1500));
    }
  }

  // 严禁在客户端 Key 隔离模式下回退消耗服务端 DeepSeek 密钥池
  const canFallbackDomestic = (urlType === 'chat' || urlType === 'stream') && !effectiveSkipDeepSeek &&
    (!isIsolatedClient || hasClientDomesticKey || hasClientUrl);

  if (canFallbackDomestic) {
    try {
      return await fetchDeepSeek(urlType, options, null, timeoutMs);
    } catch (fallbackErr) {
      logger.error(`[Gateway] Fallback DeepSeek failed as well: ${fallbackErr.message}`);
      throw lastError || fallbackErr;
    }
  }

  throw lastError || new Error('QUOTA_EXHAUSTED');
}

const EMBED_CACHE_MAX_SIZE = parseInt(process.env.EMBED_CACHE_MAX_SIZE || '1000', 10);
const _embedCache = new Map();

function getCachedEmbedding(text) {
  const cleaned = String(text).trim().substring(0, 1500);
  if (_embedCache.has(cleaned)) {
    const val = _embedCache.get(cleaned);
    _embedCache.delete(cleaned);
    _embedCache.set(cleaned, val);
    return val;
  }
  return null;
}

function setCachedEmbedding(text, vector) {
  if (!vector) return;
  const cleaned = String(text).trim().substring(0, 1500);
  if (_embedCache.has(cleaned)) {
    _embedCache.delete(cleaned);
  } else if (_embedCache.size >= EMBED_CACHE_MAX_SIZE) {
    const oldestKey = _embedCache.keys().next().value;
    _embedCache.delete(oldestKey);
  }
  _embedCache.set(cleaned, vector);
}

async function getEmbedding(text, clientHeaders = {}, profileId = 'default') {
  const cleanedText = String(text).trim().substring(0, 1500);
  if (!cleanedText) return null;

  const cached = getCachedEmbedding(cleanedText);
  if (cached) {
    logger.info(`[EmbeddingCache] Hit for text: "${cleanedText.substring(0, 30)}..."`);
    return cached;
  }

  const effectivePid = profileId || clientHeaders?.['x-internal-profile-id'] || 'default';
  try {
    const response = await fetchWithKeyRotation(buildEmbedURL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(clientHeaders || {}) },
      profileId: effectivePid,
      body: JSON.stringify({
        model: `models/${EMBED_MODEL}`,
        content: { parts: [{ text: cleanedText }] },
        outputDimensionality: 768
      })
    });
    const data = await response.json();
    const vector = data.embedding?.values || null;
    if (vector) {
      setCachedEmbedding(cleanedText, vector);
      logApiUsage(EMBED_MODEL, 'embed', cleanedText, 0, 'success', effectivePid);
    } else {
      logApiUsage(EMBED_MODEL, 'embed', cleanedText, 0, 'error', effectivePid);
    }
    return vector;
  } catch (err) {
    logApiUsage(EMBED_MODEL, 'embed', cleanedText, 0, 'error', effectivePid);
    const msg = String(err?.message || '');
    if (msg.includes('429') || /quota/i.test(msg) || msg.includes('QUOTA_EXHAUSTED')) {
      const quotaErr = new Error('EMBED_QUOTA_EXHAUSTED');
      quotaErr.code = err?.code || 'EMBED_QUOTA_EXHAUSTED';
      quotaErr.isMissingKey = err?.isMissingKey;
      throw quotaErr;
    }
    throw err;
  }
}

function unmarkInvalidKey(key) {
  if (key) {
    invalidKeys.delete(key);
    keyCooldown.delete(key);
  }
}

function resetKeyPool() {
  invalidKeys.clear();
  keyCooldown.clear();
}

module.exports = {
  fetchWithKeyRotation,
  fetchDeepSeek,
  translateDeepSeekStream,
  getEmbedding,
  buildChatURL,
  buildStreamURL,
  startEmbeddingCheck,
  convertGeminiToDeepSeekPayload,
  isOpenAiVisionModel,
  unmarkInvalidKey,
  resetKeyPool,
  _internal: { invalidKeys, keyCooldown, keyLastUsed }
};
