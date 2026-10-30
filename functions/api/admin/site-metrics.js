import {requireAdmin} from '../../_lib/auth.js';
import {json} from '../../_lib/tickets.js';
import {pages,schema,localDay,validDate} from '../../_lib/site-metrics.js';
export async function onRequestGet(context){try{const auth=await requireAdmin(context);if(auth.response)return auth.response;
 const params=new URL(context.request.url).searchParams,to=params.get('to')||localDay();if(!validDate(to))return json({message:'Data inválida.'},400);const from=params.get('from')||new Date(Date.parse(to+'T00:00:00Z')-29*86400000).toISOString().slice(0,10);
 if(!validDate(from)||!validDate(to)||from>to||(Date.parse(to)-Date.parse(from))/86400000>365)return json({message:'Selecione datas válidas, em um período de até 366 dias.'},400);
 await context.env.DB.prepare(schema).run();const data=await context.env.DB.prepare('SELECT page,event,SUM(count) AS total FROM site_metrics WHERE day>=? AND day<=? GROUP BY page,event').bind(from,to).all();
 const rows=Object.entries(pages).map(([page,label])=>({page,label,path:page==='home'?'/':'/'+page,view:0,whatsapp:0,quote:0}));for(const entry of data.results){const row=rows.find(r=>r.page===entry.page);if(row&&['view','whatsapp','quote'].includes(entry.event))row[entry.event]=Number(entry.total);}
 return json({from,to,rows,totals:rows.reduce((total,row)=>({view:total.view+row.view,whatsapp:total.whatsapp+row.whatsapp,quote:total.quote+row.quote}),{view:0,whatsapp:0,quote:0})});
 }catch{return json({message:'Não foi possível carregar as contagens.'},503);}}
