const crypto = require('crypto');
const { API_TOKEN, NODE_ENV, AUTH_RATE_LIMIT_WINDOW_MS, AUTH_RATE_LIMIT_MAX } = require('../config');
const logger = require('../services/logger');

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
    logger.error('[Auth] Error in periodic failures cleanup interval:', err);
  }
}, FAILURE_CLEANUP_INTERVAL).unref();

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

/**
 * Token-based authentication middleware with brute-force protection.
 * In dev mode: optionally skip auth.
 * In production: strictly enforces token for admin/management operations,
 * while allowing unauthenticated student learning features.
 */
function authMiddleware(req, res, next) {
  // Allow health check, parent remote view, public version and PIN verification/reset without Bearer auth
  // Note: middleware is mounted at /api/, so req.path is already stripped of the /api prefix
  if (
    req.path === '/health' ||
    req.path === '/parent/remote-view' ||
    req.path === '/system/version' ||
    req.path === '/admin/pin-status' ||
    req.path === '/admin/verify-pin' ||
    req.path === '/admin/reset-pin' ||
    req.path === '/admin/pin'
  ) return next();

  // If auth is explicitly disabled in environment, skip
  if (process.env.REQUIRE_AUTH === 'false') return next();

  const currentEnv = process.env.NODE_ENV || NODE_ENV;

  // In test/dev mode without explicit REQUIRE_AUTH, skip auth
  if ((currentEnv === 'development' || currentEnv === 'test') && !process.env.REQUIRE_AUTH) return next();

  const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
  const isLoopback = clientIp === '127.0.0.1' || clientIp === '::1' || clientIp === '::ffff:127.0.0.1' || clientIp === 'localhost';
  const isTargetAdmin = isAdminRoute(req.path);

  // If not an admin route, allow access if the client didn't send a token (student learning mode)
  // unless REQUIRE_AUTH is explicitly 'true'
  if (!isTargetAdmin && process.env.REQUIRE_AUTH !== 'true') {
    if (!req.headers.authorization) {
      return next();
    }
  }

  // Allow loopback non-admin access without token
  if (isLoopback && !isTargetAdmin) {
    if (!req.headers.authorization) {
      return next();
    }
  }
  const now = Date.now();
  let failureEntry = authFailures.get(clientIp);

  if (!failureEntry || now > failureEntry.windowStart + AUTH_RATE_LIMIT_WINDOW_MS) {
    // Prevent memory leaks under DDoS/mass IP spoofing: enforce map capacity limit (2000)
    if (authFailures.size >= 2000) {
      // Map iterates in insertion order. Evict the 50 oldest entries in O(1) time.
      const iterator = authFailures.keys();
      for (let i = 0; i < 50; i++) {
        const oldestIp = iterator.next().value;
        if (oldestIp) authFailures.delete(oldestIp);
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
  const candidateTokens = [API_TOKEN].filter(Boolean);
  
  let isMatch = false;
  if (token && typeof token === 'string') {
    const tokenBuf = Buffer.from(token);
    for (const expected of candidateTokens) {
      if (token.length === expected.length && crypto.timingSafeEqual(tokenBuf, Buffer.from(expected))) {
        isMatch = true;
        break;
      }
    }
  }

  if (!isMatch) {
    failureEntry.count++;
    logger.warn(`[Auth] Failed attempt from ${clientIp} (${failureEntry.count}/${AUTH_RATE_LIMIT_MAX})`);
    return res.status(403).json({ error: '访问令牌无效。' });
  }

  // Successful auth — reset failure count for this IP
  authFailures.delete(clientIp);

  next();
}

module.exports = authMiddleware;
