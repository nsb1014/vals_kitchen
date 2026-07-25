import { describe, expect, it } from 'vitest';
import type { Placement } from '../../domain/state/game-state.ts';
import { assignPartyToTable, seatsFromPlacements } from '../../domain/floor/seats.ts';

describe('seatsFromPlacements', () => {
  it('derives two south-facing seats per table_2seat', () => {
    const placements: Placement[] = [
      { id: 'table_a', itemKey: 'table_2seat', x: 0, y: 0, rotation: 0 },
      { id: 'table_b', itemKey: 'table_2seat', x: 2, y: 0, rotation: 0 },
    ];
    const seats = seatsFromPlacements(placements);
    expect(seats).toHaveLength(4);
    expect(seats.filter((s) => s.tablePlacementId === 'table_a')).toEqual([
      { tablePlacementId: 'table_a', slotIndex: 0, x: 0, y: 1, facing: 0 },
      { tablePlacementId: 'table_a', slotIndex: 1, x: 1, y: 1, facing: 0 },
    ]);
    expect(seats.filter((s) => s.tablePlacementId === 'table_b')).toEqual([
      { tablePlacementId: 'table_b', slotIndex: 0, x: 2, y: 1, facing: 0 },
      { tablePlacementId: 'table_b', slotIndex: 1, x: 3, y: 1, facing: 0 },
    ]);
  });

  it('ignores non-table placements', () => {
    const placements: Placement[] = [
      { id: 'prep', itemKey: 'prep_station', x: 0, y: 0, rotation: 0 },
    ];
    expect(seatsFromPlacements(placements)).toEqual([]);
  });
});

describe('assignPartyToTable', () => {
  const placements: Placement[] = [
    { id: 'table_a', itemKey: 'table_2seat', x: 0, y: 0, rotation: 0 },
    { id: 'table_b', itemKey: 'table_2seat', x: 2, y: 0, rotation: 0 },
  ];
  const seats = seatsFromPlacements(placements);

  it('returns both slots for party size 2 on a 2-top', () => {
    const assigned = assignPartyToTable(seats, 'table_a', 2);
    expect(assigned).toHaveLength(2);
    expect(assigned!.every((s) => s.tablePlacementId === 'table_a')).toBe(true);
  });

  it('returns one slot for party size 1', () => {
    const assigned = assignPartyToTable(seats, 'table_a', 1);
    expect(assigned).toHaveLength(1);
    expect(assigned![0]).toEqual({
      tablePlacementId: 'table_a',
      slotIndex: 0,
      x: 0,
      y: 1,
      facing: 0,
    });
  });

  it('returns null when party exceeds table capacity', () => {
    expect(assignPartyToTable(seats, 'table_a', 3)).toBeNull();
  });

  it('returns null for unknown table', () => {
    expect(assignPartyToTable(seats, 'missing', 1)).toBeNull();
  });
});
