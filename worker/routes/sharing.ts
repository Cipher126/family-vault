import type {RequestContext} from '../types';
import {cleanText} from '../lib/security';
import {HttpError,json,readJson} from '../lib/http';
import {photoAccessPredicate} from '../lib/photo-access';
import {deliverUploadEmail} from '../lib/upload-email';
import {rateLimit} from '../lib/rate-limit';
import {collectionOffset} from '../lib/pagination';

export async function listUploadBatches({env,user,url}:RequestContext):Promise<Response> {
  const offset=collectionOffset(url);
  const access=photoAccessPredicate('p','viewer.id','viewer.role');
  const rows=await env.DB.prepare(`SELECT b.id,b.title,b.owner_id,b.completed_at,COALESCE(a.visibility,'private') visibility,u.display_name uploader,
    (SELECT COUNT(*) FROM upload_batch_photos bp JOIN photos p ON p.id=bp.photo_id WHERE bp.batch_id=b.id AND p.status='ready' AND ${access}) photo_count,
    (SELECT p.id FROM upload_batch_photos bp JOIN photos p ON p.id=bp.photo_id WHERE bp.batch_id=b.id AND p.status='ready' AND ${access} ORDER BY p.created_at DESC,p.id DESC LIMIT 1) thumbnail_photo_id
    FROM upload_batches b JOIN users u ON u.id=b.owner_id LEFT JOIN albums a ON a.id=b.album_id CROSS JOIN (SELECT ? id,? role) viewer
    WHERE b.completed_at IS NOT NULL AND (b.owner_id=viewer.id OR viewer.role='admin' OR a.visibility='family')
    ORDER BY b.completed_at DESC,b.id DESC LIMIT 101 OFFSET ?`).bind(user!.id,user!.role,offset).all();
  return json({collections:rows.results.slice(0,100),nextCursor:rows.results.length>100 ? String(offset+100) : null});
}

export async function createUploadBatch({env,user,request}:RequestContext):Promise<Response> {
  const body=await readJson<Record<string,unknown>>(request);
  const id=cleanText(body.id,64),title=cleanText(body.title,100),existingAlbum=cleanText(body.albumId,64);
  if(!/^[a-zA-Z0-9_-]{16,64}$/.test(id) || !title)throw new HttpError(400,'Give this collection a name.');
  const previous=await env.DB.prepare('SELECT id,owner_id,album_id FROM upload_batches WHERE id=?').bind(id).first<{id:string;owner_id:string;album_id:string}>();
  if(previous){if(previous.owner_id!==user!.id)throw new HttpError(404,'Collection not found.');return json({id:previous.id,albumId:previous.album_id});}
  let albumId=existingAlbum;
  if(albumId){
    const album=await env.DB.prepare('SELECT owner_id,visibility FROM albums WHERE id=?').bind(albumId).first<{owner_id:string;visibility:string}>();
    if(!album || (album.visibility!=='family' && album.owner_id!==user!.id))throw new HttpError(404,'Album not found.');
  }else{
    const policy=await env.DB.prepare("SELECT value FROM application_settings WHERE key='members_can_create_albums'").first<{value:string}>();
    if(user!.role!=='admin' && policy?.value==='false')throw new HttpError(403,'Choose an existing album; only administrators can create new albums.');
    albumId=`collection-${id}`;
  }
  await env.DB.batch([
    ...(!existingAlbum ? [env.DB.prepare('INSERT OR IGNORE INTO albums(id,name,visibility,owner_id) VALUES(?,?,?,?)').bind(albumId,title,body.visibility==='private' ? 'private' : 'family',user!.id)] : []),
    env.DB.prepare('INSERT OR IGNORE INTO upload_batches(id,title,owner_id,album_id) VALUES(?,?,?,?)').bind(id,title,user!.id,albumId)
  ]);
  return json({id,albumId},{status:201});
}

export async function getUploadBatch({env,user}:RequestContext,id:string):Promise<Response> {
  const batch=await env.DB.prepare(`SELECT b.id,b.title,b.owner_id,b.album_id,b.created_at,b.completed_at,COALESCE(a.visibility,'private') visibility,u.display_name uploader,
    (SELECT COUNT(*) FROM upload_batch_photos bp JOIN photos p ON p.id=bp.photo_id WHERE bp.batch_id=b.id AND p.status='ready' AND ${photoAccessPredicate()}) photo_count
    FROM upload_batches b JOIN users u ON u.id=b.owner_id LEFT JOIN albums a ON a.id=b.album_id
    WHERE b.id=? AND (b.owner_id=? OR ?='admin' OR (a.visibility='family' AND b.completed_at IS NOT NULL))`)
    .bind(user!.id,user!.role,id,user!.id,user!.role).first();
  if(!batch)throw new HttpError(404,'Collection not found or you do not have access.');
  return json({collection:batch});
}

export async function completeUploadBatch(ctx:RequestContext,id:string):Promise<Response> {
  const {env,user,request}=ctx;
  const batch=await env.DB.prepare('SELECT owner_id,completed_at FROM upload_batches WHERE id=?').bind(id).first<{owner_id:string;completed_at:string|null}>();
  if(!batch || batch.owner_id!==user!.id)throw new HttpError(404,'Collection not found.');
  if(!batch.completed_at){
    const count=await env.DB.prepare("SELECT COUNT(*) total FROM upload_batch_photos bp JOIN photos p ON p.id=bp.photo_id WHERE bp.batch_id=? AND p.status='ready'").bind(id).first<{total:number}>();
    if(!count?.total)throw new HttpError(400,'Upload at least one photograph first.');
    await rateLimit(env,request,`collection-notification:${user!.id}`,10,60);
    await env.DB.prepare("UPDATE upload_batches SET completed_at=datetime('now') WHERE id=? AND completed_at IS NULL").bind(id).run();
  }
  const deliver=deliverUploadEmail(env,id);
  if(ctx.execution)ctx.execution.waitUntil(deliver);else await deliver;
  return json({id,path:`/collections/${encodeURIComponent(id)}`});
}

export async function getSharedAlbum({env,user}:RequestContext,id:string):Promise<Response> {
  const album=await env.DB.prepare(`SELECT a.id,a.name,a.description,a.visibility,a.owner_id,a.cover_photo_id,
    (SELECT COUNT(*) FROM album_photos ap JOIN photos p ON p.id=ap.photo_id WHERE ap.album_id=a.id AND p.status='ready' AND ${photoAccessPredicate()}) photo_count
    FROM albums a WHERE a.id=? AND (a.visibility='family' OR a.owner_id=? OR ?='admin')`).bind(user!.id,user!.role,id,user!.id,user!.role).first();
  if(!album)throw new HttpError(404,'Album not found or you do not have access.');
  return json({album});
}

export async function getSharedPhoto({env,user}:RequestContext,id:string):Promise<Response> {
  const photo=await env.DB.prepare(`SELECT p.id,p.caption,p.event_description,p.date_taken,p.created_at,p.owner_id,p.width,p.height,u.display_name uploader
    FROM photos p JOIN users u ON u.id=p.owner_id WHERE p.id=? AND p.status='ready' AND ${photoAccessPredicate()}`).bind(id,user!.id,user!.role).first();
  if(!photo)throw new HttpError(404,'Photograph not found or you do not have access.');
  return json({photo});
}

export async function adminUploadActivity({env}:RequestContext):Promise<Response> {
  const rows=await env.DB.prepare(`SELECT b.id,b.title,b.completed_at,b.email_state,b.email_error,b.email_sent_at,u.display_name uploader,
    (SELECT COUNT(*) FROM upload_batch_photos bp JOIN photos p ON p.id=bp.photo_id WHERE bp.batch_id=b.id AND p.status='ready') photo_count
    FROM upload_batches b JOIN users u ON u.id=b.owner_id WHERE b.completed_at IS NOT NULL ORDER BY b.completed_at DESC LIMIT 30`).all();
  return json({collections:rows.results,emailConfigured:Boolean(env.SMTP_USER && env.SMTP_PASSWORD && env.ADMIN_UPLOAD_EMAIL && env.PUBLIC_APP_URL)});
}
