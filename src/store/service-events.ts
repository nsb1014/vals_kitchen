import type { GameState } from '../domain/state/game-state.ts';
import type { ReducerEvent } from '../domain/reducer.ts';
import type { RecentReviewEntry } from '../ui/presentation/rating-display.ts';
import type { CeremonyKind, ServeReview } from './game-store.ts';

const MAX_RECENT_REVIEWS = 12;

export interface ServiceUiPatch {
  pendingReview?: ServeReview | null;
  ceremony?: CeremonyKind | null;
  ceremonyPrestige?: number | null;
  recentReviews?: RecentReviewEntry[];
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
): ServiceUiPatch {
  const patch: ServiceUiPatch = {};
  let recipeName: string | null = null;

  for (const event of events) {
    switch (event.type) {
      case 'RECIPE_DISCOVERED':
        recipeName = event.recipeName;
        break;
      case 'CUSTOMER_SERVED':
        patch.pendingReview = {
          matchStars: event.matchStars,
          tip: event.tip,
          ratingDelta: event.ratingDelta,
          recipeName,
          masteryLine: formatMasteryLine(event),
        };
        break;
      case 'PRESTIGE_TRIGGERED':
        patch.ceremony = 'prestige';
        patch.ceremonyPrestige = event.prestige;
        break;
      case 'SOFT_RESET_TRIGGERED':
        patch.ceremony = 'soft_reset';
        patch.ceremonyPrestige = null;
        break;
      default:
        break;
    }
  }

  if (patch.pendingReview) {
    patch.recentReviews = appendRecentReview(
      before,
      patch.pendingReview,
      existingReviews,
    );
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
