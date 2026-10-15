import { requireAdmin } from "../../_lib/auth.js";

const LICENSE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function jsonResponse(data, status = 200) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store" }
  });
}

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeOptionalText(value) {
  const text = normalizeText(value);
  return text || null;
}

function isValidDateValue(value) {
  if (!value) return true;
  return Number.isFinite(new Date(value).getTime());
}

function isSameOrigin(request) {
  const origin = request.headers.get("Origin");
  if (!origin) return false;
  return origin === new URL(request.url).origin;
}

function generateLicenseKey() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const chars = Array.from(bytes, (value) => LICENSE_ALPHABET[value % LICENSE_ALPHABET.length]);
  const groups = [];
  for (let i = 0; i < chars.length; i += 4) groups.push(chars.slice(i, i + 4).join(""));
  return groups.join("-");
}

async function generateUniqueLicenseKey(db) {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const key = generateLicenseKey();
    const existing = await db.prepare("SELECT id FROM licenses WHERE license_key = ? LIMIT 1").bind(key).first();
    if (!existing) return key;
  }
  throw new Error("Unable to generate unique license key");
}

export async function onRequestGet(context) {
  try {
    const auth = await requireAdmin(context);
    if (auth.response) return auth.response;

    const result = await context.env.DB
      .prepare(
        `SELECT id, customer_name, product_name, license_key, environment,
                equipment_name, activated_at, expires_at, active, last_seen_at,
                notes, created_at, updated_at
         FROM licenses
         ORDER BY customer_name COLLATE NOCASE ASC,
                  product_name COLLATE NOCASE ASC,
                  id ASC`
      )
      .all();

    const rows = result.results || [];
    const now = Date.now();
    const onlineThresholdMs = 15 * 60 * 1000;

    const licenses = rows.map((row) => {
      const lastSeen = row.last_seen_at ? new Date(row.last_seen_at).getTime() : NaN;
      const online = row.active === 1 && Number.isFinite(lastSeen) && (now - lastSeen) <= onlineThresholdMs;
      return {
        ...row,
        active: row.active === 1,
        online
      };
    });

    const active = licenses.filter((license) => license.active).length;
    const online = licenses.filter((license) => license.online).length;

    return jsonResponse({
      status: "ok",
      metrics: {
        total: licenses.length,
        active,
        inactive: licenses.length - active,
        production: licenses.filter((license) => license.environment === "production").length,
        demo: licenses.filter((license) => license.environment === "demo").length,
        online,
        offline: active - online
      },
      count: licenses.length,
      licenses
    });
  } catch {
    return jsonResponse({ status: "error", message: "Unable to load licenses" }, 500);
  }
}

export async function onRequestPost(context) {
  try {
    const auth = await requireAdmin(context);
    if (auth.response) return auth.response;

    if (!isSameOrigin(context.request)) {
      return jsonResponse({ status: "error", message: "Invalid origin" }, 403);
    }

    let body;
    try {
      body = await context.request.json();
    } catch {
      return jsonResponse({ status: "error", message: "Invalid JSON" }, 400);
    }

    const customerName = normalizeText(body.customer_name);
    const productName = normalizeText(body.product_name);
    const environment = normalizeText(body.environment) || "production";
    const expiresAt = normalizeOptionalText(body.expires_at);
    const notes = normalizeOptionalText(body.notes);
    const active = body.active === undefined ? 1 : body.active === true || body.active === 1 ? 1 : 0;

    if (!customerName || customerName.length > 160) {
      return jsonResponse({ status: "error", message: "Invalid customer_name" }, 400);
    }

    if (!productName || productName.length > 160) {
      return jsonResponse({ status: "error", message: "Invalid product_name" }, 400);
    }

    if (!["production", "demo"].includes(environment)) {
      return jsonResponse({ status: "error", message: "Invalid environment" }, 400);
    }

    if (notes && notes.length > 2000) {
      return jsonResponse({ status: "error", message: "Invalid notes" }, 400);
    }

    if (!isValidDateValue(expiresAt)) {
      return jsonResponse({ status: "error", message: "Invalid expires_at" }, 400);
    }

    if (environment === "demo" && !expiresAt) {
      return jsonResponse({ status: "error", message: "Demo license requires expires_at" }, 400);
    }

    const licenseKey = await generateUniqueLicenseKey(context.env.DB);

    const insert = await context.env.DB
      .prepare(
        `INSERT INTO licenses (
           customer_name, product_name, license_key, environment,
           equipment_name, activated_at, expires_at, active, notes, updated_at
         ) VALUES (?, ?, ?, ?, NULL, NULL, ?, ?, ?, CURRENT_TIMESTAMP)`
      )
      .bind(customerName, productName, licenseKey, environment, expiresAt, active, notes)
      .run();

    const id = insert.meta?.last_row_id;
    const license = await context.env.DB
      .prepare(
        `SELECT id, customer_name, product_name, license_key, environment,
                equipment_name, activated_at, expires_at, active, last_seen_at,
                notes, created_at, updated_at
         FROM licenses WHERE id = ?`
      )
      .bind(id)
      .first();

    return jsonResponse({
      status: "ok",
      license: {
        ...license,
        active: license.active === 1,
        online: false
      }
    }, 201);
  } catch (error) {
    if (String(error?.message || "").includes("UNIQUE constraint failed")) {
      return jsonResponse({ status: "error", message: "License key collision" }, 409);
    }
    return jsonResponse({ status: "error", message: "Unable to generate license" }, 500);
  }
}
