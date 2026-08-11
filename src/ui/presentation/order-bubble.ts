import type { AxisKey, CustomerPreference } from '../../domain/types.ts';
import { AXIS_KEYS } from '../../domain/types.ts';
import { AXIS_LABELS } from '../../domain/flavor/axis-labels.ts';
import type { FloorDay } from '../../domain/floor/types.ts';
import { formatCustomerRequestText } from './customer-request.ts';
import {
  generateGuestGibberish,
  guestGibberishMoodFromPreference,
  type GuestGibberishMood,
} from './guest-gibberish.ts';

/** Whether a recent order still belongs to the live, actionable floor state. */
export function isOrderBubbleOwnedByFloor(
  floor: FloorDay | null | undefined,
  customerId: string | null,
): boolean {
  if (!floor || !customerId) return false;

  const guest = floor.pool.find(
    (candidate) => candidate.customer.id === customerId,
  );
  if (guest?.stage !== 'ordered') return false;

  return floor.tickets.some(
    (ticket) => ticket.customerId === customerId && ticket.status === 'open',
  );
}

export interface OrderBubbleCue {
  axis: AxisKey;
  label: string;
  band: 'low' | 'mid' | 'high' | 'avoid';
  short: string;
}

/** Top requested axes for at-a-glance bubble iconography (max 3). */
export function buildOrderBubbleCues(
  preference: CustomerPreference,
  limit = 3,
): OrderBubbleCue[] {
  const cues: OrderBubbleCue[] = [];
  for (const axis of AXIS_KEYS) {
    const band = preference.primary[axis];
    if (band) {
      const label = AXIS_LABELS[axis];
      cues.push({
        axis,
        label,
        band,
        short: label.slice(0, 2),
      });
    }
  }
  for (const axis of AXIS_KEYS) {
    if (preference.avoid[axis] && !cues.some((cue) => cue.axis === axis)) {
      const label = AXIS_LABELS[axis];
      cues.push({
        axis,
        label,
        band: 'avoid',
        short: label.slice(0, 2),
      });
    }
  }
  return cues.slice(0, limit);
}

export function orderBubbleSeed(input: {
  guestId: string;
  ticketId?: string | null;
}): string {
  return `${input.guestId}:${input.ticketId ?? 'order'}`;
}

export function buildOrderBubbleSpeech(input: {
  preference: CustomerPreference;
  seed: string;
  archetypeId?: string;
  mood?: GuestGibberishMood;
}): { gibberish: string; accessibleSummary: string; cues: OrderBubbleCue[] } {
  const mood =
    input.mood ?? guestGibberishMoodFromPreference(input.preference);
  return {
    gibberish: generateGuestGibberish(input.seed, {
      mood,
      archetypeId: input.archetypeId,
    }),
    accessibleSummary: formatCustomerRequestText(input.preference),
    cues: buildOrderBubbleCues(input.preference),
  };
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Sims babble + compact order cues for the chat bubble.
 * Real preference text stays in `.sr-only` for `role="status"`.
 */
export function renderOrderBubbleHtml(input: {
  gibberish: string;
  accessibleSummary: string;
  cues: readonly OrderBubbleCue[];
}): string {
  const cues = input.cues
    .map(
      (cue) =>
        `<span class="order-bubble-cue order-bubble-cue-${escapeHtml(cue.band)}" data-testid="order-bubble-cue" data-axis="${escapeHtml(cue.axis)}" title="${escapeHtml(cue.label)}">${escapeHtml(cue.short)}</span>`,
    )
    .join('');
  return `<span class="sr-only">Order: ${escapeHtml(input.accessibleSummary)}</span><div class="order-bubble-visual" aria-hidden="true"><div class="order-bubble-cues" data-testid="order-bubble-cues"><span class="order-bubble-ticket-icon" data-testid="order-bubble-ticket-icon"></span>${cues}</div><p class="order-bubble-gibberish" data-testid="order-bubble-gibberish">${escapeHtml(input.gibberish)}</p></div>`;
}
