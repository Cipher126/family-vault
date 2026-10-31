import {useEffect,useRef,useState} from "react";
import {Photo,request} from "./api";
export type PhotoPage={photos:Photo[];nextCursor:string|null};
export function appendPhotos(previous:Photo[],next:Photo[]):Photo[] {
  return [...new Map([...previous,...next].map(photo=>[photo.id,photo])).values()];
}
export function usePhotoCollection(path:string|null) {
  const [photos,setPhotos]=useState<Photo[]>([]),[nextCursor,setNextCursor]=useState<string|null>(null),[loading,setLoading]=useState(false),[loadingMore,setLoadingMore]=useState(false),[error,setError]=useState("");
  const current=useRef<{path:string|null;controller:AbortController;more:boolean}|null>(null);
  useEffect(()=>{
    const turn={path,controller:new AbortController(),more:false};current.current=turn;
    setPhotos([]);setNextCursor(null);setLoadingMore(false);setError("");setLoading(Boolean(path));
    if(path)void request<PhotoPage>(path,{signal:turn.controller.signal}).then(data=>{if(current.current===turn){setPhotos(data.photos);setNextCursor(data.nextCursor);}}).catch(reason=>{if(!turn.controller.signal.aborted)setError(reason instanceof Error ? reason.message : "Unable to load photographs.");}).finally(()=>{if(current.current===turn)setLoading(false);});
    return ()=>{turn.controller.abort();if(current.current===turn)current.current=null;};
  },[path]);
  const loadMore=async()=>{
    const turn=current.current;if(!turn || turn.path!==path || !path || !nextCursor || turn.more)return;
    turn.more=true;setLoadingMore(true);setError("");
    try {const data=await request<PhotoPage>(`${path}${path.includes("?") ? "&" : "?"}cursor=${encodeURIComponent(nextCursor)}`,{signal:turn.controller.signal});if(current.current===turn){setPhotos(items=>appendPhotos(items,data.photos));setNextCursor(data.nextCursor);}}
    catch(reason){if(!turn.controller.signal.aborted)setError(reason instanceof Error ? reason.message : "Unable to load more photographs.");}
    finally{turn.more=false;if(current.current===turn)setLoadingMore(false);}
  };
  return {photos,setPhotos,nextCursor,loading,loadingMore,error,loadMore};
}
