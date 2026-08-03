import type { GuestStage } from '../../domain/floor/types.ts';

export type CarriedDishRelation = 'none' | 'matching' | 'other';
export type GuestHintAction = 'order' | 'deliver' | null;

/** The floor highlight is a promise that tapping this guest can act now. */
export function guestHintAction(
  stage: GuestStage,
  adjacent: boolean,
  carriedDish: CarriedDishRelation,
  orderAvailable: boolean,
): GuestHintAction {
  if (!adjacent) return null;
  if (carriedDish === 'matching' && stage === 'ordered') return 'deliver';
  if (carriedDish === 'none' && stage === 'seated' && orderAvailable) {
    return 'order';
  }
  return null;
}
