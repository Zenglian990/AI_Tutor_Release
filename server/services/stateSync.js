const fs = require('fs');
const os = require('os');
const path = require('path');
const { pipeline } = require('stream/promises');
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
 * 使用纯流式 I/O 复制文件，彻底规避 Linux/GCSFuse 挂载卷上 fs.copyFileSync 触发 EPERM (copy_file_range/fchmod) 问题
 */
async function streamCopyFile(srcPath, destPath) {
  await pipeline(
    fs.createReadStream(srcPath),
    fs.createWriteStream(destPath, { flags: 'w' })
  );
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
    // 纯读取+写入规避跨文件系统 copyFileSync 权限元操作
    const buf = fs.readFileSync(remoteDbPath);
    fs.writeFileSync(SQLITE_DB_PATH, buf);
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
 * 事务一致性热同步：通过 VACUUM INTO 在本地生成单文件干净快照，再纯流式写入 PERSIST_STATE_DIR（零锁死、零 EPERM）
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
  const remoteTemp = path.join(PERSIST_STATE_DIR, `mistakes.db.tmp.${process.pid}.${Date.now()}`);

  try {
    if (!fs.existsSync(PERSIST_STATE_DIR)) {
      fs.mkdirSync(PERSIST_STATE_DIR, { recursive: true });
    }

    await dbQueue.enqueue(async () => {
      await sqliteDb.run('PRAGMA wal_checkpoint(PASSIVE);');
      await sqliteDb.run('VACUUM INTO ?', [tempLocalSnapshot.replace(/\\/g, '/')]);
    }, 60000);

    if (!isValidSqliteFile(tempLocalSnapshot)) {
      throw new Error('Generated SQLite snapshot failed header validation');
    }

    // 纯流式写入 GCS FUSE 挂载卷临时文件并尝试原子重命名；若某些 FUSE 配置不支持 rename 覆写则回退直接流式写入目标文件
    await streamCopyFile(tempLocalSnapshot, remoteTemp);
    try {
      fs.renameSync(remoteTemp, remoteTarget);
    } catch (renameErr) {
      logger.warn(`[StateSync] Rename fallback triggered on FUSE volume (${renameErr.message}); writing target directly.`);
      await streamCopyFile(tempLocalSnapshot, remoteTarget);
      try { if (fs.existsSync(remoteTemp)) fs.unlinkSync(remoteTemp); } catch {}
    }

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
  const intervalMs = Math.max(30000, parseInt(process.env.PERSIST_SYNC_INTERVAL_MS || '120000', 10) || 120000);
  logger.info(`[StateSync] Cloud persistence enabled: dir=${PERSIST_STATE_DIR}, interval=${intervalMs}ms`);

  // 错开冷启动重型初始化峰值，35 秒后落盘首份基线快照
  setTimeout(() => {
    syncSqliteToPersistDir('startup', true).catch(() => {});
  }, 35000).unref();

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
