CREATE TABLE IF NOT EXISTS consuntivi_closures (
  id TEXT PRIMARY KEY,
  commessa_key TEXT NOT NULL UNIQUE,
  data TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_consuntivi_closures_key ON consuntivi_closures(commessa_key);
