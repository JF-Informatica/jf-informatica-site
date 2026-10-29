import {requireAdmin} from '../../_lib/auth.js';
import {ensureSupportSchema,json} from '../../_lib/tickets.js';
export async function onRequestGet(context){
 try{
  const auth=await requireAdmin(context);if(auth.response)return auth.response;
  await ensureSupportSchema(context.env.DB);
  const result={status:'ok',generated_at:new Date().toISOString()};
  for(const field of ['status','urgency','category']){
   const rows=await context.env.DB.prepare(`SELECT ${field} AS name,COUNT(*) AS total FROM support_tickets GROUP BY ${field}`).all();
   result['by_'+field]=Object.fromEntries((rows.results||[]).map(row=>[row.name,row.total]));
  }
  result.total=Object.values(result.by_status).reduce((sum,n)=>sum+n,0);
  const critical=await context.env.DB.prepare("SELECT COUNT(*) AS total FROM support_tickets WHERE urgency='alta' AND status NOT IN ('resolvido','encerrado')").first();
  result.critical_open=critical.total;
  return json(result);
 }catch{return json({status:'error',message:'Não foi possível carregar os indicadores.'},503);}
}
