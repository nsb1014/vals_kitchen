import { describe, expect, it } from 'vitest';
import {
  formatFloorTicketLabel,
  formatTicketStatusLabel,
  visibleFloorTickets,
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
    phrases: [
      'something really savory',
      'a touch of warmth without getting too sweet or sharp on the finish',
    ],
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
    expect(withName.preferenceFull).toMatch(/^Wants:.*savory/i);
    expect(withName.preferenceFull).toContain('without getting too sweet');
    expect(withName.preferenceFull).not.toMatch(/…/);
    expect(withName.preferenceSummary).toBe(withName.preferenceFull);

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

  it('drops delivered tickets from the visible orders list', () => {
    const tickets: FloorTicket[] = [
      ticket('open'),
      { ...ticket('plated'), id: 'ticket_2', customerId: 'c2' },
      { ...ticket('delivered'), id: 'ticket_3', customerId: 'c3' },
    ];
    expect(visibleFloorTickets(tickets).map((t) => t.id)).toEqual([
      'ticket_customer_1_0',
      'ticket_2',
    ]);
  });

  it('keeps the full preference copy without truncation', () => {
    const longPhrases = Array.from({ length: 6 }, (_, i) =>
      `phrase number ${i + 1} with plenty of descriptive wording about taste`,
    );
    const label = formatFloorTicketLabel({
      ticket: ticket('open'),
      customer: {
        ...customer,
        preference: { ...customer.preference, phrases: longPhrases },
      },
      archetypeName: 'Comfort Seeker',
      partyNumber: 1,
      selected: false,
    });
    for (const phrase of longPhrases) {
      expect(label.preferenceFull.toLowerCase()).toContain(phrase);
    }
    expect(label.preferenceFull).not.toMatch(/…|\.\.\.$/);
  });
});
