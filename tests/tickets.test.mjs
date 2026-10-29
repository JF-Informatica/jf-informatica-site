import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createEnv,submission,context} from './support-env.mjs';
import {onRequestPost as submit,onRequest} from '../functions/api/tickets.js';
import {onRequestGet as list} from '../functions/api/admin/tickets.js';
import {onRequestGet as detail,onRequestPatch as update} from '../functions/api/admin/tickets/[id].js';
import {onRequestGet as download} from '../functions/api/admin/tickets/[id]/attachments/[attachment].js';
import {ensureSupportSchema,parseSubmission,MAX_FILE} from '../functions/_lib/tickets.js';

async function envFor(t){const env=await createEnv();t.after(()=>env.close());return env;}
async function ticket(env,fields={},files=[]){const response=await submit(context(env,'/api/tickets',{body:submission(fields,files)}));assert.equal(response.status,201,await response.clone().text());return response.json();}
function admin(env,path,options={}){return context(env,path,{method:'GET',token:'admin-test-token',...options});}

test('public submission persists all requested fields and returns only a protocol',async t=>{
 const env=await envFor(t),data=await ticket(env);assert.match(data.protocol,/^JF-\d{8}-[A-F0-9]{12}$/);
 assert.deepEqual(Object.keys(data).sort(),['created_at','protocol','status']);
 const row=env.sqlite.prepare('SELECT * FROM support_tickets').get();
 assert.equal(row.full_name,'Cliente de Laboratório');assert.equal(row.email,'cliente@example.invalid');assert.equal(row.status,'novo');assert.equal(row.category,'hardware');assert.equal(row.urgency,'media');
});
test('required fields and malformed contacts are rejected without creating tickets',async t=>{
 const env=await envFor(t);
 for(const fields of [{full_name:''},{email:'invalid'},{phone:'abcdefghi'},{department:''},{category:'injected'},{urgency:'urgent'},{description:'curta'},{submission_id:'x'}]){
  const response=await submit(context(env,'/api/tickets',{body:submission(fields)}));assert.equal(response.status,400);
 }
 assert.equal(env.sqlite.prepare("SELECT count(*) n FROM sqlite_master WHERE name='support_tickets'").get().n,0);
});
test('same-origin check rejects foreign and missing origins',async t=>{
 const env=await envFor(t);for(const origin of ['https://evil.invalid',null])assert.equal((await submit(context(env,'/api/tickets',{origin,body:submission()}))).status,403);
});
test('JSON and oversized request bodies are rejected',async t=>{
 const env=await envFor(t);assert.equal((await submit(context(env,'/api/tickets',{body:'{}'}))).status,415);
 const c=context(env,'/api/tickets',{body:submission()});c.request.headers.set('Content-Length',String(13*1024*1024));assert.equal((await submit(c)).status,413);
});
test('honeypot and duplicate fields reject malformed submissions',async t=>{
 const env=await envFor(t),form=submission({website:'spam'});assert.equal((await submit(context(env,'/api/tickets',{body:form}))).status,400);
 const duplicate=submission();duplicate.append('email','other@example.invalid');assert.equal((await submit(context(env,'/api/tickets',{body:duplicate}))).status,400);
});
test('optional attachments are stored privately and only administrators can download',async t=>{
 const env=await envFor(t);env.objects.set('existing-download',new Uint8Array([1]));
 await ticket(env,{},[{name:'erro.txt',bytes:'Mensagem fictícia de erro'}]);
 const row=env.sqlite.prepare('SELECT * FROM support_tickets').get(),file=env.sqlite.prepare('SELECT * FROM support_attachments').get();
 assert.ok(file.object_key.startsWith('support-tickets/'+row.id+'/'));assert.equal(env.objects.size,2);
 const params={id:row.id,attachment:file.id},path=`/api/admin/tickets/${row.id}/attachments/${file.id}`;
 assert.equal((await download(context(env,path,{method:'GET',params}))).status,401);
 assert.equal((await download(context(env,path,{method:'GET',params,token:'client-test-token'}))).status,403);
 const response=await download(admin(env,path,{params}));assert.equal(response.status,200);assert.match(response.headers.get('Content-Disposition'),/^attachment;/);assert.match(response.headers.get('Cache-Control'),/no-store/);assert.equal(await response.text(),'Mensagem fictícia de erro');
});
test('mismatched attachment and ticket IDs do not expose another ticket file',async t=>{
 const env=await envFor(t);await ticket(env,{},[{name:'erro.log',bytes:'test-only'}]);const file=env.sqlite.prepare('SELECT * FROM support_attachments').get();
 const response=await download(admin(env,'/api/admin/tickets/x/attachments/y',{params:{id:crypto.randomUUID(),attachment:file.id}}));assert.equal(response.status,404);
});
test('executable, spoofed image, too many and oversized attachments are refused',async t=>{
 const env=await envFor(t);
 for(const files of [[{name:'app.exe',bytes:'binary'}],[{name:'foto.jpg',bytes:'<html>not an image</html>'}],Array.from({length:4},()=>({name:'erro.txt',bytes:'a'})),[{name:'erro.txt',bytes:new Uint8Array(MAX_FILE+1)}]]){
  const response=await submit(context(env,'/api/tickets',{body:submission({},files)}));assert.ok([400,413].includes(response.status));
 }
 assert.equal(env.objects.size,0);
});
test('signature-checked image files and PDFs are accepted',async t=>{
 const env=await envFor(t);await ticket(env,{},[{name:'foto.jpg',bytes:new Uint8Array([255,216,255,224,1])},{name:'print.png',bytes:new Uint8Array([137,80,78,71,13,10,26,10,1])},{name:'erro.pdf',bytes:'%PDF-1.7 test-only'}]);
 assert.equal(env.sqlite.prepare('SELECT count(*) n FROM support_attachments').get().n,3);
});
test('missing or failed object storage never confirms a lost ticket',async t=>{
 for(const missing of [true,false]){const env=await envFor(t);if(missing)delete env.DOWNLOADS;else env.DOWNLOADS.fail=true;
  const response=await submit(context(env,'/api/tickets',{body:submission({},[{name:'erro.txt',bytes:'test-only'}])}));assert.equal(response.status,503);assert.equal(env.sqlite.prepare('SELECT count(*) n FROM support_tickets').get().n,0);
 }
});
test('database failure cleans uploaded objects and does not report success',async t=>{
 const env=await envFor(t);await ensureSupportSchema(env.DB);const batch=env.DB.batch;env.DB.batch=async()=>{throw new Error('synthetic failure');};
 const response=await submit(context(env,'/api/tickets',{body:submission({},[{name:'erro.txt',bytes:'test-only'}])}));assert.equal(response.status,503);assert.equal(env.objects.size,0);env.DB.batch=batch;
});
test('retrying an identical submission returns the same protocol without duplicates',async t=>{
 const env=await envFor(t),id=crypto.randomUUID();const first=await ticket(env,{submission_id:id}),second=await ticket(env,{submission_id:id});assert.equal(first.protocol,second.protocol);assert.equal(env.sqlite.prepare('SELECT count(*) n FROM support_tickets').get().n,1);
 assert.equal((await submit(context(env,'/api/tickets',{body:submission({submission_id:id,description:'Outra descrição para um incidente diferente.'})}))).status,409);
});
test('public endpoint does not list tickets and rate limits repeated submissions',async t=>{
 const env=await envFor(t);assert.equal((await onRequest(context(env,'/api/tickets',{method:'GET'}))).status,405);
 for(let i=0;i<5;i++)await ticket(env);const response=await submit(context(env,'/api/tickets',{body:submission()}));assert.equal(response.status,429);assert.equal(response.headers.get('Retry-After'),'600');
 const rate=env.sqlite.prepare('SELECT * FROM support_rate_limits').get();assert.ok(!JSON.stringify(rate).includes('192.0.2.10'));
});
test('admin listing, filtering and detail are private',async t=>{
 const env=await envFor(t);await ticket(env);
 assert.equal((await list(context(env,'/api/admin/tickets',{method:'GET'}))).status,401);
 assert.equal((await list(context(env,'/api/admin/tickets',{method:'GET',token:'client-test-token'}))).status,403);
 const result=await list(admin(env,'/api/admin/tickets'));const data=await result.json();assert.equal(data.total,1);assert.equal(data.tickets[0].full_name,'Cliente de Laboratório');
 const record=await detail(admin(env,'/api/admin/tickets/'+data.tickets[0].id,{params:{id:data.tickets[0].id}}));assert.equal((await record.json()).ticket.description,'Computador de laboratório apresenta falha ao iniciar o sistema.');
 assert.equal((await (await list(admin(env,'/api/admin/tickets?status=resolvido'))).json()).total,0);
});
test('only same-origin administrators can update ticket status',async t=>{
 const env=await envFor(t);await ticket(env);const id=env.sqlite.prepare('SELECT id FROM support_tickets').get().id,options={method:'PATCH',body:JSON.stringify({status:'em_atendimento'}),params:{id}};
 assert.equal((await update(context(env,'/api/admin/tickets/'+id,options))).status,401);
 assert.equal((await update(context(env,'/api/admin/tickets/'+id,{...options,token:'client-test-token'}))).status,403);
 assert.equal((await update(admin(env,'/api/admin/tickets/'+id,{...options,origin:'https://evil.invalid'}))).status,403);
 const response=await update(admin(env,'/api/admin/tickets/'+id,options));assert.equal(response.status,200);assert.equal((await response.json()).ticket.status,'em_atendimento');
 assert.equal((await update(admin(env,'/api/admin/tickets/'+id,{...options,body:'{"status":"invalid"}'}))).status,400);
});
test('schema migration is additive and idempotent',async t=>{
 const env=await envFor(t);const migration=readFileSync(new URL('../migrations/006_support_tickets.sql',import.meta.url),'utf8');env.sqlite.exec(migration);env.sqlite.exec(migration);await ensureSupportSchema(env.DB);assert.equal(env.sqlite.prepare('SELECT count(*) n FROM users').get().n,2);
});
test('SQL-like customer text is stored as data without changing existing accounts',async t=>{
 const env=await envFor(t),department="Teste'); DROP TABLE users; --";
 await ticket(env,{department,description:'<script>Texto de um erro de laboratório, sem execução.</script>'});
 assert.equal(env.sqlite.prepare('SELECT department FROM support_tickets').get().department,department);
 assert.equal(env.sqlite.prepare('SELECT count(*) n FROM users').get().n,2);
 for(const query of ['?status=invalid','?page=-1','?page=NaN','?page=1.5'])assert.equal((await list(admin(env,'/api/admin/tickets'+query))).status,400);
});
test('combined attachment size is limited even when every file is below 5 MB',async t=>{
 const env=await envFor(t),files=Array.from({length:3},()=>({name:'erro.txt',bytes:'a'.repeat(3.5*1024*1024)}));
 assert.equal((await submit(context(env,'/api/tickets',{body:submission({},files)}))).status,413);assert.equal(env.objects.size,0);
});
test('body limit is enforced for streamed uploads without Content-Length',async t=>{
 const env=await envFor(t);const body=new ReadableStream({start(controller){controller.enqueue(new Uint8Array(13*1024*1024));controller.close();}});
 const request=new Request('https://portal.test/api/tickets',{method:'POST',body,duplex:'half',headers:{Origin:'https://portal.test','Content-Type':'multipart/form-data; boundary=test'}});
 assert.equal((await submit({env,request})).status,413);
});
test('retrying an uploaded ticket does not store additional attachments',async t=>{
 const env=await envFor(t),submission_id=crypto.randomUUID(),files=[{name:'erro.log',bytes:'test-only error'}];
 const first=await ticket(env,{submission_id},files),second=await ticket(env,{submission_id},files);
 assert.equal(first.protocol,second.protocol);assert.equal(env.objects.size,1);assert.equal(env.sqlite.prepare('SELECT count(*) n FROM support_attachments').get().n,1);
});
test('status filters paginate persisted records correctly',async t=>{
 const env=await envFor(t);await ensureSupportSchema(env.DB);
 for(let i=0;i<27;i++)env.sqlite.prepare(`INSERT INTO support_tickets VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(crypto.randomUUID(),'JF-test-'+i,crypto.randomUUID(),'hash','Teste','teste@example.invalid','11999990000','Laboratório','outros','baixa','Descrição fictícia para teste de paginação.',i===0?'resolvido':'novo','2026-10-29T12:00:00Z','2026-10-29T12:00:00Z');
 const first=await(await list(admin(env,'/api/admin/tickets?status=novo&page=1'))).json(),second=await(await list(admin(env,'/api/admin/tickets?status=novo&page=2'))).json();
 assert.equal(first.total,26);assert.equal(first.tickets.length,25);assert.equal(first.has_next,true);assert.equal(second.tickets.length,1);assert.equal(second.has_next,false);
});
