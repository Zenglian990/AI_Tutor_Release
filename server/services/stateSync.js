const fs = require('fs');
const os = require('os');
const path = require('path');
const { SQLITE_DB_PATH, PERSIST_STATE_DIR, NODE_ENV } = require('../config');
const logger = require('./logger');

const SQLITE_MAGIC = Buffer.from('SQLite format 3\0', 'utf8');
let syncInProgress = false;
let lastSyncedSignature = '';
let syncTimer = null;

/**
 * 校验文件是否为完整合法的 SQLite 3 数据库文件（防止空文件/截断文件覆盖正式库）
 */
function isValidSqliteFile(filePath) {
  try {
    if (!fs.existsSync(filePath)) return false;
    const stat = fs.statSync(filePath);
    if (!stat.isFile() || stat.size < 4096) return false;
    const fd = fs.openSync(filePath, 'r');
    try {
      const header = Buffer.alloc(16);
      const bytesRead = fs.readSync(fd, header, 0, 16, 0);
      return bytesRead === 16 && header.equals(SQLITE_MAGIC);
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    return false;
  }
}

/**
 * 计算本地 SQLite 文件及其 WAL 的轻量变更签名，避免无变更时重复同步 GCS FUSE
 */
function computeLocalDbSignature() {
  try {
    const parts = [];
    for (const suffix of ['', '-wal']) {
      const p = `${SQLITE_DB_PATH}${suffix}`;
      if (fs.existsSync(p)) {
        const st = fs.statSync(p);
        parts.push(`${suffix}:${st.size}:${Math.floor(st.mtimeMs)}`);
      }
    }
    return parts.join('|');
  } catch {
    return '';
  }
}

/**
 * 冷启动恢复：若配置了 PERSIST_STATE_DIR 且存在有效持久化数据库快照，则在 SQLite 打开前恢复到本地高速盘
 */
function restoreSqliteFromPersistDir() {
  if (!PERSIST_STATE_DIR) return false;
  const remoteDbPath = path.join(PERSIST_STATE_DIR, 'mistakes.db');
  try {
    if (!isValidSqliteFile(remoteDbPath)) {
      logger.info(`[StateSync] No existing valid persisted snapshot at ${remoteDbPath}; starting fresh.`);
      return false;
    }
    const localDir = path.dirname(SQLITE_DB_PATH);
    if (!fs.existsSync(localDir)) {
      fs.mkdirSync(localDir, { recursive: true });
    }
    // 清除可能残留的本地旧 WAL/SHM 避免与恢复快照不匹配
    for (const suffix of ['-wal', '-shm']) {
      const sidecar = `${SQLITE_DB_PATH}${suffix}`;
      if (fs.existsSync(sidecar)) {
        fs.unlinkSync(sidecar);
      }
    }
    fs.copyFileSync(remoteDbPath, SQLITE_DB_PATH);
    lastSyncedSignature = computeLocalDbSignature();
    const sizeMB = (fs.statSync(SQLITE_DB_PATH).size / (1024 * 1024)).toFixed(2);
    logger.info(`[StateSync] Restored SQLite snapshot from ${remoteDbPath} (${sizeMB} MB).`);
    return true;
  } catch (err) {
    logger.warn(`[StateSync] Failed to restore SQLite from ${remoteDbPath}: ${err.message}`);
    return false;
  }
}

/**
 * 事务一致性热同步：通过 VACUUM INTO 在本地生成单文件干净快照，再原子 rename 写入 PERSIST_STATE_DIR（规避 GCS FUSE WAL 锁死风险）
 */
async function syncSqliteToPersistDir(reason = 'periodic', force = false) {
  if (!PERSIST_STATE_DIR) return false;
  if (syncInProgress) return false;

  const currentSig = computeLocalDbSignature();
  if (!force && currentSig && currentSig === lastSyncedSignature) {
    return false;
  }

  const { getSqliteDb } = require('../db/init');
  const dbQueue = require('./dbQueue');
  const sqliteDb = getSqliteDb();
  if (!sqliteDb) return false;

  syncInProgress = true;
  const tempLocalSnapshot = path.join(os.tmpdir(), `ai-tutor-sync-${process.pid}-${Date.now()}.db`);
  const remoteTarget = path.join(PERSIST_STATE_DIR, 'mistakes.db');
  const remoteTemp = path.join(PERSIST_STATE_DIR, `.mistakes.db.tmp.${process.pid}.${Date.now()}`);

  try {
    if (!fs.existsSync(PERSIST_STATE_DIR)) {
      fs.mkdirSync(PERSIST_STATE_DIR, { recursive: true });
    }

    await dbQueue.enqueue(async () => {
      await sqliteDb.run('PRAGMA wal_checkpoint(PASSIVE);');
      await sqliteDb.run('VACUUM INTO ?', [tempLocalSnapshot.replace(/\\/g, '/')]);
    }, 30000);

    if (!isValidSqliteFile(tempLocalSnapshot)) {
      throw new Error('Generated SQLite snapshot failed header validation');
    }

    // 写入 GCS FUSE 挂载卷临时文件并原子重命名
    fs.copyFileSync(tempLocalSnapshot, remoteTemp);
    fs.renameSync(remoteTemp, remoteTarget);

    lastSyncedSignature = computeLocalDbSignature();
    const sizeMB = (fs.statSync(tempLocalSnapshot).size / (1024 * 1024)).toFixed(2);
    logger.info(`[StateSync] Synced SQLite snapshot (${sizeMB} MB) to ${remoteTarget} (reason=${reason}).`);
    return true;
  } catch (err) {
    logger.warn(`[StateSync] Failed to sync SQLite snapshot (reason=${reason}): ${err.message}`);
    try {
      if (fs.existsSync(remoteTemp)) fs.unlinkSync(remoteTemp);
    } catch {}
    return false;
  } finally {
    try {
      if (fs.existsSync(tempLocalSnapshot)) fs.unlinkSync(tempLocalSnapshot);
    } catch {}
    syncInProgress = false;
  }
}

/**
 * 启动后台持久化同步调度器（仅在配置 PERSIST_STATE_DIR 且非测试环境下生效）
 */
function startPersistSyncSchedule() {
  if (!PERSIST_STATE_DIR || NODE_ENV === 'test' || process.env.NODE_ENV === 'test') return;
  const intervalMs = Math.max(15000, parseInt(process.env.PERSIST_SYNC_INTERVAL_MS || '60000', 10) || 60000);
  logger.info(`[StateSync] Cloud persistence enabled: dir=${PERSIST_STATE_DIR}, interval=${intervalMs}ms`);

  // 首次启动 20 秒后确保至少落盘一份基线快照
  setTimeout(() => {
    syncSqliteToPersistDir('startup', true).catch(() => {});
  }, 20000).unref();

  syncTimer = setInterval(() => {
    syncSqliteToPersistDir('periodic', false).catch(() => {});
  }, intervalMs);
  syncTimer.unref();
}

function stopPersistSyncSchedule() {
  if (syncTimer) {
    clearInterval(syncTimer);
    syncTimer = null;
  }
}

module.exports = {
  isValidSqliteFile,
  restoreSqliteFromPersistDir,
  syncSqliteToPersistDir,
  startPersistSyncSchedule,
  stopPersistSyncSchedule
};
