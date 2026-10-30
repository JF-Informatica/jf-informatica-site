import {TicketError} from './tickets.js';
export const BRAND_SCHEMA=[
 `CREATE TABLE IF NOT EXISTS support_brand_assets(id TEXT PRIMARY KEY,object_key TEXT NOT NULL UNIQUE,mime TEXT NOT NULL,size INTEGER NOT NULL,created_at TEXT NOT NULL)`,
 `CREATE TABLE IF NOT EXISTS support_branding(id INTEGER PRIMARY KEY CHECK(id=1),logo_id TEXT REFERENCES support_brand_assets(id),updated_at TEXT NOT NULL)`
];
const ready=new WeakMap();
export async function ensureBranding(db){if(!ready.has(db))ready.set(db,db.batch(BRAND_SCHEMA.map(sql=>db.prepare(sql))).catch(error=>{ready.delete(db);throw error;}));await ready.get(db);}
export const LOGO_LIMIT=512*1024;
export function logoMime(bytes){
 if(bytes.length<12)throw new TicketError('Imagem inválida.');
 if(bytes.length>=24&&[137,80,78,71,13,10,26,10].every((v,i)=>bytes[i]===v))return'image/png';
 if(bytes[0]===255&&bytes[1]===216&&bytes[2]===255)return'image/jpeg';
 if(new TextDecoder().decode(bytes.slice(0,4))==='RIFF'&&new TextDecoder().decode(bytes.slice(8,12))==='WEBP')return'image/webp';
 throw new TicketError('Use uma imagem PNG, JPG ou WebP. SVG e outros formatos não são aceitos.');
}
export async function currentLogo(db){await ensureBranding(db);const row=await db.prepare('SELECT logo_id FROM support_branding WHERE id=1').first();return row?.logo_id||null;}
export function logoURL(id){return id?'https://jf-informatica.pages.dev/api/branding/logo?id='+encodeURIComponent(id):'https://jf-informatica.pages.dev/assets/logo-jf-informatica.png';}
