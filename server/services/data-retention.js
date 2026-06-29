const { DATA_RETENTION_DAYS } = require('../config');
const logger = require('./logger');

/**
 * Periodically clean up old data beyond the retention period.
 * Runs once on startup and then every 24 hours.
 */
async function startDataRetentionCleanup(getSqliteDb) {
  const cleanup = async () => {
    const db = getSqliteDb();
    if (!db) return;

    let totalChanges = 0;

    try {
      await db.run(
        `DELETE FROM chat_history_fts 
         WHERE chat_id IN (
           SELECT id FROM chat_history 
           WHERE datetime(timestamp) < datetime('now', '-' || ? || ' days')
         )`,
        [DATA_RETENTION_DAYS]
      );
      const result = await db.run(
        `DELETE FROM chat_history WHERE datetime(timestamp) < datetime('now', '-' || ? || ' days')`,
        [DATA_RETENTION_DAYS]
      );
      if (result.changes > 0) {
        totalChanges += result.changes;
        logger.info(`[DataRetention] Cleaned ${result.changes} old chat history records (${DATA_RETENTION_DAYS}d retention).`);
      }
    } catch (e) {
      logger.error('[DataRetention] Failed to clean chat_history:', e);
    }

    try {
      const result = await db.run(
        `DELETE FROM mistakes 
         WHERE datetime(timestamp) < datetime('now', '-' || ? || ' days')
         AND datetime(COALESCE(next_review_date, '1970-01-01')) < datetime('now', '-' || ? || ' days')`,
        [DATA_RETENTION_DAYS, DATA_RETENTION_DAYS]
      );
      if (result.changes > 0) {
        totalChanges += result.changes;
        logger.info(`[DataRetention] Cleaned ${result.changes} old mistake records (${DATA_RETENTION_DAYS}d retention).`);
      }
    } catch (e) {
      logger.error('[DataRetention] Failed to clean mistakes:', e);
    }

    // Do not clean up profile_progress records since it represents historical student progress map positions and level states, which should be kept permanently.

    if (totalChanges > 0) {
      try {
        await db.run('VACUUM;');
        logger.info(`[DataRetention] SQLite database vacuumed successfully (cleaned ${totalChanges} records).`);
      } catch (err) {
        logger.error('[DataRetention] Failed to vacuum SQLite database:', err);
      }
    }
  };

  // Run on startup (after a short delay to let DB init)
  setTimeout(cleanup, 30_000).unref();

  // Run every 24 hours
  setInterval(cleanup, 24 * 60 * 60 * 1000).unref();

  logger.info(`[DataRetention] Enabled: auto-clean data older than ${DATA_RETENTION_DAYS} days.`);
}

module.exports = { startDataRetentionCleanup };
