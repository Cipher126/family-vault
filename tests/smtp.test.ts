import {expect,it,vi} from 'vitest';
type Socket=ReturnType<typeof import('cloudflare:sockets').connect>;
import type {Env} from '../worker/types';
import {sendSmtpEmail,smtpMessage,UncertainEmailDelivery} from '../worker/lib/smtp';

function smtpServer(mode:'success'|'auth-fail'|'uncertain'='success') {
  const writes:string[]=[];let controller:ReadableStreamDefaultController<Uint8Array>;
  const send=(text:string)=>{for(let offset=0;offset<text.length;offset+=7)controller.enqueue(new TextEncoder().encode(text.slice(offset,offset+7)));};
  const readable=new ReadableStream<Uint8Array>({start(value){controller=value;send('220 Gmail ready\r\n');}});
  const writable=new WritableStream<Uint8Array>({write(bytes){const command=new TextDecoder().decode(bytes);writes.push(command);
    if(command.startsWith('EHLO'))send('250-Gmail\r\n250-AUTH PLAIN LOGIN\r\n250 SIZE 35882577\r\n');
    else if(command.startsWith('AUTH'))send(mode==='auth-fail' ? '535 Authentication failed\r\n' : '235 Authenticated\r\n');
    else if(command.startsWith('MAIL') || command.startsWith('RCPT'))send('250 OK\r\n');
    else if(command.startsWith('DATA'))send('354 Send message\r\n');
    else if(mode==='uncertain')controller.close();else send('250 Accepted\r\n');
  }});
  const socket={readable,writable,opened:Promise.resolve({}),closed:Promise.resolve(),close:vi.fn(async()=>undefined)} as unknown as Socket;
  const connect=vi.fn(()=>socket);return {writes,connect};
}
const env={SMTP_USER:'sender@gmail.com',SMTP_PASSWORD:'abcd efgh ijkl mnop'} as Env;
const mail={to:'admin@gmail.com',subject:'New family pictures: Day at the park',text:'Pictures\nhttps://vault.test/collections/park',id:'park-collection-123456'};
it('sends Gmail SMTP over implicit TLS and parses split, multiline replies',async()=>{
  const server=smtpServer();expect((await sendSmtpEmail(env,mail,server.connect)).id).toBe(`upload-${mail.id}`);
  expect(server.connect).toHaveBeenCalledWith({hostname:'smtp.gmail.com',port:465},{secureTransport:'on',allowHalfOpen:false});
  const auth=server.writes.find(line=>line.startsWith('AUTH PLAIN'))!;
  expect(atob(auth.trim().slice('AUTH PLAIN '.length))).toBe('\0sender@gmail.com\0abcdefghijklmnop');
  expect(server.writes.at(-1)).toContain(`Message-ID: <upload-${mail.id}@family-vault.cipher126.workers.dev>`);
});
it('does not transmit the message if Gmail rejects authentication',async()=>{
  const server=smtpServer('auth-fail');await expect(sendSmtpEmail(env,mail,server.connect)).rejects.toThrow('authentication failed (535)');
  expect(server.writes.some(line=>line.startsWith('DATA'))).toBe(false);
});
it('flags an uncertain acknowledgement so automatic delivery cannot duplicate it',async()=>{
  const server=smtpServer('uncertain');await expect(sendSmtpEmail(env,mail,server.connect)).rejects.toBeInstanceOf(UncertainEmailDelivery);
});
it('encodes UTF-8 and prevents SMTP header or message-body injection',()=>{
  const message=smtpMessage('sender@gmail.com','admin@gmail.com','Park 📸\r\nBcc: stranger@example.com','Family\r\n.\r\nMore',mail.id);
  expect(message).not.toContain('\r\nBcc:');expect(message).not.toContain('\r\n.\r\n');
  expect(message).toContain('Content-Transfer-Encoding: base64');
  expect(()=>smtpMessage('sender@gmail.com\r\nBcc: stranger@example.com','admin@gmail.com','Pictures','',mail.id)).toThrow('Invalid SMTP email address');
});
