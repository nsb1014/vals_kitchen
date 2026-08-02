import type { Customer } from '../day/types.ts';
import { markDirty, occupyTable } from './tables.ts';
import { assignPartyToTable } from './seats.ts';
import { canEnqueue, enqueueTickets } from './tickets.ts';
import { waitingAreaOccupied } from './entry.ts';
import { playerNearGuestSeat } from './interact.ts';
import type { FloorDay, FloorGuest, FloorTable, FloorTicket, SeatSlot } from './types.ts';

const ACTIVE_AT_TABLE: ReadonlySet<FloorGuest['stage']> = new Set([
  'seating',
  'seated',
  'ordered',
  'eating',
  'leaving',
]);

/** Promote the next queued guest to `entering` if the waiting area is free. */
export function admitNextGuest(day: FloorDay): FloorDay {
  if (waitingAreaOccupied(day)) return day;
  const next = day.pool.find((g) => g.stage === 'queued');
  if (!next) return day;
  return {
    ...day,
    pool: day.pool.map((g) =>
      g.id === next.id ? { ...g, stage: 'entering' as const } : g,
    ),
  };
}

/** Enter walk finished: `entering` → `waiting` (ready to seat). */
export function completeGuestEntering(day: FloorDay): FloorDay {
  const entering = day.pool.find((g) => g.stage === 'entering');
  if (!entering) return day;
  return {
    ...day,
    pool: day.pool.map((g) =>
      g.id === entering.id ? { ...g, stage: 'waiting' as const } : g,
    ),
  };
}

export function createFloorDayFromCustomers(
  customers: Customer[],
  tables: FloorTable[],
  seats: SeatSlot[],
  playerPosition: { x: number; y: number } = { x: 0, y: 0 },
): FloorDay {
  const day: FloorDay = {
    pool: customers.map((customer) => ({
      id: customer.id,
      customer,
      stage: 'queued' as const,
      eatTicksRemaining: 0,
    })),
    tables: tables.map((t) => ({ ...t })),
    seats: seats.map((s) => ({ ...s })),
    tickets: [],
    carriedTicketId: null,
    selectedTicketId: null,
    tutorialStep: null,
    playerPosition: { ...playerPosition },
  };
  return admitNextGuest(day);
}

function takenSeatKeys(day: FloorDay): Set<string> {
  const keys = new Set<string>();
  for (const g of day.pool) {
    if (g.seat && ACTIVE_AT_TABLE.has(g.stage)) {
      keys.add(`${g.seat.tablePlacementId}:${g.seat.slotIndex}`);
    }
  }
  return keys;
}

function freeSlotsOnTable(day: FloorDay, tablePlacementId: string): SeatSlot[] {
  const taken = takenSeatKeys(day);
  return day.seats
    .filter((s) => s.tablePlacementId === tablePlacementId)
    .filter((s) => !taken.has(`${s.tablePlacementId}:${s.slotIndex}`))
    .sort((a, b) => a.slotIndex - b.slotIndex);
}

export function hasAvailableSeatForWaitingGuest(day: FloorDay): boolean {
  if (!day.pool.some((guest) => guest.stage === 'waiting')) return false;
  // Morning setup is restaurant-wide: service cannot begin while any table is
  // still unset. Mid-day dirty/occupied tables do not block seating elsewhere.
  if (day.tables.some((table) => table.state === 'unset')) return false;
  return day.tables.some(
    (table) =>
      (table.state === 'ready' || table.state === 'occupied') &&
      freeSlotsOnTable(day, table.placementId).length > 0,
  );
}

/** Reserve a seat for the next waiting guest and begin their walk to it. Party size 1. */
export function seatNextWaiting(day: FloorDay): FloorDay {
  const waiting = day.pool.find((g) => g.stage === 'waiting');
  if (!waiting) return day;
  // Enforce the same invariant at the domain boundary so direct reducer
  // dispatches cannot bypass the UI selector's morning-setup gate.
  if (day.tables.some((table) => table.state === 'unset')) return day;

  for (const table of day.tables) {
    if (table.state !== 'ready' && table.state !== 'occupied') continue;
    const free = freeSlotsOnTable(day, table.placementId);
    if (free.length < 1) continue;
    const assigned = assignPartyToTable(day.seats, table.placementId, 1);
    if (!assigned || assigned.length < 1) continue;
    const seat = free[0]!;

    const pool = day.pool.map((g) =>
      g.id === waiting.id ? { ...g, stage: 'seating' as const, seat } : g,
    );
    const tables =
      table.state === 'ready'
        ? day.tables.map((t) => (t.placementId === table.placementId ? occupyTable(t) : t))
        : day.tables;
    // The arrival lane remains reserved until the guest actually reaches the
    // seat, so guests never overlap while walking through the entrance.
    return { ...day, pool, tables };
  }

  return day;
}

/** Seat walk finished: `seating` -> `seated`, then admit the next arrival. */
export function completeGuestSeating(day: FloorDay, guestId: FloorGuest['id']): FloorDay {
  const seating = day.pool.find((guest) => guest.id === guestId);
  if (!seating || seating.stage !== 'seating') return day;

  const pool = day.pool.map((guest) =>
    guest.id === guestId ? { ...guest, stage: 'seated' as const } : guest,
  );
  return admitNextGuest({ ...day, pool });
}

export function takeOrdersForSeated(day: FloorDay, customerIds: string[]): FloorDay {
  // The service interaction is intentionally one guest at a time even when a
  // caller supplies more than one id. Proximity is a domain rule, not a HUD
  // convention, so remote seated guests are ignored.
  const customerId = customerIds.find((id) =>
    day.pool.some(
      (guest) =>
        guest.customer.id === id &&
        guest.stage === 'seated' &&
        playerNearGuestSeat(day.playerPosition, guest),
    ),
  );
  if (!customerId) return day;
  if (!canEnqueue(day.tickets, 1)) return day;
  const newTickets: FloorTicket[] = [];
  const pool = day.pool.map((g) => {
    if (g.customer.id !== customerId || g.stage !== 'seated') return g;
    newTickets.push({
      id: `ticket_${g.customer.id}`,
      customerId: g.customer.id,
      ingredientIds: [],
      status: 'open',
    });
    return { ...g, stage: 'ordered' as const };
  });
  if (newTickets.length === 0) return day;
  const tickets = enqueueTickets(day.tickets, newTickets);
  return {
    ...day,
    pool,
    tickets,
    selectedTicketId: day.selectedTicketId ?? newTickets[0]!.id,
  };
}

export function beginEating(day: FloorDay, customerId: string, eatTicks: number): FloorDay {
  return {
    ...day,
    pool: day.pool.map((g) =>
      g.customer.id === customerId
        ? { ...g, stage: 'eating' as const, eatTicksRemaining: eatTicks }
        : g,
    ),
  };
}

function guestsActiveOnTable(day: FloorDay, tablePlacementId: string): boolean {
  return day.pool.some(
    (g) =>
      g.seat?.tablePlacementId === tablePlacementId && ACTIVE_AT_TABLE.has(g.stage),
  );
}

/** Decrement the pacing-only eating dwell; guests retain their seat while leaving. */
export function tickEating(day: FloorDay): FloorDay {
  let changed = false;
  const pool = day.pool.map((guest) => {
    if (guest.stage !== 'eating') return guest;
    changed = true;
    const remaining = guest.eatTicksRemaining - 1;
    return remaining > 0
      ? { ...guest, eatTicksRemaining: remaining }
      : { ...guest, stage: 'leaving' as const, eatTicksRemaining: 0 };
  });
  return changed ? { ...day, pool } : day;
}

/**
 * Exit walk finished: release the guest's seat and dirty the table only after
 * the last guest associated with that table has physically left.
 */
export function completeGuestLeaving(day: FloorDay, guestId: FloorGuest['id']): FloorDay {
  const leaving = day.pool.find((guest) => guest.id === guestId);
  if (!leaving || leaving.stage !== 'leaving') return day;

  const tableId = leaving.seat?.tablePlacementId;
  const pool = day.pool.map((guest) =>
    guest.id === guestId
      ? { ...guest, stage: 'done' as const, eatTicksRemaining: 0, seat: undefined }
      : guest,
  );
  const afterExit = { ...day, pool };
  if (!tableId || guestsActiveOnTable(afterExit, tableId)) return afterExit;

  return {
    ...afterExit,
    tables: day.tables.map((table) =>
      table.placementId === tableId && table.state === 'occupied'
        ? markDirty(table)
        : table,
    ),
  };
}

export function isFloorDayComplete(day: FloorDay): boolean {
  const allDone = day.pool.every((g) => g.stage === 'done');
  const noDirty = day.tables.every((t) => t.state !== 'dirty');
  const noActiveTickets = day.tickets.every((t) => t.status === 'delivered');
  return allDone && noDirty && noActiveTickets && day.pool.length > 0;
}

export function tablesFromPlacements(
  placements: { id: string; itemKey: string }[],
): FloorTable[] {
  return placements
    .filter((p) => p.itemKey.startsWith('table'))
    .map((p) => ({
      placementId: p.id,
      state: 'unset' as const,
      seatSlotCount: p.itemKey.includes('4') ? 4 : 2,
    }));
}
