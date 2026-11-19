CREATE TABLE file_folders (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 100),
  owner_id TEXT NOT NULL REFERENCES users(id),
  password_hash TEXT,
  password_version INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT(datetime('now'))
);
CREATE INDEX idx_file_folders_created ON file_folders(created_at DESC,id DESC);
CREATE TABLE folder_unlocks (
  folder_id TEXT NOT NULL REFERENCES file_folders(id) ON DELETE CASCADE,
  session_hash TEXT NOT NULL REFERENCES sessions(id_hash) ON DELETE CASCADE,
  password_version INTEGER NOT NULL,
  expires_at TEXT NOT NULL,
  PRIMARY KEY(folder_id,session_hash)
);
CREATE TABLE shared_files (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id),
  folder_id TEXT REFERENCES file_folders(id),
  name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size INTEGER NOT NULL CHECK(size > 0 AND size <= 52428800),
  object_key TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','uploading','ready','deleting')),
  expires_at TEXT NOT NULL DEFAULT(datetime('now','+1 hour')),
  created_at TEXT NOT NULL DEFAULT(datetime('now'))
);
CREATE INDEX idx_shared_files_folder ON shared_files(folder_id,status,created_at DESC,id DESC);
CREATE INDEX idx_shared_files_cleanup ON shared_files(status,expires_at);
