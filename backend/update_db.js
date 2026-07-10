const Database = require('better-sqlite3');
const db = new Database('./database/autobib.db');
db.exec(`
  PRAGMA foreign_keys = OFF;
  CREATE TABLE IF NOT EXISTS user_settings_new (
    id                TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    user_id           TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    active_provider   TEXT DEFAULT 'gemini',
    rotation_strategy TEXT DEFAULT 'failover' CHECK(rotation_strategy IN ('round_robin', 'failover', 'least_used')),
    citation_format   TEXT DEFAULT 'apa' CHECK(citation_format IN ('apa', 'mla', 'chicago', 'ieee')),
    output_language   TEXT DEFAULT 'id' CHECK(output_language IN ('id', 'en')),
    max_retry         INTEGER DEFAULT 3 CHECK(max_retry BETWEEN 1 AND 5),
    retry_delay_ms    INTEGER DEFAULT 1000,
    created_at        TEXT DEFAULT (datetime('now')),
    updated_at        TEXT DEFAULT (datetime('now'))
  );
  INSERT INTO user_settings_new SELECT * FROM user_settings;
  DROP TABLE user_settings;
  ALTER TABLE user_settings_new RENAME TO user_settings;
  PRAGMA foreign_keys = ON;
`);
console.log('Database updated successfully');
