import { describe, expect, it } from 'vitest';
import { seatsFromPlacements } from '../../domain/floor/seats.ts';
import {
  admitNextGuest,
  completeGuestEntering,
  completeGuestLeaving,
  completeGuestSeating,
  createFloorDayFromCustomers,
  seatNextWaiting,
  tablesFromPlacements,
} from '../../domain/floor/sim.ts';
import { setTable } from '../../domain/floor/tables.ts';
import { waitingAreaOccupied } from '../../domain/floor/entry.ts';
import type { FloorDay } from '../../domain/floor/types.ts';
import type { Customer } from '../../domain/day/types.ts';
import type { CustomerPreference } from '../../domain/types.ts';

const pref = (): CustomerPreference => ({
  primary: { UM: 'high' },
  avoid: {},
  phrases: ['savory'],
});

function customer(id: string): Customer {
  return { id, archetypeId: 'test', preference: pref() };
}

describe('guest entry gating', () => {
  const placements = [
    { id: 'table_1', itemKey: 'table_2seat', x: 2, y: 2, rotation: 0 },
    { id: 'table_2', itemKey: 'table_2seat', x: 5, y: 2, rotation: 0 },
  ];

  it('admits only one guest at a time until the prior guest reaches their seat', () => {
    const tables = tablesFromPlacements(placements).map(setTable);
    const seats = seatsFromPlacements(placements);
    let day = createFloorDayFromCustomers(
      [customer('c1'), customer('c2'), customer('c3')],
      tables,
      seats,
    );

    // Day open: first guest walks in; others stay queued outside.
    expect(day.pool.filter((g) => g.stage === 'entering')).toHaveLength(1);
    expect(day.pool.filter((g) => g.stage === 'waiting')).toHaveLength(0);
    expect(day.pool.filter((g) => g.stage === 'queued')).toHaveLength(2);
    expect(waitingAreaOccupied(day)).toBe(true);

    // Cannot pour another guest through the door while entry/wait is occupied.
    const blocked = admitNextGuest(day);
    expect(blocked).toEqual(day);
    expect(blocked.pool.filter((g) => g.stage === 'queued')).toHaveLength(2);

    // Finish the enter walk → one ready-to-seat guest in the waiting area.
    day = completeGuestEntering(day);
    expect(day.pool.filter((g) => g.stage === 'waiting')).toHaveLength(1);
    expect(day.pool.filter((g) => g.stage === 'entering')).toHaveLength(0);
    expect(day.pool.filter((g) => g.stage === 'queued')).toHaveLength(2);
    expect(waitingAreaOccupied(day)).toBe(true);

    // Reserving a seat begins the seat walk but does not admit another guest.
    day = seatNextWaiting(day);
    expect(day.pool.find((g) => g.id === 'c1')!.stage).toBe('seating');
    expect(day.pool.filter((g) => g.stage === 'queued')).toHaveLength(2);
    expect(admitNextGuest(day)).toBe(day);
    expect(waitingAreaOccupied(day)).toBe(true);

    // Arrival at the stool frees the lane and auto-admits the next guest.
    day = completeGuestSeating(day, 'c1');
    expect(day.pool.find((g) => g.id === 'c1')!.stage).toBe('seated');
    const pipeline = day.pool.filter((g) => g.stage === 'entering' || g.stage === 'waiting');
    expect(pipeline).toHaveLength(1);
    expect(pipeline[0]!.id).toBe('c2');
    expect(day.pool.filter((g) => g.stage === 'queued')).toHaveLength(1);
    expect(waitingAreaOccupied(day)).toBe(true);
  });

  it('does not seat an entering guest until they reach the waiting area', () => {
    const tables = tablesFromPlacements(placements).map(setTable);
    const seats = seatsFromPlacements(placements);
    let day = createFloorDayFromCustomers([customer('c1')], tables, seats);
    expect(day.pool[0]!.stage).toBe('entering');

    const unchanged = seatNextWaiting(day);
    expect(unchanged.pool[0]!.stage).toBe('entering');

    day = completeGuestEntering(day);
    day = seatNextWaiting(day);
    expect(day.pool[0]!.stage).toBe('seating');
    day = completeGuestSeating(day, 'c1');
    expect(day.pool[0]!.stage).toBe('seated');
  });

  it('does not admit a queued guest while any guest is leaving', () => {
    const tables = tablesFromPlacements(placements).map(setTable);
    const seats = seatsFromPlacements(placements);
    const created = createFloorDayFromCustomers(
      [customer('departing'), customer('queued')],
      tables,
      seats,
    );
    const day = {
      ...created,
      pool: created.pool.map((guest) =>
        guest.id === 'departing'
          ? { ...guest, stage: 'leaving' as const, seat: seats[0] }
          : { ...guest, stage: 'queued' as const },
      ),
      tables: created.tables.map((table, index) =>
        index === 0 ? { ...table, state: 'occupied' as const } : table,
      ),
    };

    expect(admitNextGuest(day)).toBe(day);
    expect(day.pool.find((guest) => guest.id === 'queued')!.stage).toBe('queued');
  });

  it('admits only after the final global departure and finalizes each table first', () => {
    const tables = tablesFromPlacements(placements).map(setTable);
    const seats = seatsFromPlacements(placements);
    const created = createFloorDayFromCustomers(
      [customer('leaving_1'), customer('leaving_2'), customer('next')],
      tables,
      seats,
    );
    let day: FloorDay = {
      ...created,
      pool: created.pool.map((guest) => {
        if (guest.id === 'leaving_1') {
          return { ...guest, stage: 'leaving' as const, seat: seats[0] };
        }
        if (guest.id === 'leaving_2') {
          return { ...guest, stage: 'leaving' as const, seat: seats[2] };
        }
        return { ...guest, stage: 'queued' as const };
      }),
      tables: created.tables.map((table) => ({ ...table, state: 'occupied' as const })),
    };

    day = completeGuestLeaving(day, 'leaving_1');
    expect(day.tables[0]!.state).toBe('dirty');
    expect(day.tables[1]!.state).toBe('occupied');
    expect(day.pool.find((guest) => guest.id === 'next')!.stage).toBe('queued');

    day = completeGuestLeaving(day, 'leaving_2');
    expect(day.tables[1]!.state).toBe('dirty');
    expect(day.pool.find((guest) => guest.id === 'next')!.stage).toBe('entering');
    expect(day.pool.filter((guest) => guest.stage === 'leaving')).toHaveLength(0);
  });
});
