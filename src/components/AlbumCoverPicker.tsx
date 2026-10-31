import { useEffect, useState } from "react";
import { Check, Sparkles } from "lucide-react";
import { Photo, photoUrl, request } from "../lib/api";

export default function AlbumCoverPicker({ albumId, initialPhotos, value, onChange }: { albumId:string; initialPhotos:Photo[]; value:string; onChange:(id:string)=>void }) {
  const [photos,setPhotos] = useState(initialPhotos);
  const [cursor,setCursor] = useState<string | null>(null);
  const [busy,setBusy] = useState(true);
  const [error,setError] = useState("");
  useEffect(() => { let active = true; request<{photos:Photo[];nextCursor:string|null}>(`/api/photos?album=${encodeURIComponent(albumId)}&limit=100`).then((data) => { if (active) { setPhotos(data.photos); setCursor(data.nextCursor); } }).catch((reason) => { if (active) setError(reason.message); }).finally(() => { if (active) setBusy(false); }); return () => { active = false; }; },[albumId]);
  const more = async () => { if (!cursor) return; setBusy(true); setError(""); try { const data = await request<{photos:Photo[];nextCursor:string|null}>(`/api/photos?album=${encodeURIComponent(albumId)}&limit=100&cursor=${encodeURIComponent(cursor)}`); setPhotos((items)=>[...items,...data.photos]);setCursor(data.nextCursor); } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to load photographs."); } finally { setBusy(false); } };
  return <fieldset className="album-cover-picker"><legend>Album thumbnail</legend><input type="hidden" name="coverPhotoId" value={value} /><div className="album-cover-options">
    <button type="button" className={!value ? "chosen" : ""} aria-pressed={!value} onClick={()=>onChange("")}><Sparkles size={20}/><span>Automatic</span>{!value && <i><Check size={13}/></i>}</button>
    {photos.map((photo,index)=><button type="button" key={photo.id} className={value === photo.id ? "chosen" : ""} aria-label={`Use photograph ${index+1} as album thumbnail`} aria-pressed={value === photo.id} onClick={()=>onChange(photo.id)}><img loading="lazy" src={photoUrl(photo.id,"small")} alt={photo.caption || "Album photograph"}/>{value === photo.id && <i><Check size={13}/></i>}</button>)}
  </div>{busy && <small>Loading photographs…</small>}{cursor && <button type="button" className="member-action" disabled={busy} onClick={()=>void more()}>More photographs</button>}{error && <p className="library-error" role="alert">{error}</p>}</fieldset>;
}
