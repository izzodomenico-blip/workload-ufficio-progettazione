CREATE TABLE IF NOT EXISTS machine_types (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  family TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  data TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_machine_types_code ON machine_types(code COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS idx_machine_types_name ON machine_types(name COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS idx_machine_types_family ON machine_types(family COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS idx_machine_types_active ON machine_types(active);

