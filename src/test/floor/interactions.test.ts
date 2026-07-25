import { describe, expect, it } from 'vitest';
import {
  adjacentSeatedCustomerIds,
  isAdjacent,
  playerNearGuestSeat,
  playerNearPlacement,
  playerNearStation,
  seatedUnorderedCustomerIds,
} from '../../domain/floor/interact.ts';
import { createFloorDayFromCustomers, tablesFromPlacements } from '../../domain/floor/sim.ts';
import { seatsFromPlacements } from '../../domain/floor/seats.ts';
import { setTable } from '../../domain/floor/tables.ts';
import type { Customer } from '../../domain/day/types.ts';
import type { CustomerPreference } from '../../domain/types.ts';
import type { FloorGuest } from '../../domain/floor/types.ts';

const pref = (): CustomerPreference => ({
  primary: { UM: 'high' },
  avoid: {},
  phrases: ['savory'],
});

function customer(id: string): Customer {
  return { id, archetypeId: 'test', preference: pref() };
}

describe('floor interact helpers', () => {
  describe('isAdjacent', () => {
    it('treats same cell and Chebyshev neighbors as adjacent', () => {
      expect(isAdjacent({ x: 2, y: 2 }, { x: 2, y: 2 })).toBe(true);
      expect(isAdjacent({ x: 2, y: 2 }, { x: 3, y: 2 })).toBe(true);
      expect(isAdjacent({ x: 2, y: 2 }, { x: 3, y: 3 })).toBe(true);
      expect(isAdjacent({ x: 2, y: 2 }, { x: 4, y: 2 })).toBe(false);
    });
  });

  describe('playerNearPlacement', () => {
    it('is true when player touches placement origin cell', () => {
      const placement = { id: 'prep', itemKey: 'prep_station', x: 7, y: 2, rotation: 0 };
      expect(playerNearPlacement({ x: 6, y: 2 }, placement)).toBe(true);
      expect(playerNearPlacement({ x: 8, y: 2 }, placement)).toBe(true);
      expect(playerNearPlacement({ x: 1, y: 1 }, placement)).toBe(false);
    });
  });

  describe('playerNearStation', () => {
    it('is true near prep station, false near tables only', () => {
      const placements = [
        { id: 'table_1', itemKey: 'table_2seat', x: 1, y: 2, rotation: 0 },
        { id: 'station_prep', itemKey: 'prep_station', x: 7, y: 2, rotation: 0 },
      ];
      expect(playerNearStation({ x: 6, y: 2 }, placements)).toBe(true);
      expect(playerNearStation({ x: 0, y: 2 }, placements)).toBe(false);
    });
  });

  describe('playerNearGuestSeat', () => {
    it('is true when player is adjacent to guest seat', () => {
      const guest: FloorGuest = {
        id: 'g1',
        customer: customer('c1'),
        stage: 'ordered',
        seat: { tablePlacementId: 't1', slotIndex: 0, x: 1, y: 3, facing: 0 },
        eatTicksRemaining: 0,
      };
      expect(playerNearGuestSeat({ x: 1, y: 4 }, guest)).toBe(true);
      expect(playerNearGuestSeat({ x: 5, y: 5 }, guest)).toBe(false);
    });

    it('is false when guest has no seat', () => {
      const guest: FloorGuest = {
        id: 'g1',
        customer: customer('c1'),
        stage: 'waiting',
        eatTicksRemaining: 0,
      };
      expect(playerNearGuestSeat({ x: 1, y: 1 }, guest)).toBe(false);
    });
  });

  describe('seatedUnorderedCustomerIds', () => {
    it('returns ids for seated guests only', () => {
      const placements = [{ id: 'table_1', itemKey: 'table_2seat', x: 0, y: 0, rotation: 0 }];
      const tables = tablesFromPlacements(placements).map(setTable);
      const seats = seatsFromPlacements(placements);
      const day = createFloorDayFromCustomers(
        [customer('c1'), customer('c2'), customer('c3')],
        tables,
        seats,
      );
      const withSeated: typeof day = {
        ...day,
        pool: day.pool.map((g, i) =>
          i === 0
            ? { ...g, stage: 'seated' as const, seat: seats[0] }
            : i === 1
              ? { ...g, stage: 'ordered' as const, seat: seats[1] }
              : g,
        ),
      };
      expect(seatedUnorderedCustomerIds(withSeated)).toEqual(['c1']);
    });
  });

  describe('adjacentSeatedCustomerIds', () => {
    it('returns seated guest ids only when player is Chebyshev-adjacent to their seat', () => {
      const placements = [{ id: 'table_1', itemKey: 'table_2seat', x: 0, y: 0, rotation: 0 }];
      const tables = tablesFromPlacements(placements).map(setTable);
      const seats = seatsFromPlacements(placements);
      const day = createFloorDayFromCustomers(
        [customer('c1'), customer('c2')],
        tables,
        seats,
      );
      const withSeated: typeof day = {
        ...day,
        pool: day.pool.map((g, i) =>
          i === 0
            ? { ...g, stage: 'seated' as const, seat: seats[0] }
            : i === 1
              ? { ...g, stage: 'seated' as const, seat: seats[1] }
              : g,
        ),
      };

      expect(adjacentSeatedCustomerIds(withSeated, { x: seats[0]!.x - 1, y: seats[0]!.y })).toEqual([
        'c1',
      ]);
      expect(adjacentSeatedCustomerIds(withSeated, { x: 10, y: 10 })).toEqual([]);
    });
  });
});
