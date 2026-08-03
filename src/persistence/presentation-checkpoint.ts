import type {
  CeremonyKind,
  ServeReview,
} from '../store/game-store.ts';
import type { GameState } from '../domain/state/game-state.ts';
import type { DaySummaryDisplay } from '../ui/presentation/day-summary-display.ts';
import type { RecentReviewEntry } from '../ui/presentation/rating-display.ts';

export const MAX_PERSISTED_RECENT_REVIEWS = 12;

export interface PresentationCheckpoint {
  pendingReview: ServeReview | null;
  daySummary: DaySummaryDisplay | null;
  ceremony: CeremonyKind | null;
  ceremonyPrestige: number | null;
  dayStartRating: number | null;
  recentReviews: RecentReviewEntry[];
}

export interface GameSaveSnapshot {
  state: GameState;
  presentation: PresentationCheckpoint;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isBoundedString(value: unknown, maxLength: number): value is string {
  return typeof value === 'string' && value.length <= maxLength;
}

function isNumberInRange(value: unknown, min: number, max: number): value is number {
  return isFiniteNumber(value) && value >= min && value <= max;
}

function isNullableBoundedString(
  value: unknown,
  maxLength: number,
): value is string | null {
  return value === null || isBoundedString(value, maxLength);
}

function isSafeIntegerAtLeast(value: unknown, min: number): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= min;
}

function normalizePendingReview(value: unknown): ServeReview | null {
  if (value === null) return null;
  if (
    !isRecord(value) ||
    !isNumberInRange(value.matchStars, 0, 10) ||
    !isNumberInRange(value.tip, 0, Number.MAX_SAFE_INTEGER) ||
    !isNumberInRange(value.ratingDelta, -6, 6) ||
    !isNullableBoundedString(value.recipeName, 200) ||
    (value.customerId !== undefined && !isBoundedString(value.customerId, 200)) ||
    (value.afterSoftReset !== undefined && typeof value.afterSoftReset !== 'boolean') ||
    (value.masteryLine !== undefined && !isNullableBoundedString(value.masteryLine, 500))
  ) {
    throw new Error('Invalid presentation checkpoint: malformed pending review');
  }
  return {
    ...(value.customerId === undefined ? {} : { customerId: value.customerId }),
    ...(value.afterSoftReset === undefined
      ? {}
      : { afterSoftReset: value.afterSoftReset }),
    matchStars: value.matchStars,
    tip: value.tip,
    ratingDelta: value.ratingDelta,
    recipeName: value.recipeName,
    ...(value.masteryLine === undefined ? {} : { masteryLine: value.masteryLine }),
  };
}

function normalizeDaySummary(value: unknown): DaySummaryDisplay | null {
  if (value === null) return null;
  if (
    !isRecord(value) ||
    !isSafeIntegerAtLeast(value.completedDay, 1) ||
    !isSafeIntegerAtLeast(value.nextDay, 1) ||
    !isBoundedString(value.earningsLine, 500) ||
    !isNullableBoundedString(value.bonusLine, 500) ||
    !isNullableBoundedString(value.volumeBonusLine, 500) ||
    !isBoundedString(value.averageMatchText, 500) ||
    !isBoundedString(value.ratingDeltaText, 500) ||
    !isBoundedString(value.unlockProgressText, 500) ||
    !isBoundedString(value.customersServedText, 500) ||
    !isNullableBoundedString(value.masteryLine, 1_000)
  ) {
    throw new Error('Invalid presentation checkpoint: malformed day summary');
  }
  return {
    completedDay: value.completedDay,
    nextDay: value.nextDay,
    earningsLine: value.earningsLine,
    bonusLine: value.bonusLine,
    volumeBonusLine: value.volumeBonusLine,
    averageMatchText: value.averageMatchText,
    ratingDeltaText: value.ratingDeltaText,
    unlockProgressText: value.unlockProgressText,
    customersServedText: value.customersServedText,
    masteryLine: value.masteryLine,
  };
}

function normalizeRecentReview(value: unknown): RecentReviewEntry {
  if (
    !isRecord(value) ||
    !isNumberInRange(value.matchStars, 0, 10) ||
    !isNumberInRange(value.ratingDelta, -6, 6) ||
    !isNumberInRange(value.tip, 0, Number.MAX_SAFE_INTEGER) ||
    !isNullableBoundedString(value.recipeName, 200) ||
    !isSafeIntegerAtLeast(value.day, 1)
  ) {
    throw new Error('Invalid presentation checkpoint: malformed recent review');
  }
  return {
    matchStars: value.matchStars,
    ratingDelta: value.ratingDelta,
    tip: value.tip,
    recipeName: value.recipeName,
    day: value.day,
  };
}

export function createEmptyPresentationCheckpoint(): PresentationCheckpoint {
  return {
    pendingReview: null,
    daySummary: null,
    ceremony: null,
    ceremonyPrestige: null,
    dayStartRating: null,
    recentReviews: [],
  };
}

/**
 * Validate untrusted persisted presentation data and return a detached,
 * canonical checkpoint. The review history is intentionally bounded because
 * it is display history rather than simulation state.
 */
export function normalizePresentationCheckpoint(
  value: unknown,
  state?: GameState,
): PresentationCheckpoint {
  if (!isRecord(value)) {
    throw new Error('Invalid presentation checkpoint: not an object');
  }
  if (
    !('pendingReview' in value) ||
    !('daySummary' in value) ||
    !('ceremony' in value) ||
    !('ceremonyPrestige' in value) ||
    !('dayStartRating' in value) ||
    !Array.isArray(value.recentReviews) ||
    value.recentReviews.length > MAX_PERSISTED_RECENT_REVIEWS
  ) {
    throw new Error('Invalid presentation checkpoint: missing fields');
  }
  if (
    value.ceremony !== null &&
    value.ceremony !== 'prestige' &&
    value.ceremony !== 'soft_reset'
  ) {
    throw new Error('Invalid presentation checkpoint: malformed ceremony');
  }
  if (
    value.ceremonyPrestige !== null &&
    !isSafeIntegerAtLeast(value.ceremonyPrestige, 1)
  ) {
    throw new Error('Invalid presentation checkpoint: malformed ceremony prestige');
  }
  if (value.dayStartRating !== null && !isNumberInRange(value.dayStartRating, 0, 6)) {
    throw new Error('Invalid presentation checkpoint: malformed day-start rating');
  }

  const pendingReview = normalizePendingReview(value.pendingReview);
  const daySummary = normalizeDaySummary(value.daySummary);
  if (state) {
    if (value.dayStartRating !== null && state.activeDay === null) {
      throw new Error('Invalid presentation checkpoint: day-start rating without active day');
    }
    if (
      daySummary &&
      (state.activeDay !== null ||
        daySummary.nextDay !== state.day ||
        daySummary.completedDay !== state.day - 1)
    ) {
      throw new Error('Invalid presentation checkpoint: day summary does not match game state');
    }
    if (pendingReview) {
      const isPostResetReview = pendingReview.afterSoftReset === true;
      if (
        isPostResetReview &&
        (state.activeDay !== null ||
          (value.ceremony !== null && value.ceremony !== 'soft_reset'))
      ) {
        throw new Error('Invalid presentation checkpoint: malformed reset review');
      }
      if (!isPostResetReview && state.activeDay === null) {
        throw new Error('Invalid presentation checkpoint: review without active day');
      }
    }
    if (pendingReview?.customerId && !pendingReview.afterSoftReset) {
      const activeCustomerIds = new Set([
        ...(state.activeDay?.customers.map((customer) => customer.id) ?? []),
        ...(state.activeDay?.floor?.pool.map((guest) => guest.customer.id) ?? []),
      ]);
      if (!activeCustomerIds.has(pendingReview.customerId)) {
        throw new Error('Invalid presentation checkpoint: review customer is not active');
      }
    }
    if (
      (value.ceremony === null && value.ceremonyPrestige !== null) ||
      (value.ceremony === 'soft_reset' && state.activeDay !== null) ||
      (value.ceremony === 'soft_reset' && value.ceremonyPrestige !== null) ||
      (value.ceremony === 'prestige' && value.ceremonyPrestige !== state.prestige)
    ) {
      throw new Error('Invalid presentation checkpoint: ceremony does not match game state');
    }
  }

  return {
    pendingReview,
    daySummary,
    ceremony: value.ceremony,
    ceremonyPrestige: value.ceremonyPrestige as number | null,
    dayStartRating: value.dayStartRating as number | null,
    recentReviews: value.recentReviews.map(normalizeRecentReview),
  };
}
