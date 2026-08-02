import type { FloorDay, TableSurfaceState } from '../domain/floor/types.ts';

/**
 * Domain occupancy reserves seats from arrival through departure. The tabletop
 * art has a narrower meaning: `occupied` contains served dishes, so it must not
 * appear until a ticket for that table has actually been delivered.
 */
export function tableServiceVisualStates(
  floor: Pick<FloorDay, 'pool' | 'tables' | 'tickets'> | null | undefined,
): Map<string, TableSurfaceState> {
  if (!floor) return new Map();

  const tableByCustomerId = new Map<string, string>();
  for (const guest of floor.pool) {
    if (guest.seat) {
      tableByCustomerId.set(guest.customer.id, guest.seat.tablePlacementId);
    }
  }

  const tablesWithDeliveredFood = new Set<string>();
  for (const ticket of floor.tickets) {
    if (ticket.status !== 'delivered') continue;
    const tableId = tableByCustomerId.get(ticket.customerId);
    if (tableId) tablesWithDeliveredFood.add(tableId);
  }

  return new Map(
    floor.tables.map((table) => [
      table.placementId,
      table.state === 'occupied' && !tablesWithDeliveredFood.has(table.placementId)
        ? 'ready'
        : table.state,
    ]),
  );
}
