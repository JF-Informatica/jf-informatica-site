import {requireAdmin} from '../../../_lib/auth.js';
import {ensureSupportSchema, json, sameOrigin, uuid, STATUSES, boundedBody} from '../../../_lib/tickets.js';
import {emailStatements,scheduleEmails} from '../../../_lib/ticket-email.js';
import {ensureHistory} from '../../../_lib/ticket-history.js';

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
    const previous=await context.env.DB.prepare('SELECT * FROM support_tickets WHERE id=?').bind(context.params.id).first();
    if(!previous)return json({status:'error',message:'Chamado não encontrado.'},404);
    if(previous.status===body.status)return json({status:'ok',ticket:{id:previous.id,protocol:previous.protocol,status:previous.status,updated_at:previous.updated_at},email_queued:false});
    await ensureHistory(context.env.DB);
    const updated=new Date().toISOString(),ticket={...previous,status:body.status,updated_at:updated};
    // Conditional INSERT and UPDATE are one transaction: concurrent edits cannot notify an unapplied status.
    const conditional=emailStatements(context.env.DB,ticket,{eventKey:`status:${previous.id}:${previous.updated_at}:${previous.status}:${body.status}`,condition:{id:previous.id,status:body.status,updated_at:updated}});
    const result=await context.env.DB.batch([
      context.env.DB.prepare('UPDATE support_tickets SET status=?,updated_at=? WHERE id=? AND status=? AND updated_at=?').bind(body.status,updated,previous.id,previous.status,previous.updated_at),
      context.env.DB.prepare("INSERT INTO support_ticket_history(id,ticket_id,kind,status,body,created_at) SELECT ?,?,'status',?,'',? WHERE changes()=1").bind(crypto.randomUUID(),previous.id,body.status,updated),
      ...conditional
    ]);
    if(!result[0].meta?.changes)return json({status:'error',message:'O chamado foi alterado por outro atendimento. Atualize os detalhes e tente novamente.'},409);
    await scheduleEmails(context,ticket.id);
    return json({status:'ok',ticket:{id:ticket.id,protocol:ticket.protocol,status:ticket.status,updated_at:updated},email_queued:true});
  } catch { return json({status:'error',message:'Não foi possível atualizar o chamado.'},503); }
}
