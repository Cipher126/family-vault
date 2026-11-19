type Socket=ReturnType<typeof import('cloudflare:sockets').connect>;
import type {Env} from '../types';

export class UncertainEmailDelivery extends Error {}
class SmtpRejection extends Error {}
const encoder=new TextEncoder();
function base64(text:string):string {
  const bytes=encoder.encode(text);let binary='';for(const byte of bytes)binary+=String.fromCharCode(byte);return btoa(binary);
}
function subjectHeader(text:string):string {
  const words:string[]=[];let chunk='';
  for(const character of text){if(encoder.encode(chunk+character).length>42){words.push(`=?UTF-8?B?${base64(chunk)}?=`);chunk='';}chunk+=character;}
  if(chunk)words.push(`=?UTF-8?B?${base64(chunk)}?=`);return words.join('\r\n ');
}
export function smtpMessage(from:string,to:string,subject:string,text:string,id:string):string {
  for(const address of [from,to])if(!/^[^<>\s@]+@[^<>\s@]+\.[^<>\s@]+$/.test(address))throw new Error('Invalid SMTP email address.');
  if(!/^[a-zA-Z0-9_-]{16,64}$/.test(id))throw new Error('Invalid email collection identifier.');
  return [`From: Family Vault <${from}>`,`To: <${to}>`,`Subject: ${subjectHeader(subject)}`,`Date: ${new Date().toUTCString()}`,`Message-ID: <upload-${id}@family-vault.cipher126.workers.dev>`,'MIME-Version: 1.0','Content-Type: text/plain; charset=UTF-8','Content-Transfer-Encoding: base64','',base64(text).match(/.{1,76}/g)?.join('\r\n') || '',''].join('\r\n');
}

type Connect=typeof import('cloudflare:sockets').connect;
export async function sendSmtpEmail(env:Env,mail:{to:string;subject:string;text:string;id:string},connection?:Connect):Promise<{id:string}> {
  const host=env.SMTP_HOST || 'smtp.gmail.com',username=env.SMTP_USER || '',password=env.SMTP_PASSWORD || '';
  const from=env.SMTP_FROM || username;
  const message=smtpMessage(from,mail.to,mail.subject,mail.text,mail.id);
  const connect=connection || (await import('cloudflare:sockets')).connect;
  const socket=connect({hostname:host,port:465},{secureTransport:'on',allowHalfOpen:false});
  void socket.closed.catch(()=>undefined);
  const reader=socket.readable.getReader(),writer=socket.writable.getWriter();
  const decoder=new TextDecoder();let buffer='',uncertain=false,accepted=false,timer:ReturnType<typeof setTimeout>|undefined;
  const line=async()=>{
    while(!buffer.includes('\r\n')){const result=await reader.read();if(result.done)throw new Error('SMTP connection ended unexpectedly.');buffer+=decoder.decode(result.value,{stream:true});if(buffer.length>32_768)throw new Error('SMTP response is too large.');}
    const end=buffer.indexOf('\r\n'),value=buffer.slice(0,end);buffer=buffer.slice(end+2);return value;
  };
  const reply=async(stage:string,allowed:number[])=>{
    let code=0,total=0;
    while(true){const value=await line();total+=value.length;if(total>32_768)throw new Error('SMTP response is too large.');const match=value.match(/^(\d{3})([ -])/);if(!match || (code && code!==Number(match[1])))throw new Error('Invalid SMTP response.');code=Number(match[1]);if(match[2]===' ')break;}
    if(!allowed.includes(code)){uncertain=false;throw new SmtpRejection(`SMTP ${stage} failed (${code}).`);}
  };
  const command=async(text:string,stage:string,allowed:number[])=>{await writer.write(encoder.encode(text+'\r\n'));await reply(stage,allowed);};
  const send=async()=>{
    await socket.opened;await reply('connection',[220]);
    await command('EHLO family-vault.cipher126.workers.dev','greeting',[250]);
    await command('AUTH PLAIN '+base64(`\0${username}\0${host==='smtp.gmail.com' ? password.replace(/\s/g,'') : password}`),'authentication',[235]);
    await command(`MAIL FROM:<${from}>`,'sender',[250]);await command(`RCPT TO:<${mail.to}>`,'recipient',[250,251]);await command('DATA','message start',[354]);
    uncertain=true;await writer.write(encoder.encode(message+'\r\n.\r\n'));await reply('message acceptance',[250]);accepted=true;
    return {id:`upload-${mail.id}`};
  };
  try {
    return await Promise.race([send(),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Error('SMTP connection timed out.')),20_000);})]);
  }catch(error){
    if(accepted)return {id:`upload-${mail.id}`};
    if(uncertain && !(error instanceof SmtpRejection))throw new UncertainEmailDelivery('Gmail acknowledgement was lost. Check Sent mail before resending.');
    throw error;
  }finally{
    clearTimeout(timer);await Promise.allSettled([reader.cancel(),writer.abort(),socket.close()]);reader.releaseLock();writer.releaseLock();
  }
}
