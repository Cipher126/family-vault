import {useEffect,useState} from 'react';
import {request} from '../lib/api';
import ShareActions from './ShareActions';

type Upload={id:string;title:string;uploader:string;photo_count:number;email_state:string;email_error:string|null;completed_at:string};
export default function AdminUploadActivity() {
  const [uploads,setUploads]=useState<Upload[]>([]),[configured,setConfigured]=useState(true),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const load=async()=>{setBusy(true);setError('');try{const data=await request<{collections:Upload[];emailConfigured:boolean}>('/api/admin/uploads');setUploads(data.collections);setConfigured(data.emailConfigured);}catch(reason){setError(reason instanceof Error ? reason.message : 'Unable to load uploads.');}finally{setBusy(false);}};
  useEffect(()=>{void load();},[]);
  const status=(state:string)=>state==='sent' ? 'Email accepted' : state==='private' ? 'Private · no email' : state==='failed' ? 'Email needs attention' : 'Email queued';
  return <section className="admin-panel"><div className="panel-heading"><div><h2>Recent family uploads</h2><p>Open a collection or share it with the family on WhatsApp.</p></div><button className="member-action" disabled={busy} onClick={()=>void load()}>{busy ? 'Refreshing…' : 'Refresh'}</button></div>{!configured && <p className="notice info">Admin email alerts need Gmail sending to be configured. You can share collection links here in the meantime.</p>}{error && <p role="alert">{error}</p>}<div className="admin-upload-list">{uploads.map(upload=><article key={upload.id}><h3><a href={`/collections/${upload.id}`}>{upload.title}</a></h3><p>{upload.uploader} · {upload.photo_count} pictures</p><small className={upload.email_state==='failed' ? 'upload-email-error' : ''}>{status(upload.email_state)}</small>{upload.email_error && <p className="muted">{upload.email_error}</p>}<ShareActions path={`/collections/${upload.id}`} title={upload.title} privateCollection={upload.email_state==='private'}/></article>)}{!busy && !uploads.length && <p>No completed upload collections yet.</p>}</div></section>;
}
