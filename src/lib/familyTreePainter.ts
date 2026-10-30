import type { FamilyTreeModel, TreePoint } from './familyTreeModel';

export type TreeCamera = { x: number; y: number; scale: number };
const clamp = (value: number) => Math.max(0, Math.min(1, value));

/** Orthogonal relationship connectors; accessible HTML provides the family boxes. */
export function paintFamilyTree(ctx: CanvasRenderingContext2D, model: FamilyTreeModel, camera: TreeCamera, width: number, height: number, growth: number) {
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = '#f7f4ee';
  ctx.fillRect(0, 0, width, height);
  ctx.save();
  ctx.translate(width / 2, height / 2);
  ctx.scale(camera.scale, camera.scale);
  ctx.translate(-camera.x, -camera.y);
  ctx.lineWidth = 1.6 / camera.scale;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const limb of model.limbs) {
    if (limb.kind === 'root') continue;
    const amount = clamp((growth - limb.level) * (limb.kind === 'union' ? 3.4 : 1.8));
    if (!amount) continue;
    const middle = limb.routeY ?? (limb.kind === 'union' ? limb.to.y : (limb.from.y + limb.to.y) / 2);
    const points: TreePoint[] = [limb.from, { x: limb.from.x, y: middle }, { x: limb.to.x, y: middle }, limb.to];
    const lengths = points.slice(1).map((point, index) => Math.hypot(point.x - points[index].x, point.y - points[index].y));
    let remaining = lengths.reduce((sum, length) => sum + length, 0) * amount;
    ctx.strokeStyle = limb.color || (limb.kind === 'union' ? '#aa8c75' : '#8c978e');
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 0; i < lengths.length; i++) {
      const fraction = lengths[i] ? Math.min(1, remaining / lengths[i]) : 1;
      ctx.lineTo(points[i].x + (points[i + 1].x - points[i].x) * fraction, points[i].y + (points[i + 1].y - points[i].y) * fraction);
      remaining -= lengths[i];
      if (remaining <= 0) break;
    }
    ctx.stroke();
  }
  ctx.restore();
}
