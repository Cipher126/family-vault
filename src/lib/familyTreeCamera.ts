export type TreeCamera = { x: number; y: number; scale: number };
export type ScreenPoint = { x: number; y: number };

export function panCamera(camera: TreeCamera, dx: number, dy: number): TreeCamera {
  return { ...camera, x: camera.x - dx / camera.scale, y: camera.y - dy / camera.scale };
}

/** Preserve the world point under the cursor when zooming. */
export function zoomCamera(camera: TreeCamera, factor: number, anchor: ScreenPoint = { x: 0, y: 0 }): TreeCamera {
  const scale = Math.max(.06, Math.min(2.4, camera.scale * factor));
  return { x: camera.x + anchor.x / camera.scale - anchor.x / scale, y: camera.y + anchor.y / camera.scale - anchor.y / scale, scale };
}
