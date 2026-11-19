import {useState} from 'react';
import {Check,Copy,MessageCircle} from 'lucide-react';
import {copyShareLink,whatsappLink} from '../lib/sharing';

export default function ShareActions({path,title,upload=false,privateCollection=false}:{path:string;title:string;upload?:boolean;privateCollection?:boolean}) {
  const [copied,setCopied]=useState(false),[error,setError]=useState('');
  const copy=async()=>{try{await copyShareLink(path);setCopied(true);setError('');}catch(reason){setError(reason instanceof Error ? reason.message : 'Unable to copy link.');}};
  return <div className={`share-actions ${upload ? 'upload-share-actions' : ''}`}>
    {!privateCollection && <a className="button secondary whatsapp-share" href={whatsappLink(path,title)} target="_blank" rel="noopener noreferrer"><MessageCircle size={18}/>{upload ? 'Send to family WhatsApp group' : 'WhatsApp'}</a>}
    <button type="button" className="button secondary" onClick={()=>void copy()}>{copied ? <Check size={17}/> : <Copy size={17}/>}{copied ? 'Link copied' : 'Copy link'}</button>
    {privateCollection && <small>This collection is private. A link does not grant access.</small>}
    {error && <small role="alert">{error}</small>}
  </div>;
}

export function PhotoShareMenuItems({id,title}:{id:string;title:string}) {
  const [copied,setCopied]=useState(false),[error,setError]=useState('');const path=`/photos/${encodeURIComponent(id)}`;
  return <><a role="menuitem" href={whatsappLink(path,title || 'A family photograph')} target="_blank" rel="noopener noreferrer"><MessageCircle size={18}/>Send on WhatsApp</a><button role="menuitem" onClick={()=>void copyShareLink(path).then(()=>{setCopied(true);setError('');}).catch(()=>setError('Unable to copy this link.'))}>{copied ? <Check size={18}/> : <Copy size={18}/>}{copied ? 'Photo link copied' : 'Copy photo link'}</button>{error && <p role="alert">{error}</p>}</>;
}
