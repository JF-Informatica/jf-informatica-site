import { requireAdmin } from "../../../../_lib/auth.js";

const json = (body, status = 200) => Response.json(body, {status, headers:{"Cache-Control":"no-store"}});
const fail = (message, status) => json({status:"error",message},status);

export function expirationForDate(value) {
  if(typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(value + 'T00:00:00Z');
  if(!Number.isFinite(date.getTime()) || date.toISOString().slice(0,10)!==value) return null;
  return new Date(value + 'T23:59:59.999-03:00').toISOString();
}

export async function onRequestPatch(context) {
  try {
    const auth=await requireAdmin(context);
    if(auth.response)return auth.response;
    if(context.request.headers.get('Origin')!==new URL(context.request.url).origin)return fail('Origem inválida.',403);
    const id=Number(context.params.id);
    if(!Number.isSafeInteger(id)||id<1)return fail('Licença inválida.',400);
    let body;
    try{body=await context.request.json()}catch{return fail('Requisição inválida.',400)}
    const expiresAt=expirationForDate(body?.validity_date);
    if(!expiresAt || Date.parse(expiresAt)<=Date.now())return fail('Escolha uma data de validade de hoje em diante.',400);
    if(!Object.hasOwn(body,'expected_expires_at') || (body.expected_expires_at!==null && typeof body.expected_expires_at!=='string'))return fail('Atualize a lista de licenças e tente novamente.',400);
    const db=context.env.DB;
    const license=await db.prepare('SELECT id FROM licenses WHERE id = ?').bind(id).first();
    if(!license)return fail('Licença não encontrada.',404);
    const result=await db.prepare(`UPDATE licenses SET expires_at = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND expires_at IS ?`).bind(expiresAt,id,body.expected_expires_at).run();
    if(result.meta.changes!==1)return fail('A validade foi alterada em outra sessão. Atualize a lista antes de salvar.',409);
    console.info('license expiration updated',{license_id:id,admin_id:auth.user.id,expires_at:expiresAt});
    return json({status:'ok',expires_at:expiresAt,message:'Data de validade atualizada com sucesso.'});
  } catch {
    return fail('Não foi possível atualizar a validade. Tente novamente.',500);
  }
}

export function onRequest(context){
  if(context.request.method==='PATCH')return onRequestPatch(context);
  return new Response(null,{status:405,headers:{Allow:'PATCH','Cache-Control':'no-store'}});
}
