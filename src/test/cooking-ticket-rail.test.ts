import { describe, expect, it } from 'vitest';
import type { FloorTicket } from '../domain/floor/types.ts';
import { buildFloorTicketPanelViewModel } from '../ui/presentation/floor-ticket-panel.ts';
import {
  buildComposeTicketRail,
  renderComposeTicketRailHtml,
} from '../ui/presentation/compose-ticket-rail.ts';

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

describe('cooking ticket rail', () => {
  it('builds a max-4 rail with active selection and carry lock', () => {
    const panel = buildFloorTicketPanelViewModel({
      tickets: [
        ticket('a', 'c1', 'open'),
        ticket('b', 'c2', 'open'),
        ticket('c', 'c3', 'plated'),
        ticket('d', 'c4', 'open'),
      ],
      selectedTicketId: 'b',
      carriedTicketId: 'c',
      guestLabelByCustomerId: guestLabels,
    });

    const rail = buildComposeTicketRail(panel.rows, {
      activeTicketId: 'b',
      guestIdByCustomerId: {
        c1: 'guest-1',
        c2: 'guest-2',
        c3: 'guest-3',
        c4: 'guest-4',
      },
    });

    expect(rail).toHaveLength(4);
    expect(rail.map((row) => row.ticketId)).toEqual(['a', 'b', 'c', 'd']);
    expect(rail.find((row) => row.ticketId === 'b')?.selected).toBe(true);
    expect(rail.find((row) => row.ticketId === 'c')?.carrying).toBe(true);
    expect(rail.every((row) => row.selectable === false)).toBe(true);
  });

  it('renders selectable buttons only for open rows when not carrying', () => {
    const panel = buildFloorTicketPanelViewModel({
      tickets: [
        ticket('a', 'c1', 'open'),
        ticket('b', 'c2', 'plated'),
      ],
      selectedTicketId: 'a',
      carriedTicketId: null,
      guestLabelByCustomerId: guestLabels,
    });
    const html = renderComposeTicketRailHtml(
      buildComposeTicketRail(panel.rows, {
        activeTicketId: 'a',
        guestIdByCustomerId: { c1: 'guest-1', c2: 'guest-2' },
      }),
      {
        escapeHtml: (text) => text,
        renderPortrait: (id) => `<img data-guest="${id}">`,
      },
    );

    expect(html).toContain('data-testid="compose-ticket-rail"');
    expect(html).toContain('data-compose-rail-ticket="a"');
    expect(html).not.toContain('data-compose-rail-ticket="b"');
    expect(html).toContain('compose-ticket-rail-item selected');
    expect(html).toContain('Ready');
  });

  it('keeps HUD carry toggle text stable while UI appends deliver cue', () => {
    const model = buildFloorTicketPanelViewModel({
      tickets: [ticket('carried', 'c1', 'plated')],
      selectedTicketId: null,
      carriedTicketId: 'carried',
      guestLabelByCustomerId: guestLabels,
    });
    expect(model.toggleText).toBe('Carrying Comfort Seeker · 1/4');
    expect(model.carriedTicketId).toBe('carried');
    expect(model.rows[0]?.carrying).toBe(true);
  });
});
