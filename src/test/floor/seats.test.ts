import { describe, expect, it } from 'vitest';
import { assignPartyToTable, seatsFromPlacements } from '../../domain/floor/seats.ts';
import type { Placement } from '../../domain/state/game-state.ts';

describe('seatsFromPlacements', () => {
  it('yields 4 seats for two table_2seat placements', () => {
    const placements: Placement[] = [
      { id: 'table_1', itemKey: 'table_2seat', x: 0, y: 0, rotation: 0 },
      { id: 'table_2', itemKey: 'table_2seat', x: 2, y: 0, rotation: 0 },
    ];
    const seats = seatsFromPlacements(placements);
    expect(seats).toHaveLength(4);
    expect(seats.filter((s) => s.tablePlacementId === 'table_1')).toHaveLength(2);
  });
});

describe('assignPartyToTable', () => {
  const seats = seatsFromPlacements([
    { id: 'table_1', itemKey: 'table_2seat', x: 0, y: 0, rotation: 0 },
  ]);

  it('assigns party size 2 on a 2-top', () => {
    const assigned = assignPartyToTable(seats, 'table_1', 2);
    expect(assigned).toHaveLength(2);
  });

  it('returns null when party larger than table', () => {
    expect(assignPartyToTable(seats, 'table_1', 3)).toBeNull();
  });
});
