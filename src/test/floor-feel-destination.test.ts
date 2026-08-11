import { describe, expect, it } from 'vitest';
import { NavController } from '../canvas/world/NavController.ts';

describe('floor-feel destination + path tail', () => {
  it('keeps destination cell stable while crumbs advance along the segment', () => {
    const nav = new NavController({ x: 0, y: 0 }, 4);
    nav.setPath([
      { x: 0, y: 0 },
      { x: 3, y: 0 },
    ]);
    expect(nav.destination).toEqual({ x: 3, y: 0 });
    const before = nav.pathTailCrumbs(3).map((c) => c.x);
    nav.update(40);
    const after = nav.pathTailCrumbs(3).map((c) => c.x);
    expect(nav.destination).toEqual({ x: 3, y: 0 });
    expect(after[0]!).toBeGreaterThan(before[0]!);
  });

  it('clears crumbs when idle', () => {
    const nav = new NavController({ x: 2, y: 2 }, 4);
    expect(nav.pathTailCrumbs()).toEqual([]);
  });
});
