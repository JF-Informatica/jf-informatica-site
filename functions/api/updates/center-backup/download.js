import {authorize, eligible, json} from '../../../_lib/cb-updates.js';

export async function onRequestPost(context) {
  try {
    const body = await context.request.json();
    if (!await authorize(context, body)) return json({message: 'Ative uma licença válida do Portal JF para baixar pelo CB.'}, 401);
    if (!Number.isSafeInteger(body.download_id) || body.download_id <= 0) return json({message: 'Instalador inválido.'}, 400);
    const row = await context.env.DB.prepare('SELECT object_key, version, file_size, sha256 FROM downloads WHERE id = ? AND active = 1 LIMIT 1').bind(body.download_id).first();
    if (!row || !eligible(row)) return json({message: 'Instalador não disponível.'}, 404);
    const object = await context.env.DOWNLOADS.get(row.object_key);
    if (!object || object.size !== row.file_size) return json({message: 'Arquivo do instalador indisponível.'}, 503);
    return new Response(object.body, {headers: {'Content-Type': 'application/octet-stream',
      'Content-Length': String(row.file_size), 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff',
      'Content-Disposition': `attachment; filename="Center-Backup-${row.version}-Setup.exe"`}});
  } catch (error) {
    return json({message: error instanceof SyntaxError ? 'Requisição inválida.' : 'Download temporariamente indisponível.'}, error instanceof SyntaxError ? 400 : 503);
  }
}
