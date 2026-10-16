import { requireAdmin } from "../../../_lib/auth.js";

function jsonResponse(data, status = 200) { return Response.json(data, { status, headers: { "Cache-Control": "no-store" } }); }
function text(value) { return typeof value === "string" ? value.trim() : ""; }
function optional(value) { const valueText = text(value); return valueText || null; }
function sameOrigin(request) { const origin = request.headers.get("Origin"); return Boolean(origin) && origin === new URL(request.url).origin; }
function validSha256(value) { return !value || /^[A-Fa-f0-9]{64}$/.test(value); }
function integer(value, fallback, min = 0) { if (value === null || value === undefined || value === "") return fallback; const parsed = Number(value); return Number.isInteger(parsed) && parsed >= min ? parsed : null; }

export async function onRequestPatch(context) {
  try {
    const auth = await requireAdmin(context);
    if (auth.response) return auth.response;
    if (!sameOrigin(context.request)) return jsonResponse({ status: "error", message: "Invalid origin" }, 403);
    const id = Number(context.params.id);
    if (!Number.isInteger(id) || id <= 0) return jsonResponse({ status: "error", message: "Invalid id" }, 400);
    const current = await context.env.DB.prepare("SELECT id FROM downloads WHERE id = ? LIMIT 1").bind(id).first();
    if (!current) return jsonResponse({ status: "error", message: "Download not found" }, 404);
    let body;
    try { body = await context.request.json(); } catch { return jsonResponse({ status: "error", message: "Invalid JSON" }, 400); }

    const objectKey = text(body.object_key);
    const name = text(body.name);
    const description = optional(body.description);
    const category = optional(body.category);
    const version = optional(body.version);
    const fileSize = integer(body.file_size, null, 0);
    const sha256 = optional(body.sha256)?.toUpperCase() || null;
    const active = body.active === true || body.active === 1 ? 1 : 0;
    const sortOrder = integer(body.sort_order, 100, 0);

    if (!objectKey || objectKey.length > 1024 || objectKey.startsWith("/") || objectKey.includes("..")) return jsonResponse({ status: "error", message: "Invalid object_key" }, 400);
    if (!name || name.length > 160) return jsonResponse({ status: "error", message: "Invalid name" }, 400);
    if (description && description.length > 2000) return jsonResponse({ status: "error", message: "Invalid description" }, 400);
    if (category && category.length > 120) return jsonResponse({ status: "error", message: "Invalid category" }, 400);
    if (version && version.length > 120) return jsonResponse({ status: "error", message: "Invalid version" }, 400);
    if (fileSize === null && body.file_size !== null && body.file_size !== undefined && body.file_size !== "") return jsonResponse({ status: "error", message: "Invalid file_size" }, 400);
    if (!validSha256(sha256)) return jsonResponse({ status: "error", message: "Invalid sha256" }, 400);
    if (sortOrder === null) return jsonResponse({ status: "error", message: "Invalid sort_order" }, 400);

    await context.env.DB.prepare(`
      UPDATE downloads SET object_key = ?, name = ?, description = ?, category = ?, version = ?,
        file_size = ?, sha256 = ?, active = ?, sort_order = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(objectKey, name, description, category, version, fileSize, sha256, active, sortOrder, id).run();
    const row = await context.env.DB.prepare(`SELECT id, object_key, name, description, category, version, file_size, sha256, active, sort_order, created_at, updated_at FROM downloads WHERE id = ?`).bind(id).first();
    return jsonResponse({ status: "ok", download: { ...row, active: row.active === 1 } });
  } catch (error) {
    if (String(error?.message || "").includes("UNIQUE constraint failed")) return jsonResponse({ status: "error", message: "object_key already registered" }, 409);
    return jsonResponse({ status: "error", message: "Unable to update download" }, 500);
  }
}
