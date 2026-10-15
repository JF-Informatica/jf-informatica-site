-- Center-Backup / Portal JF licensing activation schema
-- Apply to D1 after 001_licenses.sql.

CREATE TABLE IF NOT EXISTS license_activations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  activation_id TEXT NOT NULL UNIQUE,
  license_id INTEGER NOT NULL UNIQUE,
  installation_id TEXT NOT NULL,
  fingerprint_version INTEGER NOT NULL DEFAULT 1,
  fingerprint_hash TEXT NOT NULL,
  device_name TEXT,
  client_version TEXT,
  platform TEXT,
  token_hash TEXT NOT NULL UNIQUE,
  activated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (license_id) REFERENCES licenses(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_license_activations_installation
ON license_activations (installation_id);

CREATE INDEX IF NOT EXISTS idx_license_activations_last_seen
ON license_activations (last_seen_at);

CREATE INDEX IF NOT EXISTS idx_license_activations_fingerprint
ON license_activations (fingerprint_hash);
