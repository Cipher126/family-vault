// @vitest-environment jsdom
import {createElement} from "react";
import {act,cleanup,fireEvent,render} from "@testing-library/react";
import {afterEach,expect,it,vi} from "vitest";
import PhotoGrid from "../src/components/PhotoGrid";
import {gridWindow} from "../src/lib/gridWindow";
afterEach(()=>{cleanup();vi.restoreAllMocks();vi.unstubAllGlobals();vi.useRealTimers();});
it("keeps 5000 photos to a small rendered window and updates it on scroll",async()=>{
  vi.useFakeTimers();vi.stubGlobal("matchMedia",()=>({matches:true}));vi.stubGlobal("ResizeObserver",class{observe(){}disconnect(){}});
  vi.stubGlobal("requestAnimationFrame",fn=>setTimeout(fn,0));vi.stubGlobal("cancelAnimationFrame",clearTimeout);
  let top=0;vi.spyOn(HTMLElement.prototype,"clientWidth","get").mockReturnValue(390);
  vi.spyOn(HTMLElement.prototype,"getBoundingClientRect").mockImplementation(()=>({top,bottom:top+220000,left:0,right:390,width:390,height:220000}));
  const photos=Array.from({length:5000},(_,i)=>({id:String(i),caption:`Photo ${i}`,created_at:"2026-10-31"}));
  const {container}=render(createElement(PhotoGrid,{photos}));expect(container.querySelectorAll("button").length).toBeLessThan(70);
  top=-13200;fireEvent.scroll(window);await act(async()=>{vi.runOnlyPendingTimers();});
  expect(container.querySelector("img").alt).toBe(`Photo ${gridWindow(5000,390,3,2,13200,innerHeight).start}`);expect(container.querySelectorAll("button").length).toBeLessThan(70);
});
it("keeps row boundaries aligned at the end of a long grid",()=>{
  const result=gridWindow(501,390,3,2,100000,844);expect(result.start%3).toBe(0);expect(result.end).toBe(501);expect(result.height).toBeGreaterThan(20000);
});
