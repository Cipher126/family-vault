import {useLayoutEffect,useRef,useState} from "react";
import {Check} from "lucide-react";
import {Photo,photoUrl} from "../lib/api";
import {gridWindow} from "../lib/gridWindow";
export default function PhotoGrid({photos,onSelect,selectionMode=false,selectedIds}:{photos:Photo[];onSelect?:(photo:Photo)=>void;selectionMode?:boolean;selectedIds?:Set<string>}) {
  const root=useRef<HTMLDivElement>(null),virtual=photos.length>150;
  const [windowed,setWindowed]=useState(()=>gridWindow(photos.length,390,3,2,0,900));
  useLayoutEffect(()=>{
    if(!virtual || !root.current)return;const grid=root.current;let frame=0;
    const measure=()=>{
      frame=0;const rect=grid.getBoundingClientRect(),style=getComputedStyle(grid),gap=parseFloat(style.columnGap)||2;
      const cols=matchMedia("(max-width:600px)").matches ? 3 : Math.max(1,Math.floor((grid.clientWidth+gap)/((innerWidth>900 ? 160 : 140)+gap)));
      let top=0,bottom=innerHeight;
      for(let parent:HTMLElement|null=grid;parent;parent=parent.parentElement){if(/auto|scroll/.test(getComputedStyle(parent).overflowY)){const clip=parent.getBoundingClientRect();top=Math.max(top,clip.top);bottom=Math.min(bottom,clip.bottom);}}
      const offset=(grid.scrollTop || 0)+top-rect.top;
      const next=gridWindow(photos.length,grid.clientWidth,cols,gap,offset,Math.max(1,bottom-top));
      setWindowed(old=>JSON.stringify(old)===JSON.stringify(next) ? old : next);
    };
    const schedule=()=>{if(!frame)frame=requestAnimationFrame(measure);};
    const resize=new ResizeObserver(schedule);resize.observe(grid);window.addEventListener("scroll",schedule,{capture:true,passive:true});window.addEventListener("resize",schedule);measure();
    return ()=>{cancelAnimationFrame(frame);resize.disconnect();window.removeEventListener("scroll",schedule,true);window.removeEventListener("resize",schedule);};
  },[photos.length,virtual]);
  const items=virtual ? photos.slice(windowed.start,windowed.end) : photos;
  const cards=items.map(photo=>{const checked=selectedIds?.has(photo.id)||false;return <button className={`photo-card ${checked ? "selected" : ""}`} key={photo.id} onClick={()=>onSelect?.(photo)} aria-pressed={selectionMode ? checked : undefined}><img loading="lazy" decoding="async" src={photoUrl(photo.id,"small")} srcSet={`${photoUrl(photo.id,"small")} 320w, ${photoUrl(photo.id,"thumbnail")} 640w`} sizes="(max-width:600px) 33vw, 180px" alt={photo.caption || "Family photograph"}/><span>{photo.caption || (photo.date_taken ? new Intl.DateTimeFormat(undefined,{dateStyle:"long",timeZone:"UTC"}).format(new Date(`${photo.date_taken}T00:00:00Z`)) : "Date unknown")}</span>{selectionMode && <i className="selection-check" aria-hidden="true">{checked && <Check size={13} strokeWidth={3}/>}</i>}</button>;});
  return <div ref={root} className={`photo-grid ${selectionMode ? "selection-mode" : ""} ${virtual ? "virtual-photo-root" : ""}`}>{virtual ? <div className="virtual-photo-space" style={{height:windowed.height}}><div className="virtual-photo-cells" style={{top:windowed.top,gridTemplateColumns:`repeat(${windowed.columns},minmax(0,1fr))`,gap:windowed.gap}}>{cards}</div></div> : cards}</div>;
}
