const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const zlib = require('zlib');
const path = require('path');

const srcDbPath = path.join(__dirname, '..', 'data', 'mistakes.db');
const tempDbPath = path.join(__dirname, '..', 'data', 'canonical_seed_temp.db');
const targetGzPath = path.join(__dirname, '..', 'data', 'canonical_questions.db.gz');

if (!fs.existsSync(srcDbPath)) {
  console.error('Source mistakes.db not found at:', srcDbPath);
  process.exit(1);
}

if (fs.existsSync(tempDbPath)) fs.unlinkSync(tempDbPath);

const srcDb = new sqlite3.Database(srcDbPath);
const destDb = new sqlite3.Database(tempDbPath);

console.log('[Export] Reading canonical_questions from local database...');

srcDb.serialize(() => {
  srcDb.get("SELECT sql FROM sqlite_master WHERE type='table' AND name='canonical_questions'", (err, tableRow) => {
    if (err) {
      console.error('Failed to get schema:', err);
      process.exit(1);
    }

    destDb.run(tableRow.sql, (err2) => {
      if (err2) {
        console.error('Failed to create table in seed db:', err2);
        process.exit(1);
      }

      // Create indexes in seed db
      destDb.run("CREATE INDEX IF NOT EXISTS idx_canonical_fp ON canonical_questions(fingerprint)");
      destDb.run("CREATE INDEX IF NOT EXISTS idx_canonical_grade_subj ON canonical_questions(grade, subject)");

      srcDb.all("SELECT question, options, standard_answer, analysis, key_insight, grade, subject, chapter, source, fingerprint FROM canonical_questions", (err3, rows) => {
        if (err3) {
          console.error('Failed to fetch questions:', err3);
          process.exit(1);
        }

        console.log(`[Export] Found ${rows.length} canonical questions. Inserting into clean seed database...`);

        destDb.serialize(() => {
          destDb.run("BEGIN TRANSACTION");
          const stmt = destDb.prepare("INSERT INTO canonical_questions (question, options, standard_answer, analysis, key_insight, grade, subject, chapter, source, fingerprint) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
          
          for (const r of rows) {
            stmt.run([r.question, r.options, r.standard_answer, r.analysis, r.key_insight, r.grade, r.subject, r.chapter, r.source, r.fingerprint]);
          }

          stmt.finalize();
          destDb.run("COMMIT", () => {
            destDb.close((errClose) => {
              if (errClose) console.warn('Error closing dest db:', errClose);
              srcDb.close();

              console.log('[Export] Compressing to gzip format...');
              const rawBuf = fs.readFileSync(tempDbPath);
              const compressedBuf = zlib.gzipSync(rawBuf, { level: 9 });
              fs.writeFileSync(targetGzPath, compressedBuf);

              fs.unlinkSync(tempDbPath);

              const rawSizeMB = (rawBuf.length / 1024 / 1024).toFixed(2);
              const gzSizeMB = (compressedBuf.length / 1024 / 1024).toFixed(2);

              console.log(`[Export] ✅ Success! Exported ${rows.length} questions.`);
              console.log(`[Export] Uncompressed: ${rawSizeMB} MB -> Gzipped: ${gzSizeMB} MB`);
              console.log(`[Export] Saved to: ${targetGzPath}`);
            });
          });
        });
      });
    });
  });
});
