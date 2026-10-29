import {EMAIL_SCHEMA} from './ticket-email.js';
export const CATEGORIES = ['hardware', 'software', 'redes', 'acessos', 'impressoras', 'outros'];
export const URGENCIES = ['baixa', 'media', 'alta'];
export const STATUSES = ['novo', 'em_atendimento', 'aguardando_cliente', 'resolvido', 'encerrado'];
export const MAX_FILE = 5 * 1024 * 1024;
export const MAX_TOTAL = 10 * 1024 * 1024;
export const MAX_BODY = 12 * 1024 * 1024;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;

// Additive, idempotent schema: existing accounts, licenses and downloads are untouched.
export const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS support_tickets (
    id TEXT PRIMARY KEY, protocol TEXT NOT NULL UNIQUE, submission_id TEXT NOT NULL UNIQUE,
    request_hash TEXT NOT NULL, full_name TEXT NOT NULL, email TEXT NOT NULL,
    phone TEXT NOT NULL, department TEXT NOT NULL, category TEXT NOT NULL,
    urgency TEXT NOT NULL, description TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'novo',
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS support_tickets_status_created ON support_tickets(status, created_at DESC)`,
  `CREATE TABLE IF NOT EXISTS support_attachments (
    id TEXT PRIMARY KEY, ticket_id TEXT NOT NULL REFERENCES support_tickets(id),
    object_key TEXT NOT NULL UNIQUE, name TEXT NOT NULL, mime TEXT NOT NULL, size INTEGER NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS support_attachments_ticket ON support_attachments(ticket_id)`,
  `CREATE TABLE IF NOT EXISTS support_rate_limits (key_hash TEXT PRIMARY KEY, window_start INTEGER NOT NULL, attempts INTEGER NOT NULL)`,
  ...EMAIL_SCHEMA
];
const schemas = new WeakMap();
export async function ensureSupportSchema(db) {
  if (!db) throw new Error('Database unavailable');
  if (!schemas.has(db)) {
    const ready = db.batch(SCHEMA.map(sql => db.prepare(sql))).catch(error => { schemas.delete(db); throw error; });
    schemas.set(db, ready);
  }
  await schemas.get(db);
}
export function json(data, status = 200, extra = {}) {
  return Response.json(data, {status, headers: {'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', ...extra}});
}
export function sameOrigin(request) {
  return request.headers.get('Origin') === new URL(request.url).origin;
}
export function uuid(value) { return typeof value === 'string' && UUID.test(value); }
export class TicketError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}
export async function sha256(value) {
  const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value;
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2, '0')).join('');
}
export async function boundedBody(request, limit = MAX_BODY) {
  const length = request.headers.get('Content-Length');
  if (length && Number(length) > limit) throw new TicketError('O envio excede o tamanho permitido.', 413);
  if (!request.body) throw new TicketError('Envio vazio.');
  const reader = request.body.getReader(), chunks = [];
  let total = 0;
  try {
    while (true) {
      const {done, value} = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > limit) { await reader.cancel(); throw new TicketError('O envio excede o tamanho permitido.', 413); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  return new Blob(chunks);
}
function field(form, name, min, max, multiline = false) {
  const values = form.getAll(name);
  if (values.length !== 1 || typeof values[0] !== 'string') throw new TicketError('Confira os campos obrigatórios.');
  const value = values[0].trim();
  if (value.length < min || value.length > max || /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(value) || (!multiline && /[\r\n]/.test(value))) {
    throw new TicketError('Confira o tamanho e o conteúdo dos campos informados.');
  }
  return value;
}
export async function parseSubmission(request) {
  const contentType = request.headers.get('Content-Type') || '';
  if (!contentType.toLowerCase().startsWith('multipart/form-data;')) throw new TicketError('Formato de envio inválido.', 415);
  const body = await boundedBody(request);
  let form;
  try { form = await new Response(body, {headers: {'Content-Type': contentType}}).formData(); }
  catch { throw new TicketError('Não foi possível ler o formulário.'); }
  if (form.get('website')) throw new TicketError('Não foi possível validar o envio.');
  const data = {
    submission_id: field(form, 'submission_id', 36, 36),
    full_name: field(form, 'full_name', 3, 150), email: field(form, 'email', 5, 254).toLowerCase(),
    phone: field(form, 'phone', 8, 35), department: field(form, 'department', 2, 150),
    category: field(form, 'category', 1, 30), urgency: field(form, 'urgency', 1, 10),
    description: field(form, 'description', 20, 10000, true)
  };
  if (!uuid(data.submission_id) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email) ||
      !/^[+()\d\s.-]+$/.test(data.phone) || data.phone.replace(/\D/g, '').length < 8 ||
      data.phone.replace(/\D/g, '').length > 15 || !CATEGORIES.includes(data.category) || !URGENCIES.includes(data.urgency)) {
    throw new TicketError('Confira o e-mail, telefone, categoria e urgência informados.');
  }
  const incoming = form.getAll('attachments').filter(file => file && typeof file === 'object' && file.size > 0);
  if (incoming.length > 3) throw new TicketError('Envie no máximo 3 anexos.');
  let total = 0;
  const files = [];
  for (const file of incoming) {
    total += file.size;
    if (file.size > MAX_FILE || total > MAX_TOTAL) throw new TicketError('Cada anexo pode ter até 5 MB; o total é de até 10 MB.', 413);
    const name = file.name.split(/[\\/]/).pop().replace(/[\x00-\x1f\x7f"]/g, '').slice(0, 150);
    const extension = name.split('.').pop().toLowerCase(), bytes = new Uint8Array(await file.arrayBuffer());
    let mime;
    if (['jpg', 'jpeg'].includes(extension) && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) mime = 'image/jpeg';
    else if (extension === 'png' && [137,80,78,71,13,10,26,10].every((v,i) => bytes[i] === v)) mime = 'image/png';
    else if (extension === 'webp' && new TextDecoder().decode(bytes.slice(0,4)) === 'RIFF' && new TextDecoder().decode(bytes.slice(8,12)) === 'WEBP') mime = 'image/webp';
    else if (extension === 'pdf' && new TextDecoder().decode(bytes.slice(0,5)) === '%PDF-') mime = 'application/pdf';
    else if (['txt', 'log'].includes(extension) && !bytes.includes(0)) {
      try { new TextDecoder('utf-8', {fatal:true}).decode(bytes); mime = 'text/plain'; } catch { /* Reject binary disguised as text. */ }
    }
    if (!mime) throw new TicketError('Anexo inválido. Use JPG, PNG, WebP, PDF, TXT ou LOG.');
    files.push({name, mime, bytes, size: file.size, hash: await sha256(bytes)});
  }
  return {data, files, hash: await sha256(JSON.stringify([data, files.map(f => [f.name, f.hash])]))};
}
export async function allowSubmission(db, request) {
  const key = await sha256('support:' + (request.headers.get('CF-Connecting-IP') || 'unknown'));
  const now = Math.floor(Date.now() / 1000);
  const row = await db.prepare(`INSERT INTO support_rate_limits(key_hash, window_start, attempts) VALUES (?, ?, 1)
    ON CONFLICT(key_hash) DO UPDATE SET
    attempts=CASE WHEN window_start < ? THEN 1 ELSE attempts+1 END,
    window_start=CASE WHEN window_start < ? THEN excluded.window_start ELSE window_start END
    RETURNING attempts`).bind(key, now, now - 600, now - 600).first();
  // Keep only short-lived abuse-control metadata, never the raw IP address.
  await db.prepare('DELETE FROM support_rate_limits WHERE window_start < ?').bind(now - 86400).run();
  return row.attempts <= 5;
}
export function receipt(ticket) {
  return json({status:'ok', protocol:ticket.protocol, created_at:ticket.created_at}, 201);
}
