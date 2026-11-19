import {requireUser,sessionTokenHash} from '../lib/auth';
import {HttpError,json,readJson} from '../lib/http';
import {cleanText,hashPassword,verifyPassword,uuid} from '../lib/security';
import {rateLimit} from '../lib/rate-limit';
import {reservedStorageSql} from '../lib/file-storage';
import {collectionOffset} from '../lib/pagination';
import type {Env,RequestContext} from '../types';

const MAX_BYTES=50*1024*1024;
type Folder={id:string;name:string;owner_id:string;password_hash:string|null;password_version:number};
type StoredFile={id:string;name:string;owner_id:string;folder_id:string|null;mime_type:string;size:number;object_key:string;status:string;created_at:string;uploader?:string};
const fileColumns='f.id,f.name,f.owner_id,f.folder_id,f.mime_type,f.size,f.created_at,u.display_name uploader';
const extensions=new Set('pdf txt csv doc docx xls xlsx ppt pptx odt ods odp rtf pages numbers key zip 7z rar tar gz mp3 m4a wav ogg aac flac mp4 mov webm m4v avi jpg jpeg png webp heic heif gif'.split(' '));

function publicFolder(folder:Folder,locked:boolean){return {id:folder.id,name:folder.name,owner_id:folder.owner_id,protected:!!folder.password_hash,locked};}
function publicFile(file:StoredFile){const {object_key:_key,status:_status,...safe}=file;return safe;}
async function folderById(env:Env,id:string):Promise<Folder>{
  const folder=await env.DB.prepare('SELECT * FROM file_folders WHERE id=?').bind(id).first<Folder>();
  if(!folder)throw new HttpError(404,'Folder not found.');return folder;
}
async function canOpen(ctx:RequestContext,folder:Folder):Promise<boolean>{
  if(!folder.password_hash || folder.owner_id===ctx.user!.id)return true;
  const session=await sessionTokenHash(ctx.request);if(!session)return false;
  return !!await ctx.env.DB.prepare(`SELECT 1 FROM folder_unlocks g JOIN sessions s ON s.id_hash=g.session_hash
    WHERE g.folder_id=? AND g.session_hash=? AND g.password_version=? AND s.user_id=?
    AND julianday(g.expires_at)>julianday('now') AND julianday(s.expires_at)>julianday('now')`)
    .bind(folder.id,session,folder.password_version,ctx.user!.id).first();
}
async function assertFolder(ctx:RequestContext,id:string|null){
  if(!id)return;const folder=await folderById(ctx.env,id);
  if(!await canOpen(ctx,folder))throw new HttpError(423,'Unlock this folder first.');
}
function passwordInput(value:unknown):string{
  if(typeof value!=='string' || value.length>128 || (value.length>0 && value.length<8))throw new HttpError(400,'Use a folder password of 8–128 characters, or leave it empty.');return value;
}
async function log(ctx:RequestContext,action:string,id:string){await ctx.env.DB.prepare('INSERT INTO audit_logs(id,actor_id,action,target_type,target_id) VALUES(?,?,?,?,?)').bind(uuid(),ctx.user!.id,action,'file',id).run();}

export async function fileRoutes(ctx:RequestContext):Promise<Response|null>{
  const {env,user,request,url}=ctx,method=request.method,path=url.pathname;
  if(!path.startsWith('/api/files') && !path.startsWith('/api/file-folders'))return null;
  requireUser(user);
  if(path==='/api/file-folders' && method==='GET'){
    const offset=collectionOffset(url);
    const rows=await env.DB.prepare(`SELECT f.*, (f.password_hash IS NULL OR f.owner_id=? OR EXISTS(
      SELECT 1 FROM folder_unlocks g JOIN sessions s ON s.id_hash=g.session_hash
      WHERE g.folder_id=f.id AND g.session_hash=? AND g.password_version=f.password_version AND s.user_id=?
      AND julianday(g.expires_at)>julianday('now') AND julianday(s.expires_at)>julianday('now'))) unlocked
      FROM file_folders f ORDER BY f.created_at DESC,f.id DESC LIMIT 101 OFFSET ?`)
      .bind(user!.id,await sessionTokenHash(request),user!.id,offset).all<Folder&{unlocked:number}>();
    return json({folders:rows.results.slice(0,100).map(folder=>publicFolder(folder,!folder.unlocked)),nextCursor:rows.results.length>100 ? String(offset+100) : null});
  }
  if(path==='/api/file-folders' && method==='POST'){
    await rateLimit(env,request,`file-folder:${user!.id}`,30,60);
    const body=await readJson<Record<string,unknown>>(request),name=cleanText(body.name,100),password=passwordInput(body.password??'');
    if(!name)throw new HttpError(400,'Enter a folder name.');
    const id=uuid();await env.DB.prepare('INSERT INTO file_folders(id,name,owner_id,password_hash) VALUES(?,?,?,?)').bind(id,name,user!.id,password ? await hashPassword(password) : null).run();
    return json({folder:publicFolder(await folderById(env,id),false)},{status:201});
  }
  const folderMatch=path.match(/^\/api\/file-folders\/([^/]+)(?:\/(unlock|lock))?$/);
  if(folderMatch){
    const folder=await folderById(env,folderMatch[1]);
    if(method==='POST' && folderMatch[2]==='unlock'){
      await rateLimit(env,request,`folder-unlock:${folder.id}:${user!.id}`,8,15);
      const body=await readJson<Record<string,unknown>>(request),password=passwordInput(body.password);
      if(folder.password_hash && folder.owner_id!==user!.id && !await verifyPassword(password,folder.password_hash))throw new HttpError(403,'Incorrect folder password.');
      const session=await sessionTokenHash(request);if(!session)throw new HttpError(401,'Please sign in again.');
      // Read the version again atomically: changing a password invalidates an in-flight unlock.
      const result=await env.DB.prepare(`INSERT INTO folder_unlocks(folder_id,session_hash,password_version,expires_at)
        SELECT id,?,password_version,datetime('now','+12 hours') FROM file_folders WHERE id=? AND password_version=?
        ON CONFLICT(folder_id,session_hash) DO UPDATE SET password_version=excluded.password_version,expires_at=excluded.expires_at`)
        .bind(session,folder.id,folder.password_version).run();
      if(!result.meta.changes)throw new HttpError(409,'Folder password changed. Please try again.');
      return json({ok:true});
    }
    if(method==='POST' && folderMatch[2]==='lock'){
      await env.DB.prepare('DELETE FROM folder_unlocks WHERE folder_id=? AND session_hash=?').bind(folder.id,await sessionTokenHash(request)).run();return json({ok:true});
    }
    if(!folderMatch[2] && (method==='PATCH' || method==='DELETE')){
      if(folder.owner_id!==user!.id)throw new HttpError(403,'Only the folder owner can change this folder.');
      if(method==='DELETE'){
        const result=await env.DB.prepare('DELETE FROM file_folders WHERE id=? AND NOT EXISTS(SELECT 1 FROM shared_files WHERE folder_id=?)').bind(folder.id,folder.id).run();
        if(!result.meta.changes)throw new HttpError(409,'Delete the files in this folder first.');return json({ok:true});
      }
      const body=await readJson<Record<string,unknown>>(request),name=cleanText(body.name,100);
      if(!name)throw new HttpError(400,'Enter a folder name.');
      if(body.password===undefined)await env.DB.prepare('UPDATE file_folders SET name=? WHERE id=?').bind(name,folder.id).run();
      else{
        const password=passwordInput(body.password);
        await env.DB.batch([env.DB.prepare('UPDATE file_folders SET name=?,password_hash=?,password_version=password_version+1 WHERE id=?').bind(name,password ? await hashPassword(password) : null,folder.id),env.DB.prepare('DELETE FROM folder_unlocks WHERE folder_id=?').bind(folder.id)]);
      }
      return json({ok:true});
    }
  }
  if(path==='/api/files' && method==='GET'){
    const folderId=url.searchParams.get('folder'),folder=folderId ? await folderById(env,folderId) : null;
    if(folder && !await canOpen(ctx,folder))return json({folder:publicFolder(folder,true),files:[],nextCursor:null,total:0});
    const offset=collectionOffset(url);
    const [rows,count]=await Promise.all([
      env.DB.prepare(`SELECT ${fileColumns} FROM shared_files f JOIN users u ON u.id=f.owner_id WHERE f.status='ready' AND f.folder_id IS ? ORDER BY f.created_at DESC,f.id DESC LIMIT 101 OFFSET ?`).bind(folderId,offset).all(),
      env.DB.prepare("SELECT COUNT(*) total FROM shared_files WHERE status='ready' AND folder_id IS ?").bind(folderId).first<{total:number}>()
    ]);
    return json({folder:folder ? publicFolder(folder,false) : null,files:rows.results.slice(0,100),nextCursor:rows.results.length>100 ? String(offset+100) : null,total:count?.total??0});
  }
  if(path==='/api/files' && method==='POST'){
    await rateLimit(env,request,`file-upload:${user!.id}`,120,60);
    const body=await readJson<Record<string,unknown>>(request),id=cleanText(body.id,64),name=cleanText(body.name,180).replace(/[\\/\u0000-\u001f\u007f]/g,'_');
    const size=Number(body.size),folderId=typeof body.folderId==='string' && body.folderId ? body.folderId : null;
    if(!/^[a-zA-Z0-9_-]{16,64}$/.test(id) || !name)throw new HttpError(400,'Invalid file name or upload identifier.');
    if(!extensions.has(name.split('.').pop()!.toLowerCase()))throw new HttpError(415,'Choose a document, audio, video, image, or archive file.');
    if(!Number.isSafeInteger(size) || size<=0 || size>MAX_BYTES)throw new HttpError(413,'Files must be between 1 byte and 50 MB.');
    await assertFolder(ctx,folderId);
    const existing=await env.DB.prepare('SELECT * FROM shared_files WHERE id=?').bind(id).first<StoredFile>();
    if(existing){
      if(existing.owner_id!==user!.id || existing.size!==size || existing.name!==name || existing.folder_id!==folderId)throw new HttpError(409,'Start a new file upload.');
      return json({id,ready:existing.status==='ready',uploadPath:`/api/files/${id}/content`});
    }
    const quota=Number((await env.DB.prepare("SELECT value FROM application_settings WHERE key='storage_quota_bytes'").first<{value:string}>())?.value||8_589_934_592);
    const result=await env.DB.prepare(`INSERT INTO shared_files(id,owner_id,folder_id,name,mime_type,size,object_key)
      SELECT ?,?,?,?,?,?,? WHERE (${reservedStorageSql})+?<=?`)
      .bind(id,user!.id,folderId,name,'application/octet-stream',size,`files/${id}`,size,quota).run();
    if(!result.meta.changes)throw new HttpError(413,'The family storage quota would be exceeded.');
    return json({id,ready:false,uploadPath:`/api/files/${id}/content`},{status:201});
  }
  const match=path.match(/^\/api\/files\/([^/]+)(?:\/(content|download))?$/);
  if(!match)return null;
  const file=await env.DB.prepare('SELECT f.*,u.display_name uploader FROM shared_files f JOIN users u ON u.id=f.owner_id WHERE f.id=?').bind(match[1]).first<StoredFile>();
  if(!file)throw new HttpError(404,'File not found.');
  if(method==='GET' && !match[2] && file.status==='ready'){
    const folder=file.folder_id ? await folderById(env,file.folder_id) : null;
    if(folder && !await canOpen(ctx,folder))return json({file:null,folder:publicFolder(folder,true)});
    return json({file:publicFile(file),folder:folder ? publicFolder(folder,false) : null});
  }
  await assertFolder(ctx,file.folder_id);
  if(method==='PUT' && match[2]==='content'){
    if(file.owner_id!==user!.id)throw new HttpError(404,'Upload not found.');
    if(file.status==='ready')return json({ok:true});
    const length=Number(request.headers.get('Content-Length'));
    if(!request.body || length!==file.size)throw new HttpError(413,'File size does not match its upload reservation.');
    const claim=await env.DB.prepare("UPDATE shared_files SET status='uploading' WHERE id=? AND status='pending' AND expires_at>datetime('now')").bind(file.id).run();
    if(!claim.meta.changes)throw new HttpError(409,'Upload is in progress or expired. Start a new upload if it has expired.');
    try{
      const object=await env.PHOTOS.put(file.object_key,request.body,{httpMetadata:{contentType:'application/octet-stream'},customMetadata:{ownerId:file.owner_id,fileId:file.id}});
      if(!object || object.size!==file.size)throw new HttpError(413,'Uploaded file size did not match.');
      await assertFolder(ctx,file.folder_id);
      const result=await env.DB.prepare("UPDATE shared_files SET status='ready' WHERE id=? AND status='uploading' AND expires_at>datetime('now')").bind(file.id).run();
      if(!result.meta.changes)throw new HttpError(409,'Upload expired. Please try again.');
    }catch(error){
      await env.PHOTOS.delete(file.object_key);
      await env.DB.prepare("UPDATE shared_files SET status='pending' WHERE id=? AND status='uploading'").bind(file.id).run();throw error;
    }
    await log(ctx,'file.uploaded',file.id);return json({ok:true});
  }
  if(method==='GET' && match[2]==='download' && file.status==='ready'){
    const object=await env.PHOTOS.get(file.object_key);if(!object)throw new HttpError(404,'File is unavailable.');
    const ascii=file.name.replace(/[^a-zA-Z0-9._ -]/g,'_');
    return new Response(object.body,{headers:{'Content-Type':'application/octet-stream','Content-Length':String(object.size),
      'Content-Disposition':`attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(file.name).replace(/['()*]/g,c=>'%'+c.charCodeAt(0).toString(16))}`,
      'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox"}});
  }
  if(method==='DELETE' && !match[2]){
    if(file.owner_id!==user!.id && user!.role!=='admin')throw new HttpError(403,'Only the uploader or administrator can delete this file.');
    const claimed=await env.DB.prepare("UPDATE shared_files SET status='deleting' WHERE id=? AND status IN ('ready','pending','deleting')").bind(file.id).run();
    if(!claimed.meta.changes)throw new HttpError(409,'Wait for this upload to finish.');
    await env.PHOTOS.delete(file.object_key);await env.DB.prepare("DELETE FROM shared_files WHERE id=? AND status='deleting'").bind(file.id).run();
    await log(ctx,'file.deleted',file.id);return json({ok:true});
  }
  throw new HttpError(404,'File not found.');
}

export async function cleanupFiles(env:Env):Promise<void>{
  // Deleting is durable: interrupted deletions and abandoned uploads are retried.
  const rows=await env.DB.prepare("SELECT id,object_key FROM shared_files WHERE status='deleting' OR (status IN ('pending','uploading') AND expires_at<datetime('now','-1 hour')) LIMIT 25").all<{id:string;object_key:string}>();
  for(const row of rows.results){
    const result=await env.DB.prepare("UPDATE shared_files SET status='deleting' WHERE id=? AND (status='deleting' OR (status IN ('pending','uploading') AND expires_at<datetime('now','-1 hour')))").bind(row.id).run();
    if(!result.meta.changes)continue;
    await env.PHOTOS.delete(row.object_key);await env.DB.prepare("DELETE FROM shared_files WHERE id=? AND status='deleting'").bind(row.id).run();
  }
  await env.DB.prepare("DELETE FROM folder_unlocks WHERE julianday(expires_at)<=julianday('now')").run();
}
