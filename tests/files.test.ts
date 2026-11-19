import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {api} from '../worker/routes/api';
import {createSession} from '../worker/lib/auth';
import {cleanupFiles} from '../worker/routes/files';
import type {Env,RequestContext,AuthUser} from '../worker/types';

let db:DatabaseSync,env:Env;
const owner:AuthUser={id:'a',email:'a@x.co',displayName:'A',role:'admin'},member:AuthUser={id:'b',email:'b@x.co',displayName:'B',role:'member'};
function statement(sql:string,values:unknown[]=[]):any{
  const params=()=>values as Array<string|number|null>;
  return {sql,values,bind:(...args:unknown[])=>statement(sql,args),first:async()=>db.prepare(sql).get(...params())??null,
    all:async()=>({results:db.prepare(sql).all(...params())}),run:async()=>({meta:{changes:Number(db.prepare(sql).run(...params()).changes)}})};
}
function ctx(path:string,method='GET',body?:unknown,user:AuthUser|null=owner,cookie?:string):RequestContext{
  const headers:Record<string,string>={};if(cookie)headers.Cookie=cookie;
  if(body!==undefined)headers['Content-Type']='application/json';
  const request=new Request(`https://vault${path}`,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});
  return {env,request,user,url:new URL(request.url)};
}
const call=async(path:string,method='GET',body?:unknown,user:AuthUser|null=owner,cookie?:string)=>await (await api(ctx(path,method,body,user,cookie))).json() as any;
beforeEach(()=>{
  db=new DatabaseSync(':memory:');const directory=new URL('../db/migrations/',import.meta.url);
  for(const file of readdirSync(directory).filter(name=>name.endsWith('.sql')).sort())db.exec(readFileSync(new URL(file,directory),'utf8'));
  env={DB:{prepare:statement,batch:async(items:any[])=>{db.exec('BEGIN');try{const results=items.map(item=>({meta:{changes:Number(db.prepare(item.sql).run(...item.values).changes)}}));db.exec('COMMIT');return results;}catch(error){db.exec('ROLLBACK');throw error;}}},PHOTOS:{put:vi.fn(async(_key:string,body:ReadableStream)=>({size:(await new Response(body).arrayBuffer()).byteLength})),get:vi.fn(async()=>({body:new Response(new Uint8Array([1,2,3])).body,size:3})),delete:vi.fn(async()=>undefined)},APP_ENV:'production'} as unknown as Env;
  db.exec("INSERT INTO users(id,email,display_name,password_hash,role) VALUES('a','a@x.co','A','old','admin'),('b','b@x.co','B','old','member')");
});
afterEach(()=>{db.close();vi.restoreAllMocks();});
async function folder(password='StrongFolder1'){return (await call('/api/file-folders','POST',{name:'Documents',password})).folder;}
async function reserve(folderId:string|null=null,id='test-document-upload-001',user=owner,cookie?:string){return call('/api/files','POST',{id,name:'Family document.pdf',size:3,folderId},user,cookie);}
async function upload(id:string,user=owner,cookie?:string){
  const request=new Request(`https://vault/api/files/${id}/content`,{method:'PUT',headers:{'Content-Length':'3',...(cookie?{Cookie:cookie}:{})},body:new Uint8Array([1,2,3])});
  return api({env,request,url:new URL(request.url),user});
}
it('requires sign-in and rejects cross-origin folder mutations',async()=>{
  await expect(call('/api/files','GET',undefined,null)).rejects.toMatchObject({status:401});
  const context=ctx('/api/file-folders','POST',{name:'Docs'});context.request.headers.set('Origin','https://attacker');
  await expect(api(context)).rejects.toMatchObject({status:403});
});
it('keeps protected contents hidden through lists, direct links, download, and upload until this session unlocks',async()=>{
  const protectedFolder=await folder(),reserved=await reserve(protectedFolder.id);await upload(reserved.id);
  const cookie=(await createSession(new Request('https://vault'),env,member.id)).split(';')[0];
  expect((await call('/api/file-folders','GET',undefined,member,cookie)).folders[0]).toMatchObject({locked:true,protected:true});
  expect(JSON.stringify(await call('/api/file-folders'))).not.toContain('password_hash');
  const listing=await call(`/api/files?folder=${protectedFolder.id}`,'GET',undefined,member,cookie);
  expect(listing.files).toEqual([]);expect(listing.total).toBe(0);
  expect((await call(`/api/files/${reserved.id}`,'GET',undefined,member,cookie)).file).toBeNull();
  await expect(call(`/api/files/${reserved.id}/download`,'GET',undefined,member,cookie)).rejects.toMatchObject({status:423});
  await expect(reserve(protectedFolder.id,'member-upload-document-01',member,cookie)).rejects.toMatchObject({status:423});
  await expect(call(`/api/file-folders/${protectedFolder.id}/unlock`,'POST',{password:'WrongPassword1'},member,cookie)).rejects.toMatchObject({status:403});
  await call(`/api/file-folders/${protectedFolder.id}/unlock`,'POST',{password:'StrongFolder1'},member,cookie);
  expect((await call(`/api/files?folder=${protectedFolder.id}`,'GET',undefined,member,cookie)).files).toHaveLength(1);
  const anotherCookie=(await createSession(new Request('https://vault'),env,member.id)).split(';')[0];
  expect((await call(`/api/files/${reserved.id}`,'GET',undefined,member,anotherCookie)).file).toBeNull();
  await reserve(protectedFolder.id,'member-upload-document-01',member,cookie);
  await call(`/api/file-folders/${protectedFolder.id}/lock`,'POST',{},member,cookie);
  expect((await call(`/api/files/${reserved.id}`,'GET',undefined,member,cookie)).file).toBeNull();
});
it('invalidates unlocks on password changes and prevents members changing someone else’s folder',async()=>{
  const item=await folder(),cookie=(await createSession(new Request('https://vault'),env,member.id)).split(';')[0];
  await call(`/api/file-folders/${item.id}/unlock`,'POST',{password:'StrongFolder1'},member,cookie);
  await expect(call(`/api/file-folders/${item.id}`,'PATCH',{name:'Hijacked',password:''},member,cookie)).rejects.toMatchObject({status:403});
  await call(`/api/file-folders/${item.id}`,'PATCH',{name:'Renamed',password:'NewPassword123'});
  expect((await call(`/api/files?folder=${item.id}`,'GET',undefined,member,cookie)).folder.locked).toBe(true);
  expect(db.prepare('SELECT COUNT(*) total FROM folder_unlocks').get()?.total).toBe(0);
});
it('keeps an upload invisible until R2 accepts all bytes and makes retries reuse one file',async()=>{
  const reserved=await reserve();expect((await call('/api/files')).files).toHaveLength(0);
  await upload(reserved.id);await upload(reserved.id);await reserve();
  expect(env.PHOTOS.put).toHaveBeenCalledTimes(1);
  expect((await call('/api/files')).files).toHaveLength(1);
  const response=await api(ctx(`/api/files/${reserved.id}/download`));
  expect(response.headers.get('Content-Type')).toBe('application/octet-stream');
  expect(response.headers.get('Content-Disposition')).toContain('attachment;');
  expect(response.headers.get('Cache-Control')).toBe('private, no-store');
  expect((await call(`/api/files/${reserved.id}`)).file.object_key).toBeUndefined();
});
it('counts photo reservations and files against one atomic quota, rejects oversized and executable files',async()=>{
  db.exec("UPDATE application_settings SET value='5' WHERE key='storage_quota_bytes'");
  await reserve();await expect(reserve(null,'another-file-upload-123')).rejects.toMatchObject({status:413});
  await expect(call('/api/files','POST',{id:'large-file-upload-001',name:'large.zip',size:52428801})).rejects.toMatchObject({status:413});
  await expect(call('/api/files','POST',{id:'unsafe-file-upload-001',name:'danger.html',size:3})).rejects.toMatchObject({status:415});
  db.exec("DELETE FROM shared_files; INSERT INTO photos(id,owner_id,original_filename,mime_type,expected_gallery_bytes,upload_expires_at) VALUES('p','a','p.jpg','image/jpeg',4,datetime('now','+1 hour'))");
  await expect(reserve()).rejects.toMatchObject({status:413});
});
it('denies file deletion to other members and retries interrupted R2 deletions',async()=>{
  const reserved=await reserve();await upload(reserved.id);
  await expect(call(`/api/files/${reserved.id}`,'DELETE',undefined,member)).rejects.toMatchObject({status:403});
  vi.mocked(env.PHOTOS.delete).mockRejectedValueOnce(new Error('R2 unavailable'));
  await expect(call(`/api/files/${reserved.id}`,'DELETE')).rejects.toThrow('R2 unavailable');
  expect((await call('/api/files')).files).toHaveLength(0);await cleanupFiles(env);
  expect(db.prepare('SELECT * FROM shared_files').all()).toHaveLength(0);
});
it('bounds wrong-password attempts and cleans abandoned uploads',async()=>{
  const item=await folder(),cookie=(await createSession(new Request('https://vault'),env,member.id)).split(';')[0];
  for(let i=0;i<8;i++)await expect(call(`/api/file-folders/${item.id}/unlock`,'POST',{password:'WrongPassword1'},member,cookie)).rejects.toMatchObject({status:403});
  await expect(call(`/api/file-folders/${item.id}/unlock`,'POST',{password:'StrongFolder1'},member,cookie)).rejects.toMatchObject({status:429});
  await reserve();db.exec("UPDATE shared_files SET expires_at=datetime('now','-3 hours')");await cleanupFiles(env);
  expect(db.prepare('SELECT * FROM shared_files').all()).toHaveLength(0);expect(env.PHOTOS.delete).toHaveBeenCalledTimes(1);
});
it('includes files in storage totals and admin archives without exporting folder password hashes',async()=>{
  const item=await folder(),reserved=await reserve(item.id);await upload(reserved.id);
  const storage=await call('/api/admin/storage');expect(storage.file_count).toBe(1);expect(storage.total_bytes).toBe(3);
  const metadata=await call('/api/admin/export');expect(metadata.sharedFiles).toHaveLength(1);expect(metadata.fileFolders[0].password_protected).toBe(1);expect(JSON.stringify(metadata)).not.toContain('password_hash');
  const archive=await api(ctx('/api/admin/archive'));const text=new TextDecoder().decode(await archive.arrayBuffer());expect(text).toContain(`files/${reserved.id}-Family document.pdf`);
});
