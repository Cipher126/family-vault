import {sendSmtpEmail} from "../worker/lib/smtp";
vi.mock("../worker/lib/smtp",async original=>({...await original<object>(),sendSmtpEmail:vi.fn()}));
import {DatabaseSync} from "node:sqlite";
import {readFileSync,readdirSync} from "node:fs";
import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import {api,serveAuthenticatedPhoto} from "../worker/routes/api";
import {currentUser,createSession} from "../worker/lib/auth";
import {readJson} from "../worker/lib/http";
import {rateLimit} from "../worker/lib/rate-limit";
import {sha256,verifyPassword} from "../worker/lib/security";
import {photoAccessPredicate} from "../worker/lib/photo-access";
import {deliverUploadEmail,retryUploadEmails} from "../worker/lib/upload-email";
import type {Env,RequestContext} from "../worker/types";

let db:DatabaseSync,env:Env;
function statement(sql:string,values:unknown[]=[]):any {
  const query=()=>db.prepare(sql),params=()=>values as Array<string|number|null>;
  return {sql,values,bind:(...args:unknown[])=>statement(sql,args),
    first:async()=>query().get(...params()) ?? null,
    all:async()=>({results:query().all(...params())}),
    run:async()=>({meta:{changes:Number(query().run(...params()).changes)}})};
}
function context(path:string,body?:unknown,user:RequestContext["user"]={id:"a",email:"a@x.co",displayName:"A",role:"admin"}):RequestContext {
  const request=new Request(`https://vault${path}`,body===undefined ? {} : {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
  return {env,request,url:new URL(request.url),user};
}
beforeEach(()=>{
  db=new DatabaseSync(":memory:");
  const directory=new URL("../db/migrations/",import.meta.url);
  for(const file of readdirSync(directory).filter(name=>name.endsWith(".sql")).sort())db.exec(readFileSync(new URL(file,directory),"utf8"));
  env={DB:{prepare:statement,batch:async(statements:any[])=>{
    db.exec("BEGIN");try{const results=statements.map(item=>{
      const prepared=db.prepare(item.sql);
      if(/^\s*SELECT/i.test(item.sql))return {results:prepared.all(...item.values),meta:{changes:0}};
      return {results:[],meta:{changes:Number(prepared.run(...item.values).changes)}};
    });db.exec("COMMIT");return results;}catch(error){db.exec("ROLLBACK");throw error;}
  }},PHOTOS:{get:vi.fn()},APP_ENV:"production"} as unknown as Env;
  db.exec("INSERT INTO users(id,email,display_name,password_hash,role) VALUES('a','a@x.co','A','old','admin'),('b','b@x.co','B','old','member'),('c','c@x.co','C','old','member')");
});
afterEach(()=>{db.close();vi.restoreAllMocks();vi.clearAllMocks();vi.unstubAllGlobals();});

describe("authorization against real SQLite",()=>{
  it("does not let private bookmarks hide another person's shared photo",()=>{
    db.exec("INSERT INTO photos(id,owner_id,original_filename,mime_type,status) VALUES('p','a','p.jpg','image/jpeg','ready'); INSERT INTO albums(id,name,visibility,owner_id) VALUES('bookmark','Bookmark','private','b'),('owner','Owner','private','a'); INSERT INTO album_photos(album_id,photo_id,added_by) VALUES('bookmark','p','b')");
    const canSee=(id:string)=>db.prepare(`SELECT id FROM photos p WHERE ${photoAccessPredicate()}`).get(id,"member");
    expect(canSee("b")).toBeTruthy();expect(canSee("c")).toBeTruthy();
    db.exec("INSERT INTO album_photos(album_id,photo_id,added_by) VALUES('owner','p','a')");
    expect(canSee("a")).toBeTruthy();expect(canSee("b")).toBeUndefined();expect(canSee("c")).toBeUndefined();
  });
  it("rejects an expired ISO session in both API and media authentication",async()=>{
    const cookie=await createSession(new Request("https://vault"),env,"a");
    db.exec("UPDATE sessions SET expires_at=strftime('%Y-%m-%dT00:00:00.000Z','now')");
    const request=new Request("https://vault/api/photos/p/small",{headers:{Cookie:cookie.split(";")[0]}});
    expect(await currentUser(request,env)).toBeNull();
    await expect(serveAuthenticatedPhoto(request,env,"p","small")).rejects.toMatchObject({status:401});
  });
  it("allows exactly one concurrent registration for an unbound invitation",async()=>{
    db.prepare("INSERT INTO invitations(id,token_hash,created_by,expires_at) VALUES('i',?,'a',datetime('now','+1 day'))").run(await sha256("invite"));
    const attempts=await Promise.allSettled(["one","two"].map(name=>api(context("/api/auth/register",{token:"invite",email:`${name}@x.co`,displayName:name,password:"LongPassword123"},null))));
    expect(attempts.filter(result=>result.status==="fulfilled")).toHaveLength(1);
    expect(db.prepare("SELECT COUNT(*) total FROM users").get()?.total).toBe(4);
  });
  it("allows exactly one concurrent password reset and retains its password",async()=>{
    db.prepare("INSERT INTO recovery_tokens(id,user_id,token_hash,created_by,expires_at) VALUES('r','b',?,'a',datetime('now','+1 day'))").run(await sha256("recover"));
    const passwords=["FirstPassword123","SecondPassword123"];
    const attempts=await Promise.allSettled(passwords.map(password=>api(context("/api/auth/recover",{token:"recover",password},null))));
    expect(attempts.filter(result=>result.status==="fulfilled")).toHaveLength(1);
    const encoded=String(db.prepare("SELECT password_hash FROM users WHERE id='b'").get()?.password_hash);
    expect(await verifyPassword(passwords[attempts.findIndex(result=>result.status==="fulfilled")],encoded)).toBe(true);
  });
  it("admits only the configured number of parallel authentication attempts",async()=>{
    const attempts=await Promise.allSettled(Array.from({length:30},()=>rateLimit(env,new Request("https://vault"),"login",10,15)));
    expect(attempts.filter(result=>result.status==="fulfilled")).toHaveLength(10);
    expect(db.prepare("SELECT value FROM application_settings WHERE key LIKE 'rate:login:%'").get()?.value).toBe("10");
  });
});

describe("bounded requests and complete exports",()=>{
  it("rejects a streamed body without Content-Length and stops reading",async()=>{
    let pulls=0,cancelled=false;
    const body=new ReadableStream({pull(controller){pulls++;controller.enqueue(new Uint8Array(20_000));},cancel(){cancelled=true;}},{highWaterMark:0});
    const request=new Request("https://vault",{method:"POST",body,duplex:"half"} as RequestInit);
    await expect(readJson(request)).rejects.toMatchObject({status:413});
    expect(pulls).toBe(2);expect(cancelled).toBe(true);
  });
  it("decodes JSON correctly across multibyte stream boundaries",async()=>{
    const bytes=new TextEncoder().encode(JSON.stringify({name:"Múm"}));let position=0;
    const body=new ReadableStream({pull(controller){if(position===bytes.length)controller.close();else controller.enqueue(bytes.slice(position,++position));}});
    expect(await readJson(new Request("https://vault",{method:"POST",body,duplex:"half"} as RequestInit))).toEqual({name:"Múm"});
  });
  it("exports family profiles, relationships, tags, memories and membership",async()=>{
    db.exec("INSERT INTO family_people(id,first_name,created_by) VALUES('person','Person','a'); INSERT INTO memories(id,title,created_by) VALUES('m','Christmas','a')");
    const data=await (await api(context("/api/admin/export"))).json() as Record<string,unknown[]>;
    expect(data.familyPeople).toHaveLength(1);expect(data.memories).toHaveLength(1);
    for(const key of ["familyRelationships","photoPeople","memoryPhotos"])expect(data[key]).toEqual([]);
    expect(JSON.stringify(data)).not.toContain("password_hash");
  });
  it("only reads archive object bytes when the client consumes them and cancels R2",async()=>{
    db.exec("INSERT INTO photos(id,owner_id,original_filename,mime_type,status,gallery_key) VALUES('p','a','p.jpg','image/jpeg','ready','gallery')");
    let pulls=0,cancelled=false;
    const get=vi.fn(async()=>({size:64_000_000,body:new ReadableStream({pull(controller){pulls++;controller.enqueue(new Uint8Array(64_000));},cancel(){cancelled=true;}},{highWaterMark:0})}));
    env.PHOTOS.get=get as any;
    const response=await api(context("/api/admin/archive"));expect(get).not.toHaveBeenCalled();
    const reader=response.body!.getReader();
    while(!get.mock.calls.length)await reader.read();
    expect(pulls).toBe(0);await reader.read();expect(pulls).toBe(1);
    await new Promise(resolve=>setTimeout(resolve,0));expect(pulls).toBe(1);
    await reader.cancel();expect(cancelled).toBe(true);
  });
});

it("paginates search, timeline and person memories without losing results",async()=>{
  db.exec("INSERT INTO family_people(id,first_name,created_by) VALUES('person','Person','a')");
  for(let i=0;i<125;i++){
    const id=`p${String(i).padStart(3,"0")}`;
    db.prepare("INSERT INTO photos(id,owner_id,original_filename,mime_type,status,caption,date_taken) VALUES(?,'a','p.jpg','image/jpeg','ready','Reunion','2025-12-25')").run(id);
    db.prepare("INSERT INTO photo_people(photo_id,person_id,tagged_by) VALUES(?,'person','a')").run(id);
  }
  for(let i=0;i<25;i++)db.prepare("INSERT INTO albums(id,name,owner_id) VALUES(?,'Reunion','a')").run(`album${i}`);
  for(const path of ["/api/timeline","/api/family-tree/people/person/photos","/api/search?q=Reunion"]){
    const first=await (await api(context(path))).json() as any;
    expect(first.photos).toHaveLength(100);expect(first.nextCursor).toBeTruthy();
    const last=await (await api(context(`${path}${path.includes("?") ? "&" : "?"}cursor=${first.nextCursor}`))).json() as any;
    expect(last.photos).toHaveLength(25);expect(last.nextCursor).toBeNull();
    expect(new Set([...first.photos,...last.photos].map((photo:any)=>photo.id)).size).toBe(125);
    if(path.includes("search")){expect(first.total).toBe(150);expect(first.albums).toHaveLength(20);expect(last.albums).toHaveLength(5);}
  }
});

describe('private collection sharing and admin email',()=>{
  const batchId='park-collection-123456';
  const member={id:'b',email:'b@x.co',displayName:'B',role:'member' as const};
  async function create(visibility='family',albumId?:string){
    const response=await api(context('/api/upload-batches',{id:batchId,title:'Day at the park',visibility,albumId}));
    return await response.json() as {id:string;albumId:string};
  }
  function picture(id:string,albumId:string,batch=true){
    db.prepare("INSERT INTO photos(id,owner_id,original_filename,mime_type,status) VALUES(?,'a','p.jpg','image/jpeg','ready')").run(id);
    db.prepare("INSERT INTO album_photos(album_id,photo_id,added_by) VALUES(?,?,'a')").run(albumId,id);
    if(batch)db.prepare('INSERT INTO upload_batch_photos(batch_id,photo_id) VALUES(?,?)').run(batchId,id);
  }
  function configureMail(){
    env.ADMIN_UPLOAD_EMAIL='admin@example.com';env.SMTP_USER='sender@example.com';env.SMTP_PASSWORD='test-only';env.PUBLIC_APP_URL='https://family-vault.cipher126.workers.dev';
    db.exec("UPDATE users SET email='admin@example.com' WHERE id='a'");
  }
  it('lets any authorized family member find and reshare old collections without sending another email',async()=>{
    const batch=await create();picture('saved-picture',batch.albumId);
    await api(context(`/api/upload-batches/${batchId}/complete`,{}));
    db.exec("UPDATE upload_batches SET completed_at='2000-01-01 12:00:00'; INSERT INTO albums(id,name,owner_id,visibility) VALUES('private','Private','a','private'); INSERT INTO upload_batches(id,title,owner_id,album_id,completed_at) VALUES('private-batch','Private','a','private',datetime('now')),('draft-batch','Draft','a','private',NULL)");
    const data=await (await api(context('/api/upload-batches',undefined,member))).json() as any;
    expect(data.collections.map((item:any)=>item.id)).toEqual([batchId]);
    expect(data.collections[0].thumbnail_photo_id).toBe('saved-picture');expect(data.collections[0].photo_count).toBe(1);
    expect((await api(context(`/api/upload-batches/${batchId}`,undefined,member))).status).toBe(200);
    expect(sendSmtpEmail).not.toHaveBeenCalled();
    await expect(api(context('/api/upload-batches',undefined,null))).rejects.toMatchObject({status:401});
  });
  it('keeps all collection history available through pagination',async()=>{
    db.exec("INSERT INTO albums(id,name,owner_id) VALUES('shared-history','History','a')");
    for(let index=0;index<105;index++)db.prepare("INSERT INTO upload_batches(id,title,owner_id,album_id,completed_at) VALUES(?,'Old collection','a','shared-history','2000-01-01 12:00:00')").run(`saved-collection-${String(index).padStart(3,'0')}`);
    const first=await (await api(context('/api/upload-batches',undefined,member))).json() as any;
    expect(first.collections).toHaveLength(100);expect(first.nextCursor).toBe('100');
    const next=await (await api(context(`/api/upload-batches?cursor=${first.nextCursor}`,undefined,member))).json() as any;
    expect(next.collections).toHaveLength(5);expect(next.nextCursor).toBeNull();
    expect(new Set([...first.collections,...next.collections].map((item:any)=>item.id)).size).toBe(105);
  });
  it('gives one exact upload collection a link even inside an older album',async()=>{
    db.exec("INSERT INTO albums(id,name,owner_id) VALUES('old-album','Old album','a')");
    const batch=await create('family','old-album');picture('older-picture',batch.albumId,false);picture('new-picture',batch.albumId);
    const finished=await (await api(context(`/api/upload-batches/${batchId}/complete`,{}))).json() as any;
    expect(finished.path).toBe(`/collections/${batchId}`);
    const page=await (await api(context(`/api/photos?batch=${batchId}`,undefined,member))).json() as any;
    expect(page.photos.map((item:any)=>item.id)).toEqual(['new-picture']);
    expect((await api(context(`/api/photos/new-picture`,undefined,member))).status).toBe(200);
    await expect(api(context(`/api/upload-batches/${batchId}`,undefined,null))).rejects.toMatchObject({status:401});
  });
  it('keeps private collection and photo links private and sends no email',async()=>{
    configureMail();const send=vi.mocked(sendSmtpEmail);
    const batch=await create('private');picture('private-photo',batch.albumId);
    await api(context(`/api/upload-batches/${batchId}/complete`,{}));
    await expect(api(context(`/api/upload-batches/${batchId}`,undefined,member))).rejects.toMatchObject({status:404});
    await expect(api(context('/api/photos/private-photo',undefined,member))).rejects.toMatchObject({status:404});
    expect(send).not.toHaveBeenCalled();expect(db.prepare('SELECT email_state FROM upload_batches').get()?.email_state).toBe('private');
  });
  it('creates one collection/album when a creation request is retried',async()=>{
    const first=await create();const second=await create();expect(second.id).toBe(first.id);
    expect(db.prepare('SELECT COUNT(*) total FROM upload_batches').get()?.total).toBe(1);
    expect(db.prepare('SELECT COUNT(*) total FROM albums').get()?.total).toBe(1);
    await expect(api(context('/api/upload-batches',{id:batchId,title:'Hijack'},member))).rejects.toMatchObject({status:404});
  });
  it('emails only the configured active admin once, with secure and WhatsApp links',async()=>{
    configureMail();const send=vi.mocked(sendSmtpEmail).mockResolvedValue({id:'email-id'});
    const batch=await create();picture('p',batch.albumId);
    await api(context(`/api/upload-batches/${batchId}/complete`,{}));await api(context(`/api/upload-batches/${batchId}/complete`,{}));
    expect(send).toHaveBeenCalledTimes(1);
    const payload=send.mock.calls[0][1];
    expect(payload.to).toBe('admin@example.com');expect(payload.text).toContain(`https://family-vault.cipher126.workers.dev/collections/${batchId}`);expect(payload.text).toContain('https://wa.me/');
    expect(db.prepare('SELECT email_provider_id FROM upload_batches').get()?.email_provider_id).toBe('email-id');
  });
  it('keeps a durable pending notification while email is unconfigured',async()=>{
    const send=vi.mocked(sendSmtpEmail);const batch=await create();picture('p',batch.albumId);
    await api(context(`/api/upload-batches/${batchId}/complete`,{}));
    expect(db.prepare('SELECT email_state FROM upload_batches').get()?.email_state).toBe('pending');expect(send).not.toHaveBeenCalled();
    configureMail();send.mockResolvedValue({id:'later'});
    db.exec("UPDATE upload_batches SET email_next_attempt_at=datetime('now','-1 minute')");await retryUploadEmails(env);expect(send).toHaveBeenCalledTimes(1);
  });
  it('retries SMTP failures using the same message identity',async()=>{
    configureMail();const send=vi.mocked(sendSmtpEmail).mockRejectedValueOnce(new Error('SMTP unavailable')).mockResolvedValueOnce({id:'retry'});
    const batch=await create();picture('p',batch.albumId);await api(context(`/api/upload-batches/${batchId}/complete`,{}));
    db.exec("UPDATE upload_batches SET email_next_attempt_at=datetime('now','-1 minute')");await deliverUploadEmail(env,batchId);
    expect(send.mock.calls[0][1].id).toBe(send.mock.calls[1][1].id);
    expect(db.prepare('SELECT email_attempts FROM upload_batches').get()?.email_attempts).toBe(2);
  });
  it('does not email the configured address if its admin access was revoked',async()=>{
    configureMail();db.exec("UPDATE users SET status='revoked' WHERE id='a'");const send=vi.mocked(sendSmtpEmail);
    const batch=await create();picture('p',batch.albumId);await api(context(`/api/upload-batches/${batchId}/complete`,{}));expect(send).not.toHaveBeenCalled();
  });
});
