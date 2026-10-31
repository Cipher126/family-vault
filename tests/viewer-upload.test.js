// @vitest-environment jsdom
import React from "react";
import {act,cleanup,fireEvent,render,renderHook,screen,waitFor} from "@testing-library/react";
import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import {Viewer,UploadDialog} from "../src/App";
import {usePhotoCollection} from "../src/lib/usePhotoCollection";
import {request,cachedRequest,post} from "../src/lib/api";
import {preparePhoto} from "../src/lib/images";

vi.mock("../src/lib/api",async original=>({...await original(),request:vi.fn(),cachedRequest:vi.fn(),post:vi.fn()}));
vi.mock("../src/lib/images",()=>({preparePhoto:vi.fn()}));
vi.mock("../src/components/ZoomablePhoto",()=>({default:({src,alt})=>React.createElement("img",{src,alt})}));
beforeEach(()=>{
  vi.stubGlobal("React",React);
  vi.stubGlobal("matchMedia",query=>({matches:query.includes("max-width"),addEventListener(){},removeEventListener(){}}));
  vi.stubGlobal("requestAnimationFrame",()=>1);vi.stubGlobal("cancelAnimationFrame",()=>{});
  HTMLElement.prototype.scrollTo=vi.fn();
  vi.mocked(cachedRequest).mockImplementation(async path=>path==="/api/albums" ? {albums:[]} : {people:[]});
});
afterEach(()=>{cleanup();vi.resetAllMocks();vi.unstubAllGlobals();});
const photo=id=>({id,caption:`Photo ${id}`,created_at:"2026-10-31"});
const deferred=()=>{let resolve;const promise=new Promise(done=>{resolve=done;});return {promise,resolve};};

describe("mobile collections",()=>{
  it("ignores old person/album responses after selecting a different collection",async()=>{
    const old=deferred(),next=deferred();
    vi.mocked(request).mockImplementation(path=>path.includes("first") ? old.promise : next.promise);
    const {result,rerender}=renderHook(({path})=>usePhotoCollection(path),{initialProps:{path:"/api/photos?album=first"}});
    rerender({path:"/api/photos?album=second"});
    await act(async()=>next.resolve({photos:[photo("second")],nextCursor:null}));
    await act(async()=>old.resolve({photos:[photo("first")],nextCursor:null}));
    expect(result.current.photos.map(item=>item.id)).toEqual(["second"]);
  });
  it("continues an album after 100 photos and prevents duplicate concurrent loads",async()=>{
    const next=deferred();
    vi.mocked(request).mockResolvedValueOnce({photos:Array.from({length:100},(_,i)=>photo(String(i))),nextCursor:"cursor"}).mockImplementation(()=>next.promise);
    const {result}=renderHook(()=>usePhotoCollection("/api/photos?album=family"));
    await waitFor(()=>expect(result.current.photos).toHaveLength(100));
    let pending;
    act(()=>{pending=result.current.loadMore();void result.current.loadMore();});
    expect(request).toHaveBeenCalledTimes(2);
    await act(async()=>{next.resolve({photos:[photo("100")],nextCursor:null});await pending;});
    expect(result.current.photos).toHaveLength(101);expect(result.current.nextCursor).toBeNull();
  });
});

it("does not skip a newly selected upload with the same filename",async()=>{
  const prepared={gallery:new Blob(["g"]),thumbnail:new Blob(["t"]),small:new Blob(["s"]),width:10,height:10,hash:"x",dateTaken:null};
  vi.mocked(preparePhoto).mockResolvedValue(prepared);
  vi.mocked(post).mockImplementation(async path=>path.endsWith("/init") ? {id:"p",preserveOriginal:false,upload:{gallery:"/g",thumbnail:"/t",small:"/s"}} : {ok:true});
  vi.stubGlobal("fetch",vi.fn(async()=>({ok:true})));
  const {container}=render(React.createElement(UploadDialog,{onClose:vi.fn()}));
  const input=container.querySelector('input[type="file"]');
  fireEvent.change(input,{target:{files:[new File(["first"],"image.jpg",{type:"image/jpeg"})]}});
  fireEvent.click(screen.getByRole("button",{name:"Upload 1 photo"}));
  await screen.findByRole("button",{name:"All photographs uploaded"});
  fireEvent.change(input,{target:{files:[new File(["different"],"image.jpg",{type:"image/jpeg"})]}});
  fireEvent.click(screen.getByRole("button",{name:"Upload 1 photo"}));
  await screen.findByRole("button",{name:"All photographs uploaded"});
  expect(preparePhoto).toHaveBeenCalledTimes(2);
});

it("keeps statuses independent for two different files with the same name",async()=>{
  vi.mocked(preparePhoto).mockRejectedValueOnce(new Error("Broken photo")).mockReturnValueOnce(new Promise(()=>{}));
  const {container}=render(React.createElement(UploadDialog,{onClose:vi.fn()}));
  fireEvent.change(container.querySelector('input[type="file"]'),{target:{files:[new File(["a"],"image.jpg"),new File(["b"],"image.jpg")]}});
  fireEvent.click(screen.getByRole("button",{name:"Upload 2 photos"}));
  await waitFor(()=>expect(preparePhoto).toHaveBeenCalledTimes(2));
  expect(screen.getAllByRole("button",{name:"Retry"})).toHaveLength(1);
});

it.each(["mobile","desktop"])("does not show a previous photo's comments in the %s viewer",async mode=>{
  vi.stubGlobal("matchMedia",query=>({matches:mode==="desktop" ? query.includes("min-width") : query.includes("max-width")}));
  const first=deferred(),second=deferred();
  vi.mocked(request).mockImplementation(path=>path.endsWith("/comments") ? (path.includes("/one/") ? first.promise : second.promise) : Promise.resolve({people:[]}));
  const props={photos:[photo("one"),photo("two")],index:0,setIndex:vi.fn(),onClose:vi.fn()};
  const {rerender}=render(React.createElement(Viewer,props));
  if(mode==="mobile")fireEvent.click(screen.getByRole("button",{name:"Photo actions"}));
  rerender(React.createElement(Viewer,{...props,index:1}));
  if(mode==="mobile")fireEvent.click(screen.getByRole("button",{name:"Photo actions"}));
  await act(async()=>second.resolve({comments:[{id:"c2",body:"Second note",author:"B",author_id:"b",created_at:"2026-10-31"}],reactions:[]}));
  await act(async()=>first.resolve({comments:[{id:"c1",body:"Wrong old note",author:"A",author_id:"a",created_at:"2026-10-31"}],reactions:[]}));
  expect(screen.queryByText("Wrong old note")).toBeNull();
  if(mode==="desktop")expect(screen.getByText("Second note")).toBeTruthy();
});
