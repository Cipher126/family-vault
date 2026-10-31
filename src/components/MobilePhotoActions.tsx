import { useEffect, useState } from "react";
import { Album as AlbumIcon, ArrowLeft, Download, Heart, Image, MessageCircle, Pencil, Smile, Trash2, Users } from "lucide-react";
import type { Album, Reaction } from "../lib/api";

export default function MobilePhotoActions({ open, albums, reactions, downloadUrl, canEdit, canManageAlbum, onClose, onAlbum, onEdit, onDelete, onReaction, onNotes, onPeople, onCover, onRemove }: {
  open:boolean; albums:Album[]; reactions:Reaction[]; downloadUrl:string; canEdit:boolean; canManageAlbum:boolean;
  onClose:()=>void; onAlbum:(id:string)=>Promise<void>; onEdit:()=>void; onDelete:()=>void; onReaction:(emoji:Reaction["emoji"])=>Promise<void>; onNotes:()=>void; onPeople:()=>void; onCover:()=>Promise<void>; onRemove:()=>void;
}) {
  const [section,setSection] = useState<"actions"|"albums"|"reactions">("actions");
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState("");
  useEffect(()=>{ if (open) {setSection("actions");setError("");} },[open]);
  if (!open) return null;
  const run = (action:()=>void) => {onClose();action();};
  const save = async (action:()=>Promise<void>) => {setBusy(true);setError("");try {await action();onClose();}catch(reason){setError(reason instanceof Error ? reason.message : "Unable to complete this action.");}finally{setBusy(false);}};
  return <div className="mobile-photo-actions">
    <button className="mobile-photo-action-scrim" aria-label="Dismiss photo actions" onClick={onClose}/>
    <div className="mobile-photo-action-menu" role="menu" aria-label={section === "albums" ? "Choose an album" : section === "reactions" ? "Choose a reaction" : "Photo actions"}>
      {section !== "actions" && <button role="menuitem" onClick={()=>setSection("actions")}><ArrowLeft size={18}/>Back</button>}
      {section === "albums" ? <>{albums.length ? albums.map(album=><button role="menuitem" key={album.id} disabled={busy} onClick={()=>void save(()=>onAlbum(album.id))}><AlbumIcon size={18}/><span>{album.name}</span></button>) : <p>Create an album first.</p>}</> : section === "reactions" ? <>{([['heart','Love'],['smile','Smile'],['celebrate','Celebrate']] as const).map(([emoji,label])=><button role="menuitem" key={emoji} disabled={busy} onClick={()=>void save(()=>onReaction(emoji))}><Heart size={18}/>{reactions.find(r=>r.emoji===emoji)?.mine ? `Remove ${label.toLowerCase()}` : label}</button>)}</> : <>
        <button role="menuitem" onClick={()=>setSection("albums")}><AlbumIcon size={18}/>Add to album</button>
        {canEdit && <button role="menuitem" onClick={()=>run(onEdit)}><Pencil size={18}/>Edit photograph</button>}
        <a role="menuitem" href={downloadUrl} onClick={onClose}><Download size={18}/>Download original</a>
        <button role="menuitem" onClick={()=>setSection("reactions")}><Smile size={18}/>React</button>
        <button role="menuitem" onClick={()=>run(onNotes)}><MessageCircle size={18}/>Family notes</button>
        <button role="menuitem" onClick={()=>run(onPeople)}><Users size={18}/>Tag relatives</button>
        {canManageAlbum && <><button role="menuitem" disabled={busy} onClick={()=>void save(onCover)}><Image size={18}/>Set as album cover</button><button role="menuitem" onClick={()=>run(onRemove)}><AlbumIcon size={18}/>Remove from album</button></>}
        {canEdit && <button role="menuitem" className="mobile-photo-delete" onClick={()=>run(onDelete)}><Trash2 size={18}/>Delete photograph</button>}
      </>}
      {busy && <p role="status">Saving…</p>}{error && <p role="alert" className="mobile-photo-menu-error">{error}</p>}
    </div>
  </div>;
}
