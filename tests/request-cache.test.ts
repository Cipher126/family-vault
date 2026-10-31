import {afterEach,expect,it,vi} from "vitest";
import {cachedRequest,clearRequestCache,post,request,setRequestCacheUser} from "../src/lib/api";
afterEach(()=>{clearRequestCache();vi.unstubAllGlobals();});
it("deduplicates simultaneous reads and reuses recent navigation data",async()=>{
  const fetch=vi.fn(async()=>new Response(JSON.stringify({albums:[]}),{headers:{"Content-Type":"application/json"}}));vi.stubGlobal("fetch",fetch);
  await Promise.all([request("/api/albums"),request("/api/albums")]);
  await cachedRequest("/api/albums");expect(fetch).toHaveBeenCalledTimes(1);
});
it("invalidates navigation data after edits and account changes",async()=>{
  const fetch=vi.fn(async()=>new Response(JSON.stringify({ok:true}),{headers:{"Content-Type":"application/json"}}));vi.stubGlobal("fetch",fetch);
  await cachedRequest("/api/albums");await post("/api/albums",{name:"New"});await cachedRequest("/api/albums");
  expect(fetch).toHaveBeenCalledTimes(3);setRequestCacheUser("different-user");await cachedRequest("/api/albums");expect(fetch).toHaveBeenCalledTimes(4);
});
