import { customersPerDay } from '../../domain/day/types.ts';
import { pickModifier } from '../../domain/day/modifiers.ts';
import { daySeed } from '../../domain/rng/index.ts';
import {
  findNearestAchievement,
  formatNearestAchievementLine,
} from '../../domain/achievements/nearest.ts';
import { getDomainContext } from '../../app/content-loader.ts';
import { useGameStore } from '../../store/game-store.ts';
import {
  buildReviewDisplay,
} from '../presentation/review-display.ts';
import {
  buildTomorrowPreview,
  type TomorrowPreviewDisplay,
} from '../presentation/day-summary-display.ts';
import { buildRatingDisplayModel } from '../presentation/rating-display.ts';

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderTomorrowPanelHtml(preview: TomorrowPreviewDisplay): string {
  return `
    <section class="tomorrow-panel" data-testid="summary-tomorrow-panel" aria-label="${escapeHtml(preview.title)}">
      <h3 class="tomorrow-panel-title">${escapeHtml(preview.title)}</h3>
      <p class="tomorrow-panel-line" data-testid="summary-tomorrow-customers">${escapeHtml(preview.customersLine)}</p>
      <p class="tomorrow-panel-line" data-testid="summary-tomorrow-modifier">${escapeHtml(preview.modifierLine)}</p>
      <p class="tomorrow-panel-line" data-testid="summary-tomorrow-prestige">${escapeHtml(preview.prestigeLine)}</p>
      ${
        preview.achievementLine
          ? `<p class="tomorrow-panel-line tomorrow-panel-goal" data-testid="summary-tomorrow-achievement">${escapeHtml(preview.achievementLine)}</p>`
          : ''
      }
    </section>
  `;
}

function buildLiveTomorrowPreview(): TomorrowPreviewDisplay | null {
  const state = useGameStore.getState();
  if (!state.daySummary) return null;
  const nextDay = state.daySummary.nextDay;
  const expectedCustomers = customersPerDay({
    seatingCapacity: state.seatingCapacity,
    rating: state.rating,
    prestige: state.prestige,
    day: nextDay,
  });
  const seed = daySeed(state.globalRunSeed, nextDay, state.prestige);
  const modifier = pickModifier(nextDay, getDomainContext().modifiers, seed);
  const rating = buildRatingDisplayModel(state.rating, state.prestige);
  return buildTomorrowPreview({
    nextDay,
    expectedCustomers,
    seatingCapacity: state.seatingCapacity,
    modifierName: modifier.name,
    modifierDescription: modifier.description || null,
    prestigeDistanceText: rating.prestigeDistanceText,
    nearestAchievementLine: formatNearestAchievementLine(
      findNearestAchievement(state),
    ),
  });
}

function injectReviewVoiceLine(): void {
  const state = useGameStore.getState();
  const review = state.pendingReview;
  if (!review) return;
  const sheet = document.querySelector<HTMLElement>(
    '[data-testid="review-sheet"]',
  );
  if (!sheet || sheet.querySelector('[data-testid="guest-voice-line"]')) return;

  const customer = state.activeDay?.customers.find(
    (entry) => entry.id === review.customerId,
  );
  const archetype = customer
    ? getDomainContext().archetypes.find(
        (entry) => entry.id === customer.archetypeId,
      )
    : undefined;
  const display = buildReviewDisplay({
    matchStars: review.matchStars,
    tip: review.tip,
    ratingDelta: review.ratingDelta,
    recipeName: review.recipeName,
    masteryLine: review.masteryLine,
    archetype: archetype ?? null,
  });
  if (!display.guestVoiceLine) return;

  const voice = document.createElement('p');
  voice.className = 'guest-voice-line';
  voice.dataset.testid = 'guest-voice-line';
  voice.textContent = display.guestVoiceLine;

  const identity = sheet.querySelector('.review-identity-copy');
  if (identity) {
    identity.appendChild(voice);
    return;
  }
  const body = sheet.querySelector('.sheet-body-scroll');
  body?.insertBefore(voice, body.firstChild);
}

function injectTomorrowPanel(): void {
  const sheet = document.querySelector<HTMLElement>(
    '[data-testid="day-summary-sheet"]',
  );
  if (!sheet || sheet.querySelector('[data-testid="summary-tomorrow-panel"]')) {
    return;
  }
  const preview = buildLiveTomorrowPreview();
  if (!preview) return;
  const body = sheet.querySelector('.sheet-body-scroll');
  if (!body) return;
  body.insertAdjacentHTML('beforeend', renderTomorrowPanelHtml(preview));
}

/**
 * Live review / day-summary DOM enrichment without touching ServiceDayUi
 * (owned by another slice). Hooks from CelebrationBanner mount lifecycle.
 */
export function mountMetaSheetEnhancer(): () => void {
  const sync = () => {
    injectReviewVoiceLine();
    injectTomorrowPanel();
  };

  const observer = new MutationObserver(() => {
    sync();
  });
  observer.observe(document.body, { childList: true, subtree: true });

  const unsubscribe = useGameStore.subscribe((state, prev) => {
    if (
      state.pendingReview !== prev.pendingReview ||
      state.daySummary !== prev.daySummary ||
      state.rating !== prev.rating ||
      state.prestige !== prev.prestige ||
      state.seatingCapacity !== prev.seatingCapacity ||
      state.unlockedAchievementIds !== prev.unlockedAchievementIds
    ) {
      queueMicrotask(sync);
    }
  });

  sync();

  return () => {
    unsubscribe();
    observer.disconnect();
  };
}

export { buildLiveTomorrowPreview, renderTomorrowPanelHtml };
