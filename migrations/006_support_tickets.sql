-- Additive and idempotent. The support module also initializes these tables on first use.
CREATE TABLE IF NOT EXISTS support_tickets (
  id TEXT PRIMARY KEY, protocol TEXT NOT NULL UNIQUE, submission_id TEXT NOT NULL UNIQUE,
  request_hash TEXT NOT NULL, full_name TEXT NOT NULL, email TEXT NOT NULL,
  phone TEXT NOT NULL, department TEXT NOT NULL, category TEXT NOT NULL,
  urgency TEXT NOT NULL, description TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'novo',
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS support_tickets_status_created ON support_tickets(status, created_at DESC);
CREATE TABLE IF NOT EXISTS support_attachments (
  id TEXT PRIMARY KEY, ticket_id TEXT NOT NULL REFERENCES support_tickets(id),
  object_key TEXT NOT NULL UNIQUE, name TEXT NOT NULL, mime TEXT NOT NULL, size INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS support_attachments_ticket ON support_attachments(ticket_id);
CREATE TABLE IF NOT EXISTS support_rate_limits (
  key_hash TEXT PRIMARY KEY, window_start INTEGER NOT NULL, attempts INTEGER NOT NULL
);
