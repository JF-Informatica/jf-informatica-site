import {requireAdmin} from '../../_lib/auth.js';
import {ensureSupportSchema,json,TicketError} from '../../_lib/tickets.js';
import {ensureReports,ticketFilters,money} from '../../_lib/support-reports.js';
const statusNames={novo:'Novo',em_atendimento:'Em atendimento',aguardando_cliente:'Aguardando cliente',resolvido:'Resolvido',encerrado:'Encerrado'};
export function csvCell(value){const text=String(value??'');return '"'+(/^[\s]*[=+@\-\t\r]/.test(text)?"'":'')+text.replaceAll('"','""')+'"';}
export async function onRequestGet(context){try{
 const auth=await requireAdmin(context);if(auth.response)return auth.response;const db=context.env.DB;await ensureSupportSchema(db);await ensureReports(db);
 const url=new URL(context.request.url),{where,args}=ticketFilters(url),page=Number(url.searchParams.get('page')||1),csv=url.searchParams.get('format')==='csv';
 if(!Number.isSafeInteger(page)||page<1||page>100000)throw new TicketError('Página inválida.');
 const count=await db.prepare('SELECT COUNT(*) AS total FROM support_tickets'+where).bind(...args).first();
 if(csv&&count.total>10000)return json({message:'A exportação permite até 10.000 chamados. Reduza o período ou aplique outros filtros.'},400);
 const selected=await db.prepare(`SELECT id,protocol,full_name,email,phone,department,category,urgency,status,created_at,updated_at,(SELECT data FROM support_report_drafts WHERE ticket_id=support_tickets.id) AS report_data FROM support_tickets${where} ORDER BY created_at DESC,id DESC LIMIT ? OFFSET ?`).bind(...args,csv?10000:25,csv?0:(page-1)*25).all();
 const tickets=(selected.results||[]).map(({report_data,...ticket})=>({...ticket,total_cents:report_data?JSON.parse(report_data).total_cents:null}));
 if(csv){const lines=[['Protocolo','Abertura (São Paulo)','Solicitante','E-mail','Telefone','Empresa / Setor','Categoria','Urgência','Status','Valor do relatório (BRL)'],...tickets.map(t=>[t.protocol,new Date(t.created_at).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'}),t.full_name,t.email,t.phone,t.department,t.category,t.urgency,statusNames[t.status],t.total_cents===null?'Não preenchido':money(t.total_cents)])];return new Response('\ufeff'+lines.map(row=>row.map(csvCell).join(';')).join('\r\n'),{headers:{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="relatorio-chamados.csv"','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});}
 return json({status:'ok',tickets,total:count.total,page,has_next:page*25<count.total});
 }catch(error){return json({message:error instanceof TicketError?error.message:'Não foi possível carregar os relatórios.'},error instanceof TicketError?error.status:503);}}
