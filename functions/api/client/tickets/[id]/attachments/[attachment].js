import { requireAuth } from "../../../../../_lib/auth.js";
import { json, uuid } from "../../../../../_lib/tickets.js";
import {
  ensureHistory,
  ownedTicket,
} from "../../../../../_lib/ticket-history.js";

export async function onRequestGet(context) {
  try {
    const auth = await requireAuth(context);
    if (auth.response) return auth.response;
    const { id, attachment } = context.params;
    if (!uuid(id) || !uuid(attachment))
      return json({ message: "Anexo não encontrado." }, 404);
    await ensureHistory(context.env.DB);
    if (!(await ownedTicket(context.env.DB, auth.user, id)))
      return json({ message: "Anexo não encontrado." }, 404);
    const file = await context.env.DB.prepare(
      "SELECT object_key,name,mime,size FROM support_attachments WHERE id=? AND ticket_id=?",
    )
      .bind(attachment, id)
      .first();
    if (!file) return json({ message: "Anexo não encontrado." }, 404);
    const object = await context.env.DOWNLOADS?.get(file.object_key);
    if (!object) return json({ message: "Anexo indisponível." }, 404);
    // Force a download so untrusted evidence never runs inside the portal origin.
    return new Response(object.body, {
      headers: {
        "Content-Type": file.mime,
        "Content-Disposition": `attachment; filename="anexo"; filename*=UTF-8''${encodeURIComponent(file.name)}`,
        "Content-Length": String(file.size),
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
      },
    });
  } catch {
    return json({ message: "Não foi possível baixar o anexo." }, 503);
  }
}
