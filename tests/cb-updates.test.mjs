import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createEnv, context} from './support-env.mjs';
import {sha256} from '../functions/_lib/tickets.js';
import {onRequestGet as latest} from '../functions/api/updates/center-backup.js';
import {onRequestPost as download} from '../functions/api/updates/center-backup/download.js';

async function fixture(t) {
  const env = await createEnv(); t.after(() => env.close());
  for (const name of ['001_licenses.sql', '002_license_activations.sql', '004_downloads.sql']) env.sqlite.exec(readFileSync(new URL('../migrations/' + name, import.meta.url), 'utf8'));
  env.sqlite.exec("DELETE FROM downloads; DELETE FROM sqlite_sequence WHERE name='downloads'; ALTER TABLE licenses ADD COLUMN environment TEXT DEFAULT 'production'");
  env.sqlite.prepare('INSERT INTO licenses(customer_name,product_name,license_key) VALUES(?,?,?)').run('Private customer', 'Center-Backup', 'secret-key');
  env.token = 't'.repeat(64); env.activation = crypto.randomUUID(); env.installation = crypto.randomUUID(); env.fingerprint = 'a'.repeat(64);
  env.sqlite.prepare('INSERT INTO license_activations(activation_id,license_id,installation_id,fingerprint_hash,token_hash) VALUES(?,1,?,?,?)').run(env.activation, env.installation, env.fingerprint, await sha256(env.token));
  env.add = (version, active = 1, hash = 'b'.repeat(64)) => env.sqlite.prepare('INSERT INTO downloads(object_key,name,version,file_size,sha256,active) VALUES(?,?,?,?,?,?)').run(`center-backup/releases/${version}/Center-Backup-${version}-Setup.exe`, 'CB', version, 3, hash, active).lastInsertRowid;
  env.DOWNLOADS.get = async key => ({body: new Uint8Array([1, 2, 3]), size: 3});
  return env;
}
function request(env, overrides = {}, token = env.token) {
  return {env, request: new Request('https://portal.test/api/updates/center-backup/download', {method: 'POST', headers: {Authorization: 'Bearer ' + token, 'Content-Type': 'application/json'}, body: JSON.stringify({api_version: 1, activation_id: env.activation, installation_id: env.installation, fingerprint_version: 1, fingerprint: env.fingerprint, download_id: 1, ...overrides})})};
}

test('public metadata selects numeric newest active installer and exposes no private data', async t => {
  const env = await fixture(t); env.add('0.1.3-dev9'); env.add('0.1.3-dev19'); env.add('0.1.3-dev99', 0); env.add('9.0.0', 1, 'bad');
  const response = await latest(context(env, '/api/updates/center-backup', {method: 'GET'}));
  assert.equal(response.status, 200); const value = await response.json();
  assert.equal(value.version, '0.1.3-dev19'); assert.equal(value.download_id, 2);
  for (const secret of ['object_key', 'customer', 'secret-key', env.token, env.activation]) assert.ok(!JSON.stringify(value).includes(secret));
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
});

test('download requires correct token, installation and active unexpired license', async t => {
  const env = await fixture(t); env.add('0.1.3-dev19');
  assert.equal((await download(request(env, {}, 'x'.repeat(64)))).status, 401);
  assert.equal((await download(request(env, {installation_id: crypto.randomUUID()}))).status, 401);
  assert.equal((await download(request(env, {fingerprint: 'c'.repeat(64)}))).status, 401);
  env.sqlite.exec('UPDATE licenses SET active=0'); assert.equal((await download(request(env))).status, 401);
  env.sqlite.exec("UPDATE licenses SET active=1,expires_at='2000-01-01'"); assert.equal((await download(request(env))).status, 401);
  env.sqlite.exec('UPDATE licenses SET expires_at=NULL');
  const result = await download(request(env)); assert.equal(result.status, 200);
  assert.deepEqual(new Uint8Array(await result.arrayBuffer()), new Uint8Array([1, 2, 3]));
  assert.equal(result.headers.get('Cache-Control'), 'private, no-store');
  env.sqlite.exec('DELETE FROM license_activations'); assert.equal((await download(request(env))).status, 401);
});

test('download rejects inactive, other catalog files, missing and wrong-sized objects', async t => {
  const env = await fixture(t); env.add('0.1.3-dev19');
  env.sqlite.exec('UPDATE downloads SET active=0'); assert.equal((await download(request(env))).status, 404);
  env.sqlite.exec("UPDATE downloads SET active=1,object_key='private/certificate.pdf'"); assert.equal((await download(request(env))).status, 404);
  env.sqlite.exec("UPDATE downloads SET object_key='center-backup/releases/0.1.3-dev19/Center-Backup-0.1.3-dev19-Setup.exe'");
  env.DOWNLOADS.get = async () => null; assert.equal((await download(request(env))).status, 503);
  env.DOWNLOADS.get = async () => ({size: 4}); assert.equal((await download(request(env))).status, 503);
  assert.equal((await download(request(env, {download_id: '../private'}))).status, 400);
});
