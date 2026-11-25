const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { getSqliteDb } = require('../db/init');
const { API_TOKEN } = require('../config');
const { isVerifiedAdminRequest } = require('../utils/adminAuth');
const { resolveAuthorizedProfileId } = require('../middleware/auth');
const dbQueue = require('../services/dbQueue');
const logger = require('../services/logger');

// 核销卡密防爆破限流表（按 IP 隔离：15 分钟最多 10 次失败）
const redeemFailMap = new Map();
const REDEEM_WINDOW_MS = 15 * 60 * 1000;
const REDEEM_MAX_FAILS = 10;

setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of redeemFailMap.entries()) {
    if (now > entry.resetAt) redeemFailMap.delete(ip);
  }
}, 10 * 60 * 1000).unref();

function checkRedeemRateLimit(req, res, next) {
  const ip = req.ip || req.socket?.remoteAddress || 'unknown';
  const now = Date.now();
  if (redeemFailMap.size > 5000) redeemFailMap.clear();
  let entry = redeemFailMap.get(ip);
  if (!entry || now > entry.resetAt) {
    entry = { count: 0, resetAt: now + REDEEM_WINDOW_MS };
    redeemFailMap.set(ip, entry);
  }
  if (entry.count >= REDEEM_MAX_FAILS) {
    return res.status(429).json({ error: '激活码验证失败次数过多，请 15 分钟后再试', code: 'ERR_RATE_LIMITED' });
  }
  req._redeemRateEntry = entry;
  next();
}

let tablesInitialized = false;

async function ensureMembershipTables(db) {
  if (!db || tablesInitialized) return;
  await db.exec(`
    CREATE TABLE IF NOT EXISTS memberships (
      profile_id TEXT PRIMARY KEY,
      tier TEXT DEFAULT 'free',
      expire_at DATETIME,
      activated_at DATETIME,
      key_code TEXT
    );
    CREATE TABLE IF NOT EXISTS license_keys (
      key_code TEXT PRIMARY KEY,
      days INTEGER NOT NULL,
      tier TEXT DEFAULT 'pro',
      batch_name TEXT,
      is_used INTEGER DEFAULT 0,
      used_by_profile TEXT,
      used_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_license_keys_used ON license_keys(is_used);
  `);
  tablesInitialized = true;
}

// Format a random license key: VIP-XXXX-XXXX-XXXX
function generateKeyCode(prefix = 'VIP') {
  const part1 = crypto.randomBytes(2).toString('hex').toUpperCase();
  const part2 = crypto.randomBytes(2).toString('hex').toUpperCase();
  const part3 = crypto.randomBytes(2).toString('hex').toUpperCase();
  return `${prefix}-${part1}-${part2}-${part3}`;
}

/**
 * GET /api/membership/status — Query membership status for a profile
 */
router.get('/membership/status', async (req, res) => {
  try {
    const authCheck = resolveAuthorizedProfileId(req, req.query.profile_id || 'default');
    if (!authCheck.ok) return res.status(authCheck.status || 403).json({ error: authCheck.error });
    const profileId = authCheck.profileId;

    const sqliteDb = await getSqliteDb();
    if (!sqliteDb) {
      return res.json({
        profile_id: profileId,
        tier: 'free',
        is_vip: false,
        expire_at: null,
        days_remaining: 0
      });
    }
    await ensureMembershipTables(sqliteDb);

    const row = await sqliteDb.get('SELECT * FROM memberships WHERE profile_id = ?', [profileId]);

    const now = new Date();
    if (!row) {
      return res.json({
        profile_id: profileId,
        tier: 'free',
        is_vip: false,
        expire_at: null,
        days_remaining: 0
      });
    }

    const expireDate = row.expire_at ? new Date(row.expire_at) : null;
    const isExpired = !expireDate || expireDate < now;
    const isVip = row.tier === 'pro' && !isExpired;

    let daysRemaining = 0;
    if (isVip && expireDate) {
      daysRemaining = Math.max(0, Math.ceil((expireDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
    }

    // Auto update expired status
    if (row.tier === 'pro' && isExpired) {
      await sqliteDb.run("UPDATE memberships SET tier = 'free' WHERE profile_id = ?", [profileId]);
    }

    return res.json({
      profile_id: profileId,
      tier: isVip ? 'pro' : 'free',
      is_vip: isVip,
      expire_at: row.expire_at,
      days_remaining: daysRemaining,
      activated_at: row.activated_at
    });
  } catch (err) {
    logger.error('[Membership] Failed to get status:', err);
    res.status(500).json({ error: '获取会员状态失败' });
  }
});

/**
 * POST /api/membership/redeem — Redeem a license key to activate Pro membership
 */
router.post('/membership/redeem', checkRedeemRateLimit, async (req, res) => {
  try {
    const sqliteDb = await getSqliteDb();
    if (!sqliteDb) {
      return res.status(503).json({ error: '数据库尚未就绪，请稍后重试' });
    }
    await ensureMembershipTables(sqliteDb);

    const { profile_id, key_code } = req.body;
    if (!profile_id || !key_code) {
      return res.status(400).json({ error: '缺少 profile_id 或激活码 key_code' });
    }
    const authCheck = resolveAuthorizedProfileId(req, profile_id);
    if (!authCheck.ok) return res.status(authCheck.status || 403).json({ error: authCheck.error });
    const targetPid = authCheck.profileId;

    const cleanKey = String(key_code).trim().toUpperCase();

    const redeemOutcome = await dbQueue.enqueue(async () => {
      await sqliteDb.run('BEGIN IMMEDIATE TRANSACTION');
      try {
        const keyRow = await sqliteDb.get('SELECT * FROM license_keys WHERE key_code = ?', [cleanKey]);
        if (!keyRow) {
          await sqliteDb.run('ROLLBACK');
          return { status: 404, body: { error: '激活码不存在，请核对后重试' } };
        }
        if (keyRow.is_used === 1) {
          await sqliteDb.run('ROLLBACK');
          return { status: 409, body: { error: '该激活码已被使用，无法重复激活' } };
        }

        const now = new Date();
        const nowIso = now.toISOString();
        const daysToAdd = keyRow.days || 30;

        // Atomic conditional update to prevent concurrent double-spend
        const updateRes = await sqliteDb.run(
          'UPDATE license_keys SET is_used = 1, used_by_profile = ?, used_at = ? WHERE key_code = ? AND is_used = 0',
          [targetPid, nowIso, cleanKey]
        );
        if (!updateRes || updateRes.changes !== 1) {
          await sqliteDb.run('ROLLBACK');
          return { status: 409, body: { error: '该激活码已被使用，无法重复激活' } };
        }

        const existing = await sqliteDb.get('SELECT * FROM memberships WHERE profile_id = ?', [targetPid]);
        let baseTime = now;
        if (existing && existing.expire_at) {
          const existingExpire = new Date(existing.expire_at);
          if (existingExpire > now) {
            baseTime = existingExpire;
          }
        }

        const newExpire = new Date(baseTime.getTime() + daysToAdd * 24 * 60 * 60 * 1000);
        const newExpireIso = newExpire.toISOString();

        await sqliteDb.run(`
          INSERT INTO memberships (profile_id, tier, expire_at, activated_at, key_code)
          VALUES (?, 'pro', ?, ?, ?)
          ON CONFLICT(profile_id) DO UPDATE SET
            tier = 'pro',
            expire_at = excluded.expire_at,
            activated_at = excluded.activated_at,
            key_code = excluded.key_code
        `, [targetPid, newExpireIso, nowIso, cleanKey]);

        await sqliteDb.run('COMMIT');
        logger.info(`[Membership] Key ${cleanKey} redeemed by ${targetPid}, valid until ${newExpireIso}`);

        return {
          status: 200,
          body: {
            success: true,
            message: `🎉 恭喜！VIP 会员激活成功，已增加 ${daysToAdd} 天权益！`,
            tier: 'pro',
            is_vip: true,
            expire_at: newExpireIso,
            days_added: daysToAdd
          }
        };
      } catch (txErr) {
        try { await sqliteDb.run('ROLLBACK'); } catch {}
        throw txErr;
      }
    });

    if (redeemOutcome.status === 200) {
      if (req._redeemRateEntry) req._redeemRateEntry.count = 0;
    } else if (req._redeemRateEntry) {
      req._redeemRateEntry.count += 1;
    }

    return res.status(redeemOutcome.status).json(redeemOutcome.body);
  } catch (err) {
    logger.error('[Membership] Failed to redeem key:', err);
    res.status(500).json({ error: '激活码核销失败' });
  }
});

/**
 * Verify Parent Admin PIN or Master API Token
 */
async function verifyAdminPin(sqliteDb, pinHash, req) {
  if (req && await isVerifiedAdminRequest(req)) {
    return true;
  }

  // Check parent_pin_hash stored in system_settings
  if (!pinHash || !sqliteDb) return false;
  const { isWeakPinHash } = require('../utils/adminAuth');
  if (isWeakPinHash(pinHash)) return false;

  const savedPinRow = await sqliteDb.get("SELECT value FROM system_settings WHERE key = 'parent_pin_hash'");
  if (!savedPinRow || !savedPinRow.value || isWeakPinHash(savedPinRow.value)) {
    return false;
  }
  const savedBuf = Buffer.from(String(savedPinRow.value));
  const inputBuf = Buffer.from(String(pinHash));
  if (savedBuf.length !== inputBuf.length) return false;
  return crypto.timingSafeEqual(savedBuf, inputBuf);
}

/**
 * POST /api/membership/admin/generate-keys — Generate batches of license keys (For 曾先生 monetization)
 */
router.post('/membership/admin/generate-keys', async (req, res) => {
  try {
    const sqliteDb = await getSqliteDb();
    if (!sqliteDb) {
      return res.status(503).json({ error: '数据库尚未就绪，请稍后重试' });
    }
    await ensureMembershipTables(sqliteDb);

    const { count = 10, days = 30, tier = 'pro', batch_name = '默认发卡批次', pin_hash } = req.body;
    const effectivePin = pin_hash || req.headers?.['x-parent-pin-hash'];

    const isPinValid = await verifyAdminPin(sqliteDb, effectivePin, req);
    if (!isPinValid) {
      return res.status(403).json({ error: '家长/管理员安全 PIN 校验未通过，禁止生成激活码' });
    }

    const numKeys = Math.min(100, Math.max(1, parseInt(count) || 1));
    const generatedKeys = [];

    for (let i = 0; i < numKeys; i++) {
      let key = generateKeyCode('VIP');
      // Ensure no collision
      let attempts = 0;
      while (attempts < 5) {
        const exists = await sqliteDb.get('SELECT key_code FROM license_keys WHERE key_code = ?', [key]);
        if (!exists) break;
        key = generateKeyCode('VIP');
        attempts++;
      }

      await sqliteDb.run(`
        INSERT INTO license_keys (key_code, days, tier, batch_name, is_used)
        VALUES (?, ?, ?, ?, 0)
      `, [key, parseInt(days) || 30, tier, String(batch_name).slice(0, 50)]);

      generatedKeys.push(key);
    }

    logger.info(`[Membership] Generated ${generatedKeys.length} license keys for batch '${batch_name}' (${days} days)`);

    res.json({
      success: true,
      count: generatedKeys.length,
      days: parseInt(days) || 30,
      batch_name,
      keys: generatedKeys
    });
  } catch (err) {
    logger.error('[Membership] Failed to generate keys:', err);
    res.status(500).json({ error: '生成激活卡密失败' });
  }
});

/**
 * GET /api/membership/admin/keys — List generated keys and usage status
 */
router.get('/membership/admin/keys', async (req, res) => {
  try {
    const sqliteDb = await getSqliteDb();
    if (!sqliteDb) {
      return res.status(503).json({ error: '数据库尚未就绪，请稍后重试' });
    }
    await ensureMembershipTables(sqliteDb);

    const pinHash = req.query.pin_hash || req.headers['x-parent-pin-hash'];
    const isPinValid = await verifyAdminPin(sqliteDb, pinHash, req);
    if (!isPinValid) {
      return res.status(403).json({ error: '家长/管理员安全 PIN 校验未通过' });
    }

    const keys = await sqliteDb.all(`
      SELECT key_code, days, tier, batch_name, is_used, used_by_profile, used_at, created_at
      FROM license_keys
      ORDER BY created_at DESC
      LIMIT 200
    `);

    res.json({
      total: keys.length,
      keys
    });
  } catch (err) {
    logger.error('[Membership] Failed to list keys:', err);
    res.status(500).json({ error: '获取卡密列表失败' });
  }
});

module.exports = router;
