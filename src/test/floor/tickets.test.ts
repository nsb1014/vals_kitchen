import { describe, expect, it } from 'vitest';
import {
  canEnqueue,
  deliverTicket,
  enqueueTickets,
  plateTicket,
} from '../../domain/floor/tickets.ts';
import type { FloorTicket } from '../../domain/floor/types.ts';

function openTicket(id: string, customerId: string): FloorTicket {
  return { id, customerId, ingredientIds: [], status: 'open' };
}

describe('tickets', () => {
  it('caps active tickets at 4', () => {
    const four = [1, 2, 3, 4].map((n) => openTicket(`t${n}`, `c${n}`));
    expect(canEnqueue(four, 1)).toBe(false);
    expect(() => enqueueTickets(four, [openTicket('t5', 'c5')])).toThrow();
  });

  it('plates one ticket and rejects a second plate while carrying', () => {
    let tickets = [openTicket('t1', 'c1'), openTicket('t2', 'c2')];
    const plated = plateTicket(tickets, 't1', ['flour', 'salt', 'butter']);
    expect(plated.carriedTicketId).toBe('t1');
    expect(plated.tickets.find((t) => t.id === 't1')!.status).toBe('plated');
    expect(() => plateTicket(plated.tickets, 't2', ['flour', 'salt', 'onion'])).toThrow(
      /Already carrying/,
    );
    tickets = deliverTicket(plated.tickets, 't1');
    expect(tickets.find((t) => t.id === 't1')!.status).toBe('delivered');
  });
});
