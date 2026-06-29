/**
 * AI Tutor Server Entry Point
 *
 * Architecture:
 *   config/     → environment & constants
 *   db/         → database initialization & migrations
 *   middleware/  → auth, rate limiting, etc.
 *   services/   → embedding, data retention, etc.
 *   prompts/    → prompt templates & chapter data
 *   routes/     → API route handlers
 */

const { PORT, NODE_ENV, API_KEYS } = require('./config');
const { initDB, getSqliteDb } = require('./db/init');
const { startDataRetentionCleanup } = require('./services/data-retention');
const { createApp } = require('./app');
const logger = require('./services/logger');

if (API_KEYS.length === 0) {
  logger.error('FATAL: No GEMINI_API_KEY found in environment!');
  process.exit(1);
}
logger.info(`[Key Pool] Loaded ${API_KEYS.length} API key(s).`);

const app = createApp();

let server;

async function start() {
  await initDB();

  // Start data retention cleanup (auto-cleans old records)
  startDataRetentionCleanup(getSqliteDb);

  // Start automated backups
  require('./services/backup');

  server = app.listen(PORT, () => {
    logger.info(`曾练专属私教 backend running on http://localhost:${PORT} (${NODE_ENV})`);
    logger.info(`  Health check: http://localhost:${PORT}/api/health`);
  });
}

// Graceful shutdown
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

async function shutdown(signal) {
  logger.info(`Received ${signal}, shutting down gracefully...`);
  if (!server) { process.exit(0); }
  server.close(async () => {
    logger.info('HTTP server closed.');
    const sqliteDb = getSqliteDb();
    if (sqliteDb) {
      try {
        await sqliteDb.close();
        logger.info('SQLite closed.');
      } catch (e) {
        logger.error('Failed to close SQLite:', e);
      }
    }
    process.exit(0);
  });
  // Force exit after 5s
  setTimeout(() => process.exit(1), 5000);
}

start();
