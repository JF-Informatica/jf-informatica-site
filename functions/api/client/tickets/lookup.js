import { requireAuth } from "../../../_lib/auth.js";
import {
  json,
  sameOrigin,
  boundedBody,
  TicketError,
} from "../../../_lib/tickets.js";
import {
  ensureHistory,
  ownedTicket,
  historyFor,
} from "../../../_lib/ticket-history.js";

// POST keeps the ticket identifier out of browser URLs and referrers.
export async function onRequestPost(context) {
  try {
    const auth = await requireAuth(context);
    if (auth.response) return auth.response;
    if (!sameOrigin(context.request))
      return json({ message: "Origem inválida." }, 403);
    if (
      !context.request.headers
        .get("Content-Type")
        ?.startsWith("application/json")
    )
      return json({ message: "Formato inválido." }, 415);
    let body;
    try {
      body = JSON.parse(await (await boundedBody(context.request, 512)).text());
    } catch (error) {
      if (error instanceof TicketError) throw error;
      return json({ message: "Dados inválidos." }, 400);
    }
    await ensureHistory(context.env.DB);
    const ticket = await ownedTicket(
      context.env.DB,
      auth.user,
      body?.identifier,
    );
    if (!ticket)
      return json(
        {
          message:
            auth.user.role === "admin"
              ? "Chamado não encontrado. Confira o protocolo completo."
              : "Chamado não encontrado para esta conta. Confira o protocolo e o e-mail cadastrado.",
        },
        404,
      );
    const history = await historyFor(context.env.DB, ticket),
      files = await context.env.DB.prepare(
        "SELECT id,name,mime,size FROM support_attachments WHERE ticket_id=? ORDER BY name",
      )
        .bind(ticket.id)
        .all();
    return json({
      ticket: { ...ticket, closed_at: history.closed_at },
      timeline: [
        {
          kind: "opened",
          status: "novo",
          body: "Chamado registrado.",
          created_at: ticket.created_at,
        },
        ...history.entries,
      ],
      history_note: history.history_note,
      attachments: (files.results || []).map((file) => ({
        ...file,
        download_url: `/api/client/tickets/${ticket.id}/attachments/${file.id}`,
      })),
    });
  } catch (error) {
    return json(
      {
        message:
          error instanceof TicketError
            ? error.message
            : "Consulta temporariamente indisponível. Tente novamente.",
      },
      error instanceof TicketError ? error.status : 503,
    );
  }
}
