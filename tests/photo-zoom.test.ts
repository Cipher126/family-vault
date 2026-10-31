import {describe,expect,it} from "vitest";
import {clampPhotoZoom,INITIAL_ZOOM,zoomPhotoAt} from "../src/lib/photoZoom";
describe("photo pinch zoom",()=>{
  it("keeps the touched image point anchored when zooming",()=>{
    expect(zoomPhotoAt(INITIAL_ZOOM,2,{x:50,y:100})).toEqual({scale:2,x:-50,y:-100});
  });
  it("bounds portrait panning to actual visible image dimensions",()=>{
    expect(clampPhotoZoom({scale:2,x:9999,y:-9999},390,844,1200,2200)).toEqual({scale:2,x:195,y:-293});
  });
  it("limits zoom and resets panning when pinched back to normal",()=>{
    expect(clampPhotoZoom({scale:.8,x:500,y:400},390,844,1200,2200)).toEqual(INITIAL_ZOOM);
    expect(clampPhotoZoom({scale:9,x:0,y:0},390,844,1200,2200).scale).toBe(5);
  });
});
