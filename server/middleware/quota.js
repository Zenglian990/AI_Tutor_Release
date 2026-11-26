const { getSqliteDb } = require('../db/init');
const logger = require('../services/logger');
const { resolveAuthorizedProfileId } = require('./auth');

const FREE_DAILY_AI_QUOTA = parseInt(process.env.FREE_DAILY_AI_QUOTA || '30', 10);

const BYOK_HEADERS = [
  'x-gemini-api-key',
  'x-deepseek-api-key',
  'x-siliconflow-api-key',
  'x-dashscope-api-key',
  'x-zhipu-api-key',
  'x-openai-api-key'
];

// 各功能端点实际支持并会严格隔离使用的 BYOK 请求头白名单（防止塞无关垃圾头绕过配额盗刷服务端 Key）
const FEATURE_BYOK_ALLOWLIST = {
  tts: ['x-gemini-api-key'],
  transcribe: ['x-gemini-api-key'],
  vision: ['x-gemini-api-key', 'x-siliconflow-api-key', 'x-dashscope-api-key', 'x-zhipu-api-key'],
  homework: ['x-gemini-api-key', 'x-siliconflow-api-key', 'x-dashscope-api-key', 'x-zhipu-api-key']
};

/**
 * 检查请求是否携带当前功能实际支持的 BYOK 大模型密钥
 */
function hasByokKey(req, featureNameOrHeaders = null) {
  const headers = req.headers || {};
  let allowed = BYOK_HEADERS;
  if (Array.isArray(featureNameOrHeaders) && featureNameOrHeaders.length > 0) {
    allowed = featureNameOrHeaders;
  } else if (typeof featureNameOrHeaders === 'string' && FEATURE_BYOK_ALLOWLIST[featureNameOrHeaders]) {
    allowed = FEATURE_BYOK_ALLOWLIST[featureNameOrHeaders];
  }
  return allowed.some(h => typeof headers[h] === 'string' && headers[h].trim().length >= 8);
}

/**
 * 服务端会员 VIP 与每日免费体验配额门禁中间件
 * - 自带本路由实际支持的有效 BYOK 密钥：标记隔离模式并放行（下游网关严禁回退服务端池）
 * - 管理员或有效 VIP 会员（memberships.expire_at > now）：直接放行
 * - 免费用户：按已授权 profile_id 实施每日配额上限，防止无门槛盗刷服务端付费大模型账单
 */
function requireQuotaOrVip(featureName = 'ai', allowedByokHeaders = null) {
  return async (req, res, next) => {
    try {
      // 测试或本地开发未显式启用配额门禁时放行，避免阻断离线单测
      const env = process.env.NODE_ENV || 'development';
      if (process.env.ENFORCE_QUOTA === 'false' || (env !== 'production' && process.env.ENFORCE_QUOTA !== 'true')) {
        return next();
      }

      if (req.auth?.isAdmin) {
        return next();
      }

      if (hasByokKey(req, allowedByokHeaders || featureName)) {
        req.isByokIsolated = true;
        return next();
      }

      const sqliteDb = getSqliteDb();
      if (!sqliteDb) {
        return next();
      }

      // 优先采用已验签授权档案，杜绝通过伪造 profile_id 重置免费配额；
      // 若旧客户端或首屏请求传 'default' 但会话已签发独立 stu_* 档案，按独立设备档案计桶，避免全站匿名访客互相挤爆每日 30 次免费额度
      const requestedPid = req.body?.profile_id || req.query?.profile_id;
      const authCheck = req.auth ? resolveAuthorizedProfileId(req, requestedPid) : null;
      if (authCheck && !authCheck.ok) {
        return res.status(authCheck.status || 403).json({ error: authCheck.error });
      }
      const resolvedPid = (authCheck?.profileId || req.auth?.activeProfileId || String(requestedPid || 'default').trim() || 'default');
      const sessionPrimaryPid = req.auth?.activeProfileId && req.auth.activeProfileId !== 'default'
        ? req.auth.activeProfileId
        : resolvedPid;
      const profileId = (resolvedPid === 'default' && sessionPrimaryPid !== 'default')
        ? sessionPrimaryPid
        : resolvedPid;

      // 1. 校验有效 VIP 会员（同时检查当前档案与会话主档案）
      const member = await sqliteDb.get(
        `SELECT tier, expire_at FROM memberships WHERE profile_id IN (?, ?) ORDER BY expire_at DESC LIMIT 1`,
        [profileId, resolvedPid]
      );
      if (member && member.tier && member.tier !== 'free' && member.expire_at) {
        const expireMs = new Date(member.expire_at).getTime();
        if (!Number.isNaN(expireMs) && expireMs > Date.now()) {
          return next();
        }
      }

      // 2. 校验免费用户当日累计调用次数（严格使用北京时间 UTC+8 防止凌晨 0-8 点跨日错位）
      const usageRow = await sqliteDb.get(
        `SELECT COUNT(*) as cnt FROM api_usage WHERE profile_id = ? AND date(timestamp, '+8 hours') = date('now', '+8 hours')`,
        [profileId]
      );
      const todayUsed = usageRow?.cnt || 0;

      if (todayUsed >= FREE_DAILY_AI_QUOTA) {
        logger.warn(`[Quota] Daily free quota exceeded for profile=${profileId}, feature=${featureName}, used=${todayUsed}/${FREE_DAILY_AI_QUOTA}`);
        return res.status(429).json({
          error: `今日免费体验额度（${FREE_DAILY_AI_QUOTA} 次）已用完，请开通专属会员或在设置中配置您的个人 API Key 继续使用。`,
          code: 'ERR_DAILY_QUOTA_EXCEEDED',
          dailyLimit: FREE_DAILY_AI_QUOTA,
          todayUsed
        });
      }

      return next();
    } catch (err) {
      logger.error('[Quota] Middleware check error:', err);
      // 避免数据库瞬时抖动导致全站中断，仅记录告警后放行
      return next();
    }
  };
}

module.exports = {
  requireQuotaOrVip,
  hasByokKey,
  FREE_DAILY_AI_QUOTA,
  FEATURE_BYOK_ALLOWLIST
};
