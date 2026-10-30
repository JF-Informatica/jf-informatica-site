import { requireAdmin } from "../../../../_lib/auth.js";
import {
  json,
  sameOrigin,
  boundedBody,
  uuid,
  TicketError,
} from "../../../../_lib/tickets.js";
import { ensureHistory, historyFor } from "../../../../_lib/ticket-history.js";
async function handle(context, write) {
  try {
    const auth = await requireAdmin(context);
    if (auth.response) return auth.response;
    if (write && !sameOrigin(context.request))
      return json({ message: "Origem inválida." }, 403);
    if (!uuid(context.params.id))
      return json({ message: "Chamado inválido." }, 400);
    await ensureHistory(context.env.DB);
    const ticket = await context.env.DB.prepare(
      "SELECT id,status,created_at,updated_at FROM support_tickets WHERE id=?",
    )
      .bind(context.params.id)
      .first();
    if (!ticket) return json({ message: "Chamado não encontrado." }, 404);
    if (write) {
      let body;
      try {
        body = JSON.parse(
          await (await boundedBody(context.request, 8192)).text(),
        );
      } catch (error) {
        if (error instanceof TicketError) throw error;
        return json({ message: "Dados inválidos." }, 400);
      }
      const text = typeof body?.body === "string" ? body.body.trim() : "";
      if (
        text.length < 3 ||
        text.length > 4000 ||
        /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(text) ||
        !uuid(body?.request_id)
      )
        return json(
          { message: "Informe um comentário de 3 a 4.000 caracteres." },
          400,
        );
      // Idempotent key prevents retries from publishing the same comment twice.
      const existing = await context.env.DB.prepare(
        "SELECT ticket_id,body FROM support_ticket_history WHERE id=?",
      )
        .bind(body.request_id)
        .first();
      if (
        existing &&
        (existing.ticket_id !== ticket.id || existing.body !== text)
      )
        return json(
          { message: "Solicitação já utilizada. Atualize e tente novamente." },
          409,
        );
      await context.env.DB.prepare(
        "INSERT INTO support_ticket_history(id,ticket_id,kind,status,body,created_at) VALUES(?,?,'comment',NULL,?,?) ON CONFLICT(id) DO NOTHING",
      )
        .bind(body.request_id, ticket.id, text, new Date().toISOString())
        .run();
    }
    return json(await historyFor(context.env.DB, ticket));
  } catch (error) {
    return json(
      {
        message:
          error instanceof TicketError
            ? error.message
            : "Não foi possível carregar o histórico.",
      },
      error instanceof TicketError ? error.status : 503,
    );
  }
}
export const onRequestGet = (context) => handle(context, false);
export const onRequestPost = (context) => handle(context, true);
