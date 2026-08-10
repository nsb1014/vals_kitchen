import type { FloorTicketPanelRowViewModel } from './floor-ticket-panel.ts';

export interface ComposeTicketRailItem {
  ticketId: string;
  guestLabel: string;
  guestId: string | null;
  statusLabel: string;
  selected: boolean;
  carrying: boolean;
  selectable: boolean;
}

/**
 * Max-4 peripheral queue strip for compose. Mirrors floor ticket panel rows so
 * status/selectable/carrying stay consistent with the HUD dock.
 */
export function buildComposeTicketRail(
  rows: readonly FloorTicketPanelRowViewModel[],
  input: {
    activeTicketId: string | null;
    guestIdByCustomerId: Readonly<Record<string, string | undefined>>;
  },
): ComposeTicketRailItem[] {
  return rows.slice(0, 4).map((row) => ({
    ticketId: row.ticketId,
    guestLabel: row.guestLabel,
    guestId: input.guestIdByCustomerId[row.customerId] ?? null,
    statusLabel: row.statusLabel,
    selected: row.ticketId === input.activeTicketId,
    carrying: row.carrying,
    selectable: row.selectable,
  }));
}

export function renderComposeTicketRailHtml(
  items: readonly ComposeTicketRailItem[],
  helpers: {
    escapeHtml: (text: string) => string;
    renderPortrait: (guestId: string) => string;
  },
): string {
  if (items.length === 0) return '';
  const buttons = items
    .map((item) => {
      const portrait = item.guestId
        ? helpers.renderPortrait(item.guestId)
        : '';
      const classes = [
        'compose-ticket-rail-item',
        item.selected ? 'selected' : '',
        item.carrying ? 'carrying' : '',
      ]
        .filter(Boolean)
        .join(' ');
      const label = helpers.escapeHtml(
        `${item.guestLabel}, ${item.statusLabel}`,
      );
      const body = `${portrait}<span class="compose-ticket-rail-guest">${helpers.escapeHtml(item.guestLabel)}</span><span class="compose-ticket-rail-status">${helpers.escapeHtml(item.statusLabel)}</span>`;
      if (item.selectable) {
        return `<button type="button" class="${classes}" data-compose-rail-ticket="${helpers.escapeHtml(item.ticketId)}" data-testid="compose-ticket-rail-item" aria-pressed="${item.selected}" aria-label="${label}">${body}</button>`;
      }
      return `<div class="${classes}" data-testid="compose-ticket-rail-item" aria-current="${item.selected ? 'true' : 'false'}" aria-label="${label}">${body}</div>`;
    })
    .join('');
  return `<nav class="compose-ticket-rail" data-testid="compose-ticket-rail" aria-label="Active tickets">${buttons}</nav>`;
}
