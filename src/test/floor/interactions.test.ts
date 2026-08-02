import { describe, expect, it } from 'vitest';
import {
  adjacentDirtyTablePlacementIds,
  adjacentSeatedCustomerIds,
  adjacentUnsetTablePlacementIds,
  findCookStationPlacementAtCell,
  guestServicePositions,
  isAdjacent,
  isCookStationItemKey,
  playerNearGuestSeat,
  playerNearPlacement,
  playerNearStation,
  seatedUnorderedCustomerIds,
} from '../../domain/floor/interact.ts';
import {
  createFloorDayFromCustomers,
  tablesFromPlacements,
} from '../../domain/floor/sim.ts';
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
      const placement = {
        id: 'prep',
        itemKey: 'prep_station',
        x: 7,
        y: 2,
        rotation: 0,
      };
      expect(playerNearPlacement({ x: 6, y: 2 }, placement)).toBe(true);
      expect(playerNearPlacement({ x: 8, y: 2 }, placement)).toBe(true);
      expect(playerNearPlacement({ x: 1, y: 1 }, placement)).toBe(false);
    });
  });

  describe('playerNearStation', () => {
    it('is true near prep station, false near tables only', () => {
      const placements = [
        { id: 'table_1', itemKey: 'table_2seat', x: 1, y: 2, rotation: 0 },
        {
          id: 'station_prep',
          itemKey: 'prep_station',
          x: 7,
          y: 2,
          rotation: 0,
        },
      ];
      expect(playerNearStation({ x: 6, y: 2 }, placements)).toBe(true);
      expect(playerNearStation({ x: 0, y: 2 }, placements)).toBe(false);
    });
  });

  describe('isCookStationItemKey', () => {
    it('recognizes every canonical equipment item as a cook station', () => {
      const equipmentItemKeys = [
        'prep_station',
        'grill',
        'oven',
        'fryer',
        'stockpot',
        'cold_station',
        'pastry_bench',
        'smoker',
        'wok',
        'fermentation_crock',
        'barista_station',
        'spice_rack',
      ];

      expect(equipmentItemKeys).toHaveLength(12);
      for (const itemKey of equipmentItemKeys) {
        expect(isCookStationItemKey(itemKey), itemKey).toBe(true);
      }
    });

    it('rejects tables, decor, and unknown item keys', () => {
      expect(isCookStationItemKey('table_2seat')).toBe(false);
      expect(isCookStationItemKey('table_4seat')).toBe(false);
      expect(isCookStationItemKey('decor_plant')).toBe(false);
      expect(isCookStationItemKey('mystery_station')).toBe(false);
    });
  });

  describe('findCookStationPlacementAtCell', () => {
    it('resolves canonical cook stations, but not other placements, at the tapped cell', () => {
      const placements = [
        { id: 'station', itemKey: 'wok', x: 8, y: 2, rotation: 0 },
        { id: 'table', itemKey: 'table_2seat', x: 3, y: 3, rotation: 0 },
      ];
      expect(
        findCookStationPlacementAtCell(placements, { x: 8, y: 2 })?.id,
      ).toBe('station');
      expect(
        findCookStationPlacementAtCell(placements, { x: 3, y: 3 }),
      ).toBeNull();
      expect(
        findCookStationPlacementAtCell(placements, { x: 0, y: 0 }),
      ).toBeNull();
    });
  });

  describe('playerNearGuestSeat', () => {
    it('keeps vertical chibi silhouettes two cells apart while allowing side service', () => {
      const guest: FloorGuest = {
        id: 'g1',
        customer: customer('c1'),
        stage: 'ordered',
        seat: { tablePlacementId: 't1', slotIndex: 0, x: 1, y: 3, facing: 0 },
        eatTicksRemaining: 0,
      };
      expect(guestServicePositions(guest.seat!)).toEqual([
        { x: 0, y: 3 },
        { x: 2, y: 3 },
        { x: 1, y: 1 },
        { x: 1, y: 5 },
      ]);
      expect(playerNearGuestSeat({ x: 0, y: 3 }, guest)).toBe(true);
      expect(playerNearGuestSeat({ x: 1, y: 4 }, guest)).toBe(false);
      expect(playerNearGuestSeat({ x: 1, y: 5 }, guest)).toBe(true);
      expect(playerNearGuestSeat({ x: 1, y: 3 }, guest)).toBe(false);
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
      const placements = [
        { id: 'table_1', itemKey: 'table_2seat', x: 0, y: 0, rotation: 0 },
      ];
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

  describe('adjacentUnsetTablePlacementIds', () => {
    it('returns unset table placementIds only when player is adjacent to that table', () => {
      const placements = [
        { id: 'table_1', itemKey: 'table_2seat', x: 0, y: 0, rotation: 0 },
        { id: 'table_2', itemKey: 'table_2seat', x: 2, y: 0, rotation: 0 },
      ];
      const tables = tablesFromPlacements(placements);
      const seats = seatsFromPlacements(placements);
      const day = createFloorDayFromCustomers([customer('c1')], tables, seats);

      expect(
        adjacentUnsetTablePlacementIds(day, { x: 0, y: 1 }, placements),
      ).toEqual(['table_1']);
      expect(
        adjacentUnsetTablePlacementIds(day, { x: 5, y: 5 }, placements),
      ).toEqual([]);
    });

    it('ignores ready or dirty tables', () => {
      const placements = [
        { id: 'table_1', itemKey: 'table_2seat', x: 0, y: 0, rotation: 0 },
      ];
      const tables = tablesFromPlacements(placements).map((t) =>
        t.placementId === 'table_1' ? setTable(t) : t,
      );
      const seats = seatsFromPlacements(placements);
      const day = createFloorDayFromCustomers([customer('c1')], tables, seats);

      expect(
        adjacentUnsetTablePlacementIds(day, { x: 0, y: 1 }, placements),
      ).toEqual([]);
    });
  });

  describe('adjacentDirtyTablePlacementIds', () => {
    it('returns dirty table placementIds only when player is adjacent to that table', () => {
      const placements = [
        { id: 'table_1', itemKey: 'table_2seat', x: 0, y: 0, rotation: 0 },
        { id: 'table_2', itemKey: 'table_2seat', x: 2, y: 0, rotation: 0 },
      ];
      const tables = tablesFromPlacements(placements).map((t) => ({
        ...t,
        state: 'dirty' as const,
      }));
      const seats = seatsFromPlacements(placements);
      const day = createFloorDayFromCustomers([customer('c1')], tables, seats);

      expect(
        adjacentDirtyTablePlacementIds(day, { x: 2, y: 1 }, placements),
      ).toEqual(['table_2']);
      expect(
        adjacentDirtyTablePlacementIds(day, { x: 0, y: 1 }, placements),
      ).toEqual(['table_1']);
    });
  });

  describe('adjacentSeatedCustomerIds', () => {
    it('returns seated guest ids only when player is Chebyshev-adjacent to their seat', () => {
      const placements = [
        { id: 'table_1', itemKey: 'table_2seat', x: 1, y: 0, rotation: 0 },
        { id: 'table_2', itemKey: 'table_2seat', x: 4, y: 0, rotation: 0 },
      ];
      const tables = tablesFromPlacements(placements).map(setTable);
      const seats = seatsFromPlacements(placements);
      const seat1 = seats.find((s) => s.tablePlacementId === 'table_1')!;
      const seat2 = seats.find((s) => s.tablePlacementId === 'table_2')!;
      const day = createFloorDayFromCustomers(
        [customer('c1'), customer('c2')],
        tables,
        seats,
      );
      const withSeated: typeof day = {
        ...day,
        pool: day.pool.map((g, i) =>
          i === 0
            ? { ...g, stage: 'seated' as const, seat: seat1 }
            : i === 1
              ? { ...g, stage: 'seated' as const, seat: seat2 }
              : g,
        ),
      };

      // 2-top seats sit west/east of their table; adjacency is per seat cell.
      expect(
        adjacentSeatedCustomerIds(withSeated, { x: seat1.x - 1, y: seat1.y }),
      ).toEqual(['c1']);
      expect(
        adjacentSeatedCustomerIds(withSeated, { x: seat2.x + 1, y: seat2.y }),
      ).toEqual(['c2']);
      expect(adjacentSeatedCustomerIds(withSeated, { x: 10, y: 10 })).toEqual(
        [],
      );
    });
  });
});
