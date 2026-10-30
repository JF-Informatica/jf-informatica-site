import {requireAdmin} from '../../_lib/auth.js';
import {ensureSupportSchema,json,sameOrigin,boundedBody,TicketError} from '../../_lib/tickets.js';
import {ensureReports,profileData} from '../../_lib/support-reports.js';
async function handle(context,save){try{const auth=await requireAdmin(context);if(auth.response)return auth.response;if(save&&!sameOrigin(context.request))return json({message:'Origem inválida.'},403);await ensureSupportSchema(context.env.DB);await ensureReports(context.env.DB);const db=context.env.DB;
 if(save){let body;try{body=JSON.parse(await(await boundedBody(context.request,16000)).text());}catch{throw new TicketError('Dados inválidos.');}if(!body||typeof body!=='object'||Array.isArray(body))throw new TicketError('Dados inválidos.');const data=profileData(body.data),revision=crypto.randomUUID(),now=new Date().toISOString();
 const result=body.revision?await db.prepare('UPDATE support_commercial_profile SET data=?,revision=?,updated_at=? WHERE id=1 AND revision=?').bind(JSON.stringify(data),revision,now,body.revision).run():await db.prepare('INSERT OR IGNORE INTO support_commercial_profile(id,data,revision,updated_at) VALUES(1,?,?,?)').bind(JSON.stringify(data),revision,now).run();
 if(!result.meta?.changes)return json({message:'Os dados comerciais mudaram. Recarregue antes de salvar.'},409);
 return json({status:'ok',data,revision});}
 const row=await db.prepare('SELECT * FROM support_commercial_profile WHERE id=1').first();return json({status:'ok',data:row?JSON.parse(row.data):profileData({}),revision:row?.revision??null});
 }catch(error){return json({message:error instanceof TicketError?error.message:'Não foi possível acessar os dados comerciais.'},error instanceof TicketError?error.status:503);}}
export const onRequestGet=context=>handle(context,false);
export const onRequestPut=context=>handle(context,true);
