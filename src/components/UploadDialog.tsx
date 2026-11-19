import {useEffect,useRef,useState} from 'react';
import {Camera,CheckCircle2,Image,ShieldCheck,Upload,X} from 'lucide-react';
import {Album,cachedRequest,post,request} from '../lib/api';
import {preparePhoto} from '../lib/images';
import {newBatchId} from '../lib/sharing';
import ShareActions from './ShareActions';

type Item={id:number;file:File};
type Batch={id:string;albumId:string};
export default function UploadDialog({onClose}:{onClose:()=>void}) {
  const input=useRef<HTMLInputElement>(null),sequence=useRef(0),batch=useRef<Batch|null>(null),batchRequestId=useRef<string|null>(null),lock=useRef(false),success=useRef(new Set<number>());
  const [files,setFiles]=useState<Item[]>([]),[progress,setProgress]=useState<Record<number,string>>({}),[busy,setBusy]=useState(false),[error,setError]=useState(''),[albums,setAlbums]=useState<Album[]>([]),[albumId,setAlbumId]=useState(''),[title,setTitle]=useState('Family pictures'),[visibility,setVisibility]=useState('family'),[started,setStarted]=useState(false),[done,setDone]=useState<{path:string;count:number;visibility:string}|null>(null);
  useEffect(()=>{let active=true;void cachedRequest<{albums:Album[]}>('/api/albums').then(data=>{if(active)setAlbums(data.albums);}).catch(()=>undefined);return ()=>{active=false;};},[]);
  const choose=(chosen:File[])=>{if(lock.current || started)return;setFiles(chosen.map(file=>({id:++sequence.current,file})));setProgress({});setError('');success.current.clear();};
  const finish=async()=>{
    if(!batch.current)return;
    const result=await post<{path:string}>(`/api/upload-batches/${batch.current.id}/complete`);
    const details=await request<{collection:{photo_count:number;visibility:string}}>(`/api/upload-batches/${batch.current.id}`);
    setDone({path:result.path,count:details.collection.photo_count,visibility:details.collection.visibility});
  };
  const run=async(queue=files.filter(item=>!success.current.has(item.id)))=>{
    if(lock.current || !title.trim())return;lock.current=true;setBusy(true);setError('');
    try{
      for(const {id,file} of queue){
        try{
          setProgress(previous=>({...previous,[id]:'Preparing…'}));
          const prepared=await preparePhoto(file);
          if(!batch.current){batch.current=await post<Batch>('/api/upload-batches',{id:(batchRequestId.current ||= newBatchId()),title:title.trim(),albumId:albumId || undefined,visibility});setStarted(true);}
          const init=await post<{id:string;preserveOriginal:boolean;upload:{gallery:string;thumbnail:string;small?:string|null;original:string|null}}>('/api/photos/init',{batchId:batch.current.id,filename:file.name,mimeType:file.type,originalBytes:file.size,galleryBytes:prepared.gallery.size,smallBytes:prepared.small.size,thumbnailBytes:prepared.thumbnail.size,width:prepared.width,height:prepared.height,hash:prepared.hash,dateTaken:prepared.dateTaken});
          setProgress(previous=>({...previous,[id]:'Uploading…'}));
          const upload=(url:string,body:Blob)=>fetch(url,{method:'PUT',headers:{'Content-Type':body.type},body});
          const uploads=[upload(init.upload.gallery,prepared.gallery),upload(init.upload.thumbnail,prepared.thumbnail)];
          if(init.upload.small)uploads.push(upload(init.upload.small,prepared.small));
          if(init.preserveOriginal && init.upload.original)uploads.push(upload(init.upload.original,file));
          if((await Promise.all(uploads)).some(response=>!response.ok))throw new Error('An upload did not complete. Please retry.');
          await post(`/api/photos/${init.id}/complete`);success.current.add(id);setProgress(previous=>({...previous,[id]:'Complete'}));
        }catch(reason){setProgress(previous=>({...previous,[id]:'Failed'}));setError(reason instanceof Error ? reason.message : 'Unable to upload this picture.');}
      }
      if(files.length && files.every(item=>success.current.has(item.id)))await finish();
    }catch(reason){setError(reason instanceof Error ? reason.message : 'Your pictures are uploaded, but the collection could not be finished. Try again.');}
    finally{if(success.current.size)window.dispatchEvent(new Event('family-vault-uploaded'));lock.current=false;setBusy(false);}
  };
  const finishPartial=async()=>{if(lock.current)return;lock.current=true;setBusy(true);setError('');try{await finish();}catch(reason){setError(reason instanceof Error ? reason.message : 'Unable to finish collection.');}finally{lock.current=false;setBusy(false);}};
  const reset=()=>{batch.current=null;batchRequestId.current=null;success.current.clear();setStarted(false);setDone(null);setFiles([]);setProgress({});setError('');setTitle('Family pictures');if(input.current)input.current.value='';};
  const remaining=files.filter(item=>!success.current.has(item.id)).length;
  return <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="upload-dialog-title"><section className="modal upload-collection-modal"><header><div className="modal-heading"><span className="modal-icon"><Upload/></span><div><p className="eyebrow">FAMILY VAULT</p><h2 id="upload-dialog-title">{done ? 'Your pictures are ready' : 'Add family memories'}</h2></div></div><button type="button" className="icon-button dialog-close" aria-label="Close dialog" disabled={busy} onClick={onClose}><X/></button></header>
    {done ? <div className="upload-share-result"><CheckCircle2/><h3>{title}</h3><p>{done.count} pictures in one collection.</p><ShareActions upload path={done.path} title={title} privateCollection={done.visibility==='private'}/><p className="muted">The link is for invited family members. They may need to sign in.</p><button className="button secondary wide" onClick={reset}>Start another collection</button><button className="button primary wide" onClick={onClose}>Done</button></div> : <div className="upload-dialog">
      <div className="stack-form upload-collection-fields"><label>What are these pictures from?<input value={title} onChange={event=>setTitle(event.target.value)} maxLength={100} disabled={busy || started} placeholder="Our day at the park"/></label><details className="upload-options"><summary>Album and privacy options</summary><label>Save in an album<select value={albumId} onChange={event=>setAlbumId(event.target.value)} disabled={busy || started}><option value="">Create an album for this collection</option>{albums.map(album=><option key={album.id} value={album.id}>{album.name}{album.visibility==='private' ? ' · Private' : ''}</option>)}</select></label>{!albumId && <label>Who can see these pictures?<select value={visibility} onChange={event=>setVisibility(event.target.value)} disabled={busy || started}><option value="family">The family</option><option value="private">Keep private</option></select></label>}</details></div>
      <button type="button" className="dropzone" disabled={busy || started} onClick={()=>input.current?.click()} onDragOver={event=>event.preventDefault()} onDrop={event=>{event.preventDefault();choose(Array.from(event.dataTransfer.files));}}><span><Camera/></span><h3>Choose photographs</h3><p>or drag them here · JPEG, PNG, or WebP</p></button>
      <input ref={input} type="file" multiple accept="image/jpeg,image/png,image/webp" hidden onChange={event=>choose(Array.from(event.target.files || []))}/>
      {!!files.length && <div className="upload-list">{files.map(item=><div key={item.id}><Image size={18}/><span>{item.file.name}<small>{(item.file.size/1024/1024).toFixed(1)} MB</small></span>{progress[item.id]==='Failed' ? <button className="upload-retry" disabled={busy} onClick={()=>void run([item])}>Retry</button> : <b>{progress[item.id] || 'Ready'}</b>}</div>)}</div>}
      {error && <p className="notice error" role="alert">{error}</p>}
      <button className="button primary wide" disabled={!files.length || busy || !title.trim()} onClick={()=>void run()}>{busy ? 'Preserving memories…' : !files.length ? 'Choose photographs first' : !remaining ? 'Finish collection' : files.some(item=>progress[item.id]==='Failed') ? 'Retry failed uploads' : `Upload ${remaining} ${remaining===1 ? 'photo' : 'photos'}`}</button>
      {!!success.current.size && remaining>0 && <button className="button secondary wide" disabled={busy} onClick={()=>void finishPartial()}>Share the pictures already uploaded</button>}
      <p className="privacy-note"><ShieldCheck size={15}/>Your pictures are stored privately. Share the collection when they are ready.</p>
    </div>}
  </section></div>;
}
