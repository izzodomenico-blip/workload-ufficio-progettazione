-- v1.2 — Anagrafiche clienti/fornitori/personale/altro
-- Tabella conservata in stile JSON-blob coerente con le altre.

CREATE TABLE IF NOT EXISTS business_partners (
  id TEXT PRIMARY KEY,
  account_code TEXT,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  vat_number TEXT,
  fiscal_code TEXT,
  email TEXT,
  pec TEXT,
  city TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  data TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_business_partners_account_code ON business_partners(account_code);
CREATE INDEX IF NOT EXISTS idx_business_partners_name ON business_partners(name COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS idx_business_partners_type ON business_partners(type);
CREATE INDEX IF NOT EXISTS idx_business_partners_active ON business_partners(active);
CREATE INDEX IF NOT EXISTS idx_business_partners_vat_number ON business_partners(vat_number);
CREATE INDEX IF NOT EXISTS idx_business_partners_fiscal_code ON business_partners(fiscal_code);
CREATE INDEX IF NOT EXISTS idx_business_partners_email ON business_partners(email);
CREATE INDEX IF NOT EXISTS idx_business_partners_pec ON business_partners(pec);
CREATE INDEX IF NOT EXISTS idx_business_partners_city ON business_partners(city);
