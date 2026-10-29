import {requireAdmin} from '../../_lib/auth.js';
import {ensureSupportSchema,json,sameOrigin,uuid,boundedBody} from '../../_lib/tickets.js';
import {emailSummary,processEmailQueue} from '../../_lib/ticket-email.js';
import {gmailConfigured,SUPPORT_EMAIL} from '../../_lib/gmail-smtp.js';
export async function onRequestGet(context){
 try{
  const auth=await requireAdmin(context);if(auth.response)return auth.response;
  await ensureSupportSchema(context.env.DB);
  const id=new URL(context.request.url).searchParams.get('ticket_id');
  if(id&&!uuid(id))return json({status:'error',message:'Chamado inválido.'},400);
  const rows=id?await context.env.DB.prepare('SELECT id,recipient,subject,state,attempts,last_error,created_at,sent_at FROM support_email_outbox WHERE ticket_id=? ORDER BY created_at DESC,id DESC LIMIT 50').bind(id).all():{results:[]};
  return json({status:'ok',configured:gmailConfigured(context.env),account:SUPPORT_EMAIL,summary:await emailSummary(context.env.DB),messages:rows.results||[]});
 }catch{return json({status:'error',message:'Não foi possível consultar as notificações.'},503);}
}
export async function onRequestPost(context){
 try{
  const auth=await requireAdmin(context);if(auth.response)return auth.response;
  if(!sameOrigin(context.request))return json({status:'error',message:'Origem inválida.'},403);
  let body;try{body=JSON.parse(await(await boundedBody(context.request,4096)).text());}catch{return json({status:'error',message:'Dados inválidos.'},400);}
  if(!['process','retry'].includes(body?.action))return json({status:'error',message:'Ação inválida.'},400);
  await ensureSupportSchema(context.env.DB);
  if(!gmailConfigured(context.env))return json({status:'error',message:'Configure a senha de app do Gmail no segredo GMAIL_APP_PASSWORD do Cloudflare.'},409);
  if(body.action==='retry'){
   if(!uuid(body.id))return json({status:'error',message:'Notificação inválida.'},400);
   const row=await context.env.DB.prepare('SELECT state FROM support_email_outbox WHERE id=?').bind(body.id).first();
   if(!row)return json({status:'error',message:'Notificação não encontrada.'},404);
   if(['sent','processing'].includes(row.state))return json({status:'error',message:'Esta mensagem já foi enviada ou está em processamento.'},409);
   if(row.state==='uncertain'&&body.confirm_uncertain!==true)return json({status:'error',message:'Confirme o reenvio: esta mensagem pode já ter sido recebida.'},409);
   await context.env.DB.prepare("UPDATE support_email_outbox SET state='pending',attempts=0,available_at=0,last_error=NULL WHERE id=? AND state NOT IN ('sent','processing')").bind(body.id).run();
  }
  const result=await processEmailQueue(context.env);
  return json({status:'ok',...result,summary:await emailSummary(context.env.DB)});
 }catch{return json({status:'error',message:'Não foi possível processar as notificações.'},503);}
}
