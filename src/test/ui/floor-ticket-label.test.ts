import { describe, expect, it } from 'vitest';
import {
  formatFloorTicketLabel,
  formatTicketStatusLabel,
} from '../../ui/presentation/floor-ticket.ts';
import type { FloorTicket } from '../../domain/floor/types.ts';
import type { Customer } from '../../domain/day/types.ts';

const ticket = (status: FloorTicket['status']): FloorTicket => ({
  id: 'ticket_customer_1_0',
  customerId: 'customer_1_0',
  ingredientIds: [],
  status,
});

const customer: Customer = {
  id: 'customer_1_0',
  archetypeId: 'comfort_seeker',
  preference: {
    primary: { UM: 'high' },
    avoid: {},
    phrases: ['something really savory', 'not too sweet'],
  },
};

describe('floor ticket labels', () => {
  it('maps statuses to human Open / Cooking / Ready labels', () => {
    expect(formatTicketStatusLabel('open', false)).toBe('Open');
    expect(formatTicketStatusLabel('open', true)).toBe('Cooking');
    expect(formatTicketStatusLabel('plated', false)).toBe('Ready');
    expect(formatTicketStatusLabel('delivered', false)).toBe('Done');
  });

  it('never shows raw ticket ids; uses guest name or Party N', () => {
    const withName = formatFloorTicketLabel({
      ticket: ticket('open'),
      customer,
      archetypeName: 'Comfort Seeker',
      partyNumber: 1,
      selected: false,
    });
    expect(withName.buttonText).not.toMatch(/ticket_/);
    expect(withName.buttonText).toContain('Comfort Seeker');
    expect(withName.buttonText).toContain('Open');
    expect(withName.preferenceSummary).toMatch(/savory/i);

    const fallback = formatFloorTicketLabel({
      ticket: ticket('plated'),
      customer: { ...customer, archetypeId: 'unknown' },
      archetypeName: undefined,
      partyNumber: 2,
      selected: false,
    });
    expect(fallback.buttonText).toContain('Party 2');
    expect(fallback.buttonText).toContain('Ready');
    expect(fallback.buttonText).not.toMatch(/ticket_customer/);
  });
});
