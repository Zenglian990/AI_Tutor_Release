const fs = require('fs');
const fsPromises = fs.promises;
const path = require('path');
const logger = require('./logger');
const { getSqliteDb } = require('../db/init');

const BACKUP_DIR = path.join(__dirname, '..', '..', 'data', 'backups');
const SQLITE_DB = path.join(__dirname, '..', '..', 'data', 'mistakes.db');
const LANCEDB_DIR = path.join(__dirname, '..', '..', 'data', 'lancedb');

// Purge backups older than 7 days (7 * 24 * 60 * 60 * 1000 = 604800000 ms)
const MAX_BACKUP_AGE_MS = 7 * 24 * 60 * 60 * 1000;

async function runBackup() {
  try {
    if (!fs.existsSync(BACKUP_DIR)) {
      await fsPromises.mkdir(BACKUP_DIR, { recursive: true });
    }

    // Prevent backup flood on restart: skip if a backup exists that is less than 12 hours old
    const folders = await fsPromises.readdir(BACKUP_DIR);
    const now = Date.now();
    const recentBackup = folders.find(folder => {
      if (!folder.startsWith('backup-')) return false;
      try {
        const stat = fs.statSync(path.join(BACKUP_DIR, folder));
        return (now - stat.mtimeMs) < 12 * 60 * 60 * 1000; // 12 hours
      } catch (e) {
        return false;
      }
    });

    if (recentBackup) {
      logger.info(`[Backup] Skipped. A recent backup exists: ${recentBackup}`);
      return;
    }

    // 0. Perform SQLite WAL Checkpoint to flush all journal modifications into the main database file
    const sqliteDb = getSqliteDb();
    if (sqliteDb) {
      try {
        await sqliteDb.run('PRAGMA wal_checkpoint(TRUNCATE);');
        logger.info('[Backup] SQLite WAL checkpoint completed (flushed journal to main database file).');
      } catch (checkpointErr) {
        logger.warn('[Backup] Warning: Failed to execute WAL checkpoint before backup:', checkpointErr.message);
      }
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const destFolder = path.join(BACKUP_DIR, `backup-${timestamp}`);
    await fsPromises.mkdir(destFolder, { recursive: true });

    // 1. Backup SQLite db and its transaction log (WAL) files
    if (fs.existsSync(SQLITE_DB)) {
      await fsPromises.copyFile(SQLITE_DB, path.join(destFolder, 'mistakes.db'));
      
      const walFile = `${SQLITE_DB}-wal`;
      if (fs.existsSync(walFile)) {
        await fsPromises.copyFile(walFile, path.join(destFolder, 'mistakes.db-wal'));
      }
      
      const shmFile = `${SQLITE_DB}-shm`;
      if (fs.existsSync(shmFile)) {
        await fsPromises.copyFile(shmFile, path.join(destFolder, 'mistakes.db-shm'));
      }
      
      logger.info(`[Backup] SQLite database and WAL files backed up to ${destFolder}`);
    }

    // 2. LanceDB contains static textbook vector databases (1.89GB) which does not need regular backup.
    // We only backup mistakes.db (which contains dynamic user data and is only ~0.2MB).

    // 3. Purge old backups
    await cleanOldBackups();

  } catch (err) {
    logger.error('[Backup] Backup process failed:', err);
  }
}

async function cleanOldBackups() {
  try {
    if (!fs.existsSync(BACKUP_DIR)) return;
    const folders = await fsPromises.readdir(BACKUP_DIR);
    const now = Date.now();

    for (const folder of folders) {
      const folderPath = path.join(BACKUP_DIR, folder);
      const stat = await fsPromises.stat(folderPath);
      if (stat.isDirectory() && folder.startsWith('backup-')) {
        const age = now - stat.mtimeMs;
        if (age > MAX_BACKUP_AGE_MS) {
          logger.info(`[Backup] Purging old backup: ${folder}`);
          await fsPromises.rm(folderPath, { recursive: true, force: true });
        }
      }
    }
  } catch (err) {
    logger.error('[Backup] Failed to purge old backups:', err);
  }
}

// Start backup scheduler
// Runs once 10 seconds after server startup, then every 24 hours
setTimeout(() => {
  runBackup().catch(err => logger.error('[Backup Scheduler] Startup run failed:', err));
}, 10000).unref();

setInterval(() => {
  runBackup().catch(err => logger.error('[Backup Scheduler] Interval run failed:', err));
}, 24 * 60 * 60 * 1000).unref();

module.exports = {
  runBackup
};
