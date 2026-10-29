import {requireAdmin} from '../../_lib/auth.js';
import {ensureSupportSchema, json, STATUSES} from '../../_lib/tickets.js';

export async function onRequestGet(context) {
  try {
    const auth = await requireAdmin(context);
    if (auth.response) return auth.response;
    await ensureSupportSchema(context.env.DB);
    const url = new URL(context.request.url), status = url.searchParams.get('status') || '';
    const page = Number(url.searchParams.get('page') || 1);
    if ((status && !STATUSES.includes(status)) || !Number.isSafeInteger(page) || page < 1 || page > 100000) return json({status:'error',message:'Filtro inválido.'},400);
    const where = status ? ' WHERE status = ?' : '', args = status ? [status] : [];
    const count = await context.env.DB.prepare('SELECT COUNT(*) AS total FROM support_tickets' + where).bind(...args).first();
    const rows = await context.env.DB.prepare(`SELECT id,protocol,full_name,email,phone,department,category,urgency,status,created_at,updated_at FROM support_tickets${where} ORDER BY created_at DESC,id DESC LIMIT 25 OFFSET ?`).bind(...args,(page-1)*25).all();
    return json({status:'ok',tickets:rows.results || [],total:count.total,page,has_next:page*25<count.total});
  } catch { return json({status:'error',message:'Não foi possível carregar os chamados.'},503); }
}
