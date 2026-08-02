import { describe, expect, it } from 'vitest';
import { tableServiceVisualStates } from '../../canvas/table-service-visual.ts';
import type { FloorDay, FloorTicket } from '../../domain/floor/types.ts';

function floorWithTicket(status?: FloorTicket['status']): FloorDay {
  const customer = {
    id: 'guest_a',
    archetypeId: 'comfort_seeker',
    preference: { primary: {}, avoid: {}, phrases: [] },
  };
  return {
    pool: [
      {
        id: customer.id,
        customer,
        stage: status === 'delivered' ? 'eating' : status ? 'ordered' : 'seated',
        seat: {
          tablePlacementId: 'table_a',
          slotIndex: 0,
          x: 2,
          y: 2,
          facing: 90,
        },
        eatTicksRemaining: status === 'delivered' ? 3 : 0,
      },
    ],
    tables: [
      { placementId: 'table_a', state: 'occupied', seatSlotCount: 2 },
      { placementId: 'table_b', state: 'ready', seatSlotCount: 2 },
      { placementId: 'table_c', state: 'dirty', seatSlotCount: 2 },
    ],
    seats: [],
    tickets: status
      ? [
          {
            id: 'ticket_a',
            customerId: customer.id,
            ingredientIds: [],
            status,
          },
        ]
      : [],
    carriedTicketId: status === 'plated' ? 'ticket_a' : null,
    selectedTicketId: status === 'open' ? 'ticket_a' : null,
    tutorialStep: null,
    playerPosition: { x: 0, y: 0 },
    playerRoom: 'main',
  };
}

describe('table service visual state', () => {
  it.each([undefined, 'open', 'plated'] as const)(
    'keeps place settings visible before delivery (%s)',
    (status) => {
      const floor = floorWithTicket(status);

      expect(tableServiceVisualStates(floor).get('table_a')).toBe('ready');
      expect(floor.tables[0]!.state).toBe('occupied');
    },
  );

  it('shows served dishes only after that table receives a delivery', () => {
    const floor = floorWithTicket('delivered');

    expect(tableServiceVisualStates(floor).get('table_a')).toBe('occupied');
  });

  it('preserves non-occupied table visuals', () => {
    const states = tableServiceVisualStates(floorWithTicket());

    expect(states.get('table_b')).toBe('ready');
    expect(states.get('table_c')).toBe('dirty');
  });
});
