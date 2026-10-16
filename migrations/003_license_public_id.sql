-- Public identifier for licenses used by signed Center-Backup authorizations.
-- Keeps the internal D1 row id and the license key out of client authorization documents.

ALTER TABLE licenses
ADD COLUMN public_id TEXT;

UPDATE licenses
SET public_id =
  lower(hex(randomblob(4))) || '-' ||
  lower(hex(randomblob(2))) || '-4' ||
  substr(lower(hex(randomblob(2))), 2) || '-' ||
  substr('89ab', abs(random()) % 4 + 1, 1) ||
  substr(lower(hex(randomblob(2))), 2) || '-' ||
  lower(hex(randomblob(6)))
WHERE public_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_licenses_public_id
ON licenses (public_id);

CREATE TRIGGER IF NOT EXISTS trg_licenses_public_id_required_insert
BEFORE INSERT ON licenses
FOR EACH ROW
WHEN NEW.public_id IS NULL OR trim(NEW.public_id) = ''
BEGIN
  SELECT RAISE(ABORT, 'public_id is required');
END;

CREATE TRIGGER IF NOT EXISTS trg_licenses_public_id_required_update
BEFORE UPDATE OF public_id ON licenses
FOR EACH ROW
WHEN NEW.public_id IS NULL OR trim(NEW.public_id) = ''
BEGIN
  SELECT RAISE(ABORT, 'public_id is required');
END;
