import type { Photo } from "./api";

export type LibrarySnapshot = { query: string; photos: Photo[]; nextCursor: string | null; total?:number; saved: number };
const PREFIX = "fv-library:";
export function readLibrarySnapshot(userId: string, query?: string): LibrarySnapshot | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(PREFIX + userId) || "null") as LibrarySnapshot | null;
    return value && (query === undefined || value.query === query) && Array.isArray(value.photos) && Date.now() - value.saved < 30 * 60_000 ? value : null;
  } catch { return null; }
}
export function saveLibrarySnapshot(userId: string, value: Omit<LibrarySnapshot,"saved">): void {
  const photos = value.photos.slice(0,300);
  const last = photos[photos.length - 1];
  const taken = new URLSearchParams(value.query).get("sort")?.startsWith("taken-");
  const nextCursor = value.photos.length > 300 && last ? JSON.stringify([taken ? last.date_taken || "" : last.created_at,last.id]) : value.nextCursor;
  try { sessionStorage.setItem(PREFIX + userId,JSON.stringify({ ...value,photos,nextCursor,saved:Date.now() })); } catch { /* Storage can be disabled or full. */ }
}
export function clearLibrarySnapshots(): void {
  try { for (const key of Object.keys(sessionStorage)) if (key.startsWith(PREFIX) || key.startsWith("fv-view:")) sessionStorage.removeItem(key); } catch { /* Storage may be disabled. */ }
}
export function readViewSnapshot<T>(user:string,view:string):T | null {
  try{const cached=JSON.parse(sessionStorage.getItem(`fv-view:${user}:${view}`)||"null");return cached && Date.now()-cached.saved<30*60_000 ? cached.value as T : null;}catch{return null;}
}
export function saveViewSnapshot<T>(user:string,view:string,value:T):void {
  try{sessionStorage.setItem(`fv-view:${user}:${view}`,JSON.stringify({saved:Date.now(),value}));}catch{/* Storage can be unavailable. */}
}
