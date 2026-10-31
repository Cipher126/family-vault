import {DatabaseSync} from "node:sqlite";
import {readFileSync,readdirSync} from "node:fs";
import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import {api,serveAuthenticatedPhoto} from "../worker/routes/api";
import {currentUser,createSession} from "../worker/lib/auth";
import {readJson} from "../worker/lib/http";
import {rateLimit} from "../worker/lib/rate-limit";
import {sha256,verifyPassword} from "../worker/lib/security";
import {photoAccessPredicate} from "../worker/lib/photo-access";
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
afterEach(()=>{db.close();vi.restoreAllMocks();});

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
