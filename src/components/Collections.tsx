import {useEffect,useRef,useState} from 'react';
import {Link} from 'react-router-dom';
import {Images} from 'lucide-react';
import {cachedRequest,peekRequestCache,photoUrl,request} from '../lib/api';
import ShareActions from './ShareActions';

type Collection={id:string;title:string;uploader:string;photo_count:number;visibility:string;thumbnail_photo_id:string|null};
type Page={collections:Collection[];nextCursor:string|null};
export default function Collections() {
  const [data,setData]=useState<Page>(()=>peekRequestCache<Page>('/api/upload-batches') || {collections:[],nextCursor:null}),[loading,setLoading]=useState(!peekRequestCache('/api/upload-batches')),[more,setMore]=useState(false),[error,setError]=useState('');
  const active=useRef(false),busy=useRef(false);
  useEffect(()=>{
    active.current=true;
    void cachedRequest<Page>('/api/upload-batches').then(page=>{if(active.current)setData(page);}).catch(reason=>{if(active.current)setError(reason instanceof Error ? reason.message : 'Unable to load collections.');}).finally(()=>{if(active.current)setLoading(false);});
    return ()=>{active.current=false;};
  },[]);
  const loadMore=async()=>{
    if(!data.nextCursor || busy.current)return;busy.current=true;setMore(true);setError('');
    try{const page=await request<Page>(`/api/upload-batches?cursor=${encodeURIComponent(data.nextCursor)}`);if(active.current)setData(current=>({collections:[...new Map([...current.collections,...page.collections].map(item=>[item.id,item])).values()],nextCursor:page.nextCursor}));}
    catch(reason){if(active.current)setError(reason instanceof Error ? reason.message : 'Unable to load more collections.');}
    finally{busy.current=false;if(active.current)setMore(false);}
  };
  return <div className="page"><p className="eyebrow">PICTURES SHARED TOGETHER</p><h1>Collections</h1><p className="muted">Find an upload collection and share its link again whenever you like.</p>{error && <p className="notice error" role="alert">{error}</p>}{loading ? <p role="status">Loading collections…</p> : data.collections.length ? <div className="saved-collections">{data.collections.map(collection=><article className="saved-collection" key={collection.id}><Link className="saved-collection-heading" to={`/collections/${encodeURIComponent(collection.id)}`}><span className="saved-collection-cover">{collection.thumbnail_photo_id ? <img src={photoUrl(collection.thumbnail_photo_id,'small')} loading="lazy" alt=""/> : <Images size={25}/>}</span><span><h2>{collection.title}</h2><small>{collection.photo_count} pictures · {collection.uploader}</small></span></Link><ShareActions path={`/collections/${encodeURIComponent(collection.id)}`} title={collection.title} privateCollection={collection.visibility==='private'}/></article>)}</div> : <div className="soft-empty"><Images/><h3>No upload collections yet</h3><p>New upload collections will appear here. You can also share your existing albums and individual pictures.</p><Link className="button secondary" to="/albums">Browse albums</Link></div>}{data.nextCursor && <button className="button secondary wide" disabled={more} onClick={()=>void loadMore()}>{more ? 'Loading…' : 'Load more collections'}</button>}</div>;
}
