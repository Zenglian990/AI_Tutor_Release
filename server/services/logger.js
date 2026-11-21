const fs = require('fs');
const path = require('path');

const LOGS_DIR = path.join(__dirname, '..', '..', 'logs');

// Ensure log directory exists
try {
  if (!fs.existsSync(LOGS_DIR)) {
    fs.mkdirSync(LOGS_DIR, { recursive: true });
  }
} catch (err) {
  console.error('Failed to create logs directory:', err);
}

const fsPromises = fs.promises;

function formatMessage(level, message, meta) {
  const ts = new Date().toISOString();
  let metaStr = '';
  if (meta) {
    if (meta instanceof Error) {
      metaStr = `\n${meta.stack || meta.message}`;
    } else {
      try {
        metaStr = ` ${JSON.stringify(meta)}`;
      } catch (e) {
        metaStr = ` [unserializable metadata]`;
      }
    }
  }
  return `[${ts}] [${level}] ${message}${metaStr}\n`;
}

const MAX_LOG_SIZE = 5 * 1024 * 1024; // 5MB
const MAX_BACKUPS = 5;

async function rotateLogFile(logPath) {
  try {
    const stats = await fsPromises.stat(logPath).catch(() => null);
    if (!stats || stats.size < MAX_LOG_SIZE) return;

    // Delete the oldest backup (e.g. log.5) if it exists
    const maxBackupPath = `${logPath}.${MAX_BACKUPS}`;
    await fsPromises.unlink(maxBackupPath).catch(() => {});

    // Shift backups: from MAX_BACKUPS-1 down to 1
    for (let i = MAX_BACKUPS - 1; i >= 1; i--) {
      const oldPath = `${logPath}.${i}`;
      const newPath = `${logPath}.${i + 1}`;
      
      const oldStats = await fsPromises.stat(oldPath).catch(() => null);
      if (oldStats) {
        try {
          await fsPromises.unlink(newPath).catch(() => {});
          await fsPromises.rename(oldPath, newPath);
        } catch (e) {
          console.error(`Failed to shift log backup ${oldPath} to ${newPath}:`, e);
        }
      }
    }

    // Rename active file to backup 1
    const backup1Path = `${logPath}.1`;
    try {
      await fsPromises.unlink(backup1Path).catch(() => {});
      await fsPromises.rename(logPath, backup1Path);
    } catch (e) {
      console.error(`Failed to rename active log ${logPath} to ${backup1Path}:`, e);
    }
  } catch (err) {
    console.error('Error during log rotation:', err);
  }
}

function writeToLogFile(filename, data) {
  const logPath = path.join(LOGS_DIR, filename);
  rotateLogFile(logPath).finally(() => {
    fs.appendFile(logPath, data, 'utf8', (err) => {
      if (err) console.error(`Failed to async write to log file ${filename}:`, err);
    });
  });
}

const logger = {
  info(message, meta) {
    const formatted = formatMessage('INFO', message, meta);
    console.log(`[INFO] ${message}${meta ? ' ' + (meta instanceof Error ? meta.message : JSON.stringify(meta)) : ''}`);
    writeToLogFile('combined.log', formatted);
  },
  warn(message, meta) {
    const formatted = formatMessage('WARN', message, meta);
    console.warn(`[WARN] ${message}${meta ? ' ' + (meta instanceof Error ? meta.message : JSON.stringify(meta)) : ''}`);
    writeToLogFile('combined.log', formatted);
  },
  error(message, meta) {
    const formatted = formatMessage('ERROR', message, meta);
    console.error(`[ERROR] ${message}`, meta || '');
    writeToLogFile('combined.log', formatted);
    writeToLogFile('error.log', formatted);
  }
};

module.exports = logger;
