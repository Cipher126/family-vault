import { useEffect, useState } from "react";
import { Album as AlbumIcon, ArrowLeft, CheckCheck, MoreVertical, Pencil, Sparkles, Trash2, X } from "lucide-react";
import type { Album } from "../lib/api";

export default function PhotoSelectionActions({ count, allSelected, albums, busy, message, canEdit, deletableCount, onSelectAll, onAlbum, onMemory, onEdit, onDelete, onClose }: {
  count:number; allSelected:boolean; albums:Album[]; busy:boolean; message:string; canEdit:boolean; deletableCount:number;
  onSelectAll:()=>void; onAlbum:(id:string)=>void; onMemory:()=>void; onEdit:()=>void; onDelete:()=>void; onClose:()=>void;
}) {
  const [open,setOpen] = useState(false);
  const [pickingAlbum,setPickingAlbum] = useState(false);
  const dismiss = () => { setOpen(false); setPickingAlbum(false); };
  useEffect(() => {
    if (!open) return;
    const close = (event:KeyboardEvent) => { if (event.key === "Escape") { setOpen(false); setPickingAlbum(false); } };
    window.addEventListener("keydown",close); return () => window.removeEventListener("keydown",close);
  },[open]);
  const run = (action:()=>void) => { dismiss(); action(); };
  return <>
    {open && <button className="selection-menu-dismiss" aria-label="Dismiss selection actions" onClick={dismiss} />}
    <section className="selection-dock" aria-label="Selected photograph actions">
      {open && <div className="selection-action-menu" role="menu" aria-label={pickingAlbum ? "Choose an album" : "Photo selection actions"}>
        {pickingAlbum ? <><button role="menuitem" onClick={() => setPickingAlbum(false)}><ArrowLeft size={17} />Back</button><p>ADD TO ALBUM</p>{albums.length ? albums.map((album) => <button role="menuitem" key={album.id} onClick={() => run(() => onAlbum(album.id))}><AlbumIcon size={17} /><span>{album.name}</span></button>) : <p>Create an album first.</p>}</> : <>
          <button role="menuitem" onClick={() => run(onSelectAll)} disabled={busy}><CheckCheck size={17} />{allSelected ? "Clear selection" : "Select loaded photos"}</button>
          <button role="menuitem" onClick={() => setPickingAlbum(true)} disabled={!count || busy}><AlbumIcon size={17} />Add to album</button>
          <button role="menuitem" onClick={() => run(onMemory)} disabled={!count || count > 60 || busy}><Sparkles size={17} />Create memory</button>
          <button role="menuitem" onClick={() => run(onEdit)} disabled={!canEdit || count > 60 || busy}><Pencil size={17} />Edit details</button>
          <button role="menuitem" className="selection-delete" onClick={() => run(onDelete)} disabled={!deletableCount || busy}><Trash2 size={17} />Delete{deletableCount ? ` (${deletableCount})` : ""}</button>
        </>}
      </div>}
      {message && <p className="selection-status" role="status">{message}</p>}
      <div className="selection-count-bar"><b aria-live="polite">{busy ? "Working…" : `${count} selected`}</b><button aria-label="Selection actions" aria-haspopup="menu" aria-expanded={open} onClick={() => { setOpen(!open); setPickingAlbum(false); }}><MoreVertical size={20} /></button><button aria-label="Cancel selection" disabled={busy} onClick={onClose}><X size={18} /></button></div>
    </section>
  </>;
}
