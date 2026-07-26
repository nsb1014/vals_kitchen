import { isFloorDayComplete } from './sim.ts';
import type { FloorDay } from './types.ts';

export type TutorialStepId =
  | 'set_tables'
  | 'wait_seat'
  | 'take_orders'
  | 'cook'
  | 'deliver'
  | 'clear'
  | 'close'
  | 'done';

const ORDER: TutorialStepId[] = [
  'set_tables',
  'wait_seat',
  'take_orders',
  'cook',
  'deliver',
  'clear',
  'close',
  'done',
];

export function tutorialPrompt(step: TutorialStepId | null): string | null {
  switch (step) {
    case 'set_tables':
      return 'Set every table before guests can sit.';
    case 'wait_seat':
      return 'Seat the next guest from the door line.';
    case 'take_orders':
      return 'Take orders from seated guests.';
    case 'cook':
      return 'Plate a ticket at the kitchen station.';
    case 'deliver':
      return 'Deliver the plated dish to the matching guest.';
    case 'clear':
      return 'Clear dirty tables after guests leave.';
    case 'close':
      return 'When the floor is clear, close the day.';
    case 'done':
      return null;
    default:
      return null;
  }
}

/** Advance day-1 tutorial based on floor state. */
export function nextTutorialStep(day: FloorDay, enabled: boolean): TutorialStepId | null {
  if (!enabled) return null;

  const allSetOrBusy = day.tables.every((t) => t.state !== 'unset');
  if (!allSetOrBusy) return 'set_tables';

  const anySeatedOrFurther = day.pool.some((g) => g.stage !== 'waiting' && g.stage !== 'done');
  const anyWaiting = day.pool.some((g) => g.stage === 'waiting');
  if (anyWaiting && !day.pool.some((g) => g.stage === 'seated' || g.stage === 'ordered' || g.stage === 'eating')) {
    return 'wait_seat';
  }

  if (day.pool.some((g) => g.stage === 'seated')) return 'take_orders';
  if (day.tickets.some((t) => t.status === 'open') && !day.carriedTicketId) return 'cook';
  if (day.carriedTicketId) return 'deliver';
  if (day.tables.some((t) => t.state === 'dirty')) return 'clear';

  if (anySeatedOrFurther || anyWaiting) {
    // Mid-loop: prefer seat/order/cook cycle
    if (anyWaiting) return 'wait_seat';
    return 'take_orders';
  }

  if (isFloorDayComplete(day)) return 'close';

  return 'done';
}

export function tutorialOrder(): readonly TutorialStepId[] {
  return ORDER;
}
