CREATE TABLE IF NOT EXISTS support_commercial_profile(id INTEGER PRIMARY KEY CHECK(id=1),data TEXT NOT NULL,revision TEXT NOT NULL,updated_at TEXT NOT NULL);

CREATE TABLE IF NOT EXISTS support_report_drafts(ticket_id TEXT PRIMARY KEY REFERENCES support_tickets(id),data TEXT NOT NULL,revision TEXT NOT NULL,updated_at TEXT NOT NULL);

CREATE TABLE IF NOT EXISTS support_report_deliveries(id TEXT PRIMARY KEY,ticket_id TEXT NOT NULL REFERENCES support_tickets(id),revision TEXT NOT NULL,email_id TEXT NOT NULL REFERENCES support_email_outbox(id),snapshot TEXT NOT NULL,created_at TEXT NOT NULL,UNIQUE(ticket_id,revision));
