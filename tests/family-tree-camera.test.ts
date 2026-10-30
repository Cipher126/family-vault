import { describe, expect, it } from 'vitest';
import { panCamera, zoomCamera } from '../src/lib/familyTreeCamera';

describe('family diagram interaction', () => {
  it('accumulates every drag event without losing movement between animation frames', () => {
    const start = { x: 400, y: 300, scale: .5 };
    let result = start;
    for (let i = 0; i < 20; i++) result = panCamera(result, 5, -2);
    expect(result).toEqual(panCamera(start, 100, -40));
    expect(result.x).toBe(200);
  });
  it('keeps the point under the cursor fixed during zoom', () => {
    const start = { x: 400, y: 300, scale: .5 }, cursor = { x: 120, y: -60 };
    const next = zoomCamera(start, 1.8, cursor);
    expect(next.x + cursor.x / next.scale).toBeCloseTo(start.x + cursor.x / start.scale);
    expect(next.y + cursor.y / next.scale).toBeCloseTo(start.y + cursor.y / start.scale);
  });
});
