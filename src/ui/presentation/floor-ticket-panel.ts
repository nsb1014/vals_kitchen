import { MAX_TICKETS } from '../../domain/floor/tickets.ts';
import type { FloorTicket } from '../../domain/floor/types.ts';
import { formatTicketStatusLabel } from './floor-ticket.ts';

export interface FloorTicketPanelViewModelInput {
  tickets: readonly FloorTicket[];
  selectedTicketId: string | null;
  carriedTicketId: string | null;
  guestLabelByCustomerId: Readonly<Record<string, string | undefined>>;
}

export interface FloorTicketPanelRowViewModel {
  ticketId: string;
  customerId: string;
  guestLabel: string;
  status: FloorTicket['status'];
  statusLabel: string;
  selected: boolean;
  carrying: boolean;
  selectable: boolean;
}

export interface FloorTicketPanelViewModel {
  activeCount: number;
  capacity: number;
  capacityFull: boolean;
  capacityMessage: string | null;
  toggleText: string;
  toggleAriaLabel: string;
  subjectTicketId: string | null;
  carriedTicketId: string | null;
  rows: FloorTicketPanelRowViewModel[];
}

/**
 * Presentation-only ticket planning state. Domain selection remains the source
 * of truth; this model only makes capacity, carried-dish state, and the Ideal
 * profile subject explicit for the HUD.
 */
export function buildFloorTicketPanelViewModel(
  input: FloorTicketPanelViewModelInput,
): FloorTicketPanelViewModel {
  const activeTickets = input.tickets.filter(
    (ticket) => ticket.status !== 'delivered',
  );
  const selectedTicket = activeTickets.find(
    (ticket) =>
      ticket.id === input.selectedTicketId && ticket.status === 'open',
  );
  const carriedTicket = activeTickets.find(
    (ticket) =>
      ticket.id === input.carriedTicketId && ticket.status === 'plated',
  );
  const subjectTicket =
    selectedTicket ??
    carriedTicket ??
    activeTickets.find((ticket) => ticket.status === 'open') ??
    null;
  const carryingGuestLabel = carriedTicket
    ? (input.guestLabelByCustomerId[carriedTicket.customerId] ?? 'Guest')
    : null;
  const activeCount = activeTickets.length;
  const countText = `${activeCount}/${MAX_TICKETS}`;
  const capacityFull = activeCount === MAX_TICKETS;

  return {
    activeCount,
    capacity: MAX_TICKETS,
    capacityFull,
    capacityMessage: capacityFull
      ? `Tickets full (${countText}) — cook or deliver first.`
      : null,
    toggleText: carryingGuestLabel
      ? `Carrying ${carryingGuestLabel} · ${countText}`
      : `Tickets ${countText}`,
    toggleAriaLabel: carryingGuestLabel
      ? `Carrying dish for ${carryingGuestLabel}; ${activeCount} of ${MAX_TICKETS} active tickets`
      : `Tickets; ${activeCount} of ${MAX_TICKETS} active`,
    subjectTicketId: subjectTicket?.id ?? null,
    carriedTicketId: carriedTicket?.id ?? null,
    rows: activeTickets.map((ticket) => {
      const selected =
        ticket.status === 'open' && ticket.id === input.selectedTicketId;
      const carrying = ticket.id === carriedTicket?.id;
      return {
        ticketId: ticket.id,
        customerId: ticket.customerId,
        guestLabel: input.guestLabelByCustomerId[ticket.customerId] ?? 'Guest',
        status: ticket.status,
        statusLabel: carrying
          ? 'Carrying'
          : formatTicketStatusLabel(ticket.status, selected),
        selected,
        carrying,
        // A carried dish blocks cooking in the domain. Keep all order rows
        // informational until it is delivered instead of promising a next pick.
        selectable: ticket.status === 'open' && !input.carriedTicketId,
      };
    }),
  };
}
