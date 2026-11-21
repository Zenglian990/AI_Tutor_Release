const { isSafeProductionMode } = require('./paramValidator');

const CLIENT_AI_HEADER_NAMES = [
  'x-gemini-api-key',
  'x-deepseek-api-key',
  'x-deepseek-api-url',
  'x-siliconflow-api-key',
  'x-dashscope-api-key',
  'x-zhipu-api-key',
  'x-openai-api-key',
  'x-custom-api-url'
];

/**
 * 从 Express 请求（或 header 对象）大小写无关提取全部 8 个客户端模型请求头。
 * @param {{ headers?: Record<string, any> } | Record<string, any>} reqOrHeaders
 * @returns {Record<string, string>}
 */
function extractClientAiHeaders(reqOrHeaders) {
  const rawHeaders = reqOrHeaders?.headers ? reqOrHeaders.headers : (reqOrHeaders || {});
  const lowerMap = {};
  for (const [k, v] of Object.entries(rawHeaders)) {
    if (v !== undefined && v !== null) {
      const val = String(v).trim();
      if (val) lowerMap[k.toLowerCase()] = val;
    }
  }

  const extracted = {};
  for (const name of CLIENT_AI_HEADER_NAMES) {
    if (lowerMap[name]) {
      extracted[name] = lowerMap[name];
    }
  }
  return extracted;
}

function hasAnyClientAiKey(headers) {
  const h = extractClientAiHeaders(headers);
  return Boolean(
    h['x-gemini-api-key'] ||
    h['x-deepseek-api-key'] ||
    h['x-siliconflow-api-key'] ||
    h['x-dashscope-api-key'] ||
    h['x-zhipu-api-key'] ||
    h['x-openai-api-key']
  );
}

function hasAnyClientAiUrl(headers) {
  const h = extractClientAiHeaders(headers);
  return Boolean(h['x-custom-api-url'] || h['x-deepseek-api-url']);
}

/**
 * 将 AI 网关抛出的错误规范映射为精确 HTTP 状态码与脱敏 JSON（绝不将缺 Key 错返为 500）。
 * @param {any} err
 * @param {import('express').Response} res
 * @param {string} [fallbackMessage]
 */
function mapAiErrorToHttp(err, res, fallbackMessage = 'AI 服务请求失败，请稍后重试') {
  if (!res || res.headersSent) return;

  const code = err?.code || '';
  const status = err?.status;
  const msg = String(err?.message || '');

  if (code === 'ERR_SSRF_BLOCKED' || code === 'ERR_INVALID_AI_URL') {
    return res.status(400).json({
      error: err.publicMessage || msg || '自定义模型接口地址不安全，已被安全策略拦截',
      code: code || 'ERR_SSRF_BLOCKED'
    });
  }

  if (
    code === 'ERR_MISSING_API_KEY' ||
    err?.isMissingKey ||
    /缺少.*API Key/i.test(msg)
  ) {
    return res.status(400).json({
      error: err?.publicMessage || '未检测到可用 AI 密钥，请先在右上角设置中配置有效 API Key',
      code: 'ERR_MISSING_API_KEY'
    });
  }

  if (
    code === 'ERR_INVALID_CLIENT_KEY' ||
    status === 401 ||
    /API_KEY_INVALID|API key not valid|CONSUMER_SUSPENDED|Invalid.*API Key|401/i.test(msg)
  ) {
    return res.status(401).json({
      error: err?.publicMessage || '客户端提供的 API Key 无效或权限受限，请检查设置中的密钥',
      code: 'ERR_INVALID_CLIENT_KEY'
    });
  }

  if (
    code === 'ERR_QUOTA_EXHAUSTED' ||
    msg === 'QUOTA_EXHAUSTED' ||
    msg === 'EMBED_QUOTA_EXHAUSTED' ||
    status === 429
  ) {
    return res.status(429).json({
      error: '今日 AI 调用额度已用完，请稍后再试或在设置中配置自定义 API Key',
      code: 'ERR_QUOTA_EXHAUSTED'
    });
  }

  return res.status(500).json({
    error: fallbackMessage,
    code: 'ERR_AI_UPSTREAM',
    details: isSafeProductionMode() ? undefined : msg
  });
}

module.exports = {
  CLIENT_AI_HEADER_NAMES,
  extractClientAiHeaders,
  hasAnyClientAiKey,
  hasAnyClientAiUrl,
  mapAiErrorToHttp
};
