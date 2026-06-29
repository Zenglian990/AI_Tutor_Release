const lancedb = require('@lancedb/lancedb');
const { open } = require('sqlite');
const sqlite3 = require('sqlite3');
const { DB_PATH, SQLITE_DB_PATH, EMBED_MODEL } = require('../config');
const logger = require('../services/logger');

let table = null;
let sqliteDb = null;

async function initDB() {
  try {
    const db = await lancedb.connect(DB_PATH);
    table = await db.openTable('textbooks');
    logger.info("Connected to LanceDB 'textbooks' table successfully.");

    // Verify embedding dimension and model compatibility (Issue 6)
    try {
      const { getEmbedding } = require('../services/embedding');
      const sampleText = 'test_dimension_alignment';
      const currentVector = await getEmbedding(sampleText);
      if (currentVector && Array.isArray(currentVector)) {
        const currentDim = currentVector.length;
        logger.info(`[Embedding] Configured model '${EMBED_MODEL}' dimension: ${currentDim}`);

        // Get a sample from LanceDB table to verify dimension compatibility
        const samples = await table.query().limit(1).toArray();
        if (samples.length > 0 && samples[0].vector) {
          const dbDim = samples[0].vector.length;
          logger.info(`[LanceDB] Existing table vector dimension: ${dbDim}`);
          if (dbDim !== currentDim) {
            logger.error(`FATAL: Embedding dimension mismatch! Configured model '${EMBED_MODEL}' returns ${currentDim}-dimensional vectors, but the existing database table has ${dbDim}-dimensional vectors. Please re-ingest your textbooks or check your EMBED_MODEL config.`);
            process.exit(1);
          } else {
            logger.info(`[Embedding] Dimension check passed: ${currentDim} (matching LanceDB).`);
          }
        } else {
          logger.info('[LanceDB] Table is empty, skipping dimension alignment check.');
        }
      } else {
        logger.warn('[Embedding] Could not retrieve startup test embedding. Skipping dimension validation.');
      }
    } catch (err) {
      logger.warn('[Embedding] Failed during startup embedding dimension validation:', err.message);
    }

    // Create Full-Text Search (FTS) index on the 'text' column for hybrid search
    try {
      await table.createIndex('text', { config: lancedb.Index.fts(), replace: true });
      logger.info("[LanceDB] FTS index verified/created on 'text' column.");
    } catch (e) {
      logger.warn("[LanceDB] FTS index warning (it might already exist or is loading):", e);
    }

    sqliteDb = await open({
      filename: SQLITE_DB_PATH,
      driver: sqlite3.Database
    });

    // Enable Write-Ahead Logging for high concurrency (Issue 13 Fix)
    await sqliteDb.exec('PRAGMA journal_mode=WAL;');
    await sqliteDb.exec('PRAGMA synchronous=NORMAL;');
    
    // Set busy timeout to 5000ms to handle write lock contention automatically
    await sqliteDb.exec('PRAGMA busy_timeout=5000;');

    // Run migrations
    await runMigrations(sqliteDb);

    logger.info("Mistake Notebook (SQLite) initialized with multi-profile and subject support.");
  } catch (e) {
    logger.error("FATAL: Database initialization error.", e);
    throw e; // rethrow to abort startup
  }
}

async function runMigrations(db) {
  // Migration v1: Core tables
  await db.exec(`
    CREATE TABLE IF NOT EXISTS mistakes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      query TEXT,
      answer TEXT,
      grade TEXT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      source_info TEXT,
      reason TEXT
    )
  `);

  // Migration v2: SM-2 Spaced Repetition columns
  for (const col of [
    'ALTER TABLE mistakes ADD COLUMN review_count INTEGER DEFAULT 0',
    'ALTER TABLE mistakes ADD COLUMN easiness_factor REAL DEFAULT 2.5',
    'ALTER TABLE mistakes ADD COLUMN next_review_date DATETIME DEFAULT CURRENT_TIMESTAMP',
    'ALTER TABLE mistakes ADD COLUMN last_interval INTEGER DEFAULT 0',
  ]) {
    try { await db.exec(col); } catch (e) { /* column already exists */ }
  }

  // Migration v3: Chat history
  await db.exec(`CREATE TABLE IF NOT EXISTS chat_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    profile_id TEXT,
    subject TEXT,
    role TEXT,
    text TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Migration v4: Profile progress
  await db.exec(`
    CREATE TABLE IF NOT EXISTS profile_progress (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      profile_id TEXT NOT NULL,
      grade TEXT NOT NULL,
      subject TEXT NOT NULL,
      chapter_id TEXT NOT NULL,
      status TEXT DEFAULT 'not_started',
      progress_pct INTEGER DEFAULT 0,
      score INTEGER,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(profile_id, grade, subject, chapter_id)
    )
  `);

  // Migration v5: Multi-profile support for mistakes
  for (const col of [
    "ALTER TABLE mistakes ADD COLUMN profile_id TEXT DEFAULT 'default'",
    'ALTER TABLE mistakes ADD COLUMN subject TEXT',
  ]) {
    try { await db.exec(col); } catch (e) { /* column already exists */ }
  }

  // Migration v6: Chat history grade column
  try { await db.exec("ALTER TABLE chat_history ADD COLUMN grade TEXT DEFAULT 'unknown'"); } catch (e) { /* exists */ }

  // Migration v7: Tenancy separation indexes
  try {
    await db.exec('CREATE INDEX IF NOT EXISTS idx_mistakes_profile_subject ON mistakes(profile_id, subject);');
    await db.exec('CREATE INDEX IF NOT EXISTS idx_chat_history_profile_grade_subject ON chat_history(profile_id, grade, subject);');
    await db.exec('CREATE INDEX IF NOT EXISTS idx_profile_progress_profile_grade_subject ON profile_progress(profile_id, grade, subject);');
  } catch (e) {
    logger.error('Failed to create migration indexes:', e);
  }

  // Migration v8: API usage statistics tracking
  try {
    await db.exec(`
      CREATE TABLE IF NOT EXISTS api_usage (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        model TEXT,
        type TEXT,
        prompt_tokens INTEGER,
        completion_tokens INTEGER,
        status TEXT
      )
    `);
    await db.exec('CREATE INDEX IF NOT EXISTS idx_api_usage_timestamp ON api_usage(timestamp);');
  } catch (e) {
    logger.error('Failed to create api_usage table:', e);
  }

  // Migration v9: Mistakes tags column
  try {
    await db.exec("ALTER TABLE mistakes ADD COLUMN tags TEXT DEFAULT '';");
  } catch (e) {
    // column already exists
  }

  // Migration v10: Parental gate / Admin settings table
  try {
    await db.exec(`
      CREATE TABLE IF NOT EXISTS system_settings (
        key TEXT PRIMARY KEY,
        value TEXT
      )
    `);
  } catch (e) {
    logger.error('Failed to create system_settings table:', e);
  }

  // Migration v11: FTS5 Full text search index for chat history
  try {
    await db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS chat_history_fts USING fts5(
        chat_id UNINDEXED,
        text
      );
    `);
  } catch (e) {
    logger.error('Failed to create chat_history_fts table:', e);
  }

  logger.info('[Migrations] All schema migrations applied.');
}

function getTable() { return table; }
function getSqliteDb() { return sqliteDb; }

module.exports = { initDB, getTable, getSqliteDb };
