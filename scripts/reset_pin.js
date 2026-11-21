const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, '..', 'data', 'mistakes.db');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
  db.run("DELETE FROM system_settings WHERE key IN ('parent_pin_hash', 'security_answer_hash')");
  db.run("INSERT OR REPLACE INTO system_settings (key, value) VALUES ('needs_parent_pin_setup', '1')");
  db.all("SELECT * FROM system_settings", (err, rows) => {
    if (err) {
      console.error('Error querying system_settings:', err);
    } else {
      console.log('Successfully reset PIN in SQLite. Current system_settings:', rows);
    }
    db.close();
  });
});
