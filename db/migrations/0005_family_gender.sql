ALTER TABLE family_people ADD COLUMN gender TEXT NOT NULL DEFAULT 'unspecified'
  CHECK (gender IN ('female', 'male', 'unspecified'));
