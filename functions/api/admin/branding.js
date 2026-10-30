import {requireAdmin} from '../../_lib/auth.js';
import {json,sameOrigin,boundedBody,TicketError} from '../../_lib/tickets.js';
import {ensureBranding,currentLogo,logoURL,logoMime,LOGO_LIMIT} from '../../_lib/branding.js';
async function handle(context,method){try{const auth=await requireAdmin(context);if(auth.response)return auth.response;if(method!=='GET'&&!sameOrigin(context.request))return json({message:'Origem inválida.'},403);const db=context.env.DB;await ensureBranding(db);
 if(method==='POST'){
  if(!(context.request.headers.get('Content-Type')||'').startsWith('multipart/form-data;'))throw new TicketError('Envie o arquivo de imagem.');
  const body=await boundedBody(context.request,LOGO_LIMIT+8192);let form;try{form=await new Response(body,{headers:{'Content-Type':context.request.headers.get('Content-Type')}}).formData();}catch{throw new TicketError('Não foi possível ler a imagem.');}
  const files=form.getAll('logo');if(files.length!==1||typeof files[0]?.arrayBuffer!=='function'||!files[0].size)throw new TicketError('Selecione uma imagem.');const file=files[0];if(file.size>LOGO_LIMIT)throw new TicketError('O logo pode ter até 512 KB.',413);
  const bytes=new Uint8Array(await file.arrayBuffer()),mime=logoMime(bytes),id=crypto.randomUUID(),key='site-branding/'+id,now=new Date().toISOString();if(!context.env.DOWNLOADS)throw Error('Storage unavailable');
  await context.env.DOWNLOADS.put(key,bytes,{httpMetadata:{contentType:mime}});
  try{await db.batch([db.prepare('INSERT INTO support_brand_assets(id,object_key,mime,size,created_at) VALUES(?,?,?,?,?)').bind(id,key,mime,bytes.length,now),db.prepare('INSERT INTO support_branding(id,logo_id,updated_at) VALUES(1,?,?) ON CONFLICT(id) DO UPDATE SET logo_id=excluded.logo_id,updated_at=excluded.updated_at').bind(id,now)]);}catch(error){await context.env.DOWNLOADS.delete(key).catch(()=>{});throw error;}
  return json({status:'ok',logo_id:id,logo_url:logoURL(id)});
 }
 if(method==='DELETE')await db.prepare('INSERT INTO support_branding(id,logo_id,updated_at) VALUES(1,NULL,?) ON CONFLICT(id) DO UPDATE SET logo_id=NULL,updated_at=excluded.updated_at').bind(new Date().toISOString()).run();
 const id=await currentLogo(db);return json({status:'ok',logo_id:id,logo_url:logoURL(id)});
 }catch(error){return json({message:error instanceof TicketError?error.message:'Não foi possível atualizar o logo.'},error instanceof TicketError?error.status:503);}}
export const onRequestGet=context=>handle(context,'GET');
export const onRequestPost=context=>handle(context,'POST');
export const onRequestDelete=context=>handle(context,'DELETE');
