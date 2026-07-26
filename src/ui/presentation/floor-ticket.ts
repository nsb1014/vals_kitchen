import type { Customer } from '../../domain/day/types.ts';
import type { FloorTicket } from '../../domain/floor/types.ts';
import { formatCustomerRequestText } from './customer-request.ts';

export function formatTicketStatusLabel(
  status: FloorTicket['status'],
  selected: boolean,
): string {
  if (status === 'plated') return 'Ready';
  if (status === 'delivered') return 'Done';
  if (selected) return 'Cooking';
  return 'Open';
}

export function formatFloorTicketLabel(input: {
  ticket: FloorTicket;
  customer?: Customer;
  archetypeName?: string;
  partyNumber: number;
  selected: boolean;
}): {
  guestLabel: string;
  statusLabel: string;
  preferenceSummary: string;
  buttonText: string;
} {
  const guestLabel =
    input.archetypeName?.trim() ||
    `Party ${Math.max(1, input.partyNumber)}`;
  const statusLabel = formatTicketStatusLabel(input.ticket.status, input.selected);
  const preferenceSummary = input.customer
    ? shortenPreference(formatCustomerRequestText(input.customer.preference))
    : '';
  const preferenceChip = preferenceSummary ? `Wants: ${preferenceSummary}` : '';
  const buttonText = preferenceChip
    ? `${guestLabel} · ${statusLabel} — ${preferenceChip}`
    : `${guestLabel} · ${statusLabel}`;
  return { guestLabel, statusLabel, preferenceSummary: preferenceChip, buttonText };
}

function shortenPreference(text: string, maxLen = 42): string {
  const oneLine = text.replace(/\s+/g, ' ').trim();
  if (oneLine.length <= maxLen) return oneLine.replace(/\.$/, '');
  const cut = oneLine.slice(0, maxLen - 1);
  const lastSpace = cut.lastIndexOf(' ');
  const base = lastSpace > 20 ? cut.slice(0, lastSpace) : cut;
  return `${base}…`;
}
