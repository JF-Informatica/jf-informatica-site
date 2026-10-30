CREATE TABLE IF NOT EXISTS support_brand_assets(id TEXT PRIMARY KEY,object_key TEXT NOT NULL UNIQUE,mime TEXT NOT NULL,size INTEGER NOT NULL,created_at TEXT NOT NULL);

CREATE TABLE IF NOT EXISTS support_branding(id INTEGER PRIMARY KEY CHECK(id=1),logo_id TEXT REFERENCES support_brand_assets(id),updated_at TEXT NOT NULL);
