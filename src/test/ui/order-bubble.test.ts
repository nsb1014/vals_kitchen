import { describe, expect, it } from 'vitest';
import { createFloorDayFromCustomers, tablesFromPlacements } from '../../domain/floor/sim.ts';
import { seatsFromPlacements } from '../../domain/floor/seats.ts';
import type { Customer } from '../../domain/day/types.ts';
import type { FloorDay, FloorGuest, FloorTicket } from '../../domain/floor/types.ts';
import { isOrderBubbleOwnedByFloor } from '../../ui/presentation/order-bubble.ts';

const customer: Customer = {
  id: 'c1',
  archetypeId: 'a',
  preference: { primary: {}, avoid: {}, phrases: [] },
};

const placements = [
  { id: 'table_1', itemKey: 'table_2seat', x: 0, y: 0, rotation: 0 },
];

function floorWith(
  stage: FloorGuest['stage'],
  ticket?: Pick<FloorTicket, 'customerId' | 'status'>,
): FloorDay {
  const day = createFloorDayFromCustomers(
    [customer],
    tablesFromPlacements(placements),
    seatsFromPlacements(placements),
  );
  return {
    ...day,
    pool: day.pool.map((guest) => ({ ...guest, stage })),
    tickets: ticket
      ? [
          {
            id: 'ticket_1',
            customerId: ticket.customerId,
            ingredientIds: [],
            status: ticket.status,
          },
        ]
      : [],
  };
}

describe('order bubble ownership', () => {
  it.each([
    {
      label: 'missing guest',
      floor: floorWith('ordered', { customerId: customer.id, status: 'open' }),
      guestId: 'missing',
      expected: false,
    },
    {
      label: 'seated guest with an open ticket',
      floor: floorWith('seated', { customerId: customer.id, status: 'open' }),
      guestId: customer.id,
      expected: false,
    },
    {
      label: 'ordered guest with an open ticket',
      floor: floorWith('ordered', { customerId: customer.id, status: 'open' }),
      guestId: customer.id,
      expected: true,
    },
    {
      label: 'ordered guest with a plated ticket',
      floor: floorWith('ordered', { customerId: customer.id, status: 'plated' }),
      guestId: customer.id,
      expected: false,
    },
    {
      label: 'ordered guest with a delivered ticket',
      floor: floorWith('ordered', { customerId: customer.id, status: 'delivered' }),
      guestId: customer.id,
      expected: false,
    },
    {
      label: 'eating guest with an open ticket',
      floor: floorWith('eating', { customerId: customer.id, status: 'open' }),
      guestId: customer.id,
      expected: false,
    },
    {
      label: 'ordered guest whose open ticket belongs to someone else',
      floor: floorWith('ordered', { customerId: 'c2', status: 'open' }),
      guestId: customer.id,
      expected: false,
    },
  ])('$label is $expected', ({ floor, guestId, expected }) => {
    expect(isOrderBubbleOwnedByFloor(floor, guestId)).toBe(expected);
  });
});
