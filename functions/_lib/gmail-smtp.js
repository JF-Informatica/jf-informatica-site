// Gmail submission over implicit TLS. No credentials or SMTP replies are logged.
export const SUPPORT_EMAIL='desenvasp@gmail.com';
export class SMTPError extends Error {
 constructor(code,{temporary=false,uncertain=false}={}){super(code);this.code=code;this.temporary=temporary;this.uncertain=uncertain;}
}
export function emailAddress(value){
 if(typeof value!=='string'||value.length>254||!/^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,63}$/.test(value))throw new SMTPError('INVALID_EMAIL_ADDRESS');return value;
}
function base64(text){return btoa(Array.from(new TextEncoder().encode(text),byte=>String.fromCharCode(byte)).join(''));}
function encodedWords(text){const parts=[];let part='';for(const char of text){if(new TextEncoder().encode(part+char).length>42){parts.push(part);part='';}part+=char;}if(part)parts.push(part);return parts.map(value=>'=?UTF-8?B?'+base64(value)+'?=').join('\r\n ');}
export function buildMessage(message){
 emailAddress(message.to);emailAddress(message.replyTo||SUPPORT_EMAIL);
 if(typeof message.subject!=='string'||/[\r\n\x00]/.test(message.subject)||message.subject.length>250||!/^[a-f0-9-]{36}@jf-informatica\.pages\.dev$/.test(message.messageId))throw new SMTPError('INVALID_EMAIL_HEADER');
 const body=base64(message.body).match(/.{1,76}/g)?.join('\r\n')||'';
 const headers=['From: '+encodedWords('JF Informática — Atendimento')+' <'+SUPPORT_EMAIL+'>','To: <'+message.to+'>','Reply-To: <'+(message.replyTo||SUPPORT_EMAIL)+'>','Subject: '+encodedWords(message.subject),'Date: '+new Date().toUTCString(),'Message-ID: <'+message.messageId+'>','MIME-Version: 1.0'];
 if(message.html){if(typeof message.html!=='string'||message.html.length>300000)throw new SMTPError('INVALID_EMAIL_HEADER');const boundary='jf_'+message.messageId.split('@')[0],html=base64(message.html).match(/.{1,76}/g)?.join('\r\n')||'';return [...headers,'Content-Type: multipart/alternative; boundary="'+boundary+'"','','--'+boundary,'Content-Type: text/plain; charset=UTF-8','Content-Transfer-Encoding: base64','',body,'--'+boundary,'Content-Type: text/html; charset=UTF-8','Content-Transfer-Encoding: base64','',html,'--'+boundary+'--',''].join('\r\n');}
 return [...headers,'Content-Type: text/plain; charset=UTF-8','Content-Transfer-Encoding: base64','',body].join('\r\n');
}
export function gmailConfigured(env){return typeof env.GMAIL_APP_PASSWORD==='string'&&/^[a-z0-9]{16}$/i.test(env.GMAIL_APP_PASSWORD.replace(/\s/g,''));}
export async function sendGmail(env,message,{connect,timeoutMs=8000}={}){
 if(!gmailConfigured(env))throw new SMTPError('GMAIL_CONFIGURATION_REQUIRED');
 const mime=buildMessage(message);if(!connect)({connect}=await import('cloudflare:sockets'));
 let socket,reader,writer,timer,phase='connecting';
 try{
  socket=connect({hostname:'smtp.gmail.com',port:465},{secureTransport:'on'});socket.closed?.catch(()=>{});
  reader=socket.readable.getReader();writer=socket.writable.getWriter();writer.closed?.catch(()=>{});
  const decoder=new TextDecoder();let buffered='';
  async function reply(expected){let size=0,code=null;while(true){let end=buffered.indexOf('\r\n');while(end<0){const chunk=await reader.read();if(chunk.done)throw new SMTPError('SMTP_DISCONNECTED',{temporary:true,uncertain:phase==='data'});size+=chunk.value.byteLength;if(size>32768)throw new SMTPError('SMTP_INVALID_REPLY');buffered+=decoder.decode(chunk.value,{stream:true});end=buffered.indexOf('\r\n');}const line=buffered.slice(0,end);buffered=buffered.slice(end+2);if(!/^\d{3}[ -]/.test(line))throw new SMTPError('SMTP_INVALID_REPLY');const current=Number(line.slice(0,3));if(code!==null&&current!==code)throw new SMTPError('SMTP_INVALID_REPLY');code=current;if(line[3]===' '){if(!expected.includes(code))throw new SMTPError(phase==='auth'?'SMTP_AUTH_FAILED':'SMTP_REJECTED',{temporary:code>=400&&code<500});return;}}}
  async function command(text,expected){await writer.write(new TextEncoder().encode(text+'\r\n'));await reply(expected);}
  const operation=(async()=>{await socket.opened;await reply([220]);await command('EHLO jf-informatica.pages.dev',[250]);phase='auth';await command('AUTH PLAIN '+base64('\0'+SUPPORT_EMAIL+'\0'+env.GMAIL_APP_PASSWORD.replace(/\s/g,'')),[235]);phase='envelope';await command('MAIL FROM:<'+SUPPORT_EMAIL+'>',[250]);await command('RCPT TO:<'+message.to+'>',[250,251]);await command('DATA',[354]);phase='data';await writer.write(new TextEncoder().encode(mime+'\r\n.\r\n'));await reply([250]);phase='accepted';return{accepted:true};})();
  const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>{reject(new SMTPError('SMTP_TIMEOUT',{temporary:true,uncertain:phase==='data'}));try{Promise.resolve(socket.close()).catch(()=>{});}catch{}},timeoutMs);});
  return await Promise.race([operation,timeout]);
 }catch(error){if(error instanceof SMTPError)throw error;throw new SMTPError('SMTP_CONNECTION_FAILED',{temporary:true,uncertain:phase==='data'});}
 finally{clearTimeout(timer);try{await socket?.close();}catch{}try{reader?.releaseLock();}catch{}try{writer?.releaseLock();}catch{}}
}
