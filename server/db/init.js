const lancedb = require('@lancedb/lancedb');
const { open } = require('sqlite');
const sqlite3 = require('sqlite3');
const { EMBED_MODEL, SQLITE_DB_PATH, DB_PATH } = require('../config');
const logger = require('../services/logger');
const { initCanonicalQuestionsTable } = require('../services/canonicalQuestions');
const { restoreSqliteFromPersistDir } = require('../services/stateSync');

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

let table = null;
let sqliteDb = null;
let sqliteInitPromise = null;
let vectorInitPromise = null;

async function ensureColumn(db, tableName, colName, alterSql) {
  const cols = await db.all(`PRAGMA table_info('${tableName}')`);
  if (!cols.some(c => c.name === colName)) {
    await db.exec(alterSql);
  }
}

async function runMigrations(db) {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS schema_version (
      version INTEGER PRIMARY KEY,
      applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await db.exec('BEGIN IMMEDIATE TRANSACTION');
  try {
    const { version: currentVersion } = (await db.get('SELECT MAX(version) as version FROM schema_version')) || { version: 0 };
    let v = currentVersion || 0;

    if (v === 0) {
      const row = await db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='mistakes'");
      if (row) {
        const hasFts = await db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='chat_history_fts'");
        const hasSysSettings = await db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='system_settings'");
        const hasApiUsage = await db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='api_usage'");
        const hasProgress = await db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='profile_progress'");
        const hasChat = await db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='chat_history'");

        const mistakesCols = await db.all("PRAGMA table_info('mistakes')");
        const mistakesColNames = mistakesCols.map(c => c.name);
        const chatCols = hasChat ? await db.all("PRAGMA table_info('chat_history')") : [];
        const chatColNames = chatCols.map(c => c.name);

        const hasGamification = await db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='user_gamification'");
        const hasCognitive = await db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='cognitive_knowledge_state'");
        const hasCheckpoints = await db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='study_checkpoints'");
        const hasStreaks = await db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='student_streaks'");
        const hasMemberships = await db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='memberships'");
        const hasFsrs = mistakesColNames.includes('stability');
        const hasImageUrl = mistakesColNames.includes('image_url');

        if (hasMemberships) v = 18;
        else if (hasImageUrl) v = 17;
        else if (hasStreaks) v = 16;
        else if (hasFsrs) v = 15;
        else if (hasCheckpoints) v = 14;
        else if (hasCognitive) v = 13;
        else if (hasGamification) v = 12;
        else if (hasFts) v = 11;
        else if (hasSysSettings) v = 10;
        else if (mistakesColNames.includes('tags')) v = 9;
        else if (hasApiUsage) v = 8;
        else if (chatColNames.includes('grade')) v = 7;
        else if (mistakesColNames.includes('profile_id')) v = 5;
        else if (hasProgress) v = 4;
        else if (hasChat) v = 3;
        else if (mistakesColNames.includes('review_count')) v = 2;
        else v = 1;

        await db.exec(`INSERT OR IGNORE INTO schema_version (version) VALUES (${v})`);
        logger.info(`[Migrations] Deduced legacy schema version: v${v}`);
      }
    }

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
      await db.exec('INSERT OR IGNORE INTO schema_version (version) VALUES (1)');
    }

    if (v < 2) {
      await ensureColumn(db, 'mistakes', 'review_count', 'ALTER TABLE mistakes ADD COLUMN review_count INTEGER DEFAULT 0');
      await ensureColumn(db, 'mistakes', 'easiness_factor', 'ALTER TABLE mistakes ADD COLUMN easiness_factor REAL DEFAULT 2.5');
      await ensureColumn(db, 'mistakes', 'next_review_date', 'ALTER TABLE mistakes ADD COLUMN next_review_date DATETIME DEFAULT CURRENT_TIMESTAMP');
      await ensureColumn(db, 'mistakes', 'last_interval', 'ALTER TABLE mistakes ADD COLUMN last_interval INTEGER DEFAULT 0');
      await db.exec('INSERT OR IGNORE INTO schema_version (version) VALUES (2)');
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
      await db.exec('INSERT OR IGNORE INTO schema_version (version) VALUES (3)');
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
      await db.exec('INSERT OR IGNORE INTO schema_version (version) VALUES (4)');
    }

    if (v < 5) {
      await ensureColumn(db, 'mistakes', 'profile_id', "ALTER TABLE mistakes ADD COLUMN profile_id TEXT DEFAULT 'default'");
      await ensureColumn(db, 'mistakes', 'subject', 'ALTER TABLE mistakes ADD COLUMN subject TEXT');
      await db.exec('INSERT OR IGNORE INTO schema_version (version) VALUES (5)');
    }

    if (v < 6) {
      await ensureColumn(db, 'chat_history', 'grade', "ALTER TABLE chat_history ADD COLUMN grade TEXT DEFAULT 'unknown'");
      await db.exec('INSERT OR IGNORE INTO schema_version (version) VALUES (6)');
    }

    if (v < 7) {
      await db.exec('CREATE INDEX IF NOT EXISTS idx_mistakes_profile_subject ON mistakes(profile_id, subject);');
      await db.exec('CREATE INDEX IF NOT EXISTS idx_chat_history_profile_grade_subject ON chat_history(profile_id, grade, subject);');
      await db.exec('CREATE INDEX IF NOT EXISTS idx_profile_progress_profile_grade_subject ON profile_progress(profile_id, grade, subject);');
      await db.exec('INSERT OR IGNORE INTO schema_version (version) VALUES (7)');
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
      await db.exec('INSERT OR IGNORE INTO schema_version (version) VALUES (8)');
    }

    if (v < 9) {
      await ensureColumn(db, 'mistakes', 'tags', "ALTER TABLE mistakes ADD COLUMN tags TEXT DEFAULT ''");
      await db.exec('INSERT OR IGNORE INTO schema_version (version) VALUES (9)');
    }

    if (v < 10) {
      await db.exec(`
        CREATE TABLE IF NOT EXISTS system_settings (
          key TEXT PRIMARY KEY,
          value TEXT
        )
      `);
      await db.exec('INSERT OR IGNORE INTO schema_version (version) VALUES (10)');
    }

    if (v < 11) {
      await db.exec(`
        CREATE VIRTUAL TABLE IF NOT EXISTS chat_history_fts USING fts5(
          chat_id UNINDEXED,
          text
        );
      `);
      await db.exec('INSERT OR IGNORE INTO schema_version (version) VALUES (11)');
    }

    if (v < 12) {
      await db.exec(`
        CREATE TABLE IF NOT EXISTS user_gamification (
          profile_id TEXT PRIMARY KEY,
          rank_points INTEGER DEFAULT 120,
          rank_tier TEXT DEFAULT '青铜求知者',
          streak_days INTEGER DEFAULT 1,
          solved_count INTEGER DEFAULT 0,
          feynman_count INTEGER DEFAULT 0,
          scratchpad_count INTEGER DEFAULT 0,
          badges TEXT DEFAULT '[]',
          last_active_date TEXT,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
      `);
      await db.exec('INSERT OR IGNORE INTO schema_version (version) VALUES (12)');
    }

    if (v < 13) {
      await db.exec(`
        CREATE TABLE IF NOT EXISTS cognitive_knowledge_state (
          profile_id TEXT NOT NULL,
          concept_id TEXT NOT NULL,
          subject TEXT NOT NULL,
          mastery_score REAL DEFAULT 0.5,
          confidence REAL DEFAULT 0.5,
          success_count INTEGER DEFAULT 0,
          failure_count INTEGER DEFAULT 0,
          last_assessed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (profile_id, concept_id)
        );
        CREATE INDEX IF NOT EXISTS idx_cognitive_profile_subject ON cognitive_knowledge_state(profile_id, subject);

        CREATE TABLE IF NOT EXISTS cognitive_events (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          profile_id TEXT NOT NULL,
          concept_id TEXT NOT NULL,
          session_id TEXT,
          event_type TEXT NOT NULL,
          scaffold_stage TEXT,
          is_success INTEGER DEFAULT 0,
          error_type TEXT,
          notes TEXT,
          timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_cognitive_events_profile ON cognitive_events(profile_id, timestamp);
      `);
      await db.exec('INSERT OR IGNORE INTO schema_version (version) VALUES (13)');
    }

    if (v < 14) {
      await db.exec(`
        CREATE TABLE IF NOT EXISTS study_checkpoints (
          profile_id TEXT NOT NULL,
          subject TEXT NOT NULL,
          chapter_id TEXT,
          chapter_name TEXT,
          concept_id TEXT,
          concept_name TEXT,
          last_query_snippet TEXT,
          unresolved_question TEXT,
          progress_pct INTEGER DEFAULT 0,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (profile_id, subject)
        );
        CREATE INDEX IF NOT EXISTS idx_study_checkpoints_updated ON study_checkpoints(profile_id, updated_at);
      `);
      await db.exec('INSERT OR IGNORE INTO schema_version (version) VALUES (14)');
    }

    if (v < 15) {
      await ensureColumn(db, 'mistakes', 'stability', 'ALTER TABLE mistakes ADD COLUMN stability REAL DEFAULT 2.0');
      await ensureColumn(db, 'mistakes', 'difficulty', 'ALTER TABLE mistakes ADD COLUMN difficulty REAL DEFAULT 5.0');
      await ensureColumn(db, 'mistakes', 'fsrs_state', 'ALTER TABLE mistakes ADD COLUMN fsrs_state INTEGER DEFAULT 0');
      await db.exec('INSERT OR IGNORE INTO schema_version (version) VALUES (15)');
    }

    if (v < 16) {
      await db.exec(`
        CREATE TABLE IF NOT EXISTS student_streaks (
          profile_id TEXT PRIMARY KEY,
          current_streak INTEGER DEFAULT 0,
          longest_streak INTEGER DEFAULT 0,
          last_active_date TEXT,
          streak_freeze_count INTEGER DEFAULT 2,
          peer_intimacy_xp INTEGER DEFAULT 0,
          peer_level INTEGER DEFAULT 1,
          total_sessions INTEGER DEFAULT 0,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS streak_history (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          profile_id TEXT NOT NULL,
          activity_date TEXT NOT NULL,
          event_type TEXT DEFAULT 'study_session',
          xp_awarded INTEGER DEFAULT 10,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(profile_id, activity_date, event_type)
        );
        CREATE INDEX IF NOT EXISTS idx_streak_history_profile_date ON streak_history(profile_id, activity_date);
      `);
      await db.exec('INSERT OR IGNORE INTO schema_version (version) VALUES (16)');
    }

    if (v < 17) {
      await ensureColumn(db, 'mistakes', 'image_url', "ALTER TABLE mistakes ADD COLUMN image_url TEXT DEFAULT ''");
      await ensureColumn(db, 'mistakes', 'crop_data', "ALTER TABLE mistakes ADD COLUMN crop_data TEXT DEFAULT ''");
      await db.exec('INSERT OR IGNORE INTO schema_version (version) VALUES (17)');
    }

    if (v < 18) {
      await db.exec(`
        CREATE TABLE IF NOT EXISTS memberships (
          profile_id TEXT PRIMARY KEY,
          tier TEXT DEFAULT 'free',
          expire_at DATETIME,
          activated_at DATETIME,
          key_code TEXT
        );
        CREATE TABLE IF NOT EXISTS license_keys (
          key_code TEXT PRIMARY KEY,
          days INTEGER NOT NULL,
          tier TEXT DEFAULT 'pro',
          batch_name TEXT,
          is_used INTEGER DEFAULT 0,
          used_by_profile TEXT,
          used_at DATETIME,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_license_keys_used ON license_keys(is_used);
      `);
      await db.exec('INSERT OR IGNORE INTO schema_version (version) VALUES (18)');
    }

    if (v < 19) {
      await ensureColumn(db, 'api_usage', 'profile_id', "ALTER TABLE api_usage ADD COLUMN profile_id TEXT DEFAULT 'default'");
      await ensureColumn(db, 'mistakes', 'last_reviewed_at', "ALTER TABLE mistakes ADD COLUMN last_reviewed_at DATETIME");
      await db.exec('CREATE INDEX IF NOT EXISTS idx_api_usage_profile_ts ON api_usage(profile_id, timestamp);');
      await db.exec('INSERT OR IGNORE INTO schema_version (version) VALUES (19)');
    }

    await db.exec('COMMIT');
  } catch (err) {
    try {
      await db.exec('ROLLBACK');
    } catch (rbErr) {
      logger.error('Failed to rollback migration transaction:', rbErr);
    }
    logger.error('Failed during schema migration: ', err);
    throw err;
  }

  // 清理 30 天前的 api_usage
  try {
    const result = await db.run("DELETE FROM api_usage WHERE timestamp < datetime('now', '-30 days')");
    if (result.changes > 0) {
      logger.info(`[Cleanup] Deleted ${result.changes} old api_usage records.`);
    }
  } catch (e) {
    logger.error('Failed to cleanup old api_usage records:', e);
  }

  // 安全审计：清除残留弱 PIN 哈希
  try {
    const pinRow = await db.get("SELECT value FROM system_settings WHERE key = 'parent_pin_hash'");
    if (pinRow && pinRow.value) {
      const { isWeakPinHash } = require('../utils/adminAuth');
      if (isWeakPinHash(pinRow.value)) {
        await db.run("DELETE FROM system_settings WHERE key = 'parent_pin_hash'");
        await db.run("INSERT OR REPLACE INTO system_settings (key, value) VALUES ('needs_parent_pin_setup', '1')");
        logger.warn('[Security] Legacy default/weak PIN hash detected and purged from system_settings.');
      }
    }
  } catch (e) {
    logger.warn('[Security] Could not verify/purge weak PIN hash:', e.message);
  }

  logger.info('[Migrations] All schema migrations applied.');
}

/**
 * 流式解压并分批导入 textbooks_k9_seed.json.gz 到 LanceDB（零主线程阻塞、背压控制）
 */
async function streamSeedLanceDb(db, seedPath, batchSize = 500) {
  return new Promise((resolve, reject) => {
    const readStream = fs.createReadStream(seedPath);
    const gunzip = zlib.createGunzip();
    gunzip.setEncoding('utf8');

    let targetTable = null;
    let totalInserted = 0;
    let batch = [];

    let inArray = false;
    let depth = 0;
    let inString = false;
    let escaped = false;
    let objBuffer = '';
    let processing = Promise.resolve();

    const flushBatch = async (records) => {
      if (!records || records.length === 0) return;
      if (!targetTable) {
        try { await db.dropTable('textbooks'); } catch {}
        targetTable = await db.createTable('textbooks', records);
      } else {
        await targetTable.add(records);
      }
      totalInserted += records.length;
      await new Promise(r => setImmediate(r));
    };

    const onError = (err) => {
      try { readStream.destroy(); } catch {}
      try { gunzip.destroy(); } catch {}
      reject(err);
    };

    readStream.on('error', onError);
    gunzip.on('error', onError);

    gunzip.on('data', (chunk) => {
      for (let i = 0; i < chunk.length; i++) {
        const ch = chunk[i];

        if (!inArray) {
          if (ch === '[') inArray = true;
          continue;
        }

        if (depth === 0) {
          if (ch === '{') {
            depth = 1;
            objBuffer = '{';
            inString = false;
            escaped = false;
          }
          continue;
        }

        objBuffer += ch;

        if (inString) {
          if (escaped) {
            escaped = false;
          } else if (ch === '\\') {
            escaped = true;
          } else if (ch === '"') {
            inString = false;
          }
          continue;
        }

        if (ch === '"') {
          inString = true;
        } else if (ch === '{') {
          depth++;
        } else if (ch === '}') {
          depth--;
          if (depth === 0) {
            try {
              const parsed = JSON.parse(objBuffer);
              batch.push(parsed);
            } catch (parseErr) {
              return onError(parseErr);
            }
            objBuffer = '';

            if (batch.length >= batchSize) {
              const toWrite = batch;
              batch = [];
              gunzip.pause();
              processing = processing
                .then(() => flushBatch(toWrite))
                .then(() => gunzip.resume())
                .catch(onError);
            }
          }
        }
      }
    });

    gunzip.on('end', () => {
      processing
        .then(() => flushBatch(batch))
        .then(() => resolve({ targetTable, totalInserted }))
        .catch(onError);
    });

    readStream.pipe(gunzip);
  });
}

/**
 * 仅初始化 SQLite（打开连接 + WAL + 事务化迁移 + 建表），耗时 < 100ms，必须在 app.listen 前完成。
 */
async function initSqlite() {
  if (sqliteDb) return sqliteDb;
  if (sqliteInitPromise) return sqliteInitPromise;

  sqliteInitPromise = (async () => {
    try {
      const dbDir = path.dirname(SQLITE_DB_PATH);
      if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true });
      }
      // 若配置了云端持久化卷目录，在打开 SQLite 前恢复最新快照
      restoreSqliteFromPersistDir();
      const db = await open({
        filename: SQLITE_DB_PATH,
        driver: sqlite3.Database
      });
      await db.exec('PRAGMA journal_mode=WAL;');
      await db.exec('PRAGMA synchronous=NORMAL;');
      await db.exec('PRAGMA busy_timeout=5000;');

      await runMigrations(db);
      await initCanonicalQuestionsTable(db);

      sqliteDb = db;
      logger.info('Mistake Notebook (SQLite) initialized with multi-profile and subject support.');
      return sqliteDb;
    } catch (e) {
      logger.error('FATAL: SQLite initialization error.', e);
      sqliteInitPromise = null;
      throw e;
    }
  })();

  return sqliteInitPromise;
}

/**
 * 初始化 LanceDB 向量库（支持预建库秒级打开或流式非阻塞导入）。
 */
async function initVectorDB() {
  if (table) return table;
  if (vectorInitPromise) return vectorInitPromise;

  vectorInitPromise = (async () => {
    try {
      const db = await lancedb.connect(DB_PATH);
      const seedPath = path.join(__dirname, '..', '..', 'data', 'textbooks_k9_seed.json.gz');
      let loadedTable = null;

      try {
        const existingTable = await db.openTable('textbooks');
        const rowCount = await existingTable.countRows();
        logger.info(`Connected to LanceDB 'textbooks' table successfully (${rowCount} records).`);

        if (rowCount <= 1 && fs.existsSync(seedPath)) {
          logger.info(`[LanceDB] Table has ${rowCount} records. Streaming K-9 curriculum dataset...`);
          const { targetTable, totalInserted } = await streamSeedLanceDb(db, seedPath, 500);
          loadedTable = targetTable;
          logger.info(`[LanceDB] Successfully auto-seeded ${totalInserted} authentic K-9 curriculum records.`);
        } else {
          loadedTable = existingTable;
        }
      } catch (openErr) {
        if (openErr.message.includes('not found') || openErr.message.includes('Table') || openErr.message.includes('Dataset')) {
          if (fs.existsSync(seedPath)) {
            logger.info("[LanceDB] Table 'textbooks' not found. Streaming pre-packaged K-9 seed package...");
            const { targetTable, totalInserted } = await streamSeedLanceDb(db, seedPath, 500);
            loadedTable = targetTable;
            logger.info(`[LanceDB] Successfully created 'textbooks' table with ${totalInserted} records.`);
          } else {
            logger.warn("LanceDB table 'textbooks' not found and seed file missing. Creating a blank table...");
            const emptyData = [{
              id: 0,
              vector: new Array(768).fill(0),
              text: 'mock_initial_data',
              source: 'mock.txt'
            }];
            loadedTable = await db.createTable('textbooks', emptyData);
            logger.info("Blank LanceDB 'textbooks' table created successfully.");
          }
        } else {
          throw openErr;
        }
      }

      if (loadedTable) {
        try {
          const indices = typeof loadedTable.listIndices === 'function' ? await loadedTable.listIndices() : [];
          const hasFts = Array.isArray(indices) && indices.some(idx =>
            idx && (idx.name === 'text_idx' || idx.indexType === 'FTS' || (Array.isArray(idx.columns) && idx.columns.includes('text')))
          );
          if (!hasFts) {
            await loadedTable.createIndex('text', { config: lancedb.Index.fts() });
            logger.info("[LanceDB] FTS index created on 'text' column.");
          } else {
            logger.info("[LanceDB] FTS index verified on 'text' column.");
          }
        } catch (e) {
          logger.warn('[LanceDB] FTS index warning:', e.message || e);
        }

        table = loadedTable;

        if (process.env.NODE_ENV !== 'test') {
          (async () => {
            try {
              const { getEmbedding } = require('../services/embedding');
              const currentVector = await getEmbedding('test_dimension_alignment');
              if (currentVector && Array.isArray(currentVector)) {
                const currentDim = currentVector.length;
                const samples = await table.query().limit(1).toArray();
                if (samples.length > 0 && samples[0].vector) {
                  const dbDim = samples[0].vector.length;
                  if (dbDim !== currentDim) {
                    logger.error(`FATAL: Embedding dimension mismatch! Model '${EMBED_MODEL}' is ${currentDim}, DB is ${dbDim}.`);
                  } else {
                    logger.info(`[Embedding] Dimension check passed: ${currentDim} (matching LanceDB).`);
                  }
                }
              }
            } catch (err) {
              logger.warn('[Embedding] Startup embedding dimension validation skipped:', err.message);
            }
          })().catch(() => {});
        }
      }

      return table;
    } catch (err) {
      vectorInitPromise = null;
      logger.error('[LanceDB] Vector DB initialization error:', err);
      throw err;
    }
  })();

  return vectorInitPromise;
}

/**
 * 完整初始化入口（保持向后兼容：依次初始化 SQLite、真题库与 LanceDB）。
 */
async function initDB() {
  const db = await initSqlite();
  const { seedCanonicalQuestionsIfEmpty } = require('../services/canonicalQuestions');
  await seedCanonicalQuestionsIfEmpty(db);
  await initVectorDB();
}

function getTable() { return table; }
function getSqliteDb() { return sqliteDb; }

async function closeDB() {
  try {
    const dbQueue = require('../services/dbQueue');
    await dbQueue.drain();
  } catch {}
  if (sqliteDb) {
    try {
      await sqliteDb.close();
    } catch {}
    sqliteDb = null;
    sqliteInitPromise = null;
  }
  table = null;
  vectorInitPromise = null;
}

module.exports = {
  initSqlite,
  initVectorDB,
  initDB,
  runMigrations,
  getTable,
  getSqliteDb,
  closeDB
};
