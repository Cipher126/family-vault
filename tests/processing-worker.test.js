import {afterEach,beforeEach,expect,it,vi} from "vitest";
beforeEach(()=>vi.resetModules());afterEach(()=>vi.unstubAllGlobals());
it("sends photo processing to a reusable worker without decoding on the UI thread",async()=>{
  const bitmaps=vi.fn();vi.stubGlobal("createImageBitmap",bitmaps);
  const workers=[];
  class WorkerMock {constructor(){workers.push(this);}postMessage({id}){queueMicrotask(()=>this.onmessage({data:{id,photo:{width:1200,height:800,small:new Blob(),thumbnail:new Blob(),gallery:new Blob(),hash:"",dateTaken:null}}}));}}
  vi.stubGlobal("Worker",WorkerMock);
  const {preparePhoto}=await import("../src/lib/images");const file=new File(["image"],"test.jpg",{type:"image/jpeg"});
  expect((await preparePhoto(file)).original).toBe(file);await preparePhoto(file);
  expect(workers).toHaveLength(1);expect(bitmaps).not.toHaveBeenCalled();
});
it("creates bounded small previews and preserves the uncropped gallery",async()=>{
  const sizes=[],draws=[];const close=vi.fn();
  vi.stubGlobal("createImageBitmap",vi.fn(async()=>({width:4000,height:3000,close})));
  vi.stubGlobal("OffscreenCanvas",class{constructor(width,height){this.width=width;this.height=height;sizes.push([width,height]);}getContext(){return{fillRect(){},drawImage(...args){draws.push(args);}};}async convertToBlob(){return new Blob(["preview"],{type:"image/webp"});}});
  const {processPhoto}=await import("../src/lib/photoProcessor");await processPhoto(new File(["image"],"test.jpg",{type:"image/jpeg"}));
  expect(sizes).toEqual([[2200,1650],[640,640],[320,320]]);expect(draws[1].slice(1,5)).toEqual([500,0,3000,3000]);expect(close).toHaveBeenCalledOnce();
});
