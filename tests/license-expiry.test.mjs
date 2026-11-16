import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createEnv,context} from './support-env.mjs';
import {onRequestPatch as update,expirationForDate} from '../functions/api/admin/licenses/[id]/expiry.js';
import {brazilDate} from '../js/license-expiry.js';

async function fixture(t){
  const env=await createEnv();t.after(()=>env.close());
  for(const name of ['001_licenses.sql','002_license_activations.sql','003_license_public_id.sql'])env.sqlite.exec(readFileSync(new URL('../migrations/'+name,import.meta.url),'utf8'));
  env.sqlite.exec("ALTER TABLE licenses ADD COLUMN environment TEXT DEFAULT 'demo'");
  env.sqlite.prepare('INSERT INTO licenses(public_id,customer_name,product_name,license_key,expires_at,active,equipment_name,notes) VALUES(?,?,?,?,?,?,?,?)').run(crypto.randomUUID(),'Cliente','Center-Backup','KEEP-KEY','2020-01-01T03:00:00Z',0,'Servidor','Preservar');
  env.sqlite.prepare('INSERT INTO license_activations(activation_id,license_id,installation_id,fingerprint_hash,token_hash) VALUES(?,1,?,?,?)').run(crypto.randomUUID(),crypto.randomUUID(),'fingerprint','token');
  return env;
}
const change=(env,body={},options={})=>update(context(env,'/api/admin/licenses/1/expiry',{method:'PATCH',token:'admin-test-token',params:{id:'1'},body:JSON.stringify({validity_date:'2099-02-28',expected_expires_at:'2020-01-01T03:00:00Z',...body}),...options}));

test('date uses end of day in Brasilia and round-trips without shifting a day',()=>{
  assert.equal(expirationForDate('2099-02-28'),'2099-03-01T02:59:59.999Z');
  assert.equal(brazilDate(expirationForDate('2099-02-28')),'2099-02-28');
  for(const date of ['2099-02-29','2099-04-31','2099-13-01','bad',null])assert.equal(expirationForDate(date),null);
  assert.equal(expirationForDate('2096-02-29'),'2096-03-01T02:59:59.999Z');
});

test('expiration update preserves key, administrative status and installation',async t=>{
  const env=await fixture(t);
  const before=env.sqlite.prepare('SELECT * FROM licenses').get();
  const activation=env.sqlite.prepare('SELECT * FROM license_activations').get();
  const response=await change(env);assert.equal(response.status,200);
  const after=env.sqlite.prepare('SELECT * FROM licenses').get();
  assert.equal(after.expires_at,'2099-03-01T02:59:59.999Z');
  for(const key of ['public_id','license_key','active','environment','customer_name','equipment_name','notes'])assert.equal(after[key],before[key]);
  assert.deepEqual(env.sqlite.prepare('SELECT * FROM license_activations').get(),activation);
  assert.equal((await change(env,{validity_date:'2099-03-03'})).status,409);
  assert.equal(env.sqlite.prepare('SELECT expires_at FROM licenses').get().expires_at,after.expires_at);
});

test('expiration update rejects anonymous, client, cross-origin and invalid dates',async t=>{
  const env=await fixture(t);
  for(const [options,status] of [[{token:undefined},401],[{token:'client-test-token'},403],[{origin:'https://other.invalid'},403],[{origin:null},403]])assert.equal((await change(env,{},options)).status,status);
  for(const date of ['2020-01-01','2099-02-29','',null])assert.equal((await change(env,{validity_date:date})).status,400);
  assert.equal((await change(env,{}, {params:{id:'999'}})).status,404);
  assert.equal((await change(env,{}, {params:{id:'bad'}})).status,400);
  assert.equal(env.sqlite.prepare('SELECT expires_at FROM licenses').get().expires_at,'2020-01-01T03:00:00Z');
});

test('production license with no expiration can receive a date',async t=>{
  const env=await fixture(t);
  env.sqlite.exec("UPDATE licenses SET environment='production',expires_at=NULL");
  assert.equal((await change(env,{expected_expires_at:null})).status,200);
});
