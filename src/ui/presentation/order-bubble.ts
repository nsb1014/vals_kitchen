import type { FloorDay } from '../../domain/floor/types.ts';

/** Whether a recent order still belongs to the live, actionable floor state. */
export function isOrderBubbleOwnedByFloor(
  floor: FloorDay | null | undefined,
  customerId: string | null,
): boolean {
  if (!floor || !customerId) return false;

  const guest = floor.pool.find(
    (candidate) => candidate.customer.id === customerId,
  );
  if (guest?.stage !== 'ordered') return false;

  return floor.tickets.some(
    (ticket) => ticket.customerId === customerId && ticket.status === 'open',
  );
}
