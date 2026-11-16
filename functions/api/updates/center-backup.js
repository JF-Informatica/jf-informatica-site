import {compareVersions, eligible, json} from '../../_lib/cb-updates.js';

export async function onRequestGet(context) {
  try {
    const {results = []} = await context.env.DB.prepare(`SELECT id, object_key, version, file_size, sha256, description
      FROM downloads WHERE active = 1 AND object_key LIKE 'center-backup/releases/%'`).all();
    const releases = results.filter(eligible).sort((a, b) => compareVersions(b.version, a.version) || b.id - a.id);
    const release = releases[0];
    if (!release) return json({message: 'Nenhum instalador publicado com SHA-256 válido.'}, 404);
    return json({app_id: 'center-backup', schema_version: 1, version: release.version, download_id: release.id,
      file_size: release.file_size, sha256: release.sha256.toLowerCase(), notes: String(release.description || '').slice(0, 10000),
      download_url: new URL('/api/updates/center-backup/download', context.request.url).href});
  } catch {
    return json({message: 'Consulta de atualização temporariamente indisponível.'}, 503);
  }
}
