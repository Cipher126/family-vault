import {HttpError} from "./http";
export function collectionOffset(url:URL):number {
  const cursor=url.searchParams.get("cursor");
  if(cursor===null)return 0;
  if(!/^\d+$/.test(cursor) || (!Number.isSafeInteger(Number(cursor)) || Number(cursor)>Math.floor(Number.MAX_SAFE_INTEGER/100)))throw new HttpError(400,"Invalid collection cursor.");
  return Number(cursor);
}
export function collectionPage<T>(rows:T[],offset:number,limit=100) {
  return {photos:rows.slice(0,limit),nextCursor:rows.length>limit ? String(offset+limit) : null};
}
