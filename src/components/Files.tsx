import {useEffect,useId,useRef,useState,type FormEvent,type ReactNode} from 'react';
import {Link,useNavigate,useParams,useSearchParams} from 'react-router-dom';
import {Archive,ArrowLeft,Check,Copy,Download,Eye,EyeOff,FileText,Folder,FolderPlus,LockKeyhole,MoreVertical,Pencil,Trash2,Upload,X} from 'lucide-react';
import {cachedRequest,peekRequestCache,post,request,type User} from '../lib/api';
import {copyShareLink,newBatchId,whatsappLink} from '../lib/sharing';
import ShareActions from './ShareActions';

type FileFolder={id:string;name:string;owner_id:string;protected:boolean;locked:boolean};
type VaultFile={id:string;name:string;size:number;owner_id:string;folder_id:string|null;created_at:string;uploader:string};
type FilePage={files:VaultFile[];folder:FileFolder|null;total:number;nextCursor:string|null};
type FolderPage={folders:FileFolder[];nextCursor:string|null};
const empty:FilePage={files:[],folder:null,total:0,nextCursor:null};
export const formatFileSize=(size:number)=>size>=1048576 ? `${(size/1048576).toFixed(1)} MB` : `${Math.max(1,Math.round(size/1024))} KB`;
const message=(error:unknown)=>error instanceof Error ? error.message : 'Unable to complete this action.';

export default function Files({user}:{user:User|null}){
  const [params]=useSearchParams(),{fileId}=useParams(),navigate=useNavigate(),folderId=params.get('folder');
  const endpoint=fileId ? `/api/files/${encodeURIComponent(fileId)}` : `/api/files${folderId ? `?folder=${encodeURIComponent(folderId)}` : ''}`;
  const [data,setData]=useState<FilePage>(empty),[folders,setFolders]=useState<FolderPage>({folders:[],nextCursor:null}),[loading,setLoading]=useState(true),[error,setError]=useState(''),[revision,setRevision]=useState(0);
  const [dialog,setDialog]=useState<'folder'|'upload'|null>(null),[edit,setEdit]=useState<FileFolder|null>(null),[menu,setMenu]=useState<VaultFile|null>(null),[remove,setRemove]=useState<VaultFile|null>(null),[deleting,setDeleting]=useState(false),[copy,setCopy]=useState(false),[more,setMore]=useState(false);
  const active=useRef(true),moreLock=useRef(false),generation=useRef(0);
  const reload=()=>setRevision(value=>value+1);
  useEffect(()=>{active.current=true;return()=>{active.current=false;};},[]);
  useEffect(()=>{
    const ticket=++generation.current;
    setMenu(null);setError('');
    const cached=!fileId&&!folderId ? peekRequestCache<FilePage>(endpoint) : undefined;
    setLoading(!cached);setData(cached&&!fileId ? cached : empty);setFolders({folders:[],nextCursor:null});
    const load=async()=>{
      try{
        if(fileId){
          const result=await request<{file:VaultFile|null;folder:FileFolder|null}>(endpoint);
          if(ticket===generation.current)setData({files:result.file ? [result.file] : [],folder:result.folder,total:result.file?1:0,nextCursor:null});
        }else{
          const [page,folderPage]=await Promise.all([folderId ? request<FilePage>(endpoint) : cachedRequest<FilePage>(endpoint),folderId ? Promise.resolve({folders:[],nextCursor:null} as FolderPage) : cachedRequest<FolderPage>('/api/file-folders')]);
          if(ticket===generation.current){setData(page);setFolders(folderPage);}
        }
      }catch(reason){if(ticket===generation.current)setError(message(reason));}
      finally{if(ticket===generation.current)setLoading(false);}
    };
    void load();return()=>{generation.current++;};
  },[endpoint,folderId,fileId,revision]);
  useEffect(()=>{if(!menu)return;const close=(event:KeyboardEvent)=>{if(event.key==='Escape')setMenu(null);};window.addEventListener('keydown',close);return()=>window.removeEventListener('keydown',close);},[menu]);
  const loadMore=async(kind:'files'|'folders')=>{
    const cursor=kind==='files'?data.nextCursor:folders.nextCursor;if(!cursor||moreLock.current)return;
    moreLock.current=true;setMore(true);const ticket=generation.current;
    try{
      if(kind==='files'){
        const page=await request<FilePage>(`${endpoint}${endpoint.includes('?')?'&':'?'}cursor=${encodeURIComponent(cursor)}`);
        if(ticket===generation.current)setData(current=>({...page,files:[...new Map([...current.files,...page.files].map(file=>[file.id,file])).values()]}));
      }else{
        const page=await request<FolderPage>(`/api/file-folders?cursor=${encodeURIComponent(cursor)}`);
        if(ticket===generation.current)setFolders(current=>({folders:[...new Map([...current.folders,...page.folders].map(folder=>[folder.id,folder])).values()],nextCursor:page.nextCursor}));
      }
    }catch(reason){if(ticket===generation.current)setError(message(reason));}
    finally{moreLock.current=false;if(active.current)setMore(false);}
  };
  const deleteFile=async()=>{
    if(!remove||deleting)return;setDeleting(true);
    try{await request(`/api/files/${remove.id}`,{method:'DELETE'});setRemove(null);if(fileId)navigate(remove.folder_id?`/files?folder=${encodeURIComponent(remove.folder_id)}`:'/files');else reload();}
    catch(reason){setError(message(reason));setRemove(null);}finally{setDeleting(false);}
  };
  const folder=data.folder,locked=!!folder?.locked;
  return <div className="page files-page">
    {(folderId||fileId)&&<Link className="files-back" to="/files"><ArrowLeft size={17}/>All files</Link>}
    <div className="files-heading"><div><p className="eyebrow">THE FAMILY VAULT</p><h1>{folder?.name||'Files'}</h1><p className="muted">{locked ? 'This folder is password protected.' : fileId ? 'Shared with your invited family.' : 'Documents, videos, audio, and more. Up to 50 MB per file.'}</p></div>
      {!fileId&&!locked&&<div className="files-header-actions">{!folderId&&<button className="button secondary" onClick={()=>{setEdit(null);setDialog('folder');}}><FolderPlus size={18}/>New folder</button>}<button className="button primary" onClick={()=>setDialog('upload')}><Upload size={18}/>Upload files</button></div>}
    </div>
    {folder&&!loading&&!locked&&<div className="files-folder-tools"><ShareActions path={`/files?folder=${encodeURIComponent(folder.id)}`} title={folder.name}/>{folder.owner_id===user?.id ? <button className="icon-button" aria-label="Edit folder" onClick={()=>{setEdit(folder);setDialog('folder');}}><Pencil size={18}/></button> : folder.protected&&<button className="button secondary" onClick={()=>void post(`/api/file-folders/${folder.id}/lock`).then(reload).catch(reason=>setError(message(reason)))}><LockKeyhole size={16}/>Lock</button>}</div>}
    {error&&<p className="notice error" role="alert">{error}</p>}
    {loading ? <p role="status">Loading files…</p> : locked&&folder ? <UnlockFolder key={folder.id} folder={folder} onUnlocked={reload}/> : <>
      {!!folders.folders.length&&<section aria-label="Folders" className="file-folders">{folders.folders.map(item=><article className="file-folder" key={item.id}><Link to={`/files?folder=${encodeURIComponent(item.id)}`}><span className="file-folder-icon"><Folder size={26}/>{item.protected&&<LockKeyhole size={13}/>}</span><span><b>{item.name}</b><small>{item.protected ? 'Password protected' : 'Family folder'}</small></span></Link>{item.owner_id===user?.id&&<button className="icon-button" aria-label={`Edit ${item.name}`} onClick={()=>{setEdit(item);setDialog('folder');}}><MoreVertical size={18}/></button>}</article>)}</section>}
      {folders.nextCursor&&<button className="button secondary" disabled={more} onClick={()=>void loadMore('folders')}>More folders</button>}
      {!!data.files.length&&<><p className="files-count">{fileId ? 'Shared file' : `${data.total} ${data.total===1?'file':'files'}`}</p><div className="file-list">{data.files.map(file=><article key={file.id} className="file-row"><span className="file-type"><FileText size={23}/><small>{file.name.split('.').pop()?.slice(0,5).toUpperCase()}</small></span><Link className="file-info" to={`/files/${file.id}`}><b>{file.name}</b><small>{formatFileSize(file.size)} · {file.uploader}</small></Link><button className="icon-button" aria-label={`Actions for ${file.name}`} onClick={()=>{setCopy(false);setMenu(file);}}><MoreVertical size={20}/></button>{fileId&&<a className="button primary file-download" href={`/api/files/${file.id}/download`}><Download size={18}/>Download file</a>}</article>)}</div></>}
      {!data.files.length&&!folders.folders.length&&<div className="soft-empty"><Archive/><h3>{folder?'This folder is empty':'A place for family files'}</h3><p>Upload a document, recording, video, or archive to share it with the family.</p></div>}
      {data.nextCursor&&<button className="button secondary wide" disabled={more} onClick={()=>void loadMore('files')}>{more?'Loading…':'Load more files'}</button>}
    </>}
    {menu&&<div className="file-menu-layer"><button className="file-menu-scrim" aria-label="Close file actions" onClick={()=>setMenu(null)}/><section className="file-action-menu" role="dialog" aria-label={`File actions for ${menu.name}`}><header><b>{menu.name}</b><button className="icon-button" aria-label="Close file actions" onClick={()=>setMenu(null)}><X size={19}/></button></header><a href={`/api/files/${menu.id}/download`} onClick={()=>setMenu(null)}><Download size={18}/>Download</a><button onClick={()=>void copyShareLink(`/files/${menu.id}`).then(()=>setCopy(true)).catch(reason=>setError(message(reason)))}>{copy?<Check size={18}/>:<Copy size={18}/>}{copy?'Link copied':'Copy link'}</button><a href={whatsappLink(`/files/${menu.id}`,menu.name)} target="_blank" rel="noopener noreferrer" onClick={()=>setMenu(null)}>Send on WhatsApp</a>{(menu.owner_id===user?.id||user?.role==='admin')&&<button className="file-danger" onClick={()=>{setRemove(menu);setMenu(null);}}><Trash2 size={18}/>Delete file</button>}</section></div>}
    {dialog==='folder'&&<FolderEditor folder={edit} onClose={()=>setDialog(null)} onSaved={()=>{setDialog(null);reload();}}/>}
    {dialog==='upload'&&<FileUploader folder={folder} onClose={()=>setDialog(null)} onSaved={()=>{setDialog(null);reload();}}/>}
    {remove&&<FileDialog title="Delete this file?" busy={deleting} onClose={()=>setRemove(null)}><p><b>{remove.name}</b> will be permanently removed for everyone.</p><div className="dialog-actions"><button className="button secondary" disabled={deleting} onClick={()=>setRemove(null)}>Keep file</button><button className="button danger-action" disabled={deleting} onClick={()=>void deleteFile()}>{deleting?'Deleting…':'Delete file'}</button></div></FileDialog>}
  </div>;
}

function UnlockFolder({folder,onUnlocked}:{folder:FileFolder;onUnlocked:()=>void}){
  const [error,setError]=useState(''),[busy,setBusy]=useState(false);
  const submit=async(event:FormEvent<HTMLFormElement>)=>{event.preventDefault();const password=String(new FormData(event.currentTarget).get('password'));setBusy(true);setError('');try{await post(`/api/file-folders/${folder.id}/unlock`,{password});onUnlocked();}catch(reason){setError(message(reason));}finally{setBusy(false);}};
  return <form className="folder-unlock stack-form" onSubmit={submit}><LockKeyhole size={30}/><h2>Unlock {folder.name}</h2><p>Ask the folder owner for its password. You’ll stay unlocked on this device for up to 12 hours, until you sign out.</p><label>Folder password<input name="password" type="password" autoComplete="off" required maxLength={128}/></label>{error&&<p className="notice error" role="alert">{error}</p>}<button className="button primary" disabled={busy}>{busy?'Unlocking…':'Unlock folder'}</button></form>;
}

function FileDialog({title,busy=false,onClose,children}:{title:string;busy?:boolean;onClose:()=>void;children:ReactNode}){
  const id=useId(),ref=useRef<HTMLElement>(null),close=useRef(onClose);close.current=onClose;
  useEffect(()=>{const previous=document.activeElement as HTMLElement|null,overflow=document.body.style.overflow;document.body.style.overflow='hidden';ref.current?.focus();return()=>{document.body.style.overflow=overflow;previous?.focus();};},[]);
  return <div className="modal-backdrop file-dialog-backdrop" onMouseDown={event=>{if(event.target===event.currentTarget&&!busy)onClose();}}><section className="modal file-dialog" ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby={id} onKeyDown={event=>{
    if(event.key==='Escape'&&!busy){event.stopPropagation();close.current();}
    if(event.key==='Tab'){const controls=ref.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),a[href]');if(!controls?.length)return;const first=controls[0],last=controls[controls.length-1];if(event.shiftKey&&(document.activeElement===first||document.activeElement===ref.current)){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}}
  }}><header><div><p className="eyebrow">FAMILY FILES</p><h2 id={id}>{title}</h2></div><button className="icon-button dialog-close" aria-label="Close dialog" disabled={busy} onClick={onClose}><X size={21}/></button></header>{children}</section></div>;
}

function FolderEditor({folder,onClose,onSaved}:{folder:FileFolder|null;onClose:()=>void;onSaved:()=>void}){
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[protect,setProtect]=useState(folder?.protected??false),[change,setChange]=useState(false),[visible,setVisible]=useState(false),[confirmDelete,setConfirmDelete]=useState(false);
  const submit=async(event:FormEvent<HTMLFormElement>)=>{
    event.preventDefault();const form=new FormData(event.currentTarget);setBusy(true);setError('');
    const payload:{name:string;password?:string}={name:String(form.get('name'))};
    if(!folder||change)payload.password=protect?String(form.get('password')):'';
    try{await request(folder?`/api/file-folders/${folder.id}`:'/api/file-folders',{method:folder?'PATCH':'POST',body:JSON.stringify(payload)});onSaved();}catch(reason){setError(message(reason));}finally{setBusy(false);}
  };
  const deleteFolder=async()=>{if(!folder)return;setBusy(true);setError('');try{await request(`/api/file-folders/${folder.id}`,{method:'DELETE'});onSaved();}catch(reason){setError(message(reason));setConfirmDelete(false);}finally{setBusy(false);}};
  return <FileDialog title={confirmDelete?'Delete empty folder?':folder?'Edit folder':'Create a folder'} busy={busy} onClose={onClose}>{confirmDelete ? <><p>Delete “{folder?.name}”? Folders containing files cannot be deleted.</p><div className="dialog-actions"><button className="button secondary" disabled={busy} onClick={()=>setConfirmDelete(false)}>Keep folder</button><button className="button danger-action" disabled={busy} onClick={()=>void deleteFolder()}>Delete folder</button></div></> : <form className="stack-form" onSubmit={submit}><label>Folder name<input name="name" required maxLength={100} defaultValue={folder?.name} placeholder="Family documents"/></label>{folder&&<label className="check"><input type="checkbox" checked={change} onChange={event=>setChange(event.target.checked)}/>Change password protection</label>}{(!folder||change)&&<><label className="check"><input type="checkbox" checked={protect} onChange={event=>setProtect(event.target.checked)}/>Password protect this folder</label>{protect&&<label>Folder password<div className="password-field"><input name="password" type={visible?'text':'password'} required minLength={8} maxLength={128} autoComplete="new-password"/><button type="button" aria-label={visible?'Hide folder password':'Show folder password'} onClick={()=>setVisible(value=>!value)}>{visible?<EyeOff size={18}/>:<Eye size={18}/>}</button></div></label>}<small>You can open your own folders. Other family members need the password. This is access protection, not file encryption.</small></>}{error&&<p className="notice error" role="alert">{error}</p>}<button className="button primary" disabled={busy}>{busy?'Saving…':folder?'Save folder':'Create folder'}</button>{folder&&<button className="button secondary file-danger" type="button" disabled={busy} onClick={()=>setConfirmDelete(true)}>Delete empty folder</button>}</form>}</FileDialog>;
}

function FileUploader({folder,onClose,onSaved}:{folder:FileFolder|null;onClose:()=>void;onSaved:()=>void}){
  type Item={id:string;file:File;status:'waiting'|'uploading'|'done'|'failed';error?:string};
  const [items,setItems]=useState<Item[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState(''),guard=useRef(false);
  const choose=(files:FileList|null)=>{const selected=Array.from(files||[]);if(selected.length>20){setError('Choose up to 20 files at a time.');return;}setError('');setItems(selected.map(file=>({id:newBatchId(),file,status:'waiting'})));};
  const upload=async()=>{
    if(guard.current)return;guard.current=true;setBusy(true);setError('');
    for(const item of items.filter(item=>item.status!=='done')){
      const update=(status:Item['status'],error?:string)=>setItems(current=>current.map(value=>value.id===item.id?{...value,status,error}:value));
      try{
        if(!item.file.size||item.file.size>50*1024*1024)throw new Error('Choose a file between 1 byte and 50 MB.');
        update('uploading');const reservation=await post<{ready:boolean;uploadPath:string}>('/api/files',{id:item.id,name:item.file.name,size:item.file.size,folderId:folder?.id??null});
        if(!reservation.ready)await request(reservation.uploadPath,{method:'PUT',headers:{'Content-Type':'application/octet-stream'},body:item.file});
        update('done');
      }catch(reason){update('failed',message(reason));}
    }
    guard.current=false;setBusy(false);
  };
  const uploaded=items.filter(item=>item.status==='done').length,allDone=items.length>0&&uploaded===items.length;
  return <FileDialog title={allDone?'Files uploaded':'Upload files'} busy={busy} onClose={uploaded?onSaved:onClose}><p className="muted">{folder?`Uploading into ${folder.name}`:'Uploading into All files'} · 50 MB per file</p>{!uploaded&&<label className="file-picker">Choose files<input aria-label="Choose files" type="file" multiple disabled={busy} onChange={event=>choose(event.target.files)} accept=".pdf,.txt,.csv,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.odt,.ods,.odp,.rtf,.pages,.numbers,.key,.zip,.7z,.rar,.tar,.gz,.mp3,.m4a,.wav,.ogg,.aac,.flac,.mp4,.mov,.webm,.m4v,.avi,.jpg,.jpeg,.png,.webp,.heic,.heif,.gif"/></label>}{error&&<p className="notice error" role="alert">{error}</p>}<div className="file-upload-list" aria-live="polite">{items.map(item=><div key={item.id}><span><b>{item.file.name}</b><small>{formatFileSize(item.file.size)}</small></span><strong className={item.status==='failed'?'file-danger':item.status==='done'?'file-success':''}>{({waiting:'Ready',uploading:'Uploading…',done:'Uploaded',failed:'Failed'})[item.status]}</strong>{item.error&&<p role="alert">{item.error}</p>}</div>)}</div>{allDone ? <><p>{uploaded} {uploaded===1?'file':'files'} ready to share.</p>{folder&&<ShareActions path={`/files?folder=${encodeURIComponent(folder.id)}`} title={folder.name}/>}<button className="button primary wide" onClick={onSaved}>Done</button></> : <>{!!items.length&&<button className="button primary wide" disabled={busy} onClick={()=>void upload()}>{busy?'Uploading…':items.some(item=>item.status==='failed')?'Retry failed uploads':`Upload ${items.length} ${items.length===1?'file':'files'}`}</button>}{uploaded>0&&!busy&&<button className="button secondary wide" onClick={onSaved}>Done with {uploaded} uploaded</button>}</>}</FileDialog>;
}
