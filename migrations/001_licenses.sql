CREATE TABLE IF NOT EXISTS licenses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_name TEXT NOT NULL,
  product_name TEXT NOT NULL,
  license_key TEXT NOT NULL UNIQUE,
  equipment_name TEXT,
  activated_at TEXT,
  expires_at TEXT,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  last_seen_at TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_licenses_customer
ON licenses (customer_name);

CREATE INDEX IF NOT EXISTS idx_licenses_product
ON licenses (product_name);

CREATE INDEX IF NOT EXISTS idx_licenses_active
ON licenses (active);

CREATE INDEX IF NOT EXISTS idx_licenses_last_seen
ON licenses (last_seen_at);
