CREATE TABLE IF NOT EXISTS workshop_outputs (
  id TEXT PRIMARY KEY,
  work_item_id TEXT NOT NULL,
  machine_type_id TEXT,
  machine_type_code TEXT NOT NULL,
  status TEXT NOT NULL,
  planned_release_date TEXT,
  actual_release_date TEXT,
  data TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_workshop_outputs_work_item_id ON workshop_outputs(work_item_id);
CREATE INDEX IF NOT EXISTS idx_workshop_outputs_machine_type_id ON workshop_outputs(machine_type_id);
CREATE INDEX IF NOT EXISTS idx_workshop_outputs_machine_type_code ON workshop_outputs(machine_type_code COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS idx_workshop_outputs_planned_release_date ON workshop_outputs(planned_release_date);
CREATE INDEX IF NOT EXISTS idx_workshop_outputs_actual_release_date ON workshop_outputs(actual_release_date);
CREATE INDEX IF NOT EXISTS idx_workshop_outputs_status ON workshop_outputs(status);

