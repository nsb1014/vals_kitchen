import { describe, expect, it } from 'vitest';
import {
  createStarterMap,
  isDiningCell,
  isKitchenCell,
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
  });
});
