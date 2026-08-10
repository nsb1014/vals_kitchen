import { useGameStore } from '../../store/game-store.ts';
import {
  findNearestAchievement,
  formatNearestAchievementLine,
} from '../../domain/achievements/nearest.ts';
import {
  buildRatingDisplayModel,
  formatRecentReview,
  ratingBarPercent,
  type RecentReviewEntry,
} from '../presentation/rating-display.ts';

export function escapeRatingReviewHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

export function renderRecentReviewsMarkup(
  recentReviews: RecentReviewEntry[],
): string {
  return recentReviews.length > 0
    ? recentReviews
        .map(
          (entry) =>
            `<li>${escapeRatingReviewHtml(formatRecentReview(entry))}</li>`,
        )
        .join('')
    : '<li class="screen-empty">No recent reviews yet — serve customers to see feedback.</li>';
}

export function mountRatingScreen(container: HTMLElement): () => void {
  const root = document.createElement('div');
  root.className = 'screen-root';
  container.appendChild(root);
  root.innerHTML = `
    <section class="screen-panel sheet-tier-meta-full meta-screen" id="rating-screen" data-testid="rating-screen" hidden>
      <header class="screen-header">
        <h1 class="screen-title">Rating & Status</h1>
        <p class="screen-subtitle" id="rating-run-goal" data-testid="rating-run-goal"></p>
      </header>
      <div class="rating-body" id="rating-body"></div>
    </section>
  `;

  const panel = root.querySelector('#rating-screen') as HTMLElement;
  const bodyEl = root.querySelector('#rating-body') as HTMLElement;
  const runGoalEl = root.querySelector('#rating-run-goal') as HTMLElement;

  const render = () => {
    const state = useGameStore.getState();
    const model = buildRatingDisplayModel(state.rating, state.prestige);
    const nearest = formatNearestAchievementLine(findNearestAchievement(state));
    runGoalEl.textContent =
      model.starsToPrestige > 0.049
        ? model.prestigeDistanceText
        : 'Prestige ready — hit 6.0★ on your next climb';

    const markers = model.ratingScaleMarkers
      .map(
        (marker) =>
          `<span class="rating-scale-marker${marker.active ? ' active' : ''}">${marker.label}</span>`,
      )
      .join('');

    const reviews = renderRecentReviewsMarkup(state.recentReviews);

    bodyEl.innerHTML = `
      <div class="rating-hero">
        <p class="rating-current" aria-label="Current rating">${model.ratingText}</p>
        <div class="rating-scale" aria-hidden="true">${markers}</div>
        <div class="rating-bar-track" role="meter" aria-valuemin="0" aria-valuemax="6" aria-valuenow="${model.rating}">
          <div class="rating-bar-fill" style="width:${ratingBarPercent(model.rating).toFixed(1)}%"></div>
        </div>
        <p class="rating-range-hint">Scale 0.0 – 6.0 · Prestige at 6.0 · Soft reset at 0.0</p>
      </div>
      <div class="rating-stats">
        <article class="stat-card">
          <h2>Prestige</h2>
          <p class="stat-value">P${model.prestige}</p>
          <p class="stat-detail">Payout × ${model.prestigeMultiplierText}</p>
        </article>
        <article class="stat-card">
          <h2>Payout multiplier</h2>
          <p class="stat-value">${model.ratingMultiplierText}</p>
          <p class="stat-detail">From current rating</p>
        </article>
      </div>
      <div class="rating-distances">
        <p data-testid="rating-prestige-distance">${model.prestigeDistanceText}</p>
        <p data-testid="rating-soft-reset-distance">${model.softResetDistanceText}</p>
        ${
          nearest
            ? `<p class="rating-nearest-achievement" data-testid="rating-nearest-achievement">${escapeRatingReviewHtml(nearest)}</p>`
            : ''
        }
      </div>
      <section class="recent-reviews">
        <h2 class="section-title">Recent Reviews</h2>
        <ul class="review-list">${reviews}</ul>
      </section>
    `;
  };

  const syncVisibility = () => {
    panel.hidden = useGameStore.getState().screen !== 'rating';
  };

  const unsubscribe = useGameStore.subscribe((state, prev) => {
    if (state.screen !== prev.screen) syncVisibility();
    if (
      state.rating !== prev.rating ||
      state.prestige !== prev.prestige ||
      state.recentReviews !== prev.recentReviews ||
      state.unlockedAchievementIds !== prev.unlockedAchievementIds ||
      state.discoveredRecipeIds !== prev.discoveredRecipeIds ||
      state.day !== prev.day ||
      state.stats !== prev.stats
    ) {
      render();
    }
  });

  render();
  syncVisibility();

  return () => {
    unsubscribe();
    root.remove();
  };
}
