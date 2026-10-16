CREATE TABLE IF NOT EXISTS login_attempts (
  key_hash TEXT PRIMARY KEY,
  failures INTEGER NOT NULL DEFAULT 0,
  window_started_at TEXT NOT NULL,
  blocked_until TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_login_attempts_blocked_until
ON login_attempts (blocked_until);

CREATE INDEX IF NOT EXISTS idx_login_attempts_updated_at
ON login_attempts (updated_at);

CREATE INDEX IF NOT EXISTS idx_sessions_expires_at
ON sessions (expires_at);
