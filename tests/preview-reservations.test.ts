import {expect,it,vi} from "vitest";
import {api} from "../worker/routes/api";
import type {RequestContext} from "../worker/types";
it("reserves every derivative's bytes and provides the small preview upload URL",async()=>{
  const writes:{sql:string;values:unknown[]}[]=[];
  const prepare=(sql:string)=>{const statement={all:async()=>({results:sql.includes("SELECT key,value") ? Object.entries({preserve_originals:"true",storage_quota_bytes:"1000",max_upload_bytes:"1000"}).map(([key,value])=>({key,value})) : []}),bind:(...values:unknown[])=>({run:async()=>{writes.push({sql,values});return{meta:{changes:1}};},first:async()=>null})};return statement;};
  const request=new Request("https://vault/api/photos/init",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({filename:"test.jpg",mimeType:"image/jpeg",originalBytes:100,galleryBytes:40,thumbnailBytes:20,smallBytes:10})});
  const response=await api({request,url:new URL(request.url),user:{id:"owner",role:"member"},env:{DB:{prepare}}} as unknown as RequestContext);
  expect(response.status).toBe(201);const body=await response.json() as {upload:{small:string}};expect(body.upload.small).toContain("/upload/small");
  expect(writes[0].values.slice(-2)).toEqual([170,1000]);expect(writes[0].sql).toContain("expected_small_bytes");
  expect((writes[0].sql.match(/\?/g)||[]).length).toBe(writes[0].values.length);
});
it("verifies small preview length before completing the upload and accounts for it",async()=>{
  const writes:{sql:string;values:unknown[]}[]=[];
  const row={owner_id:"owner",status:"pending",original_key:"original",gallery_key:"gallery",thumbnail_key:"thumb",small_key:"small",expected_original_bytes:100,expected_gallery_bytes:40,expected_thumbnail_bytes:20,expected_small_bytes:10};
  const prepare=(sql:string)=>({bind:(...values:unknown[])=>({first:async()=>row,run:async()=>{writes.push({sql,values});return{meta:{changes:1}};}})});
  const sizes:Record<string,number>={original:100,gallery:40,thumb:20,small:10},head=vi.fn(async(key:string)=>({size:sizes[key]}));
  const request=new Request("https://vault/api/photos/p/complete",{method:"POST"});const ctx={request,url:new URL(request.url),user:{id:"owner",role:"member"},env:{DB:{prepare},PHOTOS:{head,delete:vi.fn().mockResolvedValue(undefined)}}} as unknown as RequestContext;
  expect((await api(ctx)).status).toBe(200);expect(writes[0].values).toEqual([100,40,20,10,"p"]);
  sizes.small=9;await expect(api(ctx)).rejects.toThrow("Uploaded files did not match their reserved sizes");
});
