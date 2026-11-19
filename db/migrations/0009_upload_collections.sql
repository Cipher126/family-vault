CREATE TABLE upload_batches (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  owner_id TEXT NOT NULL REFERENCES users(id),
  album_id TEXT REFERENCES albums(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT,
  email_state TEXT NOT NULL DEFAULT 'pending' CHECK(email_state IN ('pending','sending','sent','private','failed')),
  email_attempts INTEGER NOT NULL DEFAULT 0,
  email_next_attempt_at TEXT NOT NULL DEFAULT (datetime('now')),
  email_lease_until TEXT,
  email_first_attempt_at TEXT,
  email_sent_at TEXT,
  email_recipient TEXT,
  email_provider_id TEXT,
  email_error TEXT
);
CREATE INDEX idx_upload_batches_delivery ON upload_batches(email_state,email_next_attempt_at);
CREATE TABLE upload_batch_photos (
  batch_id TEXT NOT NULL REFERENCES upload_batches(id) ON DELETE CASCADE,
  photo_id TEXT NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
  PRIMARY KEY(batch_id,photo_id),
  UNIQUE(photo_id)
);
