CREATE TABLE memories (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  story TEXT NOT NULL DEFAULT '',
  event_date TEXT,
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE memory_photos (
  memory_id TEXT NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
  photo_id TEXT NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
  PRIMARY KEY (memory_id, photo_id)
);
CREATE INDEX idx_memory_photos_photo ON memory_photos(photo_id);
