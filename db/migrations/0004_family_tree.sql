PRAGMA foreign_keys = ON;

CREATE TABLE family_people (
  id TEXT PRIMARY KEY,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL DEFAULT '',
  nickname TEXT NOT NULL DEFAULT '',
  birth_date TEXT,
  death_date TEXT,
  biography TEXT NOT NULL DEFAULT '',
  profile_photo_id TEXT REFERENCES photos(id) ON DELETE SET NULL,
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_family_people_name ON family_people(last_name, first_name);

-- For parent relationships person_a_id is the parent and person_b_id is the child.
-- Partner relationships are stored in a canonical id order by the API.
CREATE TABLE family_relationships (
  id TEXT PRIMARY KEY,
  person_a_id TEXT NOT NULL REFERENCES family_people(id) ON DELETE CASCADE,
  person_b_id TEXT NOT NULL REFERENCES family_people(id) ON DELETE CASCADE,
  relationship TEXT NOT NULL CHECK (relationship IN ('parent', 'partner')),
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (person_a_id <> person_b_id),
  UNIQUE (person_a_id, person_b_id, relationship)
);
CREATE INDEX idx_family_relationships_a ON family_relationships(person_a_id);
CREATE INDEX idx_family_relationships_b ON family_relationships(person_b_id);

CREATE TABLE photo_people (
  photo_id TEXT NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
  person_id TEXT NOT NULL REFERENCES family_people(id) ON DELETE CASCADE,
  tagged_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (photo_id, person_id)
);
CREATE INDEX idx_photo_people_person ON photo_people(person_id, created_at DESC);
