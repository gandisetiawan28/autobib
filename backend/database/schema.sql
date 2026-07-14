-- AutoBib Database Schema
-- SQLite

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- ============================================================
-- USERS & SESSION
-- ============================================================

CREATE TABLE IF NOT EXISTS users (
  id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  session_token TEXT UNIQUE,
  created_at  TEXT DEFAULT (datetime('now')),
  updated_at  TEXT DEFAULT (datetime('now'))
);

-- ============================================================
-- MENDELEY AUTH
-- ============================================================

CREATE TABLE IF NOT EXISTS mendeley_tokens (
  id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  access_token    TEXT NOT NULL,   -- encrypted
  refresh_token   TEXT NOT NULL,   -- encrypted
  token_type      TEXT DEFAULT 'Bearer',
  expires_at      TEXT NOT NULL,
  mendeley_profile TEXT,           -- JSON: {name, email, profile_id}
  created_at      TEXT DEFAULT (datetime('now')),
  updated_at      TEXT DEFAULT (datetime('now'))
);

-- ============================================================
-- API KEY POOL (Multi-Key per Provider)
-- ============================================================

CREATE TABLE IF NOT EXISTS api_key_pools (
  id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider    TEXT NOT NULL CHECK(provider IN ('openai', 'gemini', 'claude', 'groq')),
  key_name    TEXT NOT NULL,        -- User-defined label: "Key Kampus", "Key Pribadi"
  key_value   TEXT NOT NULL,        -- AES-256-GCM encrypted
  priority    INTEGER DEFAULT 0,    -- Lower number = higher priority
  status      TEXT DEFAULT 'active' CHECK(status IN ('active', 'rate_limited', 'invalid', 'disabled')),
  rotation_strategy TEXT DEFAULT 'failover' CHECK(rotation_strategy IN ('round_robin', 'failover', 'least_used')),
  created_at  TEXT DEFAULT (datetime('now')),
  updated_at  TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_api_key_pools_user_provider ON api_key_pools(user_id, provider);
CREATE INDEX IF NOT EXISTS idx_api_key_pools_status ON api_key_pools(status);

-- ============================================================
-- KEY COOLDOWN (Rate Limit Tracking)
-- ============================================================

CREATE TABLE IF NOT EXISTS key_cooldowns (
  id            TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  key_id        TEXT NOT NULL REFERENCES api_key_pools(id) ON DELETE CASCADE,
  cooldown_until TEXT NOT NULL,    -- datetime when key can be used again
  retry_after   INTEGER,           -- seconds from Retry-After header
  created_at    TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_key_cooldowns_key_id ON key_cooldowns(key_id);

-- ============================================================
-- KEY USAGE LOG
-- ============================================================

CREATE TABLE IF NOT EXISTS key_usage_log (
  id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  key_id      TEXT NOT NULL REFERENCES api_key_pools(id) ON DELETE CASCADE,
  timestamp   TEXT DEFAULT (datetime('now')),
  success     INTEGER NOT NULL CHECK(success IN (0, 1)),  -- 1=success, 0=fail
  error_code  INTEGER,             -- HTTP error code: 429, 503, 401, etc.
  error_msg   TEXT,
  tokens_used INTEGER DEFAULT 0,
  response_ms INTEGER DEFAULT 0    -- response time in milliseconds
);

CREATE INDEX IF NOT EXISTS idx_key_usage_log_key_id ON key_usage_log(key_id);
CREATE INDEX IF NOT EXISTS idx_key_usage_log_timestamp ON key_usage_log(timestamp);

-- ============================================================
-- USER SETTINGS
-- ============================================================

CREATE TABLE IF NOT EXISTS user_settings (
  id                TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  user_id           TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  active_provider   TEXT DEFAULT 'gemini',
  rotation_strategy TEXT DEFAULT 'failover' CHECK(rotation_strategy IN ('round_robin', 'failover', 'least_used')),
  citation_format   TEXT DEFAULT 'apa' CHECK(citation_format IN ('apa', 'mla', 'chicago', 'ieee')),
  output_language   TEXT DEFAULT 'id' CHECK(output_language IN ('id', 'en')),
  max_retry         INTEGER DEFAULT 3 CHECK(max_retry BETWEEN 1 AND 5),
  retry_delay_ms    INTEGER DEFAULT 1000,
  local_bridge_url  TEXT DEFAULT 'http://127.0.0.1:3000',
  created_at        TEXT DEFAULT (datetime('now')),
  updated_at        TEXT DEFAULT (datetime('now'))
);

-- ============================================================
-- SMART CITATION CACHE
-- ============================================================

CREATE TABLE IF NOT EXISTS citation_cache (
  id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  raw_text        TEXT NOT NULL,           -- Original citation text from user
  raw_text_hash   TEXT NOT NULL UNIQUE,    -- SHA256 hash for lookup
  parsed_data     TEXT,                    -- JSON: {author, year, title, journal, doi}
  csl_json        TEXT,                    -- Full CSL JSON metadata
  mendeley_uuid   TEXT,                    -- Mendeley document UUID (if added)
  resolve_source  TEXT,                    -- 'mendeley' | 'crossref' | 'semantic_scholar' | 'ai'
  resolve_status  TEXT DEFAULT 'pending' CHECK(resolve_status IN ('pending', 'found', 'partial', 'not_found')),
  created_at      TEXT DEFAULT (datetime('now')),
  updated_at      TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_citation_cache_hash ON citation_cache(raw_text_hash);
CREATE INDEX IF NOT EXISTS idx_citation_cache_doi ON citation_cache(json_extract(parsed_data, '$.doi'));

-- ============================================================
-- GENERATE HISTORY
-- ============================================================

CREATE TABLE IF NOT EXISTS generate_history (
  id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider    TEXT NOT NULL,
  key_id      TEXT REFERENCES api_key_pools(id),
  mode        TEXT NOT NULL CHECK(mode IN ('summarize', 'paraphrase', 'literature_review', 'custom')),
  input_refs  TEXT,                -- JSON array of Mendeley document IDs
  output_text TEXT,                -- Generated text
  tokens_used INTEGER DEFAULT 0,
  created_at  TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_generate_history_user_id ON generate_history(user_id);

-- ============================================================
-- CHAT SESSIONS (AI Assistant)
-- ============================================================

CREATE TABLE IF NOT EXISTS chat_sessions (
  id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title       TEXT DEFAULT 'Sesi Obrolan Baru',
  created_at  TEXT DEFAULT (datetime('now')),
  updated_at  TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_chat_sessions_user ON chat_sessions(user_id);

-- ============================================================
-- CHAT MESSAGES
-- ============================================================

CREATE TABLE IF NOT EXISTS chat_messages (
  id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  session_id  TEXT NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
  role        TEXT NOT NULL CHECK(role IN ('user', 'ai')),
  content     TEXT NOT NULL,
  created_at  TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_session ON chat_messages(session_id);

-- ============================================================
-- AI SKILLS
-- ============================================================

CREATE TABLE IF NOT EXISTS ai_skills (
  id               TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  user_id          TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  description      TEXT,
  prompt_injection TEXT NOT NULL,
  is_active        INTEGER DEFAULT 1 CHECK(is_active IN (0, 1)),
  created_at       TEXT DEFAULT (datetime('now')),
  updated_at       TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_ai_skills_user ON ai_skills(user_id);
