import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

test('JSON button remains available for both linked and unlinked licenses',async()=>{
  class Element {
    children=[];_text='';hidden=false;
    set textContent(value){this._text=value;this.children=[]}
    get textContent(){return this._text}
    append(...children){this.children.push(...children)}
    replaceChildren(){this.children=[]}
    addEventListener(){}
    classList={toggle(){}};
  }
  const elements=new Map();
  const document={querySelector(selector){if(!elements.has(selector))elements.set(selector,new Element());return elements.get(selector)},querySelectorAll(){return []},createElement(){return new Element()}};
  const licenses=[{id:1,customer_name:'Sem vínculo',activation_id:null},{id:2,customer_name:'Com vínculo',activation_id:'bound'}];
  const scope=vm.createContext({document,console,fetch:async url=>url==='/api/me'?{ok:false}:{ok:true,status:200,json:async()=>({status:'ok',licenses})}});
  vm.runInContext(readFileSync(new URL('../js/admin.js',import.meta.url),'utf8'),scope);
  await vm.runInContext('loadLicenses()',scope);
  const rows=elements.get('#licenses-table-body').children;
  assert.equal(rows.length,2);
  assert.deepEqual(rows[0].children.at(-1).children.map(child=>child.textContent),['Baixar JSON','Atualizar data','Sem vínculo']);
  assert.deepEqual(rows[1].children.at(-1).children.map(child=>child.textContent),['Baixar JSON','Atualizar data','Desvincular instalação']);
});
