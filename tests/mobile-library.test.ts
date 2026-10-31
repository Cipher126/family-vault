import { afterEach, describe, expect, it, vi } from "vitest";
import { clearLibrarySnapshots, readLibrarySnapshot, saveLibrarySnapshot, readViewSnapshot, saveViewSnapshot } from "../src/lib/librarySnapshot";
import { mediaCacheHeaders, matchesMediaTag } from "../worker/lib/media-cache";
import { api } from "../worker/routes/api";
import type { RequestContext } from "../worker/types";

afterEach(() => vi.unstubAllGlobals());
describe("private media revalidation", () => {
  it("requires authenticated revalidation while retaining downloaded previews", () => {
    expect(mediaCacheHeaders(false)["Cache-Control"]).toBe("private, no-cache, must-revalidate");
    expect(mediaCacheHeaders(false).Vary).toBe("Cookie");
    expect(mediaCacheHeaders(true)["Cache-Control"]).toContain("no-store");
    expect(matchesMediaTag(new Request("https://vault/photo",{headers:{"If-None-Match":'W/"abc", "other"'}}),'"abc"')).toBe(true);
  });
  it("checks photo permissions before returning a cached response", async () => {
    const head = vi.fn().mockResolvedValue({ httpEtag:'"same"' }); const get = vi.fn();
    const first = vi.fn().mockResolvedValue({ gallery_key:"gallery",original_key:"original" });
    const request = new Request("https://vault/api/photos/photo/gallery",{headers:{"If-None-Match":'"same"'}});
    const ctx = {request,url:new URL(request.url),user:{id:"member",role:"member"},env:{DB:{prepare:() => ({bind:() => ({first})})},PHOTOS:{head,get}}} as unknown as RequestContext;
    expect((await api(ctx)).status).toBe(304); expect(get).not.toHaveBeenCalled();
    head.mockClear(); first.mockResolvedValue(null);
    await expect(api(ctx)).rejects.toThrow("Photo not found"); expect(head).not.toHaveBeenCalled();
  });
});
describe("returning to the mobile library", () => {
  function storage() {
    const data: Record<string,string> = {};
    vi.stubGlobal("sessionStorage",new Proxy(data,{get:(target,key) => key === "getItem" ? (name:string) => target[name] ?? null : key === "setItem" ? (name:string,value:string) => {target[name]=value;} : key === "removeItem" ? (name:string) => {delete target[name];} : target[String(key)]}));
  }
  it("restores the same user's list and filters without leaking across accounts", () => {
    storage();
    saveLibrarySnapshot("one",{query:"sort=taken-newest",photos:[{id:"photo",caption:"",created_at:"2026-10-30"}],nextCursor:null});
    expect(readLibrarySnapshot("one")?.photos[0].id).toBe("photo");
    expect(readLibrarySnapshot("one","sort=taken-newest")?.query).toBe("sort=taken-newest");
    expect(readLibrarySnapshot("one","album=other")).toBeNull();
    expect(readLibrarySnapshot("two")).toBeNull();
    clearLibrarySnapshots(); expect(readLibrarySnapshot("one")).toBeNull();
  });
  it("does not lose pagination when bounding stored photos", () => {
    storage();
    saveLibrarySnapshot("one",{query:"",photos:Array.from({length:301},(_,i) => ({id:String(i),caption:"",created_at:"2026-10-30"})),nextCursor:null});
    const saved = readLibrarySnapshot("one"); expect(saved?.photos).toHaveLength(300);
    expect(JSON.parse(saved!.nextCursor!)).toEqual(["2026-10-30","299"]);
  });
  it("restores timeline filters and position only for the same account and clears on logout",()=>{
    storage();const timeline={filters:{year:"2025",month:"07"},photos:[{id:"p"}],scroll:800};
    saveViewSnapshot("one","timeline",timeline);expect(readViewSnapshot("one","timeline")).toEqual(timeline);
    expect(readViewSnapshot("two","timeline")).toBeNull();clearLibrarySnapshots();expect(readViewSnapshot("one","timeline")).toBeNull();
  });
});
