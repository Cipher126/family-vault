// @vitest-environment jsdom
import {createElement} from "react";
import {act,cleanup,render} from "@testing-library/react";
import {afterEach,expect,it,vi} from "vitest";
import ZoomablePhoto from "../src/components/ZoomablePhoto";
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
function photo() {
  vi.stubGlobal("matchMedia",()=>({matches:true}));
  const changed=vi.fn(),dismissed=vi.fn();
  const {container}=render(createElement("div",{className:"viewer-slide"},createElement(ZoomablePhoto,{src:"/photo",alt:"Photo",loading:"eager",active:true,onZoomChange:changed,onDismiss:dismissed})));
  const slide=container.firstChild,image=slide.firstChild;
  Object.defineProperties(slide,{clientWidth:{value:390},clientHeight:{value:844}});
  Object.defineProperties(image,{naturalWidth:{value:1200},naturalHeight:{value:2200}});
  const touch=(name,points)=>{const event=new Event(name,{bubbles:true,cancelable:true});Object.defineProperty(event,"touches",{value:points.map(([clientX,clientY])=>({clientX,clientY}))});act(()=>slide.dispatchEvent(event));return event;};
  return {touch,image,changed,dismissed};
}
it("pinches the photograph while preserving normal single-finger swipes",()=>{
  const {touch,image,changed}=photo();
  expect(touch("touchstart",[[100,300]]).defaultPrevented).toBe(false);
  expect(touch("touchmove",[[150,300]]).defaultPrevented).toBe(false);
  touch("touchend",[]);
  expect(touch("touchstart",[[100,300],[200,300]]).defaultPrevented).toBe(true);
  touch("touchmove",[[50,300],[250,300]]);
  expect(image.style.transform).toContain("scale(2)");expect(changed).toHaveBeenLastCalledWith(true);
  touch("touchmove",[[125,300],[175,300]]);
  expect(image.style.transform).toContain("scale(1)");expect(changed).toHaveBeenLastCalledWith(false);
});
it("double taps to zoom and double taps again to reset without controls",()=>{
  const {touch,image}=photo();
  for(let i=0;i<2;i++){touch("touchstart",[[100,300]]);touch("touchend",[]);}
  expect(image.style.transform).toContain("scale(2.5)");
  for(let i=0;i<2;i++){touch("touchstart",[[100,300]]);touch("touchend",[]);}
  expect(image.style.transform).toContain("scale(1)");
});
it("bounds one-finger panning while zoomed",()=>{
  const {touch,image}=photo();
  touch("touchstart",[[100,300],[200,300]]);
  touch("touchmove",[[50,300],[250,300]]);touch("touchend",[]);
  touch("touchstart",[[100,300]]);
  expect(touch("touchmove",[[2000,2000]]).defaultPrevented).toBe(true);
  expect(image.style.transform).toBe("translate3d(195px,293px,0) scale(2)");
});
it("closes with a downward drag and cancels a short drag",()=>{
  const {touch,image,dismissed}=photo();
  touch("touchstart",[[150,300]]);touch("touchmove",[[152,350]]);touch("touchend",[]);
  expect(dismissed).not.toHaveBeenCalled();expect(image.parentElement.style.transform).toBe("");
  touch("touchstart",[[150,300]]);touch("touchmove",[[152,490]]);touch("touchend",[]);
  expect(dismissed).toHaveBeenCalledOnce();
});
it("pans instead of dismissing when zoomed",()=>{
  const {touch,dismissed}=photo();
  touch("touchstart",[[100,300],[200,300]]);touch("touchmove",[[50,300],[250,300]]);touch("touchend",[]);
  touch("touchstart",[[150,300]]);touch("touchmove",[[152,550]]);touch("touchend",[]);
  expect(dismissed).not.toHaveBeenCalled();
});
