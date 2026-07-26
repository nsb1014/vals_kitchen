import { describe, expect, it } from 'vitest';
import { seatsFromPlacements } from '../../domain/floor/seats.ts';
import {
  beginEating,
  completeGuestEntering,
  createFloorDayFromCustomers,
  isFloorDayComplete,
  seatNextWaiting,
  tablesFromPlacements,
  takeOrdersForSeated,
  tickEating,
} from '../../domain/floor/sim.ts';
import { clearTable, setTable } from '../../domain/floor/tables.ts';
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

describe('floor sim', () => {
  const placements = [
    { id: 'table_1', itemKey: 'table_2seat', x: 0, y: 0, rotation: 0 },
    { id: 'table_2', itemKey: 'table_2seat', x: 2, y: 0, rotation: 0 },
  ];

  it('seats waiting guest onto a ready table, then completes after eat+clear', () => {
    let tables = tablesFromPlacements(placements).map(setTable);
    const seats = seatsFromPlacements(placements);
    let day = createFloorDayFromCustomers([customer('c1')], tables, seats);
    day = completeGuestEntering(day);
    day = seatNextWaiting(day);
    expect(day.pool[0]!.stage).toBe('seated');
    expect(day.tables.find((t) => t.placementId === 'table_1')!.state).toBe('occupied');

    day = takeOrdersForSeated(day, ['c1']);
    expect(day.tickets).toHaveLength(1);
    expect(day.pool[0]!.stage).toBe('ordered');

    day = beginEating(day, 'c1', 1);
    day = tickEating(day);
    expect(day.pool[0]!.stage).toBe('leaving');
    expect(day.pool[0]!.seat).toBeUndefined();
    expect(day.pool[0]!.eatTicksRemaining).toBe(2);
    expect(day.tables.find((t) => t.placementId === 'table_1')!.state).toBe('dirty');
    expect(isFloorDayComplete(day)).toBe(false);

    day = tickEating(day);
    expect(day.pool[0]!.stage).toBe('leaving');
    expect(day.pool[0]!.eatTicksRemaining).toBe(1);

    day = tickEating(day);
    expect(day.pool[0]!.stage).toBe('done');
    expect(day.pool[0]!.eatTicksRemaining).toBe(0);

    tables = day.tables.map((t) => (t.state === 'dirty' ? clearTable(t) : t));
    day = { ...day, tables, tickets: day.tickets.map((t) => ({ ...t, status: 'delivered' as const })) };
    expect(isFloorDayComplete(day)).toBe(true);
  });
});
