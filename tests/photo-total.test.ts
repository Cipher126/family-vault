import {expect,it,vi} from "vitest";
import {api} from "../worker/routes/api";
import type {RequestContext} from "../worker/types";
it("returns the complete library count independently of the page cursor",async()=>{
  const photos=Array.from({length:101},(_,i)=>({id:String(i),created_at:"2026-10-31"}));
  const batch=vi.fn(async(_statements:unknown[])=>[{results:photos},{results:[{total:234}]}]);
  const prepare=vi.fn((sql:string)=>({bind:(...values:unknown[])=>({sql,values})}));
  const url=new URL("https://vault/api/photos");url.searchParams.set("cursor",JSON.stringify(["2026-10-30","older-photo"]));
  const response=await api({request:new Request(url),url,user:{id:"member",role:"member"},env:{DB:{prepare,batch}}} as unknown as RequestContext);
  const data=await response.json() as {photos:unknown[];total:number;nextCursor:string|null};
  expect(data.photos).toHaveLength(100);expect(data.total).toBe(234);expect(data.nextCursor).not.toBeNull();
  const statements=batch.mock.calls[0][0] as unknown as {sql:string;values:unknown[]}[];
  expect(statements[0].values).toContain("older-photo");expect(statements[1].values).not.toContain("older-photo");
});
