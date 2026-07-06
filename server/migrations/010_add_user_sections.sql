CREATE TABLE IF NOT EXISTS user_sections (
  user_id TEXT NOT NULL,
  section TEXT NOT NULL,
  PRIMARY KEY (user_id, section)
);
CREATE INDEX IF NOT EXISTS idx_user_sections_user ON user_sections(user_id);
