PRAGMA foreign_keys = ON;

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  display_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'member')) DEFAULT 'member',
  status TEXT NOT NULL CHECK (status IN ('active', 'revoked')) DEFAULT 'active',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE sessions (
  id_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
  user_agent TEXT,
  ip_prefix TEXT
);
CREATE INDEX idx_sessions_user ON sessions(user_id);
CREATE INDEX idx_sessions_expiry ON sessions(expires_at);

CREATE TABLE invitations (
  id TEXT PRIMARY KEY,
  email TEXT COLLATE NOCASE,
  token_hash TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL CHECK (role IN ('admin', 'member')) DEFAULT 'member',
  created_by TEXT NOT NULL REFERENCES users(id),
  expires_at TEXT NOT NULL,
  used_at TEXT,
  revoked_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_invitations_expiry ON invitations(expires_at);

CREATE TABLE albums (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  visibility TEXT NOT NULL CHECK (visibility IN ('family', 'private')) DEFAULT 'family',
  owner_id TEXT NOT NULL REFERENCES users(id),
  cover_photo_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_albums_owner ON albums(owner_id);
CREATE INDEX idx_albums_updated ON albums(updated_at DESC);

CREATE TABLE photos (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id),
  caption TEXT NOT NULL DEFAULT '',
  event_description TEXT NOT NULL DEFAULT '',
  original_filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  date_taken TEXT,
  width INTEGER,
  height INTEGER,
  hash TEXT,
  status TEXT NOT NULL CHECK (status IN ('pending', 'ready', 'deleting')) DEFAULT 'pending',
  original_key TEXT,
  gallery_key TEXT,
  thumbnail_key TEXT,
  original_bytes INTEGER NOT NULL DEFAULT 0,
  gallery_bytes INTEGER NOT NULL DEFAULT 0,
  thumbnail_bytes INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_photos_created ON photos(status, created_at DESC);
CREATE INDEX idx_photos_taken ON photos(status, date_taken DESC);
CREATE INDEX idx_photos_owner ON photos(owner_id, created_at DESC);
CREATE UNIQUE INDEX idx_photos_hash_owner ON photos(owner_id, hash) WHERE hash IS NOT NULL AND status = 'ready';

CREATE TABLE album_photos (
  album_id TEXT NOT NULL REFERENCES albums(id) ON DELETE CASCADE,
  photo_id TEXT NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
  position INTEGER NOT NULL DEFAULT 0,
  added_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (album_id, photo_id)
);
CREATE INDEX idx_album_photos_photo ON album_photos(photo_id);

CREATE TABLE comments (
  id TEXT PRIMARY KEY,
  photo_id TEXT NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
  author_id TEXT NOT NULL REFERENCES users(id),
  body TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 1000),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_comments_photo ON comments(photo_id, created_at);

CREATE TABLE reactions (
  photo_id TEXT NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  emoji TEXT NOT NULL CHECK (emoji IN ('heart', 'smile', 'celebrate')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (photo_id, user_id, emoji)
);

CREATE TABLE application_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_by TEXT REFERENCES users(id),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE audit_logs (
  id TEXT PRIMARY KEY,
  actor_id TEXT REFERENCES users(id),
  action TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  detail TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_audit_created ON audit_logs(created_at DESC);

INSERT INTO application_settings(key, value) VALUES
  ('site_name', 'Family Vault'),
  ('preserve_originals', 'true'),
  ('max_upload_bytes', '20971520'),
  ('storage_quota_bytes', '8589934592'),
  ('storage_warning_percent', '80'),
  ('members_can_create_albums', 'true');
