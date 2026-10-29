import {requireAdmin} from '../../../_lib/auth.js';
import {ensureSupportSchema, json, sameOrigin, uuid, STATUSES, boundedBody} from '../../../_lib/tickets.js';

export async function onRequestGet(context) {
  try {
    const auth = await requireAdmin(context);
    if (auth.response) return auth.response;
    if (!uuid(context.params.id)) return json({status:'error',message:'Chamado inválido.'},400);
    await ensureSupportSchema(context.env.DB);
    const ticket = await context.env.DB.prepare('SELECT id,protocol,full_name,email,phone,department,category,urgency,description,status,created_at,updated_at FROM support_tickets WHERE id = ?').bind(context.params.id).first();
    if (!ticket) return json({status:'error',message:'Chamado não encontrado.'},404);
    const attachments = await context.env.DB.prepare('SELECT id,name,mime,size FROM support_attachments WHERE ticket_id = ?').bind(ticket.id).all();
    return json({status:'ok',ticket,attachments:attachments.results || []});
  } catch { return json({status:'error',message:'Não foi possível abrir o chamado.'},503); }
}
export async function onRequestPatch(context) {
  try {
    const auth = await requireAdmin(context);
    if (auth.response) return auth.response;
    if (!sameOrigin(context.request)) return json({status:'error',message:'Origem inválida.'},403);
    if (!uuid(context.params.id)) return json({status:'error',message:'Chamado inválido.'},400);
    let body;
    try { body = JSON.parse(await (await boundedBody(context.request,4096)).text()); }
    catch { return json({status:'error',message:'Dados inválidos.'},400); }
    if (!STATUSES.includes(body?.status)) return json({status:'error',message:'Status inválido.'},400);
    await ensureSupportSchema(context.env.DB);
    const ticket = await context.env.DB.prepare('UPDATE support_tickets SET status = ?,updated_at = ? WHERE id = ? RETURNING id,protocol,status,updated_at').bind(body.status,new Date().toISOString(),context.params.id).first();
    if (!ticket) return json({status:'error',message:'Chamado não encontrado.'},404);
    return json({status:'ok',ticket});
  } catch { return json({status:'error',message:'Não foi possível atualizar o chamado.'},503); }
}
