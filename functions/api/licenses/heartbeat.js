const API_VERSION = 1;
const PRODUCT_ID = "center-backup";
const HEARTBEAT_INTERVAL_SECONDS = 900;

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function fail(requestId, code, message, status = 400, retryable = false) {
  return json({ api_version: API_VERSION, request_id: requestId || null, error: { code, message, retryable } }, status);
}

function clean(value, max = 100) {
  if (value == null) return null;
  const text = String(value).trim();
  return text ? text.slice(0, max) : null;
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ""));
}

function isSha256(value) {
  return /^[0-9a-f]{64}$/i.test(String(value || ""));
}

async function sha256Hex(value) {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
  return Array.from(digest, b => b.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqualHex(a, b) {
  const x = String(a || "").toLowerCase();
  const y = String(b || "").toLowerCase();
  if (x.length !== y.length) return false;
  let diff = 0;
  for (let i = 0; i < x.length; i += 1) diff |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return diff === 0;
}

function bearerToken(request) {
  const header = request.headers.get("Authorization") || "";
  const match = /^Bearer\s+([^\s]+)$/i.exec(header);
  return match ? match[1] : null;
}

function productMatches(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized === PRODUCT_ID || normalized === "center backup";
}

export async function onRequestPost(context) {
  if (!context.env?.DB) return fail(null, "SERVICE_UNAVAILABLE", "Serviço de licenciamento indisponível.", 503, true);

  const token = bearerToken(context.request);
  if (!token || token.length < 32 || token.length > 256) {
    return fail(null, "INVALID_ACTIVATION_TOKEN", "Token de ativação inválido.", 401, false);
  }

  let body;
  try {
    body = await context.request.json();
  } catch {
    return fail(null, "INVALID_REQUEST", "Requisição JSON inválida.", 400, false);
  }

  const requestId = clean(body?.request_id);
  const activationId = clean(body?.activation_id);
  const installationId = clean(body?.installation_id);
  const fingerprintVersion = Number(body?.fingerprint_version ?? 1);
  const fingerprint = String(body?.fingerprint || "").trim().toLowerCase();
  const clientVersion = clean(body?.client_version);

  if (body?.api_version !== API_VERSION) return fail(requestId, "UNSUPPORTED_API_VERSION", "Versão da API não suportada.", 400, false);
  if (!isUuid(requestId) || !isUuid(activationId) || !isUuid(installationId) || !Number.isInteger(fingerprintVersion) || fingerprintVersion < 1 || !isSha256(fingerprint)) {
    return fail(requestId, "INVALID_REQUEST", "Dados do heartbeat inválidos.", 400, false);
  }

  try {
    const activation = await context.env.DB.prepare(`
      SELECT a.license_id, a.activation_id, a.installation_id, a.fingerprint_version,
             a.fingerprint_hash, a.token_hash,
             l.customer_name, l.product_name, l.environment, l.expires_at, l.active
      FROM license_activations a
      JOIN licenses l ON l.id = a.license_id
      WHERE a.activation_id = ?
      LIMIT 1
    `).bind(activationId).first();

    if (!activation) return fail(requestId, "INVALID_ACTIVATION_TOKEN", "Ativação inválida.", 401, false);

    const suppliedTokenHash = await sha256Hex(token);
    if (!timingSafeEqualHex(suppliedTokenHash, activation.token_hash)) {
      return fail(requestId, "INVALID_ACTIVATION_TOKEN", "Token de ativação inválido.", 401, false);
    }

    if (Number(activation.active) !== 1) return fail(requestId, "LICENSE_DISABLED", "Licença desativada.", 403, false);
    if (!productMatches(activation.product_name)) return fail(requestId, "PRODUCT_MISMATCH", "Produto não autorizado para esta licença.", 403, false);

    const environment = String(activation.environment || "production").trim().toLowerCase();
    if (!["production", "demo"].includes(environment)) return fail(requestId, "LICENSE_CONFIGURATION_ERROR", "Configuração da licença inválida.", 500, false);

    if (activation.expires_at) {
      const expires = Date.parse(activation.expires_at);
      if (!Number.isFinite(expires)) return fail(requestId, "LICENSE_CONFIGURATION_ERROR", "Configuração da licença inválida.", 500, false);
      if (expires <= Date.now()) return fail(requestId, "LICENSE_EXPIRED", "Licença expirada.", 403, false);
    } else if (environment === "demo") {
      return fail(requestId, "LICENSE_CONFIGURATION_ERROR", "Configuração da licença inválida.", 500, false);
    }

    if (
      activation.installation_id !== installationId ||
      Number(activation.fingerprint_version) !== fingerprintVersion ||
      String(activation.fingerprint_hash || "").toLowerCase() !== fingerprint
    ) {
      return fail(requestId, "MACHINE_MISMATCH", "Identificação da instalação não corresponde à ativação.", 403, false);
    }

    await context.env.DB.prepare(`
      UPDATE license_activations
      SET client_version = COALESCE(?, client_version), last_seen_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE activation_id = ?
    `).bind(clientVersion, activationId).run();

    await context.env.DB.prepare(`
      UPDATE licenses
      SET last_seen_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(activation.license_id).run();

    return json({
      api_version: API_VERSION,
      request_id: requestId,
      server_time: new Date().toISOString(),
      activation_id: activationId,
      heartbeat_interval_seconds: HEARTBEAT_INTERVAL_SECONDS,
      license: {
        product_id: PRODUCT_ID,
        environment,
        customer_name: activation.customer_name,
        expires_at: activation.expires_at || null,
        status: "released",
      },
    });
  } catch (error) {
    console.error("license heartbeat failed", error);
    return fail(requestId, "SERVICE_UNAVAILABLE", "Serviço de licenciamento temporariamente indisponível.", 503, true);
  }
}

export function onRequest(context) {
  if (context.request.method === "POST") return onRequestPost(context);
  return new Response(null, { status: 405, headers: { Allow: "POST" } });
}
