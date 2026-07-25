import type { Customer } from '../day/types.ts';
import { markDirty, occupyTable } from './tables.ts';
import { assignPartyToTable } from './seats.ts';
import { enqueueTickets } from './tickets.ts';
import type { FloorDay, FloorGuest, FloorTable, FloorTicket, SeatSlot } from './types.ts';

const ACTIVE_AT_TABLE: ReadonlySet<FloorGuest['stage']> = new Set([
  'seated',
  'ordered',
  'eating',
]);

export function createFloorDayFromCustomers(
  customers: Customer[],
  tables: FloorTable[],
  seats: SeatSlot[],
  playerPosition: { x: number; y: number } = { x: 0, y: 0 },
): FloorDay {
  return {
    pool: customers.map((customer) => ({
      id: customer.id,
      customer,
      stage: 'waiting' as const,
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

/** Seat the next waiting guest on a ready table (or occupied with a free chair). Party size 1. */
export function seatNextWaiting(day: FloorDay): FloorDay {
  const waiting = day.pool.find((g) => g.stage === 'waiting');
  if (!waiting) return day;

  for (const table of day.tables) {
    if (table.state !== 'ready' && table.state !== 'occupied') continue;
    const free = freeSlotsOnTable(day, table.placementId);
    if (free.length < 1) continue;
    const assigned = assignPartyToTable(day.seats, table.placementId, 1);
    if (!assigned || assigned.length < 1) continue;
    const seat = free[0]!;

    const pool = day.pool.map((g) =>
      g.id === waiting.id ? { ...g, stage: 'seated' as const, seat } : g,
    );
    const tables =
      table.state === 'ready'
        ? day.tables.map((t) => (t.placementId === table.placementId ? occupyTable(t) : t))
        : day.tables;
    return { ...day, pool, tables };
  }

  return day;
}

export function takeOrdersForSeated(day: FloorDay, customerIds: string[]): FloorDay {
  const idSet = new Set(customerIds);
  const newTickets: FloorTicket[] = [];
  const pool = day.pool.map((g) => {
    if (!idSet.has(g.customer.id) || g.stage !== 'seated') return g;
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

/** Decrement eat timers; guests that finish become done and may dirty their table. */
export function tickEating(day: FloorDay): FloorDay {
  let next: FloorDay = { ...day, pool: day.pool.map((g) => ({ ...g })), tables: day.tables.map((t) => ({ ...t })) };

  for (let i = 0; i < next.pool.length; i++) {
    const g = next.pool[i]!;
    if (g.stage !== 'eating') continue;
    const remaining = g.eatTicksRemaining - 1;
    if (remaining > 0) {
      next.pool[i] = { ...g, eatTicksRemaining: remaining };
      continue;
    }
    const tableId = g.seat?.tablePlacementId;
    next.pool[i] = { ...g, stage: 'done', eatTicksRemaining: 0, seat: undefined };
    if (tableId && !guestsActiveOnTable(next, tableId)) {
      next = {
        ...next,
        tables: next.tables.map((t) =>
          t.placementId === tableId && t.state === 'occupied' ? markDirty(t) : t,
        ),
      };
    }
  }

  return next;
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
