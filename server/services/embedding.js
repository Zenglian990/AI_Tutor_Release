const { ProxyAgent, fetch: undiciFetch } = require('undici');
const { API_KEYS, proxyUrl, EMBED_MODEL, CHAT_MODEL, DEEPSEEK_API_KEY, DEEPSEEK_API_URL, DEEPSEEK_CHAT_MODEL } = require('../config');
const logger = require('./logger');
const { logApiUsage } = require('./usage');

const proxyAgent = proxyUrl ? new ProxyAgent(proxyUrl) : null;
if (proxyAgent) logger.info(`[Proxy] Using ${proxyUrl} for API requests`);

const _keyLastUsed = new Map();

function getNextKey() {
  // Filter out permanently invalid keys
  const activeKeys = API_KEYS.filter(k => !_invalidKeys.has(k));
  if (activeKeys.length === 0) return API_KEYS[0]; // fallback

  const now = Date.now();
  // Filter keys not in cooldown
  const available = activeKeys.filter(k => {
    const cd = _keyCooldown.get(k);
    return !cd || now > cd;
  });

  // Fall back to all active keys if all are in cooldown
  const candidatePool = available.length > 0 ? available : activeKeys;

  let selectedKey = candidatePool[0];
  let oldestTime = _keyLastUsed.get(selectedKey) || 0;

  for (const k of candidatePool) {
    const lastUsed = _keyLastUsed.get(k) || 0;
    if (lastUsed < oldestTime) {
      oldestTime = lastUsed;
      selectedKey = k;
    }
  }

  _keyLastUsed.set(selectedKey, now);
  return selectedKey;
}

function buildEmbedURL() {
  return `https://generativelanguage.googleapis.com/v1beta/models/${EMBED_MODEL}:embedContent`;
}

function buildChatURL(modelName) {
  const selectedModel = modelName || CHAT_MODEL;
  return `https://generativelanguage.googleapis.com/v1beta/models/${selectedModel}:generateContent`;
}

function buildStreamURL(modelName) {
  const selectedModel = modelName || CHAT_MODEL;
  return `https://generativelanguage.googleapis.com/v1beta/models/${selectedModel}:streamGenerateContent?alt=sse`;
}

// Key pool health and cooldown states
const _keyCooldown = new Map(); // key -> timestamp when cooldown ends
const _invalidKeys = new Set(); // permanently failed keys

/**
 * Perform active health check on all Gemini keys
 */
async function checkKeysHealth() {
  logger.info('[HealthCheck] Starting Gemini API keys validation...');
  for (const key of API_KEYS) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${CHAT_MODEL}:generateContent?key=${key}`;
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
      const timeoutId = setTimeout(() => controller.abort(), 8000);
      fetchOptions.signal = controller.signal;

      const res = await undiciFetch(url, fetchOptions);
      clearTimeout(timeoutId);

      if (res.status === 400 || res.status === 403) {
        logger.error(`[HealthCheck] Key ${key.slice(0, 6)}... is INVALID (status ${res.status}). Marking as disabled.`);
        _invalidKeys.add(key);
        _keyLastUsed.delete(key);
        _keyCooldown.delete(key);
      } else {
        if (_invalidKeys.has(key)) {
          logger.info(`[HealthCheck] Key ${key.slice(0, 6)}... recovered. Re-enabling.`);
          _invalidKeys.delete(key);
        }
      }
    } catch (err) {
      logger.warn(`[HealthCheck] Network check failed for key ${key.slice(0, 6)}...: ${err.message}`);
    }
  }
  logger.info(`[HealthCheck] Completed. Active keys: ${API_KEYS.filter(k => !_invalidKeys.has(k)).length}/${API_KEYS.length}`);
}

// Start active validation check every 10 minutes, and once on startup (delayed 5s)
setInterval(checkKeysHealth, 10 * 60 * 1000).unref();
setTimeout(checkKeysHealth, 5000).unref();

/**
 * Convert Gemini payload structure to DeepSeek (OpenAI compatible) payload
 */
function convertGeminiToDeepSeekPayload(geminiPayload, isStream, modelName = null) {
  const contents = geminiPayload.contents || [];
  let userMessageContent = '';

  if (contents.length > 0 && contents[0].parts) {
    const textParts = contents[0].parts.filter(p => p.text).map(p => p.text);
    userMessageContent = textParts.join('\n');
    
    // Check if there is image data
    const hasImage = contents[0].parts.some(p => p.inline_data);
    if (hasImage) {
      userMessageContent += '\n(注意：备用大模型收到了图片描述提问，但由于降级运行在文本模型模式，无法直接看图，已基于上下文文本进行回答)';
    }
  }
  
  // Optimize prompt format for DeepSeek: Split System and User roles
  let messages = [];
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
    messages = [
      { role: 'user', content: userMessageContent }
    ];
  }
  
  const deepseekPayload = {
    model: modelName && modelName !== 'default' ? modelName : DEEPSEEK_CHAT_MODEL,
    messages: messages,
    temperature: geminiPayload.generationConfig?.temperature ?? 0.2,
    stream: isStream,
    thinking: {
      type: "enabled"
    }
  };

  if (geminiPayload.generationConfig?.maxOutputTokens) {
    deepseekPayload.max_tokens = geminiPayload.generationConfig.maxOutputTokens;
  }

  return deepseekPayload;
}

/**
 * Translates DeepSeek SSE Stream chunks to Gemini format chunks in real-time
 */
async function* translateDeepSeekStream(originalBody) {
  let buffer = '';
  let isThinking = false;

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
          outputText += '\n> 🧠 **[思考过程]**\n> ';
        }
        outputText += reasoning.replace(/\n/g, '\n> ');
      } else if (text !== undefined && text !== null && text !== '') {
        if (isThinking) {
          isThinking = false;
          outputText += '\n\n';
        }
        outputText += text;
      }

      if (outputText !== '') {
        const translated = {
          candidates: [{
            content: {
              parts: [{ text: outputText }]
            }
          }]
        };
        return `data: ${JSON.stringify(translated)}\n\n`;
      }
    } catch (e) {
      return 'data: ' + dataStr + '\n\n';
    }
    return null;
  }

  for await (const chunk of originalBody) {
    const chunkStr = typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf-8');
    buffer += chunkStr;
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
    }
  }

  if (buffer && buffer.startsWith('data: ')) {
    const dataStr = buffer.slice(6).trim();
    const processed = processDataLine(dataStr);
    if (processed) {
      yield processed;
    }
  }
}

/**
 * Direct request to DeepSeek API when Gemini is unavailable or explicitly requested
 */
async function fetchDeepSeek(urlType, originalOptions, modelName = null) {
  if (!DEEPSEEK_API_KEY) {
    throw new Error('All Gemini keys failed and no DEEPSEEK_API_KEY is configured for fallback.');
  }

  const selectedModel = modelName && modelName !== 'default' ? modelName : DEEPSEEK_CHAT_MODEL;
  logger.warn(`[Gateway] Routing request to DeepSeek (${selectedModel})...`);

  const geminiPayload = JSON.parse(originalOptions.body);
  const isStream = urlType === 'stream';
  const deepseekPayload = convertGeminiToDeepSeekPayload(geminiPayload, isStream, selectedModel);

  const url = `${DEEPSEEK_API_URL}/chat/completions`;
  const fetchOptions = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${DEEPSEEK_API_KEY}`
    },
    body: JSON.stringify(deepseekPayload)
  };
  if (proxyAgent) fetchOptions.dispatcher = proxyAgent;

  const response = await undiciFetch(url, fetchOptions);
  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`DeepSeek API failed: ${response.status} ${errorBody}`);
  }

  if (isStream) {
    logger.info('[Gateway] Connected to DeepSeek streaming API.');
    const translatedGenerator = translateDeepSeekStream(response.body);
    return {
      ok: true,
      status: 200,
      body: translatedGenerator,
      headers: response.headers
    };
  } else {
    const data = await response.json();
    logger.info('[Gateway] Received non-streaming response from DeepSeek.');
    const text = data.choices?.[0]?.message?.content || '';
    
    try {
      logApiUsage(selectedModel, 'chat', geminiPayload.contents?.[0]?.parts?.[0]?.text || '', text, 'success');
    } catch (err) {}

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
 * Fetch with automatic key rotation and retry logic.
 * Tracks per-key rate limit state and falls back to DeepSeek if pool is depleted.
 */
async function fetchWithKeyRotation(buildURL, options, maxRetries = 8, timeoutMs = 30000, modelName = null) {
  const selectedModel = modelName && modelName !== 'default' ? modelName : CHAT_MODEL;
  
  // Check if directly routing to DeepSeek
  const isDeepSeek = selectedModel.toLowerCase().includes('deepseek');
  const url = buildURL(selectedModel);
  const urlType = url.includes('streamGenerateContent') ? 'stream' : (url.includes('embedContent') ? 'embed' : 'chat');

  if (isDeepSeek && (urlType === 'chat' || urlType === 'stream')) {
    return await fetchDeepSeek(urlType, options, selectedModel);
  }

  // Rewrite model parameter in body for Gemini requests
  let modifiedOptions = options;
  if (options.body && !isDeepSeek) {
    try {
      const parsedBody = JSON.parse(options.body);
      parsedBody.model = `models/${selectedModel}`;
      modifiedOptions = {
        ...options,
        body: JSON.stringify(parsedBody)
      };
    } catch (err) {}
  }

  // Filter valid keys
  const validKeys = API_KEYS.filter(k => !_invalidKeys.has(k));

  if (validKeys.length === 0) {
    if (urlType === 'chat' || urlType === 'stream') {
      return await fetchDeepSeek(urlType, modifiedOptions);
    }
    throw new Error('EMBED_QUOTA_EXHAUSTED');
  }

  let lastError = null;
  const loopLimit = Math.max(maxRetries, validKeys.length * 2);

  for (let attempt = 0; attempt < loopLimit; attempt++) {
    if (modifiedOptions.signal && modifiedOptions.signal.aborted) {
      throw new DOMException('The operation was aborted.', 'AbortError');
    }
    let key = getNextKey();
    if (_invalidKeys.has(key) || (_keyCooldown.get(key) && Date.now() <= _keyCooldown.get(key))) {
      key = null;
      for (const candidate of validKeys) {
        if (!_invalidKeys.has(candidate)) {
          const cooldownUntil = _keyCooldown.get(candidate);
          if (!cooldownUntil || Date.now() > cooldownUntil) {
            key = candidate;
            break;
          }
        }
      }
    }
    if (!key) {
      if (urlType === 'chat' || urlType === 'stream') {
        return await fetchDeepSeek(urlType, modifiedOptions);
      }
      // For embed requests, wait for the earliest cooldown to expire
      const activeCooldowns = [..._keyCooldown.entries()]
        .filter(([k, expiry]) => validKeys.includes(k) && expiry && expiry > Date.now())
        .map(([_, expiry]) => expiry);
      
      if (activeCooldowns.length > 0) {
        const earliestExpiry = Math.min(...activeCooldowns);
        const waitMs = earliestExpiry - Date.now();
        if (waitMs > 0 && waitMs < 30000) {
          logger.info(`[KeyPool] All keys in cooldown for embed request. Waiting ${waitMs}ms for nearest key...`);
          await new Promise(r => setTimeout(r, waitMs));
        }
      }
      // Try finding a key again after wait
      for (const candidate of validKeys) {
        if (!_invalidKeys.has(candidate)) {
          const cooldownUntil = _keyCooldown.get(candidate);
          if (!cooldownUntil || Date.now() > cooldownUntil) {
            key = candidate;
            break;
          }
        }
      }
      if (!key) {
        key = validKeys[0];
      }
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      try { controller.abort(); } catch (err) {}
    }, timeoutMs);

    const onExternalAbort = () => {
      try { controller.abort(); } catch (err) {}
    };

    if (modifiedOptions.signal) {
      if (modifiedOptions.signal.aborted) {
        controller.abort();
      } else {
        modifiedOptions.signal.addEventListener('abort', onExternalAbort);
      }
    }

    const cleanup = () => {
      clearTimeout(timeoutId);
      if (modifiedOptions.signal) {
        modifiedOptions.signal.removeEventListener('abort', onExternalAbort);
      }
    };

    try {
      const fetchOptions = {
        ...modifiedOptions,
        headers: { ...(modifiedOptions.headers || {}), 'x-goog-api-key': key },
        signal: controller.signal
      };
      if (proxyAgent) fetchOptions.dispatcher = proxyAgent;

      const response = await undiciFetch(url, fetchOptions);
      if (response.ok) {
        cleanup();
        return response;
      }

      const body = await response.text();
      cleanup();
      lastError = new Error(`API error ${response.status}: ${body}`);

      if (response.status === 404) {
        logger.error(`[KeyPool] Model not found (404) for model '${selectedModel}'. Check model configuration.`);
        throw new Error(`MODEL_NOT_FOUND: Model '${selectedModel}' is not supported or not found.`);
      }

      if (response.status === 429 || response.status === 503) {
        if (/quota/i.test(body)) {
          _keyCooldown.set(key, Date.now() + 60_000);
          logger.warn(`[KeyPool] Key ${key.slice(0, 6)}... quota exhausted, cooling down.`);
          continue;
        }
        logger.warn(`API ${response.status} on key ${key.slice(0, 6)}..., cooling down and retrying (Attempt ${attempt + 1}/${loopLimit}).`);
        _keyCooldown.set(key, Date.now() + 5000);
        await new Promise(resolve => setTimeout(resolve, 1500));
      } else {
        // Critical key error (400 key invalid / 403 blocked)
        _invalidKeys.add(key);
        logger.error(`[KeyPool] Key ${key.slice(0, 6)}... returned critical error ${response.status}. Key disabled.`);
        continue;
      }
    } catch (e) {
      cleanup();
      lastError = e;
      logger.warn(`Network error on key ${key.slice(0, 6)}...: ${e.message}, retrying... (Attempt ${attempt + 1}/${loopLimit}).`);
      _keyCooldown.set(key, Date.now() + 10_000);
      await new Promise(resolve => setTimeout(resolve, 1500));
    }
  }

  // All Gemini retries failed. If chat or stream, attempt DeepSeek fallback!
  if (urlType === 'chat' || urlType === 'stream') {
    try {
      return await fetchDeepSeek(urlType, modifiedOptions);
    } catch (fallbackErr) {
      logger.error(`[Gateway] Fallback DeepSeek failed as well: ${fallbackErr.message}`);
      throw lastError || fallbackErr;
    }
  }

  throw lastError || new Error('QUOTA_EXHAUSTED');
}

// Embedding Cache System (Issue 14)
const EMBED_CACHE_MAX_SIZE = 5000;
const _embedCache = new Map();

function getCachedEmbedding(text) {
  const cleaned = String(text).trim().substring(0, 1500);
  if (_embedCache.has(cleaned)) {
    const val = _embedCache.get(cleaned);
    _embedCache.delete(cleaned);
    _embedCache.set(cleaned, val); // Move to end (most recently used)
    return val;
  }
  return null;
}

function setCachedEmbedding(text, vector) {
  if (!vector) return;
  const cleaned = String(text).trim().substring(0, 1500);
  if (_embedCache.size >= EMBED_CACHE_MAX_SIZE) {
    const oldestKey = _embedCache.keys().next().value;
    _embedCache.delete(oldestKey);
  }
  _embedCache.set(cleaned, vector);
}

async function getEmbedding(text) {
  const cleanedText = String(text).trim().substring(0, 1500);
  if (!cleanedText) return null;

  const cached = getCachedEmbedding(cleanedText);
  if (cached) {
    logger.info(`[EmbeddingCache] Hit for text: "${cleanedText.substring(0, 30)}..."`);
    return cached;
  }

  const response = await fetchWithKeyRotation(buildEmbedURL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: `models/${EMBED_MODEL}`,
      content: { parts: [{ text: cleanedText }] }
    })
  });
  const data = await response.json();
  const vector = data.embedding?.values || null;
  if (vector) {
    setCachedEmbedding(cleanedText, vector);
    logApiUsage(EMBED_MODEL, 'embed', cleanedText, 0, 'success');
  } else {
    logApiUsage(EMBED_MODEL, 'embed', cleanedText, 0, 'error');
  }
  return vector;
}

module.exports = {
  fetchWithKeyRotation,
  getEmbedding,
  buildChatURL,
  buildStreamURL,
};
