import { ensureSupportSchema, uuid } from "./tickets.js";

// Separate, additive history; old tickets keep their original contents.
export const HISTORY_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS support_ticket_history (
 id TEXT PRIMARY KEY,ticket_id TEXT NOT NULL REFERENCES support_tickets(id),
 kind TEXT NOT NULL,status TEXT,body TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL)`,
  "CREATE INDEX IF NOT EXISTS support_ticket_history_ticket ON support_ticket_history(ticket_id,created_at)",
];
export async function ensureHistory(db) {
  await ensureSupportSchema(db);
  await db.batch(HISTORY_SCHEMA.map((sql) => db.prepare(sql)));
}

// Recheck access for every request and download. Administrators already have
// access to every ticket through the administrative API; clients only see their own.
export async function ownedTicket(db, user, identifier) {
  const value = String(identifier || "")
    .trim()
    .toUpperCase();
  if (!uuid(value) && !/^JF-\d{8}-[A-F0-9]{12}$/.test(value)) return null;
  const isAdmin = user.role === "admin";
  if (!isAdmin && !user.email?.trim()) return null;
  return db
    .prepare(
      `SELECT id,protocol,status,urgency,category,description,created_at,updated_at
 FROM support_tickets WHERE (id=? OR protocol=?) AND (?=1 OR LOWER(TRIM(email))=LOWER(TRIM(?)))`,
    )
    .bind(value.toLowerCase(), value, isAdmin ? 1 : 0, user.email || "")
    .first();
}
export async function historyFor(db, ticket) {
  const result = await db
    .prepare(
      // Insertion order breaks timestamp ties; random UUIDs do not represent time.
      "SELECT id,kind,status,body,created_at FROM support_ticket_history WHERE ticket_id=? ORDER BY created_at,rowid",
    )
    .bind(ticket.id)
    .all();
  const entries = result.results || [],
    lastStatus = entries.filter((e) => e.kind === "status").at(-1);
  // A previously closed ticket has no reliable close timestamp; never invent it.
  const closedAt =
    ticket.status === "encerrado" && lastStatus?.status === "encerrado"
      ? lastStatus.created_at
      : null;
  return {
    entries,
    closed_at: closedAt,
    history_note:
      "O histórico detalhado registra eventos a partir da implantação da consulta. Eventos anteriores podem não estar disponíveis.",
  };
}
