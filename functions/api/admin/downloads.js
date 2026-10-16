import { requireAdmin } from "../../_lib/auth.js";

function jsonResponse(data, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}
function text(value) { return typeof value === "string" ? value.trim() : ""; }
function optional(value) { const valueText = text(value); return valueText || null; }
function sameOrigin(request) { const origin = request.headers.get("Origin"); return Boolean(origin) && origin === new URL(request.url).origin; }
function validSha256(value) { return !value || /^[A-Fa-f0-9]{64}$/.test(value); }
function normalizeInteger(value, fallback, min = 0) {
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= min ? parsed : null;
}

export async function onRequestGet(context) {
  try {
    const auth = await requireAdmin(context);
    if (auth.response) return auth.response;
    const result = await context.env.DB.prepare(`
      SELECT id, object_key, name, description, category, version, file_size, sha256,
             active, sort_order, created_at, updated_at
      FROM downloads
      ORDER BY sort_order ASC, name COLLATE NOCASE ASC, id ASC
    `).all();
    const downloads = (result.results || []).map(row => ({ ...row, active: row.active === 1 }));
    return jsonResponse({ status: "ok", count: downloads.length, downloads });
  } catch {
    return jsonResponse({ status: "error", message: "Unable to load downloads" }, 500);
  }
}

export async function onRequestPost(context) {
  try {
    const auth = await requireAdmin(context);
    if (auth.response) return auth.response;
    if (!sameOrigin(context.request)) return jsonResponse({ status: "error", message: "Invalid origin" }, 403);
    let body;
    try { body = await context.request.json(); } catch { return jsonResponse({ status: "error", message: "Invalid JSON" }, 400); }

    const objectKey = text(body.object_key);
    const name = text(body.name);
    const description = optional(body.description);
    const category = optional(body.category);
    const version = optional(body.version);
    const fileSize = normalizeInteger(body.file_size, null, 0);
    const sha256 = optional(body.sha256)?.toUpperCase() || null;
    const active = body.active === false || body.active === 0 ? 0 : 1;
    const sortOrder = normalizeInteger(body.sort_order, 100, 0);

    if (!objectKey || objectKey.length > 1024 || objectKey.startsWith("/") || objectKey.includes("..")) return jsonResponse({ status: "error", message: "Invalid object_key" }, 400);
    if (!name || name.length > 160) return jsonResponse({ status: "error", message: "Invalid name" }, 400);
    if (description && description.length > 2000) return jsonResponse({ status: "error", message: "Invalid description" }, 400);
    if (category && category.length > 120) return jsonResponse({ status: "error", message: "Invalid category" }, 400);
    if (version && version.length > 120) return jsonResponse({ status: "error", message: "Invalid version" }, 400);
    if (fileSize === null && body.file_size !== null && body.file_size !== undefined && body.file_size !== "") return jsonResponse({ status: "error", message: "Invalid file_size" }, 400);
    if (!validSha256(sha256)) return jsonResponse({ status: "error", message: "Invalid sha256" }, 400);
    if (sortOrder === null) return jsonResponse({ status: "error", message: "Invalid sort_order" }, 400);

    const insert = await context.env.DB.prepare(`
      INSERT INTO downloads (object_key, name, description, category, version, file_size, sha256, active, sort_order, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).bind(objectKey, name, description, category, version, fileSize, sha256, active, sortOrder).run();
    const row = await context.env.DB.prepare(`SELECT id, object_key, name, description, category, version, file_size, sha256, active, sort_order, created_at, updated_at FROM downloads WHERE id = ?`).bind(insert.meta?.last_row_id).first();
    return jsonResponse({ status: "ok", download: { ...row, active: row.active === 1 } }, 201);
  } catch (error) {
    if (String(error?.message || "").includes("UNIQUE constraint failed")) return jsonResponse({ status: "error", message: "object_key already registered" }, 409);
    return jsonResponse({ status: "error", message: "Unable to create download" }, 500);
  }
}
