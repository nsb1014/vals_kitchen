import type { GuestStage } from '../../domain/floor/types.ts';

export type CarriedDishRelation = 'none' | 'matching' | 'other';
export type GuestHintAction = 'order' | 'deliver' | null;
export type GuestStageFloorCue = 'order' | 'deliver' | 'eating' | 'leaving' | null;

/** The floor highlight is a promise that tapping this guest can act now. */
export function guestHintAction(
  stage: GuestStage,
  adjacent: boolean,
  carriedDish: CarriedDishRelation,
  orderAvailable: boolean,
): GuestHintAction {
  if (!adjacent) return null;
  return guestCanvasCueAction(stage, carriedDish, orderAvailable);
}

/**
 * Distance-readable head cue — same action rules as {@link guestHintAction}
 * without the adjacency gate (PlateUp/Diner Dash glanceability).
 */
export function guestCanvasCueAction(
  stage: GuestStage,
  carriedDish: CarriedDishRelation,
  orderAvailable: boolean,
): GuestHintAction {
  if (carriedDish === 'matching' && stage === 'ordered') return 'deliver';
  if (carriedDish === 'none' && stage === 'seated' && orderAvailable) {
    return 'order';
  }
  return null;
}

/** Soft pacing cues while a guest is mid-meal or about to free the table. */
export function guestStageFloorCue(stage: GuestStage): GuestStageFloorCue {
  if (stage === 'eating') return 'eating';
  if (stage === 'leaving') return 'leaving';
  return null;
}
