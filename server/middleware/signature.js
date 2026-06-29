const crypto = require('crypto');
const { API_TOKEN, NODE_ENV } = require('../config');

function signatureMiddleware(req, res, next) {
  // Allow health check and static assets without signature
  if (req.path === '/health') return next();
  if (req.path.startsWith('/assets/') || req.path === '/index.html' || req.path === '/') return next();

  // In development, optionally skip signature if REQUIRE_AUTH is not set
  if (NODE_ENV === 'development' && !process.env.REQUIRE_AUTH) return next();

  // For localhost connections we bypass for ease of developer tools / direct curl
  const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
  if (clientIp === '127.0.0.1' || clientIp === '::1' || clientIp === '::ffff:127.0.0.1') {
    return next();
  }

  const timestamp = req.headers['x-timestamp'];
  const signature = req.headers['x-signature'];

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
  
  // If request contains body, stringify it
  const bodyStr = req.body && Object.keys(req.body).length > 0 ? JSON.stringify(req.body) : '';
  const formFieldsStr = req.headers['x-form-fields'] || '';
  const fileFieldsStr = req.headers['x-file-fields'] || '';
  
  const msg = `${method}:${path}:${bodyStr}:${timestamp}:${formFieldsStr}:${fileFieldsStr}`;

  const hmac = crypto.createHmac('sha256', API_TOKEN);
  hmac.update(msg);
  const expectedSig = hmac.digest('hex');

  if (signature !== expectedSig) {
    return res.status(401).json({ error: '请求签名验证失败。' });
  }

  next();
}

/**
 * Post-multer middleware to verify integrity of FormData text fields and files
 * against the cryptographically signed headers.
 */
function verifyMultipartIntegrity(req, res, next) {
  if (NODE_ENV === 'development' && !process.env.REQUIRE_AUTH) return next();

  // For localhost connections we bypass
  const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
  if (clientIp === '127.0.0.1' || clientIp === '::1' || clientIp === '::ffff:127.0.0.1') {
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
