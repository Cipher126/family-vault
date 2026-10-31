import type {ProcessedPhoto} from "./photoProcessor";
export interface PreparedPhoto extends ProcessedPhoto {original:File}
let processor:Worker | null=null;
let disabled=false;
let sequence=0;
const pending=new Map<number,{resolve:(photo:ProcessedPhoto|null)=>void;reject:(error:Error)=>void;timer:ReturnType<typeof setTimeout>}>();
function worker():Worker | null {
  if(disabled || typeof Worker==="undefined")return null;
  if(processor)return processor;
  try {
    processor=new Worker(new URL("../workers/photo.worker.ts",import.meta.url),{type:"module"});
    processor.onmessage=event=>{
      const job=pending.get(event.data.id);if(!job)return;clearTimeout(job.timer);pending.delete(event.data.id);
      if(event.data.unsupported){disabled=true;processor?.terminate();processor=null;job.resolve(null);}
      else if(event.data.error)job.reject(new Error(event.data.error));else job.resolve(event.data.photo);
    };
    processor.onerror=()=>{disabled=true;processor?.terminate();processor=null;for(const job of pending.values()){clearTimeout(job.timer);job.resolve(null);}pending.clear();};
    return processor;
  }catch{disabled=true;return null;}
}
export async function preparePhoto(file:File):Promise<PreparedPhoto> {
  const instance=worker();let result:ProcessedPhoto | null=null;
  if(instance){result=await new Promise((resolve,reject)=>{const id=++sequence;const timer=setTimeout(()=>{pending.delete(id);reject(new Error("Photo preparation took too long. Please retry."));},60_000);pending.set(id,{resolve,reject,timer});instance.postMessage({id,file});});}
  if(!result){const {processPhoto}=await import("./photoProcessor");result=await processPhoto(file);}
  return {...result,original:file};
}
