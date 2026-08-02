import { describe, expect, it } from 'vitest';
import { seatsFromPlacements } from '../../domain/floor/seats.ts';
import {
  beginEating,
  completeGuestEntering,
  completeGuestLeaving,
  completeGuestSeating,
  createFloorDayFromCustomers,
  hasAvailableSeatForWaitingGuest,
  isFloorDayComplete,
  seatNextWaiting,
  tablesFromPlacements,
  takeOrdersForSeated,
  tickEating,
  updateGuestMotionPosition,
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
    expect(day.pool[0]!.stage).toBe('seating');
    day = completeGuestSeating(day, 'c1');
    expect(day.pool[0]!.stage).toBe('seated');
    expect(day.tables.find((t) => t.placementId === 'table_1')!.state).toBe('occupied');

    day = {
      ...day,
      playerPosition: {
        x: day.pool[0]!.seat!.x,
        y: day.pool[0]!.seat!.y + 2,
      },
    };
    day = takeOrdersForSeated(day, ['c1']);
    expect(day.tickets).toHaveLength(1);
    expect(day.pool[0]!.stage).toBe('ordered');

    day = beginEating(day, 'c1', 1);
    day = tickEating(day);
    expect(day.pool[0]!.stage).toBe('leaving');
    expect(day.pool[0]!.seat).toBeDefined();
    expect(day.pool[0]!.eatTicksRemaining).toBe(0);
    expect(day.tables.find((t) => t.placementId === 'table_1')!.state).toBe('occupied');
    expect(isFloorDayComplete(day)).toBe(false);

    const noLeaveCountdown = tickEating(day);
    expect(noLeaveCountdown).toBe(day);

    day = completeGuestLeaving(day, 'c1');
    expect(day.pool[0]!.stage).toBe('done');
    expect(day.pool[0]!.seat).toBeUndefined();
    expect(day.pool[0]!.eatTicksRemaining).toBe(0);
    expect(day.tables.find((t) => t.placementId === 'table_1')!.state).toBe('dirty');

    tables = day.tables.map((t) => (t.state === 'dirty' ? clearTable(t) : t));
    day = { ...day, tables, tickets: day.tickets.map((t) => ({ ...t, status: 'delivered' as const })) };
    expect(isFloorDayComplete(day)).toBe(true);
  });

  it('requires every table to be set before enabling or performing morning seating', () => {
    const tables = tablesFromPlacements(placements);
    const seats = seatsFromPlacements(placements);
    let day = createFloorDayFromCustomers([customer('c1')], tables, seats);

    expect(hasAvailableSeatForWaitingGuest(day)).toBe(false);
    day = completeGuestEntering(day);
    expect(hasAvailableSeatForWaitingGuest(day)).toBe(false);

    day = {
      ...day,
      tables: day.tables.map((table, index) => (index === 0 ? setTable(table) : table)),
    };
    expect(hasAvailableSeatForWaitingGuest(day)).toBe(false);
    expect(seatNextWaiting(day)).toBe(day);
    expect(day.pool[0]!.stage).toBe('waiting');

    // A legacy mid-day `unset` table remains recoverable through the normal
    // set-table transition; once set, seating proceeds without reopening day.
    day = {
      ...day,
      tables: day.tables.map((table) =>
        table.state === 'unset' ? setTable(table) : table,
      ),
    };
    expect(hasAvailableSeatForWaitingGuest(day)).toBe(true);
    day = seatNextWaiting(day);
    expect(day.pool[0]!.stage).toBe('seating');
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
    day = completeGuestSeating(day, 'c1');
    day = completeGuestEntering(day);
    day = seatNextWaiting(day);
    day = completeGuestSeating(day, 'c2');

    const firstSeat = day.pool.find((guest) => guest.id === 'c1')!.seat!;
    day = { ...day, playerPosition: { x: 99, y: 99 } };
    day = takeOrdersForSeated(day, ['c1', 'c2']);
    expect(day.tickets).toHaveLength(0);

    day = {
      ...day,
      playerPosition: { x: firstSeat.x, y: firstSeat.y + 2 },
    };
    day = takeOrdersForSeated(day, ['c1', 'c2']);

    expect(day.tickets).toHaveLength(1);
    expect(day.pool.find((guest) => guest.id === 'c1')?.stage).toBe('ordered');
    expect(day.pool.find((guest) => guest.id === 'c2')?.stage).toBe('seated');
  });

  it('guards seating completion by guest id and stage', () => {
    const tables = tablesFromPlacements(placements).map(setTable);
    const seats = seatsFromPlacements(placements);
    let day = createFloorDayFromCustomers([customer('c1'), customer('c2')], tables, seats);
    day = completeGuestEntering(day);
    day = seatNextWaiting(day);

    expect(day.pool[0]!.stage).toBe('seating');
    expect(completeGuestSeating(day, 'missing')).toBe(day);
    const completed = completeGuestSeating(day, 'c1');
    expect(completed.pool.find((guest) => guest.id === 'c1')?.stage).toBe('seated');
    expect(completed.pool.find((guest) => guest.id === 'c2')?.stage).toBe('entering');
    expect(completeGuestSeating(completed, 'c1')).toBe(completed);
  });

  it('persists motion anchors only for the targeted moving guest and clears them on completion', () => {
    const tables = tablesFromPlacements(placements).map(setTable);
    const seats = seatsFromPlacements(placements);
    let day = createFloorDayFromCustomers([customer('c1'), customer('c2')], tables, seats);
    const enteringAnchor = { x: 4, y: 5 };

    const missing = updateGuestMotionPosition(day, 'missing', enteringAnchor);
    expect(missing).toBe(day);
    const invalid = updateGuestMotionPosition(day, 'c1', { x: 4.5, y: 5 });
    expect(invalid).toBe(day);

    day = updateGuestMotionPosition(day, 'c1', enteringAnchor);
    expect(day.pool[0]!.motionPosition).toEqual(enteringAnchor);
    expect(day.pool[1]!.motionPosition).toBeUndefined();
    expect(updateGuestMotionPosition(day, 'c1', enteringAnchor)).toBe(day);

    day = completeGuestEntering(day);
    expect(day.pool[0]!.stage).toBe('waiting');
    expect(day.pool[0]!.motionPosition).toBeUndefined();
    expect(updateGuestMotionPosition(day, 'c1', { x: 3, y: 4 })).toBe(day);

    day = seatNextWaiting(day);
    day = updateGuestMotionPosition(day, 'c1', { x: 2, y: 3 });
    expect(day.pool[0]!.motionPosition).toEqual({ x: 2, y: 3 });
    day = completeGuestSeating(day, 'c1');
    expect(day.pool[0]!.motionPosition).toBeUndefined();

    day = beginEating(day, 'c1', 1);
    day = tickEating(day);
    day = updateGuestMotionPosition(day, 'c1', { x: 3, y: 4 });
    expect(day.pool[0]!.motionPosition).toEqual({ x: 3, y: 4 });
    day = completeGuestLeaving(day, 'c1');
    expect(day.pool[0]!.motionPosition).toBeUndefined();
  });

  it('keeps a shared table occupied until its final leaving guest exits', () => {
    const tables = tablesFromPlacements(placements).map(setTable);
    const seats = seatsFromPlacements(placements);
    let day = createFloorDayFromCustomers([customer('c1'), customer('c2')], tables, seats);
    day = completeGuestEntering(day);
    day = seatNextWaiting(day);
    day = completeGuestSeating(day, 'c1');
    day = completeGuestEntering(day);
    day = seatNextWaiting(day);
    day = completeGuestSeating(day, 'c2');

    expect(day.pool[0]!.seat?.tablePlacementId).toBe('table_1');
    expect(day.pool[1]!.seat?.tablePlacementId).toBe('table_1');
    day = beginEating(day, 'c1', 1);
    day = beginEating(day, 'c2', 1);
    day = tickEating(day);
    expect(day.pool.every((guest) => guest.stage === 'leaving')).toBe(true);

    expect(completeGuestLeaving(day, 'missing')).toBe(day);
    day = completeGuestLeaving(day, 'c1');
    expect(day.pool[0]!.stage).toBe('done');
    expect(day.pool[1]!.stage).toBe('leaving');
    expect(day.tables[0]!.state).toBe('occupied');
    expect(completeGuestLeaving(day, 'c1')).toBe(day);

    day = completeGuestLeaving(day, 'c2');
    expect(day.pool[1]!.stage).toBe('done');
    expect(day.tables[0]!.state).toBe('dirty');
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
