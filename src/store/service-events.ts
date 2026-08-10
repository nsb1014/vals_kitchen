import type { GameState } from '../domain/state/game-state.ts';
import type { ReducerEvent } from '../domain/reducer.ts';
import type { RecentReviewEntry } from '../ui/presentation/rating-display.ts';
import type {
  Celebration,
  CeremonyKind,
  ServeReview,
} from './game-store.ts';
import type { SfxId } from '../assets/manifest.ts';

const MAX_RECENT_REVIEWS = 12;

export type FloorFeelBeat = 'deliver' | 'seat' | 'order' | 'walk';

export interface ServiceUiPatch {
  pendingReview?: ServeReview | null;
  ceremony?: CeremonyKind | null;
  ceremonyPrestige?: number | null;
  recentReviews?: RecentReviewEntry[];
  celebrationQueue?: Celebration[];
  /**
   * Presentation signal: play the existing `serve` sting when a floor deliver
   * completes (CUSTOMER_SERVED). Audio bridge / canvas consumers may observe.
   */
  playDeliverSting?: boolean;
  /** Armed auto-walk / CTA sync (canvas sets `data-in-flight` from this). */
  floorActionInFlight?: FloorFeelBeat | null;
}

/** Map floor-feel beats onto shipped SFX ids (no new audio files). */
export function sfxForFloorFeelBeat(beat: FloorFeelBeat): SfxId {
  switch (beat) {
    case 'deliver':
      return 'serve';
    case 'seat':
    case 'order':
      return 'uiClick';
    case 'walk':
      return 'uiClick';
  }
}

export function formatMasteryLine(input: {
  masteryLevel?: number;
  masteryLeveledUp?: boolean;
  masteryBonus?: number;
}): string | null {
  if (input.masteryLevel === undefined) return null;
  if (input.masteryLeveledUp) {
    return `Mastery up! Lv.${input.masteryLevel}`;
  }
  const bonus = input.masteryBonus ?? 0;
  return `Mastery Lv.${input.masteryLevel} (+${bonus.toFixed(2)}★)`;
}

export function mapReducerEventsToUi(
  events: ReducerEvent[],
  before: GameState,
  existingReviews: RecentReviewEntry[] = [],
  existingCelebrations: Celebration[] = [],
): ServiceUiPatch {
  const patch: ServiceUiPatch = {};
  let recipeName: string | null = null;
  const celebrations: Celebration[] = [];

  for (const event of events) {
    switch (event.type) {
      case 'RECIPE_DISCOVERED':
        recipeName = event.recipeName;
        celebrations.push({
          kind: 'recipe',
          title: event.recipeName,
          body: 'New recipe unlocked · Mastery Lv.1',
          ingredientIds: event.ingredientIds,
          level: 1,
        });
        break;
      case 'CUSTOMER_SERVED':
        patch.playDeliverSting = true;
        patch.pendingReview = {
          customerId: event.customerId,
          matchStars: event.matchStars,
          tip: event.tip,
          ratingDelta: event.ratingDelta,
          recipeName: recipeName ?? event.recipeName ?? null,
          masteryLine: formatMasteryLine(event),
        };
        if (
          event.masteryLeveledUp &&
          event.masteryLevel !== undefined &&
          event.masteryLevel >= 2 &&
          event.recipeName
        ) {
          celebrations.push({
            kind: 'mastery',
            title: event.recipeName,
            body: `Mastery up! Lv.${event.masteryLevel}`,
            ingredientIds: event.ingredientIds,
            level: event.masteryLevel,
          });
        }
        break;
      case 'PRESTIGE_TRIGGERED':
        celebrations.push({
          kind: 'prestige',
          title: 'Prestige Achieved!',
          body: `Reached P${event.prestige}. Rating reset to 3.0★ and permanent payouts increased.`,
        });
        break;
      case 'SOFT_RESET_TRIGGERED':
        patch.ceremony = 'soft_reset';
        patch.ceremonyPrestige = null;
        break;
      case 'ACHIEVEMENT_UNLOCKED':
        celebrations.push({
          kind: 'achievement',
          title: event.title,
          body: event.body,
          achievementId: event.achievementId,
        });
        break;
      default:
        break;
    }
  }

  if (patch.pendingReview && patch.ceremony === 'soft_reset') {
    patch.pendingReview = {
      ...patch.pendingReview,
      afterSoftReset: true,
    };
  }

  if (patch.pendingReview) {
    patch.recentReviews = appendRecentReview(
      before,
      patch.pendingReview,
      existingReviews,
    );
  }

  if (celebrations.length > 0) {
    patch.celebrationQueue = [...existingCelebrations, ...celebrations];
  }

  return patch;
}

export function appendRecentReview(
  state: GameState,
  review: ServeReview,
  existing: RecentReviewEntry[] = [],
): RecentReviewEntry[] {
  const entry: RecentReviewEntry = {
    matchStars: review.matchStars,
    ratingDelta: review.ratingDelta,
    tip: review.tip,
    recipeName: review.recipeName,
    day: state.day,
  };
  return [entry, ...existing].slice(0, MAX_RECENT_REVIEWS);
}
