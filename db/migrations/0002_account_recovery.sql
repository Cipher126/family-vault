CREATE TABLE recovery_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  created_by TEXT NOT NULL REFERENCES users(id),
  expires_at TEXT NOT NULL,
  used_at TEXT,
  revoked_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_recovery_tokens_user ON recovery_tokens(user_id, created_at DESC);
CREATE INDEX idx_recovery_tokens_expiry ON recovery_tokens(expires_at);
