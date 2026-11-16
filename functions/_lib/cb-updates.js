// Only installer releases from the existing private catalog are eligible.
export function versionKey(value) {
  const m = /^(\d+)\.(\d+)\.(\d+)(?:-(dev|rc)(\d+))?$/.exec(String(value || ''));
  return m ? [Number(m[1]), Number(m[2]), Number(m[3]), m[4] === 'dev' ? 1 : m[4] === 'rc' ? 2 : 3, Number(m[5] || 0)] : null;
}
export function compareVersions(a, b) {
  const x = versionKey(a), y = versionKey(b);
  for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i] - y[i];
  return 0;
}
export function eligible(row) {
  return versionKey(row.version) && /^[a-f0-9]{64}$/i.test(row.sha256 || '') &&
    Number.isSafeInteger(row.file_size) && row.file_size > 0 && row.file_size <= 200 * 1024 * 1024 &&
    row.object_key === `center-backup/releases/${row.version}/Center-Backup-${row.version}-Setup.exe`;
}
export function json(body, status = 200) {
  return Response.json(body, {status, headers: {'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff'}});
}
export async function authorize(context, body) {
  const match = /^Bearer ([^\s]{32,256})$/i.exec(context.request.headers.get('Authorization') || '');
  if (!match || body?.api_version !== 1 || typeof body.activation_id !== 'string' || typeof body.installation_id !== 'string' || !/^[a-f0-9]{64}$/i.test(body.fingerprint || '')) return false;
  const row = await context.env.DB.prepare(`SELECT a.token_hash, a.installation_id, a.fingerprint_hash, a.fingerprint_version,
    l.active, l.expires_at, l.product_name, l.environment FROM license_activations a
    JOIN licenses l ON l.id = a.license_id WHERE a.activation_id = ? LIMIT 1`).bind(body.activation_id).first();
  if (!row || Number(row.active) !== 1 || !['center-backup', 'center backup'].includes(String(row.product_name).trim().toLowerCase())) return false;
  if (!['demo', 'production'].includes(row.environment) || (!row.expires_at && row.environment === 'demo')) return false;
  if (row.expires_at && !(Date.parse(row.expires_at) > Date.now())) return false;
  if (row.installation_id !== body.installation_id || Number(row.fingerprint_version) !== 1 || body.fingerprint_version !== 1 || String(row.fingerprint_hash).toLowerCase() !== body.fingerprint.toLowerCase()) return false;
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(match[1])));
  const hash = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
  const expected = String(row.token_hash || '').toLowerCase();
  let difference = hash.length ^ expected.length;
  for (let i = 0; i < hash.length; i++) difference |= hash.charCodeAt(i) ^ (expected.charCodeAt(i) || 0);
  return difference === 0;
}
