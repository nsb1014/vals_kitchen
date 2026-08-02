import { describe, expect, it } from 'vitest';
import { clearTable, markDirty, occupyTable, setTable } from '../../domain/floor/tables.ts';
import type { FloorTable } from '../../domain/floor/types.ts';

const base = (): FloorTable => ({
  placementId: 'table_1',
  state: 'unset',
  seatSlotCount: 2,
});

describe('table lifecycle', () => {
  it('set → occupy → dirty → clear → ready for the next guest', () => {
    let t = setTable(base());
    expect(t.state).toBe('ready');
    t = occupyTable(t);
    expect(t.state).toBe('occupied');
    t = markDirty(t);
    expect(t.state).toBe('dirty');
    t = clearTable(t);
    expect(t.state).toBe('ready');
  });

  it('rejects set when not unset', () => {
    expect(() => setTable({ ...base(), state: 'ready' })).toThrow();
  });

  it('rejects occupy when not ready', () => {
    expect(() => occupyTable({ ...base(), state: 'unset' })).toThrow();
    expect(() => occupyTable({ ...base(), state: 'occupied' })).toThrow();
  });

  it('rejects markDirty when not occupied', () => {
    expect(() => markDirty({ ...base(), state: 'ready' })).toThrow();
    expect(() => markDirty({ ...base(), state: 'dirty' })).toThrow();
  });

  it('rejects clear when not dirty', () => {
    expect(() => clearTable({ ...base(), state: 'ready' })).toThrow();
    expect(() => clearTable({ ...base(), state: 'occupied' })).toThrow();
  });
});
