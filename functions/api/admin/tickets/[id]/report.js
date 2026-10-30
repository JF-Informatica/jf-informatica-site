import {requireAdmin} from '../../../../_lib/auth.js';
import {ensureSupportSchema,json,sameOrigin,boundedBody,uuid,TicketError} from '../../../../_lib/tickets.js';
import {ensureReports,reportData,profileData,validateForSend,reportText,reportHTML} from '../../../../_lib/support-reports.js';
import {currentLogo,ensureBranding,logoURL} from '../../../../_lib/branding.js';
import {gmailConfigured,SUPPORT_EMAIL,emailAddress} from '../../../../_lib/gmail-smtp.js';
import {scheduleEmails} from '../../../../_lib/ticket-email.js';
async function handle(context,method){try{
 const auth=await requireAdmin(context);if(auth.response)return auth.response;if(method!=='GET'&&!sameOrigin(context.request))return json({message:'Origem inválida.'},403);
 if(!uuid(context.params.id))throw new TicketError('Chamado inválido.');const db=context.env.DB;await ensureSupportSchema(db);await ensureReports(db);
 const ticket=await db.prepare('SELECT * FROM support_tickets WHERE id=?').bind(context.params.id).first();if(!ticket)return json({message:'Chamado não encontrado.'},404);
 const draft=await db.prepare('SELECT * FROM support_report_drafts WHERE ticket_id=?').bind(ticket.id).first();
 if(method==='GET'){const requestedRevision=new URL(context.request.url).searchParams.get('revision');if(requestedRevision){if(!uuid(requestedRevision))throw new TicketError('Versão inválida.');const sent=await db.prepare('SELECT snapshot FROM support_report_deliveries WHERE ticket_id=? AND revision=?').bind(ticket.id,requestedRevision).first();if(!sent)return json({message:'Versão não encontrada.'},404);return json({status:'ok',snapshot:JSON.parse(sent.snapshot)});}
 const profile=await db.prepare('SELECT data FROM support_commercial_profile WHERE id=1').first();const data=draft?JSON.parse(draft.data):{...profileData(profile?JSON.parse(profile.data):{}),services:'',technician:'',due_date:'',items:[],total_cents:0};if(!Object.hasOwn(data,'logo_id'))data.logo_id=await currentLogo(db);
  const history=await db.prepare('SELECT d.revision,d.created_at,e.id AS email_id,e.recipient,e.state,e.sent_at,e.last_error FROM support_report_deliveries d JOIN support_email_outbox e ON e.id=d.email_id WHERE d.ticket_id=? ORDER BY d.created_at DESC LIMIT 30').bind(ticket.id).all();
  const {request_hash,submission_id,...safeTicket}=ticket;return json({status:'ok',ticket:safeTicket,data,revision:draft?.revision??null,logo_url:logoURL(data.logo_id),needs_save:!!draft&&!Object.hasOwn(JSON.parse(draft.data),'logo_id'),preview:draft?reportText(ticket,data):'',configured:gmailConfigured(context.env),history:history.results||[]});}
 let body;try{body=JSON.parse(await(await boundedBody(context.request,40000)).text());}catch{throw new TicketError('Dados inválidos.');}if(!body||typeof body!=='object'||Array.isArray(body))throw new TicketError('Dados inválidos.');
 if(method==='PUT'){
  if((body.revision??null)!==(draft?.revision??null))return json({message:'O relatório foi alterado. Recarregue para conferir a versão atual.'},409);
  const data=reportData(body.data);if(data.logo_id){await ensureBranding(db);if(!await db.prepare('SELECT id FROM support_brand_assets WHERE id=?').bind(data.logo_id).first())throw new TicketError('Logo não encontrado. Selecione novamente o logo atual.');}const encoded=JSON.stringify(data);if(draft?.data===encoded)return json({status:'ok',data,revision:draft.revision,logo_url:logoURL(data.logo_id),preview:reportText(ticket,data)});
  const revision=crypto.randomUUID(),now=new Date().toISOString();let result;
  if(draft)result=await db.prepare('UPDATE support_report_drafts SET data=?,revision=?,updated_at=? WHERE ticket_id=? AND revision=?').bind(encoded,revision,now,ticket.id,draft.revision).run();
  else result=await db.prepare('INSERT OR IGNORE INTO support_report_drafts(ticket_id,data,revision,updated_at) VALUES(?,?,?,?)').bind(ticket.id,encoded,revision,now).run();
  if(!result.meta?.changes)return json({message:'O relatório foi alterado. Recarregue antes de salvar.'},409);
  return json({status:'ok',data,revision,logo_url:logoURL(data.logo_id),preview:reportText(ticket,data)});
 }
 if(body.action!=='send'||body.reviewed!==true||!draft||body.revision!==draft.revision)return json({message:'Salve e revise a versão atual antes de enviar.'},409);
 if(ticket.status!=='encerrado')return json({message:'Encerre o chamado antes de enviar o relatório comercial.'},409);
 if(body.ticket_updated_at!==ticket.updated_at)return json({message:'O chamado mudou desde a revisão. Atualize a página e revise novamente.'},409);
 if(!gmailConfigured(context.env))return json({message:'Configure o envio do Gmail antes de enviar o relatório.'},409);
 try{emailAddress(ticket.email);}catch{throw new TicketError('O e-mail do cliente não é compatível com o envio.');}
 if(!Object.hasOwn(JSON.parse(draft.data),'logo_id'))return json({message:'Salve novamente o documento com logo e assinaturas antes de enviar.'},409);const data=reportData(JSON.parse(draft.data));validateForSend(data);
 const existing=await db.prepare('SELECT email_id FROM support_report_deliveries WHERE ticket_id=? AND revision=?').bind(ticket.id,draft.revision).first();
 if(existing)return json({status:'ok',already_queued:true,email_id:existing.email_id});
 const emailId=crypto.randomUUID(),deliveryId=crypto.randomUUID(),now=new Date().toISOString(),content=reportText(ticket,data),snapshot=JSON.stringify({ticket:{id:ticket.id,protocol:ticket.protocol,full_name:ticket.full_name,email:ticket.email,phone:ticket.phone,department:ticket.department,description:ticket.description,created_at:ticket.created_at,status:ticket.status},data,body:content,html:reportHTML(ticket,data),logo_url:logoURL(data.logo_id)});
 // Recheck both the reviewed revision and closed status atomically with the outbox insertion.
 const result=await db.batch([
  db.prepare("INSERT OR IGNORE INTO support_email_outbox(id,event_key,ticket_id,recipient,reply_to,subject,body,created_at) SELECT ?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM support_report_drafts r JOIN support_tickets t ON t.id=r.ticket_id WHERE r.ticket_id=? AND r.revision=? AND t.status='encerrado' AND t.updated_at=?)").bind(emailId,'report:'+ticket.id+':'+draft.revision,ticket.id,ticket.email,SUPPORT_EMAIL,'['+ticket.protocol+'] Relatório de atendimento e pagamento',content,now,ticket.id,draft.revision,ticket.updated_at),
  db.prepare('INSERT OR IGNORE INTO support_report_deliveries(id,ticket_id,revision,email_id,snapshot,created_at) SELECT ?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM support_email_outbox WHERE id=?)').bind(deliveryId,ticket.id,draft.revision,emailId,snapshot,now,emailId)
 ]);
 if(!result[0].meta?.changes){const previous=await db.prepare('SELECT email_id FROM support_report_deliveries WHERE ticket_id=? AND revision=?').bind(ticket.id,draft.revision).first();if(previous)return json({status:'ok',already_queued:true,email_id:previous.email_id});return json({message:'O chamado ou relatório mudou. Recarregue e revise novamente.'},409);}
 await scheduleEmails(context,ticket.id);return json({status:'ok',already_queued:false,email_id:emailId});
 }catch(error){return json({message:error instanceof TicketError?error.message:'Não foi possível processar o relatório.'},error instanceof TicketError?error.status:503);}}
export const onRequestGet=context=>handle(context,'GET');
export const onRequestPut=context=>handle(context,'PUT');
export const onRequestPost=context=>handle(context,'POST');
