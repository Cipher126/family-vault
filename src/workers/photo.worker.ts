/// <reference lib="webworker" />
import {processPhoto} from "../lib/photoProcessor";
self.onmessage=async(event:MessageEvent<{id:number;file:File}>)=>{
  const {id,file}=event.data;
  try{if(typeof OffscreenCanvas==="undefined" || typeof createImageBitmap!=="function" || typeof OffscreenCanvas.prototype.convertToBlob!=="function" || !new OffscreenCanvas(1,1).getContext("2d")){self.postMessage({id,unsupported:true});return;}}catch{self.postMessage({id,unsupported:true});return;}
  try{self.postMessage({id,photo:await processPhoto(file)});}catch(error){self.postMessage({id,error:error instanceof Error ? error.message : "Photo preparation failed."});}
};
