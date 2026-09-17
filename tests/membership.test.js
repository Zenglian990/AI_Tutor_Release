const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../server/app');
const { initDB, closeDB, getSqliteDb } = require('../server/db/init');

let server;
let baseUrl;

before(async () => {
  await initDB();
  const app = createApp();
  await new Promise(resolve => {
    server = app.listen(0, () => {
      const port = server.address().port;
      baseUrl = `http://localhost:${port}`;
      resolve();
    });
  });
});

after(async () => {
  if (server) {
    await new Promise(resolve => server.close(resolve));
  }
  await closeDB();
});

test('Membership API: GET /api/membership/status default free tier', async () => {
  const res = await fetch(`${baseUrl}/api/membership/status?profile_id=test_student_1`);
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.profile_id, 'test_student_1');
  assert.equal(data.tier, 'free');
  assert.equal(data.is_vip, false);
  assert.equal(data.days_remaining, 0);
});

test('Membership API: POST /api/membership/admin/generate-keys creates license keys', async () => {
  const db = await getSqliteDb();
  const savedPin = await db.get("SELECT value FROM system_settings WHERE key = 'parent_pin_hash'");
  const pinHash = savedPin?.value;

  const res = await fetch(`${baseUrl}/api/membership/admin/generate-keys`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      count: 3,
      days: 30,
      batch_name: '小红书初次内测批次',
      pin_hash: pinHash
    })
  });

  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.success, true);
  assert.equal(data.count, 3);
  assert.equal(data.keys.length, 3);
  assert.match(data.keys[0], /^VIP-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
});

test('Membership API: POST /api/membership/redeem successfully activates Pro VIP', async () => {
  const db = await getSqliteDb();
  const savedPin = await db.get("SELECT value FROM system_settings WHERE key = 'parent_pin_hash'");
  const pinHash = savedPin?.value;

  // 1. Generate 1 key
  const genRes = await fetch(`${baseUrl}/api/membership/admin/generate-keys`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ count: 1, days: 90, batch_name: '季卡测试', pin_hash: pinHash })
  });
  assert.equal(genRes.status, 200);
  const genData = await genRes.json();
  const testKey = genData.keys[0];

  // 2. Redeem key
  const testProfileId = 'vip_student_' + Date.now();
  const redeemRes = await fetch(`${baseUrl}/api/membership/redeem`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      profile_id: testProfileId,
      key_code: testKey
    })
  });

  assert.equal(redeemRes.status, 200);
  const redeemData = await redeemRes.json();
  assert.equal(redeemData.success, true);
  assert.equal(redeemData.is_vip, true);
  assert.equal(redeemData.tier, 'pro');
  assert.equal(redeemData.days_added, 90);

  // 3. Query status again to verify persistence
  const statusRes = await fetch(`${baseUrl}/api/membership/status?profile_id=${testProfileId}`);
  const statusData = await statusRes.json();
  assert.equal(statusData.is_vip, true);
  assert.equal(statusData.tier, 'pro');
  assert.ok(statusData.days_remaining >= 89 && statusData.days_remaining <= 91);

  // 4. Attempt to reuse key (should fail 409)
  const reuseRes = await fetch(`${baseUrl}/api/membership/redeem`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      profile_id: 'another_student',
      key_code: testKey
    })
  });
  assert.equal(reuseRes.status, 409);
});

test('Membership API: POST /api/membership/redeem rejects invalid key', async () => {
  const res = await fetch(`${baseUrl}/api/membership/redeem`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      profile_id: 'test_student',
      key_code: 'VIP-FAKE-KEY9-9999'
    })
  });
  assert.equal(res.status, 404);
});
