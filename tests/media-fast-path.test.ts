import {expect,it,vi} from "vitest";
import {serveAuthenticatedPhoto} from "../worker/routes/api";
import type {Env} from "../worker/types";
it("revalidates session and photo access in one query before reading cached media",async()=>{
  const first=vi.fn().mockResolvedValue({session_user_id:"member",photo_id:"p",original_key:"original",gallery_key:"gallery",thumbnail_key:"thumb",small_key:null});
  const prepare=vi.fn((_sql:string)=>({bind:()=>({first})})),head=vi.fn().mockResolvedValue({httpEtag:'"same"'}),get=vi.fn();
  const env={DB:{prepare},PHOTOS:{head,get}} as unknown as Env;
  const request=new Request("https://vault/api/photos/p/small",{headers:{Cookie:"fv_session=opaque","If-None-Match":'"same"'}});
  expect((await serveAuthenticatedPhoto(request,env,"p","small")).status).toBe(304);
  expect(prepare).toHaveBeenCalledTimes(1);expect(head).toHaveBeenCalledWith("thumb");expect(get).not.toHaveBeenCalled();
  expect(prepare.mock.calls[0][0]).toContain("u.status='active'");
  first.mockResolvedValue(null);
  await expect(serveAuthenticatedPhoto(request,env,"p","small")).rejects.toThrow("Please sign in");expect(head).toHaveBeenCalledTimes(1);
});
it("does not read media for an authenticated user without photo access",async()=>{
  const get=vi.fn(),head=vi.fn();
  const env={DB:{prepare:()=>({bind:()=>({first:async()=>({session_user_id:"member",photo_id:null})})})},PHOTOS:{get,head}} as unknown as Env;
  await expect(serveAuthenticatedPhoto(new Request("https://vault/api/photos/p/small",{headers:{Cookie:"fv_session=opaque"}}),env,"p","small")).rejects.toThrow("Photo not found");
  expect(get).not.toHaveBeenCalled();expect(head).not.toHaveBeenCalled();
});
