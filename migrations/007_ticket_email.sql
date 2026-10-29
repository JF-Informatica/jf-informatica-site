-- Queued with each ticket/status transaction. Gmail credentials are Cloudflare Secrets, never SQL.
CREATE TABLE IF NOT EXISTS support_email_outbox (
 id TEXT PRIMARY KEY,event_key TEXT NOT NULL UNIQUE,ticket_id TEXT NOT NULL REFERENCES support_tickets(id),
 recipient TEXT NOT NULL,reply_to TEXT NOT NULL,subject TEXT NOT NULL,body TEXT NOT NULL,
 state TEXT NOT NULL DEFAULT 'pending',attempts INTEGER NOT NULL DEFAULT 0,last_error TEXT,
 created_at TEXT NOT NULL,sent_at TEXT,available_at INTEGER NOT NULL DEFAULT 0,
 lease_until INTEGER NOT NULL DEFAULT 0,lock_id TEXT
);
CREATE INDEX IF NOT EXISTS support_email_pending ON support_email_outbox(state,available_at);
