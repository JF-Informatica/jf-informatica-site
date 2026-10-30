CREATE TABLE IF NOT EXISTS support_ticket_history (
 id TEXT PRIMARY KEY,ticket_id TEXT NOT NULL REFERENCES support_tickets(id),
 kind TEXT NOT NULL,status TEXT,body TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS support_ticket_history_ticket ON support_ticket_history(ticket_id,created_at);
