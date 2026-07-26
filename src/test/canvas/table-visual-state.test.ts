import { describe, expect, it } from 'vitest';
import {
  spriteNameForItemKey,
  spriteNameForTableState,
} from '../../assets/furniture-sprites.ts';
import type { TableSurfaceState } from '../../domain/floor/types.ts';

describe('table visual state mapping', () => {
  it('maps unset to bare table art', () => {
    expect(spriteNameForTableState('unset')).toBe('table_2seat_unset');
    expect(spriteNameForItemKey('table_2seat', 'unset')).toBe('table_2seat_unset');
  });

  it('maps ready and occupied to set place-setting art', () => {
    expect(spriteNameForTableState('ready')).toBe('table_2seat');
    expect(spriteNameForTableState('occupied')).toBe('table_2seat');
  });

  it('maps dirty to dirty-table art', () => {
    expect(spriteNameForTableState('dirty')).toBe('table_2seat_dirty');
    expect(spriteNameForItemKey('table_4seat', 'dirty')).toBe('table_2seat_dirty');
  });

  it('defaults missing/unknown service state to unset (bare)', () => {
    expect(spriteNameForTableState(null)).toBe('table_2seat_unset');
    expect(spriteNameForTableState(undefined)).toBe('table_2seat_unset');
    expect(spriteNameForItemKey('table_2seat')).toBe('table_2seat_unset');
  });

  it('covers every domain TableSurfaceState', () => {
    const states: TableSurfaceState[] = ['unset', 'ready', 'occupied', 'dirty'];
    const sprites = new Set(states.map(spriteNameForTableState));
    expect(sprites).toEqual(
      new Set(['table_2seat_unset', 'table_2seat', 'table_2seat_dirty']),
    );
  });
});
