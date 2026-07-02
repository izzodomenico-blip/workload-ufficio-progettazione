CREATE TABLE IF NOT EXISTS consuntivi (
  id TEXT PRIMARY KEY,
  work_item_id TEXT,
  date TEXT,
  data TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_consuntivi_work_item ON consuntivi(work_item_id);
CREATE INDEX IF NOT EXISTS idx_consuntivi_date ON consuntivi(date);

CREATE TABLE IF NOT EXISTS tube_profiles (
  id TEXT PRIMARY KEY,
  categoria TEXT,
  label TEXT,
  active INTEGER DEFAULT 1,
  data TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tube_profiles_categoria ON tube_profiles(categoria);
