CREATE TABLE IF NOT EXISTS workshop_assignments (
  id TEXT PRIMARY KEY,
  workshop_output_id TEXT NOT NULL,
  work_item_id TEXT NOT NULL,
  worker_id TEXT NOT NULL,
  process TEXT NOT NULL,
  planned_date TEXT NOT NULL,
  planned_week TEXT NOT NULL,
  status TEXT NOT NULL,
  load_points REAL NOT NULL DEFAULT 0,
  data TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_workshop_assignments_output_id ON workshop_assignments(workshop_output_id);
CREATE INDEX IF NOT EXISTS idx_workshop_assignments_work_item_id ON workshop_assignments(work_item_id);
CREATE INDEX IF NOT EXISTS idx_workshop_assignments_worker_id ON workshop_assignments(worker_id);
CREATE INDEX IF NOT EXISTS idx_workshop_assignments_process ON workshop_assignments(process);
CREATE INDEX IF NOT EXISTS idx_workshop_assignments_planned_date ON workshop_assignments(planned_date);
CREATE INDEX IF NOT EXISTS idx_workshop_assignments_planned_week ON workshop_assignments(planned_week);
CREATE INDEX IF NOT EXISTS idx_workshop_assignments_status ON workshop_assignments(status);
