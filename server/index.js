/**
 * AI Tutor Server Entry Point
 */

const config = require('./config');
const { PORT, NODE_ENV, API_KEYS } = config;
const { initSqlite, initVectorDB, getSqliteDb, closeDB } = require('./db/init');
const { seedCanonicalQuestionsIfEmpty } = require('./services/canonicalQuestions');
const { startDataRetentionCleanup } = require('./services/data-retention');
const { startPersistSyncSchedule, stopPersistSyncSchedule, syncSqliteToPersistDir } = require('./services/stateSync');
const { createApp } = require('./app');
const logger = require('./services/logger');

// 全局未捕获异常与拒绝兜底处理器，防止静默崩溃
process.on('unhandledRejection', (reason) => {
  logger.error('[Process] Unhandled Promise Rejection:', reason instanceof Error ? reason.stack || reason.message : reason);
});

process.on('uncaughtException', async (err) => {
  logger.error('[Process] Uncaught Exception (fatal):', err?.stack || err);
  try {
    await closeDB();
  } catch {}
  process.exit(1);
});

const hasGemini = Array.isArray(API_KEYS) && API_KEYS.length > 0;
const hasDeepSeek = Boolean(config.DEEPSEEK_API_KEY);

if (!hasGemini && !hasDeepSeek) {
  logger.info('[Key Pool] Starting in Client-Key-Only Mode (Zero Shared Cloud Keys): requests must supply client model API keys.');
}
if (hasGemini) logger.info(`[Key Pool] Loaded ${API_KEYS.length} Gemini API key(s).`);
if (hasDeepSeek) logger.info(`[Provider] DeepSeek configured (Model: ${config.DEEPSEEK_CHAT_MODEL || 'deepseek-chat'}).`);

const app = createApp();
let server;

async function start() {
  // 1. SQLite 核心库必须在开放端口前完成打开与事务迁移，彻底消除冷启动 503
  try {
    await initSqlite();
  } catch (err) {
    logger.error('[FATAL] SQLite initialization failed before listening, aborting startup:', err?.stack || err);
    process.exit(1);
  }

  // 2. 立即绑定 HTTP 端口响应健康检查
  await new Promise((resolve) => {
    server = app.listen(PORT, () => {
      logger.info(`AI 智慧私教 backend running on http://localhost:${PORT} (${NODE_ENV})`);
      logger.info(`  Health check: http://localhost:${PORT}/api/health`);
      resolve();
    });
  });

  // 3. 非阻塞后台初始化重型真题库种子与 LanceDB 向量库
  seedCanonicalQuestionsIfEmpty(getSqliteDb()).catch((err) => {
    logger.warn('[CanonicalQuestions] Background seeding warning:', err?.message || err);
  });

  initVectorDB().then(() => {
    logger.info('[SUCCESS] LanceDB vector store initialized successfully.');
  }).catch((err) => {
    logger.warn('[LanceDB] Background vector store initialization warning (canonical fallback active):', err?.message || err);
  });

  // 4. 启动后台维护与定时任务
  startDataRetentionCleanup(getSqliteDb);
  require('./services/backup').startBackupSchedule();
  require('./services/embedding').startEmbeddingCheck();
  startPersistSyncSchedule();
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

async function shutdown(signal) {
  logger.info(`Received ${signal}, shutting down gracefully...`);
  stopPersistSyncSchedule();
  const finalizeAndClose = async () => {
    try {
      await syncSqliteToPersistDir('shutdown', true);
    } catch (syncErr) {
      logger.warn('Final state sync warning during shutdown:', syncErr.message);
    }
    try {
      await closeDB();
      logger.info('Database closed gracefully.');
    } catch (e) {
      logger.error('Failed to close database:', e);
    }
    process.exit(0);
  };
  if (!server) {
    await finalizeAndClose();
    return;
  }
  server.close(async () => {
    logger.info('HTTP server closed.');
    await finalizeAndClose();
  });
  setTimeout(() => process.exit(0), 8000).unref();
}

start();
