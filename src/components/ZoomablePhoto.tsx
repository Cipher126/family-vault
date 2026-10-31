import { useEffect, useRef, useState } from "react";
import { clampPhotoZoom, INITIAL_ZOOM, PhotoZoom, zoomPhotoAt } from "../lib/photoZoom";

export default function ZoomablePhoto({ src,originalSrc,alt,loading,active,onZoomChange,onDismiss }: {src:string;originalSrc?:string;alt:string;loading:"lazy"|"eager";active:boolean;onZoomChange:(zoomed:boolean)=>void;onDismiss?:()=>void}) {
  const imageRef = useRef<HTMLImageElement>(null);
  const [displaySrc,setDisplaySrc] = useState(src);
  const dismiss = useRef(onDismiss); dismiss.current = onDismiss;
  const callback = useRef(onZoomChange); callback.current = onZoomChange;
  useEffect(()=>{
    const image = imageRef.current; const slide = image?.parentElement;
    if (!image || !slide || !active) return;
    setDisplaySrc(src);
    let original:HTMLImageElement | null = null;
    let requestedOriginal = false;
    let draggedDown = 0;
    let value:PhotoZoom = {...INITIAL_ZOOM};
    let start:PhotoZoom = value; let distance = 0; let origin = {x:0,y:0}; let tap = {x:0,y:0};
    let moved = false; let pinching = false; let lastTap = 0;
    const midpoint = (a:Touch,b:Touch) => ({x:(a.clientX+b.clientX)/2,y:(a.clientY+b.clientY)/2});
    const span = (a:Touch,b:Touch) => Math.hypot(a.clientX-b.clientX,a.clientY-b.clientY);
    const relative = (point:{x:number;y:number}) => {const rect=slide.getBoundingClientRect();return {x:point.x-rect.left-rect.width/2,y:point.y-rect.top-rect.height/2};};
    const paint = (next:PhotoZoom) => {
      value = clampPhotoZoom(next,slide.clientWidth,slide.clientHeight,image.naturalWidth || slide.clientWidth,image.naturalHeight || slide.clientHeight);
      image.style.transform = `translate3d(${value.x}px,${value.y}px,0) scale(${value.scale})`;
      callback.current(value.scale>1.01);
      if (value.scale>1.01 && originalSrc && !requestedOriginal) {
        requestedOriginal=true;original=new window.Image();
        original.onload=()=>setDisplaySrc(originalSrc);original.src=originalSrc;
      }
    };
    const begin = (event:TouchEvent) => {
      if (!matchMedia("(max-width: 900px)").matches) return;
      start = {...value}; moved = false;
      draggedDown=0;slide.style.transition="";slide.style.transform="";
      if (event.touches.length>=2) {
        if (event.cancelable) event.preventDefault();
        pinching = true; moved = true; lastTap = 0;
        distance = span(event.touches[0],event.touches[1]); origin = midpoint(event.touches[0],event.touches[1]);
      } else if (event.touches.length===1) {pinching=false;origin={x:event.touches[0].clientX,y:event.touches[0].clientY};tap={...origin};}
    };
    const move = (event:TouchEvent) => {
      if (!matchMedia("(max-width: 900px)").matches) return;
      if (event.touches.length>=2 && pinching) {
        if (event.cancelable) event.preventDefault();
        const middle=midpoint(event.touches[0],event.touches[1]);
        const next=zoomPhotoAt(start,Math.max(1,Math.min(5,start.scale*span(event.touches[0],event.touches[1])/Math.max(1,distance))),relative(origin));
        paint({...next,x:next.x+middle.x-origin.x,y:next.y+middle.y-origin.y}); moved=true;
      } else if (event.touches.length===1) {
        const dx=event.touches[0].clientX-origin.x,dy=event.touches[0].clientY-origin.y;
        if (Math.hypot(dx,dy)>8) moved=true;
        if (value.scale>1.01) {if(event.cancelable)event.preventDefault();paint({...start,x:start.x+dx,y:start.y+dy});}
        else if (dy>12 && dy>Math.abs(dx)*1.2) {
          if(event.cancelable)event.preventDefault();draggedDown=dy;moved=true;
          slide.style.transform=`translate3d(0,${dy}px,0)`;
        }
      }
    };
    const end = (event:TouchEvent) => {
      if (event.touches.length===1 && pinching) {start={...value};origin={x:event.touches[0].clientX,y:event.touches[0].clientY};pinching=false;moved=true;return;}
      if (event.touches.length || !matchMedia("(max-width: 900px)").matches) return;
      if (draggedDown>0) {
        if(event.type!=="touchcancel" && draggedDown>Math.min(140,slide.clientHeight*.18)) {dismiss.current?.();draggedDown=0;return;}
        slide.style.transition="transform 160ms ease-out";slide.style.transform="";draggedDown=0;lastTap=0;return;
      }
      if (!moved && !pinching && event.type!=="touchcancel") {
        const now=Date.now();
        if (now-lastTap<300) {if(event.cancelable)event.preventDefault();paint(value.scale>1.01 ? INITIAL_ZOOM : zoomPhotoAt(value,2.5,relative(tap)));lastTap=0;}
        else lastTap=now;
      } else lastTap=0;
      pinching=false;
    };
    const resize = () => paint(value);
    slide.addEventListener("touchstart",begin,{passive:false});slide.addEventListener("touchmove",move,{passive:false});slide.addEventListener("touchend",end,{passive:false});slide.addEventListener("touchcancel",end,{passive:false});window.addEventListener("resize",resize);
    return ()=>{slide.removeEventListener("touchstart",begin);slide.removeEventListener("touchmove",move);slide.removeEventListener("touchend",end);slide.removeEventListener("touchcancel",end);window.removeEventListener("resize",resize);if(original)original.onload=null;image.style.transform="";slide.style.transform="";slide.style.transition="";callback.current(false);};
  },[active,src,originalSrc]);
  return <img ref={imageRef} loading={loading} decoding="async" src={displaySrc} alt={alt} draggable={false} />;
}
