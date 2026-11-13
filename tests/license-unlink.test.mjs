import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createEnv, context} from './support-env.mjs';
import {onRequestPost as unlink} from '../functions/api/admin/licenses/[id]/unlink.js';
import {onRequestPost as activate} from '../functions/api/licenses/activate.js';
import {onRequestPost as heartbeat} from '../functions/api/licenses/heartbeat.js';
import {onRequestGet as list} from '../functions/api/admin/licenses.js';

async function fixture(t){
  const env=await createEnv();t.after(()=>env.close());
  for(const file of ['001_licenses.sql','002_license_activations.sql','003_license_public_id.sql'])env.sqlite.exec(readFileSync(new URL('../migrations/'+file,import.meta.url),'utf8'));
  env.sqlite.exec("ALTER TABLE licenses ADD COLUMN environment TEXT NOT NULL DEFAULT 'production'");
  const pair=await crypto.subtle.generateKey('Ed25519',true,['sign','verify']);
  env.LICENSE_SIGNING_PRIVATE_KEY_PKCS8=Buffer.from(await crypto.subtle.exportKey('pkcs8',pair.privateKey)).toString('base64');
  const key=Array(8).fill('ABCD').join('-');
  env.sqlite.prepare('INSERT INTO licenses(public_id,customer_name,product_name,license_key,expires_at,notes) VALUES(?,?,?,?,?,?)').run(crypto.randomUUID(),'Cliente teste','Center-Backup',key,'2099-01-01','Manter observações');
  const payload={api_version:1,request_id:crypto.randomUUID(),license_key:key,product_id:'center-backup',installation:{installation_id:crypto.randomUUID(),fingerprint:'a'.repeat(64),device_name:'Servidor antigo'}};
  const response=await activate(context(env,'/api/licenses/activate',{body:JSON.stringify(payload)}));assert.equal(response.status,201);
  return {env,payload,activation:await response.json()};
}
const remove=(env,id,activation_id,options={})=>unlink(context(env,'/api/admin/licenses/'+id+'/unlink',{params:{id:String(id)},token:'admin-test-token',body:JSON.stringify({activation_id}),...options}));

test('unlink allows replacement activation, rejects old tokens and preserves license terms',async t=>{
  const {env,payload,activation}=await fixture(t);
  const replacement={...payload,request_id:crypto.randomUUID(),installation:{...payload.installation,installation_id:crypto.randomUUID(),fingerprint:'b'.repeat(64),device_name:'Servidor reinstalado'}};
  assert.equal((await activate(context(env,'/api/licenses/activate',{body:JSON.stringify(replacement)}))).status,403);
  const listed=await (await list(context(env,'/api/admin/licenses',{method:'GET',token:'admin-test-token'}))).json();assert.equal(listed.licenses[0].activation_id,activation.activation_id);
  assert.equal((await remove(env,1,activation.activation_id)).status,200);
  const license=env.sqlite.prepare('SELECT * FROM licenses').get();
  assert.equal(license.active,1);assert.equal(license.license_key,payload.license_key);assert.equal(license.expires_at,'2099-01-01');assert.equal(license.notes,'Manter observações');
  for(const field of ['equipment_name','activated_at','last_seen_at'])assert.equal(license[field],null);
  const oldRequest=context(env,'/api/licenses/heartbeat',{body:JSON.stringify({api_version:1,request_id:crypto.randomUUID(),activation_id:activation.activation_id,installation_id:payload.installation.installation_id,fingerprint:'a'.repeat(64)})});
  oldRequest.request.headers.set('Authorization','Bearer '+activation.activation_token);
  assert.equal((await heartbeat(oldRequest)).status,401);
  const next=await activate(context(env,'/api/licenses/activate',{body:JSON.stringify(replacement)}));assert.equal(next.status,201);
  const nextActivation=await next.json();assert.notEqual(nextActivation.activation_id,activation.activation_id);
  assert.equal((await remove(env,1,activation.activation_id)).status,409);
  assert.equal(env.sqlite.prepare('SELECT activation_id FROM license_activations').get().activation_id,nextActivation.activation_id);
  assert.equal(env.sqlite.prepare('SELECT equipment_name FROM licenses').get().equipment_name,'Servidor reinstalado');
});

test('unlink requires administrator, same origin and a matching installation',async t=>{
  const {env,activation}=await fixture(t);
  for(const [options,status] of [[{token:undefined},401],[{token:'client-test-token'},403],[{origin:'https://evil.invalid'},403],[{origin:null},403]])assert.equal((await remove(env,1,activation.activation_id,options)).status,status);
  assert.equal((await remove(env,0,activation.activation_id)).status,400);
  assert.equal((await remove(env,999,activation.activation_id)).status,404);
  assert.equal((await remove(env,1,'bad')).status,400);
  assert.equal((await remove(env,1,crypto.randomUUID())).status,409);
  assert.equal(env.sqlite.prepare('SELECT count(*) n FROM license_activations').get().n,1);
  assert.equal((await remove(env,1,activation.activation_id)).status,200);
  assert.equal((await remove(env,1,activation.activation_id)).status,409);
});
