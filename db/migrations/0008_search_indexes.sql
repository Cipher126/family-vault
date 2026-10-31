CREATE VIRTUAL TABLE photo_search USING fts5(caption,event_description,content='photos',content_rowid='rowid',tokenize='trigram');
INSERT INTO photo_search(photo_search) VALUES('rebuild');
CREATE TRIGGER photo_search_insert AFTER INSERT ON photos BEGIN
  INSERT INTO photo_search(rowid,caption,event_description) VALUES(new.rowid,new.caption,new.event_description);
END;
CREATE TRIGGER photo_search_delete AFTER DELETE ON photos BEGIN
  INSERT INTO photo_search(photo_search,rowid,caption,event_description) VALUES('delete',old.rowid,old.caption,old.event_description);
END;
CREATE TRIGGER photo_search_update AFTER UPDATE OF caption,event_description ON photos BEGIN
  INSERT INTO photo_search(photo_search,rowid,caption,event_description) VALUES('delete',old.rowid,old.caption,old.event_description);
  INSERT INTO photo_search(rowid,caption,event_description) VALUES(new.rowid,new.caption,new.event_description);
END;
CREATE INDEX idx_photos_capture_day ON photos(status,substr(date_taken,6,5),date_taken DESC);
CREATE INDEX idx_photos_capture_month ON photos(status,substr(date_taken,6,2),date_taken DESC);
CREATE INDEX idx_photos_uploaded_month ON photos(status,substr(created_at,6,2),created_at DESC);
CREATE INDEX idx_photos_memory_recent ON photos(status,COALESCE(date_taken,created_at) DESC,created_at DESC);
CREATE INDEX idx_photos_taken_cursor ON photos(status,COALESCE(date_taken,''),id);
CREATE INDEX idx_photos_created_cursor ON photos(status,created_at DESC,id DESC);
CREATE INDEX idx_photos_timeline_order ON photos(status,CASE WHEN date_taken IS NULL THEN 1 ELSE 0 END,date_taken DESC,created_at DESC);
