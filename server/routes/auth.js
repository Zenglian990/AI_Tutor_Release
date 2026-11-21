const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const {
  requireStudentSession,
  generateStudentSessionToken,
  verifyStudentSessionToken,
  buildCookieHeaderValue,
  appendSetCookie,
  STUDENT_SESSION_COOKIE,
  STUDENT_SESSION_TTL_SECONDS,
  MAX_PROFILES_PER_SESSION
} = require('../middleware/auth');
const { parseCookies } = require('../utils/sessionToken');

/**
 * POST /api/auth/session
 * 公开端点：初始化或续期服务端隔离的学生设备会话。
 * 优先复用 Cookie / Authorization / body.existing_token 中的有效未过期令牌，否则签发新的随机 stu_<16hex> 档案。
 */
router.post('/auth/session', (req, res) => {
  const cookies = parseCookies(req);
  const authHeader = req.headers?.authorization;
  const bearer = typeof authHeader === 'string' && authHeader.startsWith('Bearer ')
    ? authHeader.slice(7).trim()
    : '';
  const candidateToken = (
    req.body?.existing_token ||
    req.headers?.['x-student-session-token'] ||
    bearer ||
    cookies[STUDENT_SESSION_COOKIE] ||
    ''
  ).toString().trim();

  let existing = candidateToken ? verifyStudentSessionToken(candidateToken) : null;

  let sessionId;
  let profiles;
  let activeProfileId;

  if (existing) {
    sessionId = existing.sid || `sid_${crypto.randomBytes(8).toString('hex')}`;
    profiles = [...existing.pids];
    const requestedPid = typeof req.body?.profile_id === 'string' ? req.body.profile_id.trim() : '';
    activeProfileId = requestedPid && profiles.includes(requestedPid) ? requestedPid : existing.pid;
  } else {
    sessionId = `sid_${crypto.randomBytes(8).toString('hex')}`;
    activeProfileId = `stu_${crypto.randomBytes(8).toString('hex')}`;
    profiles = [activeProfileId];
  }

  const sessionToken = generateStudentSessionToken({
    sessionId,
    activeProfileId,
    profiles
  }, STUDENT_SESSION_TTL_SECONDS);

  appendSetCookie(
    res,
    buildCookieHeaderValue(STUDENT_SESSION_COOKIE, sessionToken, STUDENT_SESSION_TTL_SECONDS, '/api')
  );

  return res.json({
    success: true,
    role: 'student',
    profile_id: activeProfileId,
    profiles,
    session_token: sessionToken,
    expires_in_seconds: STUDENT_SESSION_TTL_SECONDS
  });
});

/**
 * GET /api/auth/session
 * 检验当前会话是否有效及角色状态。
 */
router.get('/auth/session', requireStudentSession, (req, res) => {
  return res.json({
    authenticated: true,
    role: req.auth.role,
    profile_id: req.auth.activeProfileId,
    profiles: req.auth.allowedProfileIds,
    is_admin: req.auth.isAdmin,
    expires_at: req.auth.exp
  });
});

/**
 * POST /api/auth/profiles
 * 在当前学生会话内创建新的子学习档案（或切换已属于自己的子档案），并签发更新后的会话令牌。
 */
router.post('/auth/profiles', requireStudentSession, (req, res) => {
  const action = req.body?.action || 'create';

  if (action === 'switch') {
    const targetPid = typeof req.body?.profile_id === 'string' ? req.body.profile_id.trim() : '';
    if (!targetPid || !req.auth.allowedProfileIds.includes(targetPid)) {
      return res.status(403).json({ error: '无权切换到未授权的学习档案', code: 'ERR_FORBIDDEN' });
    }
    const updatedToken = generateStudentSessionToken({
      sessionId: req.auth.sessionId,
      activeProfileId: targetPid,
      profiles: req.auth.allowedProfileIds
    }, STUDENT_SESSION_TTL_SECONDS);

    appendSetCookie(
      res,
      buildCookieHeaderValue(STUDENT_SESSION_COOKIE, updatedToken, STUDENT_SESSION_TTL_SECONDS, '/api')
    );

    return res.json({
      success: true,
      profile_id: targetPid,
      profiles: req.auth.allowedProfileIds,
      session_token: updatedToken,
      expires_in_seconds: STUDENT_SESSION_TTL_SECONDS
    });
  }

  if (req.auth.allowedProfileIds.length >= MAX_PROFILES_PER_SESSION) {
    return res.status(400).json({ error: `单设备最多创建 ${MAX_PROFILES_PER_SESSION} 个子档案` });
  }

  const sidPrefix = (req.auth.sessionId || '').replace(/^sid_/, '').slice(0, 6) || crypto.randomBytes(3).toString('hex');
  const newProfileId = `stu_${sidPrefix}_${crypto.randomBytes(4).toString('hex')}`;
  const updatedProfiles = [...req.auth.allowedProfileIds, newProfileId];

  const updatedToken = generateStudentSessionToken({
    sessionId: req.auth.sessionId,
    activeProfileId: newProfileId,
    profiles: updatedProfiles
  }, STUDENT_SESSION_TTL_SECONDS);

  appendSetCookie(
    res,
    buildCookieHeaderValue(STUDENT_SESSION_COOKIE, updatedToken, STUDENT_SESSION_TTL_SECONDS, '/api')
  );

  return res.json({
    success: true,
    profile_id: newProfileId,
    profiles: updatedProfiles,
    session_token: updatedToken,
    expires_in_seconds: STUDENT_SESSION_TTL_SECONDS
  });
});

module.exports = router;
