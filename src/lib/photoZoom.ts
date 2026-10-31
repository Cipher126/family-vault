export type PhotoZoom = { scale:number; x:number; y:number };
export const INITIAL_ZOOM: PhotoZoom = {scale:1,x:0,y:0};
export function clampPhotoZoom(value:PhotoZoom,width:number,height:number,imageWidth:number,imageHeight:number):PhotoZoom {
  const scale = Math.max(1,Math.min(5,value.scale));
  if (scale <= 1.01) return {...INITIAL_ZOOM};
  const fit = Math.min(width / (imageWidth || width),height / (imageHeight || height));
  const maxX = Math.max(0,(imageWidth * fit * scale-width)/2);
  const maxY = Math.max(0,(imageHeight * fit * scale-height)/2);
  return {scale,x:Math.max(-maxX,Math.min(maxX,value.x)),y:Math.max(-maxY,Math.min(maxY,value.y))};
}
export function zoomPhotoAt(value:PhotoZoom,scale:number,point:{x:number;y:number}):PhotoZoom {
  const ratio = scale/value.scale;
  return {scale,x:point.x-(point.x-value.x)*ratio,y:point.y-(point.y-value.y)*ratio};
}
