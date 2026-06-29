const { API_TOKEN, NODE_ENV, AUTH_RATE_LIMIT_WINDOW_MS, AUTH_RATE_LIMIT_MAX } = require('../config');

/**
 * In-memory auth failure tracker for brute-force protection.
 * Tracks failed attempts per IP, auto-expires entries.
 */
const authFailures = new Map();
const FAILURE_CLEANUP_INTERVAL = 60_000; // Clean up expired entries every minute

// Periodic cleanup to prevent memory leak
setInterval(() => {
  try {
    const now = Date.now();
    for (const [ip, entry] of authFailures) {
      if (now > entry.windowStart + AUTH_RATE_LIMIT_WINDOW_MS) {
        authFailures.delete(ip);
      }
    }
  } catch (err) {
    console.error('[Auth] Error in periodic failures cleanup interval:', err);
  }
}, FAILURE_CLEANUP_INTERVAL).unref();

/**
 * Token-based authentication middleware with brute-force protection.
 * In dev mode: optionally skip auth.
 * In production: always requires valid Bearer token.
 */
function authMiddleware(req, res, next) {
  // Allow health check and static assets without auth
  // Note: middleware is mounted at /api/, so req.path is already stripped of the /api prefix
  if (req.path === '/health') return next();
  if (req.path.startsWith('/assets/') || req.path === '/index.html' || req.path === '/') return next();

  // In development, optionally skip auth
  if (NODE_ENV === 'development' && !process.env.REQUIRE_AUTH) return next();

  // Brute-force check per IP
  const clientIp = req.ip || req.socket.remoteAddress || 'unknown';

  // Allow local requests without token for easy desktop usage
  if (clientIp === '127.0.0.1' || clientIp === '::1' || clientIp === '::ffff:127.0.0.1') {
    return next();
  }
  const now = Date.now();
  let failureEntry = authFailures.get(clientIp);

  if (!failureEntry || now > failureEntry.windowStart + AUTH_RATE_LIMIT_WINDOW_MS) {
    // Prevent memory leaks under DDoS/mass IP spoofing: enforce map capacity limit (2000)
    if (authFailures.size >= 2000) {
      let oldestIp = null;
      let oldestTime = Infinity;
      for (const [ip, entry] of authFailures) {
        if (now > entry.windowStart + AUTH_RATE_LIMIT_WINDOW_MS) {
          authFailures.delete(ip);
        } else if (entry.windowStart < oldestTime) {
          oldestTime = entry.windowStart;
          oldestIp = ip;
        }
      }
      if (authFailures.size >= 2000 && oldestIp) {
        authFailures.delete(oldestIp);
      }
    }
    failureEntry = { count: 0, windowStart: now };
    authFailures.set(clientIp, failureEntry);
  }

  if (failureEntry.count >= AUTH_RATE_LIMIT_MAX) {
    const retryAfterSec = Math.ceil((failureEntry.windowStart + AUTH_RATE_LIMIT_WINDOW_MS - now) / 1000);
    res.set('Retry-After', String(Math.max(1, retryAfterSec)));
    return res.status(429).json({
      error: '认证尝试次数过多，请稍后再试。',
      retry_after_seconds: Math.max(1, retryAfterSec)
    });
  }

  const authHeader = req.headers.authorization;
  if (!authHeader) {
    failureEntry.count++;
    return res.status(401).json({ error: '需要身份验证。请在设置中配置访问令牌。' });
  }

  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
  if (token !== API_TOKEN) {
    failureEntry.count++;
    console.warn(`[Auth] Failed attempt from ${clientIp} (${failureEntry.count}/${AUTH_RATE_LIMIT_MAX})`);
    return res.status(403).json({ error: '访问令牌无效。' });
  }

  // Successful auth — reset failure count for this IP
  authFailures.delete(clientIp);
  next();
}

module.exports = authMiddleware;
