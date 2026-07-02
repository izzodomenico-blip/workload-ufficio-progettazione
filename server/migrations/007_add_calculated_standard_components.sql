-- Componenti standard calcolati da parametri macchina (I.TS / I.SC).
-- Per ora la tabella resta vuota o popolata manualmente; la formula reale verrà implementata in seguito.
CREATE TABLE IF NOT EXISTS calculated_standard_components (
  id TEXT PRIMARY KEY,
  workshop_output_id TEXT NOT NULL,
  work_item_id TEXT NOT NULL,
  machine_type_code TEXT NOT NULL,
  component_code TEXT,
  process TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'manual',
  ready_from_date TEXT,
  data TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_calc_std_components_output_id ON calculated_standard_components(workshop_output_id);
CREATE INDEX IF NOT EXISTS idx_calc_std_components_work_item_id ON calculated_standard_components(work_item_id);
CREATE INDEX IF NOT EXISTS idx_calc_std_components_machine_code ON calculated_standard_components(machine_type_code);
CREATE INDEX IF NOT EXISTS idx_calc_std_components_process ON calculated_standard_components(process);
