import type { FloorTicket } from './types.ts';

export const MAX_FLOOR_TICKETS = 4;

export function canEnqueue(
  tickets: FloorTicket[],
  addCount: number,
  max: number = MAX_FLOOR_TICKETS,
): boolean {
  const active = tickets.filter((t) => t.status !== 'delivered').length;
  return active + addCount <= max;
}

export function enqueueTickets(
  tickets: FloorTicket[],
  newTickets: FloorTicket[],
  max: number = MAX_FLOOR_TICKETS,
): FloorTicket[] {
  if (!canEnqueue(tickets, newTickets.length, max)) {
    throw new Error(`Ticket queue would exceed max ${max}`);
  }
  return [...tickets, ...newTickets];
}

export function plateTicket(
  tickets: FloorTicket[],
  ticketId: string,
  ingredientIds: string[],
): { tickets: FloorTicket[]; carriedTicketId: string } {
  if (tickets.some((t) => t.status === 'plated')) {
    throw new Error('Already carrying a plated dish');
  }
  const idx = tickets.findIndex((t) => t.id === ticketId);
  if (idx < 0) throw new Error(`Unknown ticket: ${ticketId}`);
  const ticket = tickets[idx]!;
  if (ticket.status !== 'open') throw new Error(`Ticket not open: ${ticket.status}`);
  const next = tickets.slice();
  next[idx] = { ...ticket, status: 'plated', ingredientIds: [...ingredientIds] };
  return { tickets: next, carriedTicketId: ticketId };
}

export function deliverTicket(tickets: FloorTicket[], ticketId: string): FloorTicket[] {
  return tickets.map((t) =>
    t.id === ticketId ? { ...t, status: 'delivered' as const } : t,
  );
}
