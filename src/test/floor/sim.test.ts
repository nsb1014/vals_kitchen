import { describe, expect, it } from 'vitest';
import { seatsFromPlacements } from '../../domain/floor/seats.ts';
import {
  beginEating,
  completeGuestEntering,
  createFloorDayFromCustomers,
  hasAvailableSeatForWaitingGuest,
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

    day = { ...day, playerPosition: { ...day.pool[0]!.seat! } };
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

  it('only enables seating when a waiting guest and prepared seat are available', () => {
    const tables = tablesFromPlacements(placements);
    const seats = seatsFromPlacements(placements);
    let day = createFloorDayFromCustomers([customer('c1')], tables, seats);

    expect(hasAvailableSeatForWaitingGuest(day)).toBe(false);
    day = completeGuestEntering(day);
    expect(hasAvailableSeatForWaitingGuest(day)).toBe(false);
    day = { ...day, tables: day.tables.map(setTable) };
    expect(hasAvailableSeatForWaitingGuest(day)).toBe(true);
  });

  it('takes one nearby order at a time when multiple guests are supplied', () => {
    const tables = tablesFromPlacements(placements).map(setTable);
    const seats = seatsFromPlacements(placements);
    let day = createFloorDayFromCustomers(
      [customer('c1'), customer('c2')],
      tables,
      seats,
    );
    day = completeGuestEntering(day);
    day = seatNextWaiting(day);
    day = completeGuestEntering(day);
    day = seatNextWaiting(day);

    const firstSeat = day.pool.find((guest) => guest.id === 'c1')!.seat!;
    day = { ...day, playerPosition: { x: 99, y: 99 } };
    day = takeOrdersForSeated(day, ['c1', 'c2']);
    expect(day.tickets).toHaveLength(0);

    day = { ...day, playerPosition: { ...firstSeat } };
    day = takeOrdersForSeated(day, ['c1', 'c2']);

    expect(day.tickets).toHaveLength(1);
    expect(day.pool.find((guest) => guest.id === 'c1')?.stage).toBe('ordered');
    expect(day.pool.find((guest) => guest.id === 'c2')?.stage).toBe('seated');
  });

  it('leaves the fifth nearby order untouched when four tickets are active', () => {
    const tables = tablesFromPlacements(placements).map(setTable);
    const seats = seatsFromPlacements(placements);
    const fifthCustomer = customer('c5');
    const created = createFloorDayFromCustomers([fifthCustomer], tables, seats);
    const seat = seats[0]!;
    const day = {
      ...created,
      playerPosition: { x: seat.x, y: seat.y },
      pool: [
        {
          ...created.pool[0]!,
          stage: 'seated' as const,
          seat,
        },
      ],
      tickets: [1, 2, 3, 4].map((number) => ({
        id: `ticket_c${number}`,
        customerId: `c${number}`,
        ingredientIds: [],
        status: 'open' as const,
      })),
      selectedTicketId: 'ticket_c1',
    };

    const result = takeOrdersForSeated(day, [fifthCustomer.id]);

    expect(result).toBe(day);
    expect(result.tickets).toHaveLength(4);
    expect(result.pool[0]!.stage).toBe('seated');
  });
});
