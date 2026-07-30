import { describe, expect, it } from 'vitest';
import { findPath, type WalkGrid } from '../../domain/floor/pathfinding.ts';

describe('findPath', () => {
  it('returns a path around a blocked cell', () => {
    const grid: WalkGrid = {
      w: 3,
      h: 3,
      blocked: new Set(['1,0']),
    };
    const path = findPath(grid, { x: 0, y: 0 }, { x: 2, y: 0 });
    expect(path).not.toBeNull();
    expect(path![0]).toEqual({ x: 0, y: 0 });
    expect(path![path!.length - 1]).toEqual({ x: 2, y: 0 });
    expect(path!.some((p) => p.x === 1 && p.y === 0)).toBe(false);
  });

  it('returns null when unreachable', () => {
    const grid: WalkGrid = {
      w: 2,
      h: 1,
      blocked: new Set(['1,0']),
    };
    expect(findPath(grid, { x: 0, y: 0 }, { x: 1, y: 0 })).toBeNull();
  });

  it('can path onto a blocked goal when allowBlockedEndpoints is set', () => {
    const grid: WalkGrid = {
      w: 3,
      h: 1,
      blocked: new Set(['2,0']),
    };
    const path = findPath(grid, { x: 0, y: 0 }, { x: 2, y: 0 }, {
      allowBlockedEndpoints: true,
    });
    expect(path).toEqual([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
    ]);
  });

  it('still refuses to traverse other blocked cells with allowBlockedEndpoints', () => {
    const grid: WalkGrid = {
      w: 3,
      h: 1,
      blocked: new Set(['1,0', '2,0']),
    };
    expect(
      findPath(grid, { x: 0, y: 0 }, { x: 2, y: 0 }, { allowBlockedEndpoints: true }),
    ).toBeNull();
  });

  it('returns single tile when from === to', () => {
    const grid: WalkGrid = { w: 2, h: 2, blocked: new Set() };
    expect(findPath(grid, { x: 1, y: 1 }, { x: 1, y: 1 })).toEqual([{ x: 1, y: 1 }]);
  });
});
