const crypto = require('crypto');
const config = require('../config');
const logger = require('../services/logger');
const { signCompactToken, verifyCompactToken, parseCookies } = require('../utils/sessionToken');
const { isVerifiedAdminRequest, ADMIN_SESSION_COOKIE } = require('../utils/adminAuth');

const STUDENT_SESSION_COOKIE = 'ai_tutor_session';
const STUDENT_SESSION_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 天
const MAX_PROFILES_PER_SESSION = 10;

// 认证失败防爆破限流表（按 IP 隔离，上限 2000）
const authFailures = new Map();
const FAILURE_CLEANUP_INTERVAL = 60_000;

setInterval(() => {
  try {
    const now = Date.now();
    for (const [ip, entry] of authFailures) {
      if (now > entry.windowStart + config.AUTH_RATE_LIMIT_WINDOW_MS) {
        authFailures.delete(ip);
      }
    }
  } catch (err) {
    logger.error('[Auth] Error in periodic failures cleanup interval:', err);
  }
}, FAILURE_CLEANUP_INTERVAL).unref();

/**
 * 签发学生/设备隔离会话令牌（7 天有效）
 */
function generateStudentSessionToken({ sessionId, activeProfileId, profiles }, ttlSeconds = STUDENT_SESSION_TTL_SECONDS) {
  const sid = sessionId || `sid_${crypto.randomBytes(8).toString('hex')}`;
  const pidList = Array.isArray(profiles) && profiles.length > 0
    ? profiles.map(p => String(p).trim()).filter(Boolean).slice(0, MAX_PROFILES_PER_SESSION)
    : [activeProfileId || `stu_${crypto.randomBytes(8).toString('hex')}`];
  const primaryPid = activeProfileId && pidList.includes(activeProfileId) ? activeProfileId : pidList[0];

  const now = Date.now();
  const payload = {
    typ: 'student',
    sid,
    pid: primaryPid,
    pids: pidList,
    iat: now,
    exp: now + ttlSeconds * 1000
  };
  return signCompactToken(payload, config.STUDENT_SESSION_SECRET);
}

/**
 * 验证学生会话令牌
 */
function verifyStudentSessionToken(token) {
  const decoded = verifyCompactToken(token, config.STUDENT_SESSION_SECRET, 'student');
  if (!decoded || typeof decoded.pid !== 'string' || !Array.isArray(decoded.pids)) {
    return null;
  }
  const cleanPids = decoded.pids.filter(p => typeof p === 'string' && p.trim().length > 0);
  if (cleanPids.length === 0) return null;
  return {
    sid: String(decoded.sid || ''),
    pid: decoded.pid,
    pids: cleanPids,
    exp: decoded.exp
  };
}

function buildCookieHeaderValue(name, value, maxAgeSeconds, cookiePath = '/api') {
  const isProd = (process.env.NODE_ENV || config.NODE_ENV) === 'production';
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    `Path=${cookiePath}`,
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAgeSeconds}`
  ];
  if (isProd) {
    parts.push('Secure');
  }
  return parts.join('; ');
}

function buildClearCookieHeaderValue(name, cookiePath = '/api') {
  const isProd = (process.env.NODE_ENV || config.NODE_ENV) === 'production';
  const parts = [
    `${name}=`,
    `Path=${cookiePath}`,
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=0'
  ];
  if (isProd) {
    parts.push('Secure');
  }
  return parts.join('; ');
}

function appendSetCookie(res, cookieStr) {
  const existing = res.getHeader('Set-Cookie');
  if (!existing) {
    res.setHeader('Set-Cookie', cookieStr);
  } else if (Array.isArray(existing)) {
    res.setHeader('Set-Cookie', [...existing, cookieStr]);
  } else {
    res.setHeader('Set-Cookie', [String(existing), cookieStr]);
  }
}

/**
 * 从请求中提取候选学生会话 Token
 */
function extractStudentTokenFromRequest(req) {
  const cookies = parseCookies(req);
  const authHeader = req.headers?.authorization;
  let bearerToken = '';
  if (typeof authHeader === 'string' && authHeader.trim()) {
    bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : authHeader.trim();
  }
  const studentHeader = typeof req.headers?.['x-student-session-token'] === 'string'
    ? req.headers['x-student-session-token'].trim()
    : '';
  const cookieToken = typeof cookies[STUDENT_SESSION_COOKIE] === 'string'
    ? cookies[STUDENT_SESSION_COOKIE].trim()
    : '';

  return [bearerToken, studentHeader, cookieToken].filter(Boolean);
}

const ADMIN_ROUTES = [
  '/system/network-info',
  '/config/update-keys',
  '/config/test-llm',
  '/config/keys',
  '/membership/admin',
  '/admin/shutdown',
  '/admin/stats',
  '/export/data',
  '/import/data'
];

function isAdminRoute(reqPath) {
  return ADMIN_ROUTES.some(prefix => reqPath === prefix || reqPath.startsWith(prefix + '/'));
}

/**
 * 轻量身份解析与管理端防线中间件（挂载于 /api）：
 * - 对 ADMIN_ROUTES 高危管理接口严格要求管理员认证（未带凭证返 401，带无效/废弃静态凭证返 403，爆破超限返 429）
 * - 对学生正常教学流程接口支持 Student Session Token / HttpOnly Cookie，并对同源无 Token 或旧客户端缓存平滑自动签发教学会话，绝不误锁正常学生
 */
async function attachSessionMiddleware(req, res, next) {
  const clientIp = req.ip || req.socket?.remoteAddress || 'unknown';
  const now = Date.now();

  let failureEntry = authFailures.get(clientIp);
  if (failureEntry && now > failureEntry.windowStart + config.AUTH_RATE_LIMIT_WINDOW_MS) {
    authFailures.delete(clientIp);
    failureEntry = null;
  }

  // 解析潜在的学生凭证
  const studentTokenCandidates = extractStudentTokenFromRequest(req);
  let studentPayload = null;
  for (const cand of studentTokenCandidates) {
    const parsed = verifyStudentSessionToken(cand);
    if (parsed) {
      studentPayload = parsed;
      break;
    }
  }

  // 解析潜在的管理员凭证
  const isAdmin = await isVerifiedAdminRequest(req);

  const rawAuthHeader = typeof req.headers?.authorization === 'string' ? req.headers.authorization.trim() : '';
  const bearerValue = rawAuthHeader.startsWith('Bearer ') ? rawAuthHeader.slice(7).trim() : rawAuthHeader;
  const isDeprecatedStaticBearer = Boolean(bearerValue && config.DEPRECATED_STATIC_TOKENS.has(bearerValue));
  const hasAuthHeader = Boolean(rawAuthHeader);
  const hasAdminHeaders = Boolean(
    req.headers?.['x-parent-session-token'] ||
    req.headers?.['x-parent-pin-hash'] ||
    req.query?.token ||
    req.body?.token ||
    req.query?.pin_hash ||
    req.body?.pin_hash
  );
  const hasStudentHeader = Boolean(req.headers?.['x-student-session-token']);
  const cookies = parseCookies(req);
  const hasSessionCookie = Boolean(cookies[STUDENT_SESSION_COOKIE] || cookies[ADMIN_SESSION_COOKIE]);

  const requestedPidRaw = req.body?.profile_id || req.query?.profile_id;
  const fallbackPid = (typeof requestedPidRaw === 'string' && requestedPidRaw.trim()) ? requestedPidRaw.trim() : 'default';

  if (isAdmin) {
    authFailures.delete(clientIp);
    req.authenticated = true;
    req.auth = {
      authenticated: true,
      role: 'admin',
      isAdmin: true,
      sessionId: studentPayload?.sid || 'admin',
      activeProfileId: studentPayload?.pid || fallbackPid,
      allowedProfileIds: studentPayload?.pids || [fallbackPid, 'default'],
      exp: studentPayload?.exp || (now + 1800_000),
      invalidCredentialPresented: false
    };
    return next();
  }

  // 公开免检端点
  const isPublicAuthBootstrap =
    req.path === '/health' ||
    req.path === '/parent/remote-view' ||
    req.path === '/system/version' ||
    req.path === '/admin/pin-status' ||
    req.path === '/admin/pin' ||
    req.path === '/admin/verify-pin' ||
    req.path === '/parent/auth-session' ||
    req.path === '/admin/reset-pin' ||
    req.path === '/admin/logout' ||
    req.path === '/auth/session';

  if (isPublicAuthBootstrap) {
    if (studentPayload) {
      req.authenticated = true;
      req.auth = {
        authenticated: true,
        role: 'student',
        isAdmin: false,
        sessionId: studentPayload.sid,
        activeProfileId: studentPayload.pid,
        allowedProfileIds: studentPayload.pids,
        exp: studentPayload.exp,
        invalidCredentialPresented: false
      };
    } else {
      req.authenticated = true;
      req.auth = {
        authenticated: true,
        role: 'student',
        isAdmin: false,
        sessionId: 'bootstrap_session',
        activeProfileId: fallbackPid,
        allowedProfileIds: Array.from(new Set([fallbackPid, 'default'])),
        exp: now + STUDENT_SESSION_TTL_SECONDS * 1000,
        invalidCredentialPresented: false
      };
    }
    return next();
  }

  const currentEnv = process.env.NODE_ENV || config.NODE_ENV;
  const skipStrictAuthInDev = process.env.REQUIRE_AUTH === 'false' ||
    ((currentEnv === 'development' || currentEnv === 'test') && !process.env.REQUIRE_AUTH);

  const isTargetAdmin = isAdminRoute(req.path);

  // 高危管理路由防线：在生产环境或 REQUIRE_AUTH=true（以及对 update-keys / membership/admin / shutdown 等敏感接口）下严格拦截
  if (isTargetAdmin && !skipStrictAuthInDev) {
    if (!failureEntry) {
      if (authFailures.size >= 2000) {
        const iterator = authFailures.keys();
        for (let i = 0; i < 50; i++) {
          const oldestIp = iterator.next().value;
          if (oldestIp) authFailures.delete(oldestIp);
        }
      }
      failureEntry = { count: 0, windowStart: now };
      authFailures.set(clientIp, failureEntry);
    }

    if (failureEntry.count >= config.AUTH_RATE_LIMIT_MAX) {
      const retryAfterSec = Math.ceil((failureEntry.windowStart + config.AUTH_RATE_LIMIT_WINDOW_MS - now) / 1000);
      res.set('Retry-After', String(Math.max(1, retryAfterSec)));
      return res.status(429).json({
        error: '认证尝试次数过多，请稍后再试。',
        retry_after_seconds: Math.max(1, retryAfterSec)
      });
    }

    failureEntry.count++;
    if (hasAuthHeader || hasAdminHeaders || hasStudentHeader) {
      logger.warn(`[Auth] Rejected unauthorized admin route attempt on ${req.path} from ${clientIp}`);
      return res.status(403).json({
        error: '访问令牌无效或无管理员权限。',
        code: 'ERR_FORBIDDEN'
      });
    }
    return res.status(401).json({
      error: '需要管理员身份验证。请在设置中验证家长 PIN 或配置访问令牌。',
      code: 'ERR_UNAUTHORIZED'
    });
  }

  if (studentPayload) {
    authFailures.delete(clientIp);
    const mergedPids = Array.from(new Set([...studentPayload.pids, fallbackPid, 'default']));
    req.authenticated = true;
    req.auth = {
      authenticated: true,
      role: 'student',
      isAdmin: false,
      sessionId: studentPayload.sid,
      activeProfileId: studentPayload.pid,
      allowedProfileIds: mergedPids,
      exp: studentPayload.exp,
      invalidCredentialPresented: false
    };
    return next();
  }

  // 非管理路由（学生正常教学流程）：
  // 自动签发/挂载平滑兼容的学生教学会话，即使客户端未带 Token 或带有旧版残留的默认静态 Token 也不报 401
  const autoSid = `sid_${crypto.randomBytes(8).toString('hex')}`;
  const autoProfiles = Array.from(new Set([fallbackPid, 'default']));
  if (!cookies[STUDENT_SESSION_COOKIE] && !skipStrictAuthInDev) {
    try {
      const autoToken = generateStudentSessionToken({
        sessionId: autoSid,
        activeProfileId: fallbackPid,
        profiles: autoProfiles
      }, STUDENT_SESSION_TTL_SECONDS);
      appendSetCookie(
        res,
        buildCookieHeaderValue(STUDENT_SESSION_COOKIE, autoToken, STUDENT_SESSION_TTL_SECONDS, '/api')
      );
    } catch {}
  }

  req.authenticated = true;
  req.auth = {
    authenticated: true,
    role: 'student',
    isAdmin: false,
    sessionId: autoSid,
    activeProfileId: fallbackPid,
    allowedProfileIds: autoProfiles,
    exp: now + STUDENT_SESSION_TTL_SECONDS * 1000,
    invalidCredentialPresented: false,
    isDeprecatedStaticBearer
  };
  return next();
}

/**
 * 路由守卫：要求已认证学生会话或管理员会话
 */
function requireStudentSession(req, res, next) {
  if (req.auth && req.auth.authenticated && (req.auth.role === 'student' || req.auth.role === 'admin')) {
    return next();
  }
  if (req.auth && req.auth.invalidCredentialPresented) {
    return res.status(403).json({
      error: '会话凭证无效或已过期，请重新初始化学习会话。',
      code: 'ERR_INVALID_SESSION'
    });
  }
  return res.status(401).json({
    error: '需要身份验证，请先初始化学习会话。',
    code: 'ERR_UNAUTHORIZED'
  });
}

/**
 * 路由守卫：严格要求管理员/家长权限
 */
function requireAdmin(req, res, next) {
  if (req.auth && req.auth.isAdmin) {
    return next();
  }
  const hasAnyAttempt = Boolean(
    req.headers?.authorization ||
    req.headers?.['x-parent-session-token'] ||
    req.headers?.['x-parent-pin-hash'] ||
    req.auth?.authenticated // 已登录学生试图越权访问管理端
  );
  if (hasAnyAttempt) {
    return res.status(403).json({
      error: '拒绝访问：此操作仅限已授权家长或管理员执行。',
      code: 'ERR_FORBIDDEN'
    });
  }
  return res.status(401).json({
    error: '需要家长/管理员身份认证。',
    code: 'ERR_UNAUTHORIZED'
  });
}

/**
 * 解析并强校验请求的 profile_id 是否属于当前会话（IDOR 核心防线）
 * @param {import('express').Request} req
 * @param {string|undefined|null} requestedProfileId
 * @returns {{ ok: true, profileId: string } | { ok: false, status: number, error: string }}
 */
function resolveAuthorizedProfileId(req, requestedProfileId) {
  if (!req.auth || !req.auth.authenticated) {
    return { ok: false, status: 401, error: '需要有效学习会话' };
  }
  const cleanRequested = typeof requestedProfileId === 'string' ? requestedProfileId.trim() : '';

  if (req.auth.isAdmin) {
    return {
      ok: true,
      profileId: cleanRequested || req.auth.activeProfileId || 'default'
    };
  }

  if (!cleanRequested) {
    return {
      ok: true,
      profileId: req.auth.activeProfileId
    };
  }

  if (req.auth.allowedProfileIds.includes(cleanRequested)) {
    return {
      ok: true,
      profileId: cleanRequested
    };
  }

  return {
    ok: false,
    status: 403,
    error: '无权访问其他学生的专属档案'
  };
}

const authMiddleware = attachSessionMiddleware;
Object.assign(authMiddleware, {
  attachSessionMiddleware,
  requireStudentSession,
  requireAdmin,
  resolveAuthorizedProfileId,
  generateStudentSessionToken,
  verifyStudentSessionToken,
  buildCookieHeaderValue,
  buildClearCookieHeaderValue,
  appendSetCookie,
  ADMIN_SESSION_COOKIE,
  STUDENT_SESSION_COOKIE,
  STUDENT_SESSION_TTL_SECONDS,
  MAX_PROFILES_PER_SESSION,
  ADMIN_ROUTES,
  isAdminRoute
});

module.exports = authMiddleware;
