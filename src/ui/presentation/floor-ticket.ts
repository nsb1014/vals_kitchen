import type { Customer } from '../../domain/day/types.ts';
import type { FloorTicket } from '../../domain/floor/types.ts';
import {
  formatCustomerRequestText,
  splitCustomerRequestPhrases,
} from './customer-request.ts';
import {
  buildOrderBubbleCues,
  type OrderBubbleCue,
} from './order-bubble.ts';

export function formatTicketStatusLabel(
  status: FloorTicket['status'],
  selected: boolean,
): string {
  if (status === 'plated') return 'Ready';
  if (status === 'delivered') return 'Done';
  if (selected) return 'Selected';
  return 'Open';
}

/** Tickets still in play for the HUD strip / Orders dropdown (hide served/left). */
export function visibleFloorTickets(tickets: readonly FloorTicket[]): FloorTicket[] {
  return tickets.filter((t) => t.status !== 'delivered');
}

/** Icon-first Order-tab cue chips (axis short codes + band). */
export function renderFloorTicketOrderCuesHtml(
  cues: readonly OrderBubbleCue[],
  escapeHtml: (text: string) => string,
): string {
  if (cues.length === 0) return '';
  const chips = cues
    .map(
      (cue) =>
        `<span class="floor-tickets-order-cue floor-tickets-order-cue-${escapeHtml(cue.band)}" data-testid="floor-tickets-order-cue" data-axis="${escapeHtml(cue.axis)}" title="${escapeHtml(`${cue.band} ${cue.label}`)}"><span class="floor-tickets-order-cue-glyph" aria-hidden="true"></span><span class="floor-tickets-order-cue-short" aria-hidden="true">${escapeHtml(cue.short)}</span><span class="sr-only">${escapeHtml(`${cue.band} ${cue.label}`)}</span></span>`,
    )
    .join('');
  return `<div class="floor-tickets-item-cues" data-testid="floor-tickets-item-cues" aria-label="Request flavor cues">${chips}</div>`;
}

export function formatFloorTicketLabel(input: {
  ticket: FloorTicket;
  customer?: Customer;
  archetypeName?: string;
  selected: boolean;
}): {
  guestLabel: string;
  statusLabel: string;
  /** Full untruncated preference copy, prefixed with "Wants:". Empty when unknown. */
  preferenceFull: string;
  /** @deprecated Prefer preferenceFull — same full text (no truncation). */
  preferenceSummary: string;
  /** Short scan chips for the Order tab (legacy phrase text; prefer preferenceCues). */
  preferencePhrases: string[];
  /** Icon-first axis cues for Order-tab scannability (Ideal tab keeps full 15 axes). */
  preferenceCues: OrderBubbleCue[];
  buttonText: string;
} {
  const archetypeName = input.archetypeName?.trim();
  const guestLabel = archetypeName || 'Guest';
  const statusLabel = formatTicketStatusLabel(input.ticket.status, input.selected);
  const preferenceBody = input.customer
    ? formatCustomerRequestText(input.customer.preference)
    : '';
  const preferenceFull = preferenceBody ? `Wants: ${preferenceBody}` : '';
  const preferencePhrases = input.customer
    ? splitCustomerRequestPhrases(input.customer.preference)
    : [];
  const preferenceCues = input.customer
    ? buildOrderBubbleCues(input.customer.preference, 4)
    : [];
  const buttonText = preferenceFull
    ? `${guestLabel} · ${statusLabel} — ${preferenceFull}`
    : `${guestLabel} · ${statusLabel}`;
  return {
    guestLabel,
    statusLabel,
    preferenceFull,
    preferenceSummary: preferenceFull,
    preferencePhrases,
    preferenceCues,
    buttonText,
  };
}
