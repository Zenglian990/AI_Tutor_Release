const crypto = require('crypto');
const { API_TOKEN, NODE_ENV } = require('../config');

const ADMIN_ROUTES = [
  '/system/network-info',
  '/config/update-keys',
  '/config/test-llm',
  '/config/keys',
  '/membership/admin'
];

function isAdminRoute(path) {
  return ADMIN_ROUTES.some(prefix => path === prefix || path.startsWith(prefix + '/'));
}

function signatureMiddleware(req, res, next) {
  // Allow health check, parent remote view (token based) and public version without signature
  if (req.path === '/health' || req.path === '/parent/remote-view' || req.path === '/system/version') return next();
  if (req.path.startsWith('/assets/') || req.path === '/index.html' || req.path === '/') return next();

  // If auth is explicitly disabled in environment, skip
  if (process.env.REQUIRE_AUTH === 'false') return next();

  const currentEnv = process.env.NODE_ENV || NODE_ENV;

  // In development or test, optionally skip signature if REQUIRE_AUTH is not set
  if ((currentEnv === 'development' || currentEnv === 'test') && !process.env.REQUIRE_AUTH) return next();

  const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
  const isLoopback = clientIp === '127.0.0.1' || clientIp === '::1' || clientIp === '::ffff:127.0.0.1' || clientIp === 'localhost';
  const isTargetAdmin = isAdminRoute(req.path);

  const timestamp = req.headers['x-timestamp'];
  const signature = req.headers['x-signature'];

  // If not an admin route, allow access if no signature was provided
  if (!isTargetAdmin && process.env.REQUIRE_AUTH !== 'true') {
    if (!timestamp && !signature) {
      return next();
    }
  }

  // Allow loopback non-admin access without signature
  if (isLoopback && !isTargetAdmin) {
    if (!timestamp && !signature) {
      return next();
    }
  }

  if (!timestamp || !signature) {
    return res.status(401).json({ error: '认证请求签名缺失，拒绝访问。' });
  }

  // Prevent replay attacks by checking timestamp age (e.g. max 5 minutes drift)
  const now = Date.now();
  const reqTime = parseInt(timestamp, 10);
  if (isNaN(reqTime) || Math.abs(now - reqTime) > 5 * 60 * 1000) {
    return res.status(401).json({ error: '请求签名已过期或时间戳偏差过大。' });
  }

  // Calculate signature: METHOD:PATH:BODY_STRING:TIMESTAMP:FORM_FIELDS:FILE_FIELDS
  const method = req.method;
  const path = req.originalUrl.split('?')[0]; // Full path starting with /api
  
  // If request contains body, prefer exact raw incoming bytes (req.rawBody) to eliminate serialization discrepancy,
  // while falling back to JSON.stringify for compatibility with mock tests
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
  const candidateTokens = [API_TOKEN].filter(Boolean);

  let isValid = false;
  if (typeof signature === 'string') {
    const sigBuf = Buffer.from(signature);
    for (const bodyStr of bodyCandidates) {
      const msg = `${method}:${path}:${bodyStr}:${timestamp}:${formFieldsStr}:${fileFieldsStr}`;
      for (const key of candidateTokens) {
        const hmac = crypto.createHmac('sha256', key);
        hmac.update(msg);
        const expectedSig = hmac.digest('hex');
        if (signature.length === expectedSig.length && crypto.timingSafeEqual(sigBuf, Buffer.from(expectedSig))) {
          isValid = true;
          break;
        }
      }
      if (isValid) break;
    }
  }

  if (!isValid) {
    return res.status(401).json({ error: '请求签名验证失败。' });
  }

  next();
}

/**
 * Post-multer middleware to verify integrity of FormData text fields and files
 * against the cryptographically signed headers.
 */
function verifyMultipartIntegrity(req, res, next) {
  if ((NODE_ENV === 'development' || NODE_ENV === 'test') && !process.env.REQUIRE_AUTH) return next();

  // For localhost connections we bypass ONLY if explicitly enabled
  const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
  if ((clientIp === '127.0.0.1' || clientIp === '::1' || clientIp === '::ffff:127.0.0.1') && process.env.LOCAL_DEV_BYPASS === 'true') {
    return next();
  }

  const formFieldsHeader = req.headers['x-form-fields'] ? decodeURIComponent(req.headers['x-form-fields']) : undefined;
  const fileFieldsHeader = req.headers['x-file-fields'] ? decodeURIComponent(req.headers['x-file-fields']) : undefined;

  if (formFieldsHeader) {
    try {
      const expectedFields = JSON.parse(formFieldsHeader);
      for (const [key, val] of Object.entries(expectedFields)) {
        if (String(req.body[key] || '') !== String(val)) {
          return res.status(400).json({ error: "请求数据完整性校验失败 (body fields mismatch)" });
        }
      }
    } catch (e) {
      return res.status(400).json({ error: "请求数据完整性校验失败 (invalid fields format)" });
    }
  }

  if (fileFieldsHeader) {
    const expectedFiles = fileFieldsHeader.split(',').filter(Boolean);
    const actualFiles = req.files ? (Array.isArray(req.files) ? req.files : Object.values(req.files).flat()) : (req.file ? [req.file] : []);
    
    if (expectedFiles.length !== actualFiles.length) {
      return res.status(400).json({ error: "请求数据完整性校验失败 (file count mismatch)" });
    }
    
    for (const expected of expectedFiles) {
      const [fieldname, name, sizeStr] = expected.split(':');
      const size = parseInt(sizeStr, 10);
      const matched = actualFiles.find(f => f.fieldname === fieldname && f.originalname === name && f.size === size);
      if (!matched) {
        return res.status(400).json({ error: "请求数据完整性校验失败 (file mismatch)" });
      }
    }
  }

  next();
}

module.exports = {
  signatureMiddleware,
  verifyMultipartIntegrity
};
