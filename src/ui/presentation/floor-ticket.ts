import type { Customer } from '../../domain/day/types.ts';
import type { FloorTicket } from '../../domain/floor/types.ts';
import {
  formatCustomerRequestText,
  splitCustomerRequestPhrases,
} from './customer-request.ts';

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
  /** Short scan chips for the Order tab (max one line of phrases). */
  preferencePhrases: string[];
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
  const buttonText = preferenceFull
    ? `${guestLabel} · ${statusLabel} — ${preferenceFull}`
    : `${guestLabel} · ${statusLabel}`;
  return {
    guestLabel,
    statusLabel,
    preferenceFull,
    preferenceSummary: preferenceFull,
    preferencePhrases,
    buttonText,
  };
}
