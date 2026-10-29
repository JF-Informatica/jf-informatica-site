import {ensureSupportSchema, json, sameOrigin, TicketError, parseSubmission, allowSubmission, receipt} from '../_lib/tickets.js';
import {emailStatements,scheduleEmails} from '../_lib/ticket-email.js';

export async function onRequestPost(context) {
  if (!sameOrigin(context.request)) return json({status:'error',message:'Origem do envio inválida.'},403);
  if (!context.env?.DB) return json({status:'error',message:'Atendimento temporariamente indisponível. Tente novamente.'},503);
  let submission, id, protocol, created, objects = [];
  try {
    submission = await parseSubmission(context.request);
    await ensureSupportSchema(context.env.DB);
    const previous = await context.env.DB.prepare('SELECT id, protocol, created_at, request_hash FROM support_tickets WHERE submission_id = ?').bind(submission.data.submission_id).first();
    if (previous) {
      if (previous.request_hash !== submission.hash) throw new TicketError('Este envio já foi utilizado. Abra um novo chamado.',409);
      await scheduleEmails(context,previous.id);
      return receipt(previous);
    }
    if (!await allowSubmission(context.env.DB, context.request)) return json({status:'error',message:'Limite de envios atingido. Aguarde 10 minutos antes de tentar novamente.'},429,{'Retry-After':'600'});
    if (submission.files.length && !context.env.DOWNLOADS?.put) throw new TicketError('Os anexos estão temporariamente indisponíveis. Tente novamente mais tarde ou envie sem anexos.',503);
    id = crypto.randomUUID(); created = new Date().toISOString();
    protocol = `JF-${created.slice(0,10).replaceAll('-','')}-${crypto.randomUUID().replaceAll('-','').slice(0,12).toUpperCase()}`;
    const records = [];
    for (const file of submission.files) {
      const fileId = crypto.randomUUID(), key = `support-tickets/${id}/${fileId}`;
      objects.push(key);
      await context.env.DOWNLOADS.put(key, file.bytes, {httpMetadata:{contentType:'application/octet-stream'}});
      records.push(context.env.DB.prepare('INSERT INTO support_attachments (id,ticket_id,object_key,name,mime,size) VALUES (?,?,?,?,?,?)').bind(fileId,id,key,file.name,file.mime,file.size));
    }
    const d = submission.data;
    await context.env.DB.batch([
      context.env.DB.prepare(`INSERT INTO support_tickets
      (id,protocol,submission_id,request_hash,full_name,email,phone,department,category,urgency,description,status,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,'novo',?,?)`).bind(id,protocol,d.submission_id,submission.hash,d.full_name,d.email,d.phone,d.department,d.category,d.urgency,d.description,created,created),
      ...records,
      ...emailStatements(context.env.DB,{...d,id,protocol,status:'novo'},{opened:true,eventKey:'opened:'+id})
    ]);
    await scheduleEmails(context,id);
    return receipt({protocol,created_at:created});
  } catch (error) {
    // A concurrent retry may have committed the same submission. Never delete its objects.
    let saved;
    if (submission && id) {
      try { saved = await context.env.DB.prepare('SELECT id, protocol, created_at, request_hash FROM support_tickets WHERE submission_id = ?').bind(submission.data.submission_id).first(); }
      catch { /* Database unavailable; leave private orphan objects rather than risk a saved attachment. */ }
      if (saved?.id === id) return receipt(saved);
      if (objects.length && saved !== undefined) {
        try { await context.env.DOWNLOADS.delete(objects); } catch { /* Private orphan; no public download exists. */ }
      }
      if (saved?.request_hash === submission.hash) return receipt(saved);
    }
    return json({status:'error',message:error instanceof TicketError ? error.message : 'Não foi possível registrar o chamado. Seus dados continuam no formulário; tente novamente.'},error instanceof TicketError ? error.status : 503);
  }
}
export function onRequest(context) {
  return context.request.method === 'POST' ? onRequestPost(context) : json({status:'error',message:'Método não permitido.'},405,{Allow:'POST'});
}
