import {useEffect,useState} from 'react';
import {useNavigate,useParams} from 'react-router-dom';
import {Photo,request} from '../lib/api';
import {usePhotoCollection} from '../lib/usePhotoCollection';
import PhotoGrid from './PhotoGrid';
import ShareActions from './ShareActions';
import {Viewer} from '../App';

export function SharedCollectionPage({album=false}:{album?:boolean}) {
  const {id=''}=useParams(),[details,setDetails]=useState<{title:string;photo_count:number;visibility:string}|null>(null),[error,setError]=useState(''),[selected,setSelected]=useState<number|null>(null);
  const {photos,setPhotos,nextCursor,loading,loadingMore,error:photoError,loadMore}=usePhotoCollection(`/api/photos?${album ? 'album' : 'batch'}=${encodeURIComponent(id)}`);
  useEffect(()=>{
    const controller=new AbortController();setDetails(null);setError('');setSelected(null);
    void request<{collection?:{title:string;photo_count:number;visibility:string};album?:{name:string;photo_count:number;visibility:string}}>(`/api/${album ? 'albums' : 'upload-batches'}/${encodeURIComponent(id)}`,{signal:controller.signal}).then(data=>{if(!controller.signal.aborted)setDetails(data.collection || (data.album ? {...data.album,title:data.album.name} : null));}).catch(reason=>{if(!controller.signal.aborted)setError(reason instanceof Error ? reason.message : 'Unable to open collection.');});
    return ()=>controller.abort();
  },[id,album]);
  if(error)return <div className="page"><h1>Unable to open this collection</h1><p role="alert">{error}</p><p>Ask the sender to check that you have access.</p></div>;
  return <div className="page shared-collection"><p className="eyebrow">SHARED WITH FAMILY</p><h1>{details?.title || 'Opening collection…'}</h1>{details && <><p className="muted">{details.photo_count} photographs</p><ShareActions path={`/${album ? 'albums' : 'collections'}/${id}`} title={details.title} privateCollection={details.visibility==='private'}/></>}{photoError && <p role="alert">{photoError}</p>}{details && (loading ? <p role="status">Loading pictures…</p> : <PhotoGrid photos={photos} onSelect={photo=>setSelected(photos.findIndex(item=>item.id===photo.id))}/>)}{nextCursor && details && <button className="button secondary wide" disabled={loadingMore} onClick={()=>void loadMore()}>{loadingMore ? 'Loading…' : 'Load more pictures'}</button>}{selected!==null && photos[selected] && <Viewer photos={photos} index={selected} setIndex={setSelected} onClose={()=>setSelected(null)} onUpdated={updated=>setPhotos(items=>items.map(item=>item.id===updated.id ? updated : item))} onDeleted={deleted=>{setPhotos(items=>items.filter(item=>item.id!==deleted));setSelected(null);setDetails(current=>current ? {...current,photo_count:Math.max(0,current.photo_count-1)} : null);}}/>}</div>;
}

export function SharedPhotoPage() {
  const {id=''}=useParams(),navigate=useNavigate(),[photo,setPhoto]=useState<Photo|null>(null),[error,setError]=useState('');
  useEffect(()=>{const controller=new AbortController();setPhoto(null);setError('');void request<{photo:Photo}>(`/api/photos/${encodeURIComponent(id)}`,{signal:controller.signal}).then(data=>{if(!controller.signal.aborted)setPhoto(data.photo);}).catch(reason=>{if(!controller.signal.aborted)setError(reason instanceof Error ? reason.message : 'Unable to open photograph.');});return ()=>controller.abort();},[id]);
  return photo ? <Viewer photos={[photo]} index={0} setIndex={()=>undefined} onClose={()=>navigate('/gallery',{replace:true})} onUpdated={setPhoto} onDeleted={()=>navigate('/gallery',{replace:true})}/> : <div className="page"><h1>{error ? 'Unable to open this picture' : 'Opening picture…'}</h1>{error && <p role="alert">{error}</p>}</div>;
}
