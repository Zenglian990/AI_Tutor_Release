const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { getSqliteDb } = require('../db/init');
const { API_TOKEN } = require('../config');
const logger = require('../services/logger');

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
    const sqliteDb = await getSqliteDb();
    if (!sqliteDb) {
      return res.json({
        profile_id: req.query.profile_id || 'default',
        tier: 'free',
        is_vip: false,
        expire_at: null,
        days_remaining: 0
      });
    }
    await ensureMembershipTables(sqliteDb);

    const profileId = req.query.profile_id || 'default';
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
router.post('/membership/redeem', async (req, res) => {
  try {
    const sqliteDb = await getSqliteDb();
    await ensureMembershipTables(sqliteDb);

    const { profile_id, key_code } = req.body;
    if (!profile_id || !key_code) {
      return res.status(400).json({ error: '缺少 profile_id 或激活码 key_code' });
    }

    const cleanKey = String(key_code).trim().toUpperCase();

    // Look up key
    const keyRow = await sqliteDb.get('SELECT * FROM license_keys WHERE key_code = ?', [cleanKey]);
    if (!keyRow) {
      return res.status(404).json({ error: '激活码不存在，请核对后重试' });
    }
    if (keyRow.is_used === 1) {
      return res.status(409).json({ error: '该激活码已被使用，无法重复激活' });
    }

    const now = new Date();
    const daysToAdd = keyRow.days || 30;

    // Check existing membership to stack time
    const existing = await sqliteDb.get('SELECT * FROM memberships WHERE profile_id = ?', [profile_id]);
    let baseTime = now;
    if (existing && existing.expire_at) {
      const existingExpire = new Date(existing.expire_at);
      if (existingExpire > now) {
        baseTime = existingExpire; // stack onto existing membership
      }
    }

    const newExpire = new Date(baseTime.getTime() + daysToAdd * 24 * 60 * 60 * 1000);
    const newExpireIso = newExpire.toISOString();
    const nowIso = now.toISOString();

    // Mark key as used
    await sqliteDb.run(
      'UPDATE license_keys SET is_used = 1, used_by_profile = ?, used_at = ? WHERE key_code = ?',
      [profile_id, nowIso, cleanKey]
    );

    // Upsert membership
    await sqliteDb.run(`
      INSERT INTO memberships (profile_id, tier, expire_at, activated_at, key_code)
      VALUES (?, 'pro', ?, ?, ?)
      ON CONFLICT(profile_id) DO UPDATE SET
        tier = 'pro',
        expire_at = excluded.expire_at,
        activated_at = excluded.activated_at,
        key_code = excluded.key_code
    `, [profile_id, newExpireIso, nowIso, cleanKey]);

    logger.info(`[Membership] Key ${cleanKey} redeemed by ${profile_id}, valid until ${newExpireIso}`);

    res.json({
      success: true,
      message: `🎉 恭喜！VIP 会员激活成功，已增加 ${daysToAdd} 天权益！`,
      tier: 'pro',
      is_vip: true,
      expire_at: newExpireIso,
      days_added: daysToAdd
    });
  } catch (err) {
    logger.error('[Membership] Failed to redeem key:', err);
    res.status(500).json({ error: '激活码核销失败' });
  }
});

const { MASTER_PIN_HASHES } = require('../utils/adminAuth');

/**
 * Verify Parent Admin PIN or Master API Token
 */
async function verifyAdminPin(sqliteDb, pinHash, req) {
  // 1. Allow master API_TOKEN from system administrator
  if (req) {
    const authHeader = req.headers?.authorization;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
    if (token && API_TOKEN && token === API_TOKEN) {
      return true;
    }
  }

  // 2. Allow master PIN override (888888 or 000000) for owner access
  if (pinHash) {
    const inputBuf = Buffer.from(String(pinHash));
    for (const masterHash of MASTER_PIN_HASHES) {
      const masterBuf = Buffer.from(masterHash);
      if (inputBuf.length === masterBuf.length && crypto.timingSafeEqual(inputBuf, masterBuf)) {
        return true;
      }
    }
  }

  // 3. Check parent_pin_hash stored in system_settings
  const savedPinRow = await sqliteDb.get("SELECT value FROM system_settings WHERE key = 'parent_pin_hash'");
  if (!savedPinRow || !savedPinRow.value) {
    // Strict security: require configured PIN, reject unauthenticated generation
    return false;
  }
  if (!pinHash) return false;
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

    const isPinValid = await verifyAdminPin(sqliteDb, pin_hash, req);
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
