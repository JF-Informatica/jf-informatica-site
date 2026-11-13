import test from 'node:test';
import assert from 'node:assert/strict';
import {licenseDocument,downloadLicenseJson} from '../js/license-export.js';

test('export preserves license terms and excludes internal credentials and notes',()=>{
  const license={public_id:'abc',customer_name:'Empresa Á',product_name:'Center-Backup',license_key:'CHAVE',environment:'production',active:false,expires_at:null,token_hash:'secret',fingerprint_hash:'private',notes:'internal',activation_id:'binding'};
  const result=JSON.parse(JSON.stringify(licenseDocument(license)));
  assert.deepEqual(result,{format:'jf-portal-license-export',schema_version:1,license_id:'abc',customer_name:'Empresa Á',product_name:'Center-Backup',license_key:'CHAVE',environment:'production',active:false,expires_at:null,equipment_name:null,activated_at:null});
  assert.equal(licenseDocument({...license,environment:'demo',expires_at:'2030-01-01'}).expires_at,'2030-01-01');
});

test('download creates valid JSON with a safe filename and releases the temporary URL',async t=>{
  const calls=[];let blob,link;
  t.mock.method(URL,'createObjectURL',value=>{blob=value;return 'blob:test'});
  t.mock.method(URL,'revokeObjectURL',value=>calls.push(value));
  t.mock.method(globalThis,'setTimeout',fn=>{fn();return 1});
  const previous=globalThis.window;
  globalThis.window={document:{createElement:()=>link={click(){calls.push('click')},remove(){calls.push('remove')}},body:{append(){calls.push('append')}}}};
  t.after(()=>{if(previous===undefined)delete globalThis.window;else globalThis.window=previous});
  downloadLicenseJson({public_id:'../abc',customer_name:'Empresa',license_key:'KEY',active:true});
  assert.equal(link.download,'licenca-abc.json');assert.equal(link.href,'blob:test');
  assert.equal(blob.type,'application/json;charset=utf-8');assert.equal(JSON.parse(await blob.text()).license_key,'KEY');
  assert.deepEqual(calls,['append','click','remove','blob:test']);
});
