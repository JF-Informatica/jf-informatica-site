import { requireAdmin } from "../../_lib/auth.js";

function jsonResponse(data, status = 200) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store" }
  });
}

export async function onRequestGet(context) {
  try {
    const auth = await requireAdmin(context);
    if (auth.response) return auth.response;

    const result = await context.env.DB
      .prepare(
        `SELECT
           id,
           customer_name,
           product_name,
           license_key,
           equipment_name,
           activated_at,
           expires_at,
           active,
           last_seen_at,
           notes,
           created_at,
           updated_at
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
        id: row.id,
        customer_name: row.customer_name,
        product_name: row.product_name,
        license_key: row.license_key,
        equipment_name: row.equipment_name,
        activated_at: row.activated_at,
        expires_at: row.expires_at,
        active: row.active === 1,
        online,
        last_seen_at: row.last_seen_at,
        notes: row.notes,
        created_at: row.created_at,
        updated_at: row.updated_at
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
        online,
        offline: active - online
      },
      count: licenses.length,
      licenses
    });
  } catch {
    return jsonResponse(
      { status: "error", message: "Unable to load licenses" },
      500
    );
  }
}
