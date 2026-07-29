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
    primary: { UM: 'high', RI: 'mid' },
    avoid: {},
    phrases: ['high Umami', 'moderate Rich'],
    idealProfile: {
      SW: 1, SA: 4, SO: 1, BI: 0, UM: 8,
      HE: 0, FR: 0, EA: 2, SM: 1, PU: 2, NU: 1,
      RI: 5, LI: 2, HT: 0, CR: 1, TE: 1,
    },
  },
};

describe('floor ticket labels', () => {
  it('maps statuses to human Open / Selected / Ready labels', () => {
    expect(formatTicketStatusLabel('open', false)).toBe('Open');
    expect(formatTicketStatusLabel('open', true)).toBe('Selected');
    expect(formatTicketStatusLabel('plated', false)).toBe('Ready');
    expect(formatTicketStatusLabel('delivered', false)).toBe('Done');
  });

  it('never shows raw ticket ids or numeric guest overlays', () => {
    const withName = formatFloorTicketLabel({
      ticket: ticket('open'),
      customer,
      archetypeName: 'Comfort Seeker',
      selected: false,
    });
    expect(withName.buttonText).not.toMatch(/ticket_/);
    expect(withName.buttonText).toContain('Comfort Seeker');
    expect(withName.buttonText).not.toContain('#');
    expect(withName.buttonText).toContain('Open');
    expect(withName.preferenceFull).toMatch(/^Wants:.*Umami/i);
    expect(withName.preferenceFull).toContain('Rich');
    expect(withName.preferenceFull).not.toMatch(/…/);
    expect(withName.preferenceSummary).toBe(withName.preferenceFull);

    const fallback = formatFloorTicketLabel({
      ticket: ticket('plated'),
      customer: { ...customer, archetypeId: 'unknown' },
      archetypeName: undefined,
      selected: false,
    });
    expect(fallback.buttonText).toContain('Guest');
    expect(fallback.buttonText).not.toContain('#');
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
      selected: false,
    });
    for (const phrase of longPhrases) {
      expect(label.preferenceFull.toLowerCase()).toContain(phrase);
    }
    expect(label.preferenceFull).not.toMatch(/…|\.\.\.$/);
  });
});
