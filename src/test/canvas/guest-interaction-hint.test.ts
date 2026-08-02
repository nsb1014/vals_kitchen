import { describe, expect, it } from 'vitest';
import type { GuestStage } from '../../domain/floor/types.ts';
import {
  guestHintAction,
  type CarriedDishRelation,
} from '../../canvas/world/guest-interaction-hint.ts';

describe('guest interaction hint', () => {
  it('promises only an order that can be taken now', () => {
    expect(guestHintAction('seated', true, 'none')).toBe('order');
    expect(guestHintAction('seated', false, 'none')).toBeNull();
  });

  it('promises only a matching delivery that can be made now', () => {
    expect(guestHintAction('ordered', true, 'matching')).toBe('deliver');
    expect(guestHintAction('ordered', false, 'matching')).toBeNull();
    expect(guestHintAction('ordered', true, 'other')).toBeNull();
  });

  it('does not highlight passive guest states', () => {
    const passiveStages: GuestStage[] = [
      'queued',
      'entering',
      'waiting',
      'seating',
      'ordered',
      'eating',
      'leaving',
      'done',
    ];
    const carriedStates: CarriedDishRelation[] = ['none', 'other'];
    for (const stage of passiveStages) {
      for (const carried of carriedStates) {
        expect(guestHintAction(stage, true, carried), `${stage}/${carried}`).toBeNull();
      }
    }
  });
});
