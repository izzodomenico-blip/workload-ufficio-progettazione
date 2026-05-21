CREATE TABLE IF NOT EXISTS workshop_workers (
  id TEXT PRIMARY KEY,
  employee_code TEXT,
  display_name TEXT NOT NULL,
  department TEXT,
  primary_skill TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  data TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_workshop_workers_active ON workshop_workers(active);
CREATE INDEX IF NOT EXISTS idx_workshop_workers_display_name ON workshop_workers(display_name COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS idx_workshop_workers_employee_code ON workshop_workers(employee_code COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS idx_workshop_workers_department ON workshop_workers(department COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS idx_workshop_workers_primary_skill ON workshop_workers(primary_skill);
