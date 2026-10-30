ALTER TABLE photos ADD COLUMN expected_original_bytes INTEGER NOT NULL DEFAULT 0;
ALTER TABLE photos ADD COLUMN expected_gallery_bytes INTEGER NOT NULL DEFAULT 0;
ALTER TABLE photos ADD COLUMN expected_thumbnail_bytes INTEGER NOT NULL DEFAULT 0;
ALTER TABLE photos ADD COLUMN upload_expires_at TEXT;

UPDATE photos
SET upload_expires_at = datetime('now', '+1 hour')
WHERE status = 'pending' AND upload_expires_at IS NULL;

CREATE INDEX idx_photos_pending_expiry ON photos(status, upload_expires_at);
