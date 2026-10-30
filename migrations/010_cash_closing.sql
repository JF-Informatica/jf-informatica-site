CREATE TABLE IF NOT EXISTS cash_sessions(id TEXT PRIMARY KEY,request_id TEXT NOT NULL UNIQUE,request_hash TEXT NOT NULL,status TEXT NOT NULL CHECK(status IN ('open','closed')),opening_cents INTEGER NOT NULL,opened_at TEXT NOT NULL,opened_by INTEGER NOT NULL,opened_name TEXT NOT NULL,closed_at TEXT,closed_by INTEGER,closed_name TEXT,revision INTEGER NOT NULL DEFAULT 0,snapshot TEXT);

CREATE UNIQUE INDEX IF NOT EXISTS cash_one_open ON cash_sessions(status) WHERE status='open';

CREATE TABLE IF NOT EXISTS cash_movements(id TEXT PRIMARY KEY,request_id TEXT NOT NULL UNIQUE,request_hash TEXT NOT NULL,session_id TEXT NOT NULL REFERENCES cash_sessions(id),kind TEXT NOT NULL CHECK(kind IN ('receipt','expense','withdrawal')),method TEXT NOT NULL,amount_cents INTEGER NOT NULL CHECK(amount_cents>0),description TEXT NOT NULL,ticket_id TEXT REFERENCES support_tickets(id),client_name TEXT NOT NULL,created_at TEXT NOT NULL,created_by INTEGER NOT NULL,operator_name TEXT NOT NULL,void_at TEXT,void_by INTEGER,void_name TEXT,void_reason TEXT,void_key TEXT);

CREATE INDEX IF NOT EXISTS cash_movements_session ON cash_movements(session_id,created_at);
