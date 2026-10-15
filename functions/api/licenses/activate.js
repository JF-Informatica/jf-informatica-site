const API_VERSION = 1;
const PRODUCT_ID = "center-backup";
const HEARTBEAT_INTERVAL_SECONDS = 900;
const LICENSE_KEY_RE = /^[A-HJ-NP-Z2-9]{4}(?:-[A-HJ-NP-Z2-9]{4}){7}$/;

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function errorResponse(requestId, code, message, status = 400, retryable = false) {
  return json({
    api_version: API_VERSION,
    request_id: requestId || null,
    error: { code, message, retryable },
  }, status);
}

function normalizeLicenseKey(value) {
  return String(value || "").trim().toUpperCase();
}

function normalizeProduct(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeEnvironment(value) {
  return String(value || "").trim().toLowerCase();
}

function cleanText(value, maxLength) {
  if (value == null) return null;
  const text = String(value).trim();
  return text ? text.slice(0, maxLength) : null;
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ""));
}

function isSha256(value) {
  return /^[0-9a-f]{64}$/i.test(String(value || ""));
}

function bytesToBase64Url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function sha256Hex(value) {
  const data = new TextEncoder().encode(value);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", data));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function newActivationToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return bytesToBase64Url(bytes);
}

function parseExpiration(value) {
  if (!value) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : NaN;
}

function productMatches(storedProduct) {
  const normalized = String(storedProduct || "").trim().toLowerCase();
  return normalized === PRODUCT_ID || normalized === "center-backup" || normalized === "center backup";
}

export async function onRequestPost(context) {
  if (!context.env?.DB) {
    return errorResponse(null, "SERVICE_UNAVAILABLE", "Serviço de licenciamento indisponível.", 503, true);
  }

  let body;
  try {
    body = await context.request.json();
  } catch {
    return errorResponse(null, "INVALID_REQUEST", "Requisição JSON inválida.", 400, false);
  }

  const requestId = cleanText(body?.request_id, 100);
  const licenseKey = normalizeLicenseKey(body?.license_key);
  const productId = normalizeProduct(body?.product_id);
  const requestedEnvironment = normalizeEnvironment(body?.environment);
  const installation = body?.installation || {};
  const client = body?.client || {};
  const installationId = cleanText(installation.installation_id, 100);
  const fingerprintVersion = Number(installation.fingerprint_version ?? 1);
  const fingerprint = String(installation.fingerprint || "").trim().toLowerCase();
  const deviceName = cleanText(installation.device_name, 255);
  const clientVersion = cleanText(client.version, 100);
  const platform = cleanText(client.platform, 100);

  if (body?.api_version !== API_VERSION) {
    return errorResponse(requestId, "UNSUPPORTED_API_VERSION", "Versão da API não suportada.", 400, false);
  }
  if (!requestId || !isUuid(requestId)) {
    return errorResponse(requestId, "INVALID_REQUEST", "request_id inválido.", 400, false);
  }
  if (!LICENSE_KEY_RE.test(licenseKey)) {
    return errorResponse(requestId, "INVALID_LICENSE", "Licença inválida.", 403, false);
  }
  if (productId !== PRODUCT_ID) {
    return errorResponse(requestId, "PRODUCT_MISMATCH", "Produto não autorizado para esta licença.", 403, false);
  }
  if (requestedEnvironment && !["production", "demo"].includes(requestedEnvironment)) {
    return errorResponse(requestId, "INVALID_REQUEST", "Ambiente inválido.", 400, false);
  }
  if (!installationId || !isUuid(installationId) || !Number.isInteger(fingerprintVersion) || fingerprintVersion < 1 || !isSha256(fingerprint)) {
    return errorResponse(requestId, "INVALID_INSTALLATION", "Identificação da instalação inválida.", 400, false);
  }

  try {
    const license = await context.env.DB.prepare(`
      SELECT id, customer_name, product_name, environment, expires_at, active
      FROM licenses
      WHERE license_key = ?
      LIMIT 1
    `).bind(licenseKey).first();

    // Deliberately use the same public error for unknown and malformed keys.
    if (!license) {
      return errorResponse(requestId, "INVALID_LICENSE", "Licença inválida.", 403, false);
    }
    if (Number(license.active) !== 1) {
      return errorResponse(requestId, "LICENSE_DISABLED", "Licença desativada.", 403, false);
    }
    if (!productMatches(license.product_name)) {
      return errorResponse(requestId, "PRODUCT_MISMATCH", "Produto não autorizado para esta licença.", 403, false);
    }

    const environment = normalizeEnvironment(license.environment || "production");
    if (!["production", "demo"].includes(environment)) {
      return errorResponse(requestId, "LICENSE_CONFIGURATION_ERROR", "Configuração da licença inválida.", 500, false);
    }
    if (requestedEnvironment && requestedEnvironment !== environment) {
      return errorResponse(requestId, "ENVIRONMENT_MISMATCH", "Ambiente não autorizado para esta licença.", 403, false);
    }

    const expiresAt = parseExpiration(license.expires_at);
    if (Number.isNaN(expiresAt) || (environment === "demo" && expiresAt === null)) {
      return errorResponse(requestId, "LICENSE_CONFIGURATION_ERROR", "Configuração da licença inválida.", 500, false);
    }
    if (expiresAt !== null && expiresAt <= Date.now()) {
      return errorResponse(requestId, "LICENSE_EXPIRED", "Licença expirada.", 403, false);
    }

    const existing = await context.env.DB.prepare(`
      SELECT activation_id, installation_id, fingerprint_version, fingerprint_hash
      FROM license_activations
      WHERE license_id = ?
      LIMIT 1
    `).bind(license.id).first();

    if (existing) {
      if (
        existing.installation_id !== installationId ||
        Number(existing.fingerprint_version) !== fingerprintVersion ||
        String(existing.fingerprint_hash || "").toLowerCase() !== fingerprint
      ) {
        return errorResponse(requestId, "MACHINE_MISMATCH", "Licença já vinculada a outra instalação.", 403, false);
      }

      // Activation tokens are intentionally not recoverable. A repeated activation
      // for the same machine rotates the token and invalidates the previous one.
      const activationToken = newActivationToken();
      const tokenHash = await sha256Hex(activationToken);
      await context.env.DB.prepare(`
        UPDATE license_activations
        SET token_hash = ?, device_name = ?, client_version = ?, platform = ?,
            last_seen_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
        WHERE license_id = ?
      `).bind(tokenHash, deviceName, clientVersion, platform, license.id).run();

      await context.env.DB.prepare(`
        UPDATE licenses
        SET equipment_name = COALESCE(?, equipment_name),
            activated_at = COALESCE(activated_at, CURRENT_TIMESTAMP),
            last_seen_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).bind(deviceName, license.id).run();

      return json({
        api_version: API_VERSION,
        request_id: requestId,
        server_time: new Date().toISOString(),
        activation_id: existing.activation_id,
        activation_token: activationToken,
        heartbeat_interval_seconds: HEARTBEAT_INTERVAL_SECONDS,
        license: {
          product_id: PRODUCT_ID,
          environment,
          customer_name: license.customer_name,
          expires_at: license.expires_at || null,
        },
      });
    }

    const activationId = crypto.randomUUID();
    const activationToken = newActivationToken();
    const tokenHash = await sha256Hex(activationToken);

    try {
      await context.env.DB.prepare(`
        INSERT INTO license_activations (
          activation_id, license_id, installation_id, fingerprint_version,
          fingerprint_hash, device_name, client_version, platform, token_hash
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        activationId,
        license.id,
        installationId,
        fingerprintVersion,
        fingerprint,
        deviceName,
        clientVersion,
        platform,
        tokenHash,
      ).run();
    } catch {
      // UNIQUE(license_id) makes first binding atomic. If another request won the
      // race, do not reveal or overwrite that activation here.
      const winner = await context.env.DB.prepare(`
        SELECT installation_id, fingerprint_version, fingerprint_hash
        FROM license_activations
        WHERE license_id = ?
        LIMIT 1
      `).bind(license.id).first();

      if (winner) {
        return errorResponse(requestId, "ACTIVATION_CONFLICT", "A licença foi ativada simultaneamente. Tente novamente.", 409, true);
      }
      return errorResponse(requestId, "SERVICE_UNAVAILABLE", "Não foi possível concluir a ativação.", 503, true);
    }

    await context.env.DB.prepare(`
      UPDATE licenses
      SET equipment_name = ?,
          activated_at = COALESCE(activated_at, CURRENT_TIMESTAMP),
          last_seen_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(deviceName, license.id).run();

    return json({
      api_version: API_VERSION,
      request_id: requestId,
      server_time: new Date().toISOString(),
      activation_id: activationId,
      activation_token: activationToken,
      heartbeat_interval_seconds: HEARTBEAT_INTERVAL_SECONDS,
      license: {
        product_id: PRODUCT_ID,
        environment,
        customer_name: license.customer_name,
        expires_at: license.expires_at || null,
      },
    }, 201);
  } catch (error) {
    console.error("license activation failed", error);
    return errorResponse(requestId, "SERVICE_UNAVAILABLE", "Serviço de licenciamento temporariamente indisponível.", 503, true);
  }
}

export function onRequest(context) {
  if (context.request.method === "POST") return onRequestPost(context);
  return new Response(null, { status: 405, headers: { Allow: "POST" } });
}
