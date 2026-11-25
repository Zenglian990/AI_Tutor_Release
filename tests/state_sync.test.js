const { describe, it, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

describe('Cloud StateSync SQLite Persistence Tests', () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-tutor-statesync-'));
  const localDbPath = path.join(tmpRoot, 'local', 'mistakes.db');
  const persistDir = path.join(tmpRoot, 'persist');

  after(() => {
    try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch {}
  });

  it('rejects empty or corrupted files in isValidSqliteFile and restores/syncs valid SQLite snapshots', async () => {
    const prevSqlite = process.env.SQLITE_DB_PATH;
    const prevPersist = process.env.PERSIST_STATE_DIR;
    process.env.SQLITE_DB_PATH = localDbPath;
    process.env.PERSIST_STATE_DIR = persistDir;

    // 清除缓存以按临时环境变量加载配置与状态同步模块
    delete require.cache[require.resolve('../server/config')];
    delete require.cache[require.resolve('../server/services/stateSync')];
    const { isValidSqliteFile, restoreSqliteFromPersistDir } = require('../server/services/stateSync');

    try {
      fs.mkdirSync(persistDir, { recursive: true });
      const badFile = path.join(persistDir, 'mistakes.db');
      fs.writeFileSync(badFile, 'not-a-sqlite-file');
      assert.equal(isValidSqliteFile(badFile), false, 'Corrupted small file must be rejected');
      assert.equal(restoreSqliteFromPersistDir(), false, 'Corrupted snapshot must not overwrite local DB');

      // 构造合法 SQLite 3 文件头且大小 >= 4096 字节
      const fakeValid = Buffer.alloc(8192, 0);
      Buffer.from('SQLite format 3\0', 'utf8').copy(fakeValid, 0);
      fs.writeFileSync(badFile, fakeValid);
      assert.equal(isValidSqliteFile(badFile), true, 'Valid SQLite header file should pass');
      assert.equal(restoreSqliteFromPersistDir(), true, 'Should restore valid persisted snapshot to local path');
      assert.equal(fs.existsSync(localDbPath), true, 'Restored local DB file should exist');
      assert.equal(fs.statSync(localDbPath).size, 8192);
    } finally {
      if (prevSqlite === undefined) delete process.env.SQLITE_DB_PATH;
      else process.env.SQLITE_DB_PATH = prevSqlite;
      if (prevPersist === undefined) delete process.env.PERSIST_STATE_DIR;
      else process.env.PERSIST_STATE_DIR = prevPersist;
      delete require.cache[require.resolve('../server/config')];
      delete require.cache[require.resolve('../server/services/stateSync')];
    }
  });
});
