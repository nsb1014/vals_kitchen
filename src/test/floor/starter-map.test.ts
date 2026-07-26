import { describe, expect, it } from 'vitest';
import {
  createStarterMap,
  isDiningCell,
  isKitchenCell,
  isPerimeterWallCell,
  perimeterWallEdge,
  wallTileNameForEdge,
} from '../../domain/floor/starter-map.ts';

describe('createStarterMap', () => {
  it('provides a full room with two tables and prep in kitchen', () => {
    const map = createStarterMap();
    expect(map.gridSize).toEqual({ w: 10, h: 8 });
    expect(map.placements.filter((p) => p.itemKey.startsWith('table'))).toHaveLength(2);
    const prep = map.placements.find((p) => p.itemKey === 'prep_station');
    expect(prep).toBeDefined();
    expect(isKitchenCell(map.zones, prep!.x, prep!.y)).toBe(true);
    expect(isDiningCell(map.zones, 1, 2)).toBe(true);
    expect(isKitchenCell(map.zones, 1, 2)).toBe(false);
    expect(isPerimeterWallCell(prep!.x, prep!.y, map.gridSize.w, map.gridSize.h)).toBe(false);
    for (const p of map.placements) {
      expect(isPerimeterWallCell(p.x, p.y, map.gridSize.w, map.gridSize.h)).toBe(false);
    }
  });
});

describe('perimeterWallEdge', () => {
  const w = 10;
  const h = 8;

  it('returns null for interior cells', () => {
    expect(perimeterWallEdge(1, 1, w, h)).toBeNull();
    expect(perimeterWallEdge(5, 3, w, h)).toBeNull();
  });

  it('picks N/S/E/W so each edge uses the matching wall tile', () => {
    expect(perimeterWallEdge(4, 0, w, h)).toBe('n');
    expect(perimeterWallEdge(4, h - 1, w, h)).toBe('s');
    expect(perimeterWallEdge(0, 3, w, h)).toBe('w');
    expect(perimeterWallEdge(w - 1, 3, w, h)).toBe('e');
  });

  it('prefers N/S at corners so horizontal runs stay consistent', () => {
    expect(perimeterWallEdge(0, 0, w, h)).toBe('n');
    expect(perimeterWallEdge(w - 1, 0, w, h)).toBe('n');
    expect(perimeterWallEdge(0, h - 1, w, h)).toBe('s');
    expect(perimeterWallEdge(w - 1, h - 1, w, h)).toBe('s');
  });

  it('maps each edge to the oriented wall atlas frame', () => {
    expect(wallTileNameForEdge('n')).toBe('wall_n');
    expect(wallTileNameForEdge('e')).toBe('wall_e');
    expect(wallTileNameForEdge('s')).toBe('wall_s');
    expect(wallTileNameForEdge('w')).toBe('wall_w');
  });
});
