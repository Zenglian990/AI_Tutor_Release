const lancedb = require('@lancedb/lancedb');
const { open } = require('sqlite');
const sqlite3 = require('sqlite3');
const { RAG_TOP_K, EMBED_MODEL, SQLITE_DB_PATH, DB_PATH } = require('../config');
const logger = require('../services/logger');

let table = null;
let sqliteDb = null;

async function initDB() {
  try {
    const db = await lancedb.connect(DB_PATH);
    try {
      table = await db.openTable('textbooks');
      logger.info("Connected to LanceDB 'textbooks' table successfully.");
    } catch (openErr) {
      if (openErr.message.includes('not found') || openErr.message.includes('Table') || openErr.message.includes('Dataset')) {
        logger.warn("LanceDB table 'textbooks' not found. Creating a blank table for testing/runtime...");
        const emptyData = [{
          id: 0,
          vector: new Array(768).fill(0),
          text: 'mock_initial_data',
          source: 'mock.txt'
        }];
        try {
          table = await db.createTable('textbooks', emptyData);
          logger.info("Blank LanceDB 'textbooks' table created successfully.");
        } catch (createErr) {
          if (createErr.message.includes('already exists') || createErr.message.includes('Table')) {
            table = await db.openTable('textbooks');
            logger.info("Opened existing textbooks table (created concurrently).");
          } else {
            throw createErr;
          }
        }
      } else {
        throw openErr;
      }
    }

    // Verify embedding dimension and model compatibility asynchronously (Issue 6)
    (async () => {
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
              logger.error(`FATAL: Embedding dimension mismatch! Configured model '${EMBED_MODEL}' returns ${currentDim}-dimensional vectors, but the existing database table has ${dbDim}-dimensional vectors. Please re-ingest your textbooks or check your EMBED_MODEL config. (Application will attempt to continue but search may fail)`);
              // Fixed A3-1: Removed process.exit(1)
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
    })().catch(err => logger.error('[Embedding] Async dimension validation failed:', err));

    // Create Full-Text Search (FTS) index on the 'text' column for hybrid search
    try {
      // Fixed A3-2: Removed replace: true to prevent unnecessary rebuilds
      await table.createIndex('text', { config: lancedb.Index.fts() });
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
  await db.exec(`
    CREATE TABLE IF NOT EXISTS schema_version (
      version INTEGER PRIMARY KEY,
      applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  const { version: currentVersion } = (await db.get('SELECT MAX(version) as version FROM schema_version')) || { version: 0 };
  let v = currentVersion || 0;

  // Handle existing databases that didn't have schema_version
  if (v === 0) {
    const row = await db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='mistakes'");
    if (row) {
      // Deduce schema version safely
      const hasFts = await db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='chat_history_fts'");
      const hasSysSettings = await db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='system_settings'");
      const hasApiUsage = await db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='api_usage'");
      const hasProgress = await db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='profile_progress'");
      const hasChat = await db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='chat_history'");
      
      const mistakesCols = await db.all("PRAGMA table_info('mistakes')");
      const mistakesColNames = mistakesCols.map(c => c.name);
      const chatCols = hasChat ? await db.all("PRAGMA table_info('chat_history')") : [];
      const chatColNames = chatCols.map(c => c.name);

      if (hasFts) v = 11;
      else if (hasSysSettings) v = 10;
      else if (mistakesColNames.includes('tags')) v = 9;
      else if (hasApiUsage) v = 8;
      else if (chatColNames.includes('grade')) v = 7; 
      else if (mistakesColNames.includes('profile_id')) v = 5;
      else if (hasProgress) v = 4;
      else if (hasChat) v = 3;
      else if (mistakesColNames.includes('review_count')) v = 2;
      else v = 1;
      
      await db.exec(`INSERT INTO schema_version (version) VALUES (${v})`);
      logger.info(`[Migrations] Deduced legacy schema version: v${v}`);
    }
  }

  try {
    if (v < 1) {
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
      await db.exec('INSERT INTO schema_version (version) VALUES (1)');
    }

    if (v < 2) {
      await db.exec('ALTER TABLE mistakes ADD COLUMN review_count INTEGER DEFAULT 0');
      await db.exec('ALTER TABLE mistakes ADD COLUMN easiness_factor REAL DEFAULT 2.5');
      await db.exec('ALTER TABLE mistakes ADD COLUMN next_review_date DATETIME DEFAULT CURRENT_TIMESTAMP');
      await db.exec('ALTER TABLE mistakes ADD COLUMN last_interval INTEGER DEFAULT 0');
      await db.exec('INSERT INTO schema_version (version) VALUES (2)');
    }

    if (v < 3) {
      await db.exec(`CREATE TABLE IF NOT EXISTS chat_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        profile_id TEXT,
        subject TEXT,
        role TEXT,
        text TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
      )`);
      await db.exec('INSERT INTO schema_version (version) VALUES (3)');
    }

    if (v < 4) {
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
      await db.exec('INSERT INTO schema_version (version) VALUES (4)');
    }

    if (v < 5) {
      await db.exec("ALTER TABLE mistakes ADD COLUMN profile_id TEXT DEFAULT 'default'");
      await db.exec("ALTER TABLE mistakes ADD COLUMN subject TEXT");
      await db.exec('INSERT INTO schema_version (version) VALUES (5)');
    }

    if (v < 6) {
      await db.exec("ALTER TABLE chat_history ADD COLUMN grade TEXT DEFAULT 'unknown'");
      await db.exec('INSERT INTO schema_version (version) VALUES (6)');
    }

    if (v < 7) {
      await db.exec('CREATE INDEX IF NOT EXISTS idx_mistakes_profile_subject ON mistakes(profile_id, subject);');
      await db.exec('CREATE INDEX IF NOT EXISTS idx_chat_history_profile_grade_subject ON chat_history(profile_id, grade, subject);');
      await db.exec('CREATE INDEX IF NOT EXISTS idx_profile_progress_profile_grade_subject ON profile_progress(profile_id, grade, subject);');
      await db.exec('INSERT INTO schema_version (version) VALUES (7)');
    }

    if (v < 8) {
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
      await db.exec('INSERT INTO schema_version (version) VALUES (8)');
    }

    if (v < 9) {
      await db.exec("ALTER TABLE mistakes ADD COLUMN tags TEXT DEFAULT '';");
      await db.exec('INSERT INTO schema_version (version) VALUES (9)');
    }

    if (v < 10) {
      await db.exec(`
        CREATE TABLE IF NOT EXISTS system_settings (
          key TEXT PRIMARY KEY,
          value TEXT
        )
      `);
      await db.exec('INSERT INTO schema_version (version) VALUES (10)');
    }

    if (v < 11) {
      await db.exec(`
        CREATE VIRTUAL TABLE IF NOT EXISTS chat_history_fts USING fts5(
          chat_id UNINDEXED,
          text
        );
      `);
      await db.exec('INSERT INTO schema_version (version) VALUES (11)');
    }

  } catch (err) {
    logger.error('Failed during schema migration: ', err);
    throw err;
  }

  // Cleanup api_usage records older than 30 days
  try {
    const result = await db.run("DELETE FROM api_usage WHERE timestamp < datetime('now', '-30 days')");
    if (result.changes > 0) {
      logger.info(`[Cleanup] Deleted ${result.changes} old api_usage records.`);
    }
  } catch (e) {
    logger.error('Failed to cleanup old api_usage records:', e);
  }

  logger.info('[Migrations] All schema migrations applied.');
}

function getTable() { return table; }
function getSqliteDb() { return sqliteDb; }

async function closeDB() {
  try {
    const dbQueue = require('../services/dbQueue');
    await dbQueue.drain();
  } catch (e) {}
  if (sqliteDb) {
    try {
      await sqliteDb.close();
    } catch (e) {}
    sqliteDb = null;
  }
}

module.exports = { initDB, getTable, getSqliteDb, closeDB };
