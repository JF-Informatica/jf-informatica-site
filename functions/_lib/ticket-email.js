import {gmailConfigured,sendGmail,SUPPORT_EMAIL,emailAddress} from './gmail-smtp.js';
export const EMAIL_SCHEMA=[
 `CREATE TABLE IF NOT EXISTS support_email_outbox(id TEXT PRIMARY KEY,event_key TEXT NOT NULL UNIQUE,ticket_id TEXT NOT NULL REFERENCES support_tickets(id),recipient TEXT NOT NULL,reply_to TEXT NOT NULL,subject TEXT NOT NULL,body TEXT NOT NULL,state TEXT NOT NULL DEFAULT 'pending',attempts INTEGER NOT NULL DEFAULT 0,last_error TEXT,created_at TEXT NOT NULL,sent_at TEXT,available_at INTEGER NOT NULL DEFAULT 0,lease_until INTEGER NOT NULL DEFAULT 0,lock_id TEXT)`,
 `CREATE INDEX IF NOT EXISTS support_email_pending ON support_email_outbox(state,available_at)`
];
const statusNames={novo:'Novo',em_atendimento:'Em atendimento',aguardando_cliente:'Aguardando cliente',resolvido:'Resolvido',encerrado:'Encerrado'},urgencyNames={baixa:'Baixa',media:'Média',alta:'Alta / Crítica'};
export function emailStatements(db,ticket,{opened=false,eventKey,condition}={}){
 const now=new Date().toISOString(),footer='\n\nJF Informática\nAtendimento: '+SUPPORT_EMAIL+'\nPortal: https://jf-informatica.pages.dev/chamados.html\nMensagem automática. Responda a este e-mail para falar com a equipe.';
 const body=opened?`Recebemos sua solicitação de suporte.\n\nProtocolo: ${ticket.protocol}\nStatus: Novo\nUrgência: ${urgencyNames[ticket.urgency]}\n\nGuarde este protocolo para identificar o chamado. A equipe entrará em contato pelos dados informados.`:`O atendimento do seu chamado foi atualizado.\n\nProtocolo: ${ticket.protocol}\nNovo status: ${statusNames[ticket.status]}\n\nSe precisar acrescentar informações, responda a esta mensagem e informe o protocolo.`;
 const events=[{key:eventKey+':customer',to:ticket.email,replyTo:SUPPORT_EMAIL,subject:`[${ticket.protocol}] ${opened?'Chamado recebido':statusNames[ticket.status]}`,body:body+footer}];
 if(opened)events.push({key:eventKey+':staff',to:SUPPORT_EMAIL,replyTo:ticket.email,subject:`[${ticket.protocol}] Novo chamado — ${urgencyNames[ticket.urgency]}`,body:`Novo chamado registrado no portal.\n\nProtocolo: ${ticket.protocol}\nNome: ${ticket.full_name}\nE-mail: ${ticket.email}\nTelefone: ${ticket.phone}\nEmpresa / Setor: ${ticket.department}\nCategoria: ${ticket.category}\nUrgência: ${urgencyNames[ticket.urgency]}\n\nDescrição:\n${ticket.description}\n\nAcesse o chamado e seus anexos no painel administrativo:\nhttps://jf-informatica.pages.dev/admin-chamados.html\n\nOs anexos não são encaminhados por e-mail.`});
 return events.map(event=>{
  try{emailAddress(event.replyTo);}catch{event.replyTo=SUPPORT_EMAIL;}
  const args=[crypto.randomUUID(),event.key,ticket.id,event.to,event.replyTo,event.subject,event.body,now];
  const tail=condition?' SELECT ?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM support_tickets WHERE id=? AND status=? AND updated_at=?)':' VALUES(?,?,?,?,?,?,?,?)';
  if(condition)args.push(condition.id,condition.status,condition.updated_at);
  return db.prepare('INSERT OR IGNORE INTO support_email_outbox(id,event_key,ticket_id,recipient,reply_to,subject,body,created_at)'+tail).bind(...args);
 });
}
export async function processEmailQueue(env,{ticketId=null,limit=2,deliver=sendGmail}={}){
 if(!gmailConfigured(env))return{configured:false,sent:0};let sent=0;
 const now=Math.floor(Date.now()/1000);
 await env.DB.prepare("UPDATE support_email_outbox SET state='uncertain',last_error='DELIVERY_INTERRUPTED',lock_id=NULL WHERE state='processing' AND lease_until < ?").bind(now).run();
 for(let i=0;i<limit;i++){
  const lock=crypto.randomUUID(),filter=ticketId?' AND ticket_id=?':'',args=ticketId?[now,ticketId]:[now];
  const row=await env.DB.prepare(`UPDATE support_email_outbox SET state='processing',attempts=attempts+1,lock_id=?,lease_until=? WHERE id=(SELECT id FROM support_email_outbox WHERE state='pending' AND attempts<5 AND available_at<=?${filter} ORDER BY created_at,id LIMIT 1) RETURNING *`).bind(lock,now+45,...args).first();
  if(!row)break;
  try{
   await deliver(env,{to:row.recipient,replyTo:row.reply_to,subject:row.subject,body:row.body,messageId:row.id+'@jf-informatica.pages.dev'});
   await env.DB.prepare("UPDATE support_email_outbox SET state='sent',sent_at=?,last_error=NULL,lock_id=NULL,lease_until=0 WHERE id=? AND lock_id=?").bind(new Date().toISOString(),row.id,lock).run();sent++;
  }catch(error){
   const known=/^(SMTP_[A-Z_]+|INVALID_EMAIL_[A-Z_]+|GMAIL_CONFIGURATION_REQUIRED)$/.test(error.code||'')?error.code:'EMAIL_SEND_FAILED';
   const state=error.uncertain?'uncertain':error.temporary&&row.attempts<5?'pending':'failed',delay=Math.min(3600,60*2**Math.min(row.attempts-1,5));
   await env.DB.prepare('UPDATE support_email_outbox SET state=?,last_error=?,available_at=?,lock_id=NULL,lease_until=0 WHERE id=? AND lock_id=?').bind(state,known,now+delay,row.id,lock).run();
  }
 }return{configured:true,sent};
}
export async function scheduleEmails(context,ticketId=null){const operation=processEmailQueue(context.env,{ticketId}).catch(()=>({configured:gmailConfigured(context.env),sent:0}));if(typeof context.waitUntil==='function')context.waitUntil(operation);else await operation;}
export async function emailSummary(db){const result=await db.prepare('SELECT state,COUNT(*) AS total FROM support_email_outbox GROUP BY state').all();return Object.fromEntries((result.results||[]).map(row=>[row.state,row.total]));}
