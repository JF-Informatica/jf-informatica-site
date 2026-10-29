import {requireAdmin} from '../../../../../_lib/auth.js';
import {ensureSupportSchema, json, uuid} from '../../../../../_lib/tickets.js';

export async function onRequestGet(context) {
  try {
    const auth = await requireAdmin(context);
    if (auth.response) return auth.response;
    if (!uuid(context.params.id) || !uuid(context.params.attachment)) return json({status:'error',message:'Anexo inválido.'},400);
    await ensureSupportSchema(context.env.DB);
    const file = await context.env.DB.prepare('SELECT object_key,name,mime,size FROM support_attachments WHERE id = ? AND ticket_id = ?').bind(context.params.attachment,context.params.id).first();
    if (!file) return json({status:'error',message:'Anexo não encontrado.'},404);
    const object = await context.env.DOWNLOADS.get(file.object_key);
    if (!object) return json({status:'error',message:'Anexo indisponível.'},404);
    return new Response(object.body,{headers:{'Content-Type':file.mime,'Content-Disposition':`attachment; filename="anexo"; filename*=UTF-8''${encodeURIComponent(file.name)}`,'Content-Length':String(file.size),'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox"}});
  } catch { return json({status:'error',message:'Não foi possível baixar o anexo.'},503); }
}
