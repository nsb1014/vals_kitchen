import type { FloorDay, FloorTicket } from './types.ts';

export const MAX_TICKETS = 4;
/** @deprecated Use {@link MAX_TICKETS} */
export const MAX_FLOOR_TICKETS = MAX_TICKETS;

export function countActiveTickets(tickets: readonly FloorTicket[]): number {
  return tickets.filter((ticket) => ticket.status !== 'delivered').length;
}

export function formatTicketCapacityFullMessage(
  tickets: readonly FloorTicket[],
  max: number = MAX_TICKETS,
): string {
  return `Tickets full (${countActiveTickets(tickets)}/${max}) — cook or deliver first.`;
}

export function canEnqueue(
  tickets: readonly FloorTicket[],
  addCount: number,
  max: number = MAX_TICKETS,
): boolean {
  const active = countActiveTickets(tickets);
  return active + addCount <= max;
}

export function enqueueTickets(
  tickets: FloorTicket[],
  newTickets: FloorTicket[],
  max: number = MAX_TICKETS,
): FloorTicket[] {
  if (!canEnqueue(tickets, newTickets.length, max)) {
    throw new Error(`Ticket queue would exceed max ${max}`);
  }
  return [...tickets, ...newTickets];
}

type TicketResolutionFloor = Pick<
  FloorDay,
  'tickets' | 'carriedTicketId' | 'selectedTicketId'
>;

/**
 * Resolve the one ticket that owns the current service interaction.
 *
 * A real carried dish always wins. Otherwise a valid open selection wins,
 * followed by the oldest open ticket. Stale persisted ids are deliberately
 * ignored so a resumed day cannot strand the player.
 */
export function resolveFloorTicket(floor: TicketResolutionFloor): FloorTicket | null {
  if (floor.carriedTicketId) {
    const carried = floor.tickets.find(
      (ticket) =>
        ticket.id === floor.carriedTicketId && ticket.status === 'plated',
    );
    if (carried) return carried;
  }

  if (floor.selectedTicketId) {
    const selected = floor.tickets.find(
      (ticket) =>
        ticket.id === floor.selectedTicketId && ticket.status === 'open',
    );
    if (selected) return selected;
  }

  return floor.tickets.find((ticket) => ticket.status === 'open') ?? null;
}

/** Resolve the open ticket whose saved draft may be edited or plated. */
export function resolveFloorComposeTicket(
  floor: TicketResolutionFloor,
): FloorTicket | null {
  const resolved = resolveFloorTicket(floor);
  return resolved?.status === 'open' ? resolved : null;
}

function hasValidCarriedTicket(floor: TicketResolutionFloor): boolean {
  return floor.tickets.some(
    (ticket) =>
      ticket.id === floor.carriedTicketId && ticket.status === 'plated',
  );
}

export function selectFloorTicket(
  floor: FloorDay,
  ticketId: string | null,
): FloorDay {
  if (ticketId === null) {
    return floor.selectedTicketId === null
      ? floor
      : { ...floor, selectedTicketId: null };
  }
  if (hasValidCarriedTicket(floor)) {
    throw new Error('Cannot select a ticket while carrying a plated dish');
  }
  const ticket = floor.tickets.find((candidate) => candidate.id === ticketId);
  if (!ticket) throw new Error(`Unknown ticket: ${ticketId}`);
  if (ticket.status !== 'open') {
    throw new Error(`Ticket not open: ${ticket.status}`);
  }
  return floor.selectedTicketId === ticketId
    ? floor
    : { ...floor, selectedTicketId: ticketId };
}

export function setFloorTicketDraft(
  floor: FloorDay,
  ticketId: string,
  ingredientIds: string[],
): FloorDay {
  const composeTicket = resolveFloorComposeTicket(floor);
  if (!composeTicket || composeTicket.id !== ticketId) {
    throw new Error(`Ticket is not selected for composing: ${ticketId}`);
  }
  return {
    ...floor,
    tickets: floor.tickets.map((ticket) =>
      ticket.id === ticketId
        ? { ...ticket, ingredientIds: [...ingredientIds] }
        : ticket,
    ),
  };
}

export function plateTicket(
  floor: FloorDay,
  ticketId: string,
): FloorDay {
  if (hasValidCarriedTicket(floor)) {
    throw new Error('Already carrying a plated dish');
  }
  if (floor.tickets.some((ticket) => ticket.status === 'plated')) {
    throw new Error('Already carrying a plated dish');
  }
  const composeTicket = resolveFloorComposeTicket(floor);
  if (!composeTicket || composeTicket.id !== ticketId) {
    throw new Error(`Ticket is not selected for plating: ${ticketId}`);
  }
  return {
    ...floor,
    tickets: floor.tickets.map((ticket) =>
      ticket.id === ticketId
        ? { ...ticket, status: 'plated' as const }
        : ticket,
    ),
    carriedTicketId: ticketId,
    selectedTicketId: null,
  };
}

export function deliverTicket(tickets: FloorTicket[], ticketId: string): FloorTicket[] {
  return tickets.map((t) =>
    t.id === ticketId ? { ...t, status: 'delivered' as const } : t,
  );
}
