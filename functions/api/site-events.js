import {json,sameOrigin,boundedBody,TicketError} from '../_lib/tickets.js';
import {pages,schema,localDay} from '../_lib/site-metrics.js';
export async function onRequestPost({request,env}){try{
 if(!sameOrigin(request))return json({message:'Origem inválida.'},403);
 if(!request.headers.get('Content-Type')?.startsWith('application/json'))return json({message:'Formato inválido.'},415);
 const raw=await boundedBody(request,512);let body;try{body=JSON.parse(await raw.text());}catch{return json({message:'Dados inválidos.'},400);}
 if(!body||!Object.hasOwn(pages,body.page)||!['view','whatsapp','quote'].includes(body.event)||Object.keys(body).some(key=>!['page','event'].includes(key)))return json({message:'Evento inválido.'},400);
 if(/bot|crawler|spider|headless/i.test(request.headers.get('User-Agent')||''))return new Response(null,{status:204});
 await env.DB.prepare(schema).run();const events=body.event==='quote'?['quote','whatsapp']:[body.event],day=localDay();
 await env.DB.batch(events.map(event=>env.DB.prepare('INSERT INTO site_metrics(day,page,event,count) VALUES(?,?,?,1) ON CONFLICT(day,page,event) DO UPDATE SET count=count+1').bind(day,body.page,event)));
 return new Response(null,{status:204,headers:{'Cache-Control':'no-store'}});
 }catch(error){return json({message:'Contagem indisponível.'},error instanceof TicketError?error.status:503);}}
