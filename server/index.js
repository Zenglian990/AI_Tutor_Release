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

const config = require('./config');
const { PORT, NODE_ENV, API_KEYS } = config;
const { initDB, getSqliteDb, closeDB } = require('./db/init');
const { startDataRetentionCleanup } = require('./services/data-retention');
const { createApp } = require('./app');
const logger = require('./services/logger');

const hasGemini = Array.isArray(API_KEYS) && API_KEYS.length > 0;
const hasDeepSeek = Boolean(config.DEEPSEEK_API_KEY);

if (!hasGemini && !hasDeepSeek) {
  logger.info('[Key Pool] Starting in Client-Key-Only Mode (Zero Shared Cloud Keys): requests must supply x-gemini-api-key or x-deepseek-api-key from client browser.');
}
if (hasGemini) logger.info(`[Key Pool] Loaded ${API_KEYS.length} Gemini API key(s).`);
if (hasDeepSeek) logger.info(`[Provider] DeepSeek configured (Model: ${config.DEEPSEEK_CHAT_MODEL || 'deepseek-chat'}).`);

const app = createApp();

let server;

async function start() {
  // Bind to port immediately so Cloud Run health check passes without waiting for heavy DB indexing
  server = app.listen(PORT, () => {
    logger.info(`曾练专属私教 backend running on http://localhost:${PORT} (${NODE_ENV})`);
    logger.info(`  Health check: http://localhost:${PORT}/api/health`);
  });

  try {
    await initDB();
    logger.info('[SUCCESS] Database & LanceDB vector store initialized successfully.');
  } catch (err) {
    logger.error(`
============================================================
💥 DATABASE INITIALIZATION WARNING 💥
Error Details:
${err.stack || err.message}
============================================================`);
  }

  // Start data retention cleanup (auto-cleans old records)
  startDataRetentionCleanup(getSqliteDb);

  // Start automated backups and health checks
  require('./services/backup').startBackupSchedule();
  require('./services/embedding').startEmbeddingCheck();
}

// Graceful shutdown
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

async function shutdown(signal) {
  logger.info(`Received ${signal}, shutting down gracefully...`);
  if (!server) {
    try { await closeDB(); } catch (e) {}
    process.exit(0);
  }
  server.close(async () => {
    logger.info('HTTP server closed.');
    try {
      await closeDB();
      logger.info('Database closed gracefully.');
    } catch (e) {
      logger.error('Failed to close database:', e);
    }
    process.exit(0);
  });
  // Force exit after 5s
  setTimeout(() => process.exit(0), 5000);
}

start();
