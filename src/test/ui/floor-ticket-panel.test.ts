import { describe, expect, it } from 'vitest';
import { emptyFlavorProfile } from '../../domain/flavor/axis-labels.ts';
import { formatTicketCapacityFullMessage } from '../../domain/floor/tickets.ts';
import type { FloorTicket } from '../../domain/floor/types.ts';
import { buildFloorTicketPanelViewModel } from '../../ui/presentation/floor-ticket-panel.ts';
import {
  buildFlavorBarsViewModel,
  renderFlavorBarsHtml,
} from '../../ui/presentation/flavor-profile.ts';

function ticket(
  id: string,
  customerId: string,
  status: FloorTicket['status'],
): FloorTicket {
  return { id, customerId, ingredientIds: [], status };
}

const guestLabels = {
  c1: 'Comfort Seeker',
  c2: 'Garlic Fan',
  c3: 'Balanced Diner',
  c4: 'Rich Indulger',
};

describe('floor ticket panel view model', () => {
  it('uses carried plated, selected open, then first open as the Ideal subject', () => {
    const tickets = [
      ticket('open-first', 'c1', 'open'),
      ticket('carried', 'c2', 'plated'),
      ticket('selected', 'c3', 'open'),
      ticket('done', 'c4', 'delivered'),
    ];

    expect(
      buildFloorTicketPanelViewModel({
        tickets,
        selectedTicketId: 'selected',
        carriedTicketId: 'carried',
        guestLabelByCustomerId: guestLabels,
      }).subjectTicketId,
    ).toBe('carried');
    expect(
      buildFloorTicketPanelViewModel({
        tickets: tickets.filter((row) => row.id !== 'carried'),
        selectedTicketId: 'selected',
        carriedTicketId: null,
        guestLabelByCustomerId: guestLabels,
      }).subjectTicketId,
    ).toBe('selected');
    expect(
      buildFloorTicketPanelViewModel({
        tickets: tickets.filter((row) => row.id !== 'carried'),
        selectedTicketId: 'missing',
        carriedTicketId: null,
        guestLabelByCustomerId: guestLabels,
      }).subjectTicketId,
    ).toBe('open-first');
    expect(
      buildFloorTicketPanelViewModel({
        tickets: [ticket('done', 'c4', 'delivered')],
        selectedTicketId: 'done',
        carriedTicketId: null,
        guestLabelByCustomerId: guestLabels,
      }).subjectTicketId,
    ).toBeNull();
  });

  it('returns exact capacity, carrying, row, and static-during-carry presentation', () => {
    const model = buildFloorTicketPanelViewModel({
      tickets: [
        ticket('carried', 'c1', 'plated'),
        ticket('next', 'c2', 'open'),
        ticket('done', 'c3', 'delivered'),
      ],
      selectedTicketId: null,
      carriedTicketId: 'carried',
      guestLabelByCustomerId: guestLabels,
    });

    expect(model).toEqual({
      activeCount: 2,
      capacity: 4,
      capacityFull: false,
      capacityMessage: null,
      toggleText: 'Carrying Comfort Seeker · 2/4',
      toggleAriaLabel:
        'Carrying dish for Comfort Seeker; 2 of 4 active tickets',
      subjectTicketId: 'carried',
      carriedTicketId: 'carried',
      rows: [
        {
          ticketId: 'carried',
          customerId: 'c1',
          guestLabel: 'Comfort Seeker',
          status: 'plated',
          statusLabel: 'Carrying',
          selected: false,
          carrying: true,
          selectable: false,
        },
        {
          ticketId: 'next',
          customerId: 'c2',
          guestLabel: 'Garlic Fan',
          status: 'open',
          statusLabel: 'Open',
          selected: false,
          carrying: false,
          selectable: false,
        },
      ],
    });
  });

  it('shows the active queue count and selectable selected row when not carrying', () => {
    const model = buildFloorTicketPanelViewModel({
      tickets: [
        ticket('first', 'c1', 'open'),
        ticket('selected', 'c2', 'open'),
      ],
      selectedTicketId: 'selected',
      carriedTicketId: null,
      guestLabelByCustomerId: guestLabels,
    });

    expect(model).toEqual({
      activeCount: 2,
      capacity: 4,
      capacityFull: false,
      capacityMessage: null,
      toggleText: 'Tickets 2/4',
      toggleAriaLabel: 'Tickets; 2 of 4 active',
      subjectTicketId: 'selected',
      carriedTicketId: null,
      rows: [
        {
          ticketId: 'first',
          customerId: 'c1',
          guestLabel: 'Comfort Seeker',
          status: 'open',
          statusLabel: 'Open',
          selected: false,
          carrying: false,
          selectable: true,
        },
        {
          ticketId: 'selected',
          customerId: 'c2',
          guestLabel: 'Garlic Fan',
          status: 'open',
          statusLabel: 'Selected',
          selected: true,
          carrying: false,
          selectable: true,
        },
      ],
    });
  });

  it('explains the full active queue using canonical capacity', () => {
    const model = buildFloorTicketPanelViewModel({
      tickets: [
        ticket('one', 'c1', 'open'),
        ticket('two', 'c2', 'open'),
        ticket('three', 'c3', 'open'),
        ticket('four', 'c4', 'plated'),
        ticket('done', 'c1', 'delivered'),
      ],
      selectedTicketId: 'one',
      carriedTicketId: 'four',
      guestLabelByCustomerId: guestLabels,
    });

    expect({
      activeCount: model.activeCount,
      capacity: model.capacity,
      capacityFull: model.capacityFull,
      capacityMessage: model.capacityMessage,
    }).toEqual({
      activeCount: 4,
      capacity: 4,
      capacityFull: true,
      capacityMessage: formatTicketCapacityFullMessage([
        ticket('one', 'c1', 'open'),
        ticket('two', 'c2', 'open'),
        ticket('three', 'c3', 'open'),
        ticket('four', 'c4', 'plated'),
      ]),
    });
    expect(model.capacityMessage).toBe(
      'Tickets full (4/4) — cook or deliver first.',
    );
  });

  it('renders all 15 continuous Ideal axes with numbers and no temperature', () => {
    const profile = emptyFlavorProfile();
    profile.UM = 8;
    profile.RI = 5;
    const html = renderFlavorBarsHtml(
      buildFlavorBarsViewModel(profile, {
        title: 'Comfort <Seeker>',
        subtitle: 'Ideal flavor profile',
      }),
      { showValues: true, showTemp: false, showZeroValues: true },
    );

    expect(html.match(/data-testid="flavor-axis-row"/g)).toHaveLength(15);
    expect(html.match(/class="flavor-bar-value"/g)).toHaveLength(15);
    expect(html).toContain('8.0');
    expect(html).toContain('0.0');
    expect(html).not.toContain('flavor-temp-badge');
    expect(html).not.toContain('Temp:');
    expect(html).toContain('Comfort &lt;Seeker&gt;');
  });
});
