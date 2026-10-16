-- Catálogo de downloads protegidos do portal JF Informática.
-- O binário permanece privado no R2 e é entregue somente pela API autenticada.

CREATE TABLE IF NOT EXISTS downloads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  object_key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT,
  version TEXT,
  file_size INTEGER,
  sha256 TEXT,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  sort_order INTEGER NOT NULL DEFAULT 100,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_downloads_active_sort
  ON downloads(active, sort_order, name);

INSERT INTO downloads (
  object_key,
  name,
  description,
  category,
  version,
  file_size,
  sha256,
  active,
  sort_order
)
VALUES (
  'center-backup/releases/0.1.3-dev14/Center-Backup-0.1.3-dev14.exe',
  'Center-Backup',
  'Aplicativo de backup para Windows com licenciamento JF Informática.',
  'Backup',
  '0.1.3-dev14',
  34983721,
  'D0B3519CAF75626BCF6F8023F285E4C4AED37F3EA572A7DC19D453DCD744E716',
  1,
  10
)
ON CONFLICT(object_key) DO UPDATE SET
  name = excluded.name,
  description = excluded.description,
  category = excluded.category,
  version = excluded.version,
  file_size = excluded.file_size,
  sha256 = excluded.sha256,
  active = excluded.active,
  sort_order = excluded.sort_order,
  updated_at = CURRENT_TIMESTAMP;
