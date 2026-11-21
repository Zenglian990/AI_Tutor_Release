const crypto = require('crypto');
const config = require('../config');
const { isVerifiedAdminRequest, getEffectiveApiToken } = require('../utils/adminAuth');

const ADMIN_ROUTES = [
  '/system/network-info',
  '/config/update-keys',
  '/config/test-llm',
  '/config/keys',
  '/membership/admin'
];

function isAdminRoute(reqPath) {
  return ADMIN_ROUTES.some(prefix => reqPath === prefix || reqPath.startsWith(prefix + '/'));
}

/**
 * 请求签名校验中间件（仅用于仍显式调用的签名场景，已彻底移除硬编码公开静态令牌与不可达死代码）。
 */
async function signatureMiddleware(req, res, next) {
  if (req.path === '/health' || req.path === '/parent/remote-view' || req.path === '/system/version') {
    return next();
  }

  if (process.env.REQUIRE_AUTH === 'false') return next();

  const currentEnv = process.env.NODE_ENV || config.NODE_ENV;
  if ((currentEnv === 'development' || currentEnv === 'test') && !process.env.REQUIRE_AUTH) {
    return next();
  }

  const isTargetAdmin = isAdminRoute(req.path);
  if (isTargetAdmin) {
    const isAdmin = await isVerifiedAdminRequest(req);
    if (isAdmin) return next();
  }

  const timestamp = req.headers['x-timestamp'];
  const signature = req.headers['x-signature'];

  if (!isTargetAdmin && process.env.REQUIRE_AUTH !== 'true') {
    if (!timestamp && !signature) return next();
  }

  if (!timestamp || !signature) {
    return res.status(401).json({ error: '认证请求签名缺失，拒绝访问。' });
  }

  const now = Date.now();
  const reqTime = parseInt(timestamp, 10);
  if (isNaN(reqTime) || Math.abs(now - reqTime) > 5 * 60 * 1000) {
    return res.status(401).json({ error: '请求签名已过期或时间戳偏差过大。' });
  }

  const method = req.method;
  const reqUrlPath = (req.originalUrl || req.url || '').split('?')[0];

  const bodyCandidates = [];
  if (typeof req.rawBody === 'string') {
    bodyCandidates.push(req.rawBody);
  }
  const fallbackJsonStr = req.body && Object.keys(req.body).length > 0 ? JSON.stringify(req.body) : '';
  if (!bodyCandidates.includes(fallbackJsonStr)) {
    bodyCandidates.push(fallbackJsonStr);
  }
  if (bodyCandidates.length === 0) {
    bodyCandidates.push('');
  }

  const formFieldsStr = req.headers['x-form-fields'] || '';
  const fileFieldsStr = req.headers['x-file-fields'] || '';

  const authHeader = req.headers.authorization;
  const bearerToken = authHeader && (authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : authHeader.trim());
  const effectiveApiToken = getEffectiveApiToken();
  const validBearer = bearerToken && !config.DEPRECATED_STATIC_TOKENS.has(bearerToken) ? bearerToken : null;

  const candidateTokens = Array.from(new Set([
    effectiveApiToken,
    validBearer
  ].filter(Boolean)));

  let isValid = false;
  if (typeof signature === 'string' && candidateTokens.length > 0) {
    const sigBuf = Buffer.from(signature);
    for (const bodyStr of bodyCandidates) {
      const msg = `${method}:${reqUrlPath}:${bodyStr}:${timestamp}:${formFieldsStr}:${fileFieldsStr}`;
      for (const key of candidateTokens) {
        const expectedSig = crypto.createHmac('sha256', key).update(msg).digest('hex');
        const expectedBuf = Buffer.from(expectedSig);
        if (sigBuf.length === expectedBuf.length && crypto.timingSafeEqual(sigBuf, expectedBuf)) {
          isValid = true;
          break;
        }
      }
      if (isValid) break;
    }
  }

  if (isValid) {
    return next();
  }

  if (!isTargetAdmin && req.authenticated) {
    return next();
  }

  return res.status(401).json({ error: '请求签名验证失败。' });
}

/**
 * Post-multer Multipart 完整性校验中间件：
 * - 任何环境只要携带 x-form-fields / x-file-fields 即执行严格解码与校验
 * - 对畸形 URL 编码头统一捕获 URIError 返回 400（绝不抛出 500）
 */
function verifyMultipartIntegrity(req, res, next) {
  let formFieldsHeader;
  let fileFieldsHeader;

  try {
    formFieldsHeader = req.headers['x-form-fields'] ? decodeURIComponent(String(req.headers['x-form-fields'])) : undefined;
    fileFieldsHeader = req.headers['x-file-fields'] ? decodeURIComponent(String(req.headers['x-file-fields'])) : undefined;
  } catch {
    return res.status(400).json({ error: '请求头编码格式非法 (invalid header encoding)' });
  }

  if (!formFieldsHeader && !fileFieldsHeader) {
    return next();
  }

  if (formFieldsHeader) {
    try {
      const expectedFields = JSON.parse(formFieldsHeader);
      if (!expectedFields || typeof expectedFields !== 'object' || Array.isArray(expectedFields)) {
        return res.status(400).json({ error: '请求数据完整性校验失败 (invalid fields format)' });
      }
      for (const [key, val] of Object.entries(expectedFields)) {
        if (String(req.body?.[key] ?? '') !== String(val)) {
          return res.status(400).json({ error: '请求数据完整性校验失败 (body fields mismatch)' });
        }
      }
    } catch {
      return res.status(400).json({ error: '请求数据完整性校验失败 (invalid fields format)' });
    }
  }

  if (fileFieldsHeader) {
    const expectedFiles = fileFieldsHeader.split(',').filter(Boolean);
    const actualFiles = req.files
      ? (Array.isArray(req.files) ? req.files : Object.values(req.files).flat())
      : (req.file ? [req.file] : []);

    if (expectedFiles.length !== actualFiles.length) {
      return res.status(400).json({ error: '请求数据完整性校验失败 (file count mismatch)' });
    }

    for (const expected of expectedFiles) {
      const parts = expected.split(':');
      if (parts.length < 3) {
        return res.status(400).json({ error: '请求数据完整性校验失败 (invalid file spec)' });
      }
      const fieldname = parts[0];
      const sizeStr = parts[parts.length - 1];
      const name = parts.slice(1, -1).join(':');
      const size = parseInt(sizeStr, 10);
      const matched = actualFiles.find(f => f.fieldname === fieldname && f.originalname === name && f.size === size);
      if (!matched) {
        return res.status(400).json({ error: '请求数据完整性校验失败 (file mismatch)' });
      }
    }
  }

  return next();
}

module.exports = {
  signatureMiddleware,
  verifyMultipartIntegrity
};
