import {DatabaseSync} from 'node:sqlite';
import {sha256} from '../functions/_lib/tickets.js';

export async function createEnv() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(`PRAGMA foreign_keys=ON;
    CREATE TABLE users(id INTEGER PRIMARY KEY,username TEXT,name TEXT,email TEXT,role TEXT,active INTEGER);
    CREATE TABLE sessions(id INTEGER PRIMARY KEY,user_id INTEGER,token_hash TEXT,expires_at TEXT);
    INSERT INTO users VALUES(1,'admin','Administrador de teste','admin@example.invalid','admin',1);
    INSERT INTO users VALUES(2,'cliente','Cliente de teste','cliente@example.invalid','user',1);`);
  for (const [id,token] of [[1,'admin-test-token'],[2,'client-test-token']]) sqlite.prepare('INSERT INTO sessions VALUES(?,?,?,?)').run(id,id,await sha256(token),'2099-01-01T00:00:00Z');
  class Statement {
    constructor(sql){this.sql=sql;this.args=[];}
    bind(...args){this.args=args;return this;}
    async first(){return sqlite.prepare(this.sql).get(...this.args)||null;}
    async all(){return {results:sqlite.prepare(this.sql).all(...this.args)};}
    async run(){const result=sqlite.prepare(this.sql).run(...this.args);return {success:true,meta:{changes:Number(result.changes),last_row_id:Number(result.lastInsertRowid)}};}
  }
  const db={prepare:sql=>new Statement(sql),async batch(statements){sqlite.exec('BEGIN');try{const result=[];for(const statement of statements)result.push(await statement.run());sqlite.exec('COMMIT');return result;}catch(error){sqlite.exec('ROLLBACK');throw error;}}};
  const objects=new Map();
  const bucket={fail:false,async put(key,bytes){if(this.fail)throw new Error('synthetic storage failure');objects.set(key,new Uint8Array(bytes));},async get(key){const body=objects.get(key);return body?{body}:null;},async delete(keys){for(const key of Array.isArray(keys)?keys:[keys])objects.delete(key);}};
  return {DB:db,DOWNLOADS:bucket,sqlite,objects,close:()=>sqlite.close()};
}
export function submission(overrides={},files=[]) {
  const form=new FormData();
  const fields={submission_id:crypto.randomUUID(),full_name:'Cliente de Laboratório',email:'cliente@example.invalid',phone:'11999990000',department:'Empresa de Teste / TI',category:'hardware',urgency:'media',description:'Computador de laboratório apresenta falha ao iniciar o sistema.',...overrides};
  for(const [key,value] of Object.entries(fields))form.set(key,value);
  for(const file of files)form.append('attachments',new Blob([file.bytes],{type:file.type||'application/octet-stream'}),file.name);
  return form;
}
export function context(env,path='/api/tickets',{method='POST',body,token,origin='https://portal.test',params={},ip='192.0.2.10'}={}) {
  const headers={'CF-Connecting-IP':ip};if(origin)headers.Origin=origin;if(token)headers.Cookie='jf_session='+token;
  if(body&&typeof body==='string')headers['Content-Type']='application/json';
  return {env,params,request:new Request('https://portal.test'+path,{method,headers,body})};
}
