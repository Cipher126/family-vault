import {readCaptureDate} from "./photoMetadata";
export type ProcessedPhoto = {gallery:Blob;thumbnail:Blob;small:Blob;width:number;height:number;hash:string;dateTaken:string|null};
export async function processPhoto(file:File):Promise<ProcessedPhoto> {
  if(!["image/jpeg","image/png","image/webp"].includes(file.type))throw new Error(`${file.name}: unsupported file type.`);
  const buffer=await file.arrayBuffer();const dateTaken=await readCaptureDate(buffer);
  const image=await createImageBitmap(file,{imageOrientation:"from-image"});
  try {
    const gallery=await resize(image,2200,.86,false),thumbnail=await resize(image,640,.84,true),small=await resize(image,320,.8,true);
    let hash="";
    if(globalThis.crypto?.subtle){const digest=await crypto.subtle.digest("SHA-256",buffer);hash=Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,"0")).join("");}
    return {gallery,thumbnail,small,width:image.width,height:image.height,hash,dateTaken};
  } finally {image.close();}
}
async function resize(image:ImageBitmap,edge:number,quality:number,square:boolean):Promise<Blob> {
  const crop=square ? Math.min(image.width,image.height) : 0,scale=Math.min(1,edge/(crop || Math.max(image.width,image.height)));
  const width=Math.max(1,Math.round((crop || image.width)*scale)),height=Math.max(1,Math.round((crop || image.height)*scale));
  let canvas:OffscreenCanvas|HTMLCanvasElement=typeof OffscreenCanvas!=="undefined" ? new OffscreenCanvas(width,height) : document.createElement("canvas");canvas.width=width;canvas.height=height;
  let ctx=canvas.getContext("2d",{alpha:false}) as OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D | null;
  if(!ctx && typeof document!=="undefined"){canvas=document.createElement("canvas");canvas.width=width;canvas.height=height;ctx=canvas.getContext("2d",{alpha:false});}
  if(!ctx)throw new Error("Your browser cannot prepare this photo.");ctx.fillStyle="#ffffff";ctx.fillRect(0,0,width,height);
  if(square)ctx.drawImage(image,(image.width-crop)/2,(image.height-crop)/2,crop,crop,0,0,width,height);else ctx.drawImage(image,0,0,width,height);
  if("convertToBlob" in canvas)return canvas.convertToBlob({type:"image/webp",quality});
  return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob ? resolve(blob) : reject(new Error("Photo conversion failed.")),"image/webp",quality));
}
