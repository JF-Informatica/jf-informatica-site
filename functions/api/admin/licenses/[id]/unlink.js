import { requireAdmin } from "../../../../_lib/auth.js";

const json = (body, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
const fail = (message, status) => json({ status: "error", message }, status);

export async function onRequestPost(context) {
  try {
    const auth = await requireAdmin(context);
    if (auth.response) return auth.response;
    if (context.request.headers.get("Origin") !== new URL(context.request.url).origin) return fail("Origem inválida.", 403);
    const id = Number(context.params.id);
    if (!Number.isSafeInteger(id) || id < 1) return fail("Licença inválida.", 400);
    let body;
    try { body = await context.request.json(); } catch { return fail("Requisição inválida.", 400); }
    if (!/^[0-9a-f-]{36}$/i.test(body?.activation_id || "")) return fail("Informe a instalação a desvincular.", 400);
    const db = context.env.DB;
    if (!await db.prepare("SELECT id FROM licenses WHERE id = ?").bind(id).first()) return fail("Licença não encontrada.", 404);
    // D1 batch is transactional. Match the displayed activation so a stale page
    // cannot remove a newer installation, including after a repeated request.
    const results = await db.batch([
      db.prepare("DELETE FROM license_activations WHERE license_id = ? AND activation_id = ?").bind(id, body.activation_id),
      db.prepare(`UPDATE licenses SET equipment_name = NULL, activated_at = NULL,
        last_seen_at = NULL, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND changes() = 1
        AND NOT EXISTS (SELECT 1 FROM license_activations WHERE license_id = ?)`).bind(id, id),
    ]);
    if (results[0].meta.changes !== 1) return fail("O vínculo foi alterado ou já foi removido. Atualize a lista.", 409);
    console.info("license installation unlinked", { license_id: id, admin_id: auth.user.id });
    return json({ status: "ok", message: "Instalação desvinculada. Ative o Center Backup novamente com a mesma chave." });
  } catch {
    return fail("Não foi possível desvincular a instalação. Tente novamente.", 500);
  }
}

export function onRequest(context) {
  if (context.request.method === "POST") return onRequestPost(context);
  return new Response(null, { status: 405, headers: { Allow: "POST", "Cache-Control": "no-store" } });
}
