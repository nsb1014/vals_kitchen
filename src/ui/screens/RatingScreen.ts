import { useGameStore } from '../../store/game-store.ts';
import {
  buildRatingDisplayModel,
  formatRecentReview,
  ratingBarPercent,
} from '../presentation/rating-display.ts';

export function mountRatingScreen(container: HTMLElement): () => void {
  const root = document.createElement('div');
  root.className = 'screen-root';
  container.appendChild(root);
  root.innerHTML = `
    <section class="screen-panel" id="rating-screen" data-testid="rating-screen" hidden>
      <header class="screen-header">
        <h1 class="screen-title">Rating & Status</h1>
      </header>
      <div class="rating-body" id="rating-body"></div>
    </section>
  `;

  const panel = root.querySelector('#rating-screen') as HTMLElement;
  const bodyEl = root.querySelector('#rating-body') as HTMLElement;

  const render = () => {
    const state = useGameStore.getState();
    const model = buildRatingDisplayModel(state.rating, state.prestige);
    const markers = model.ratingScaleMarkers
      .map(
        (marker) =>
          `<span class="rating-scale-marker${marker.active ? ' active' : ''}">${marker.label}</span>`,
      )
      .join('');

    const reviews =
      state.recentReviews.length > 0
        ? state.recentReviews
            .map((entry) => `<li>${formatRecentReview(entry)}</li>`)
            .join('')
        : '<li class="screen-empty">No recent reviews yet — serve customers to see feedback.</li>';

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
        <p>${model.prestigeDistanceText}</p>
        <p>${model.softResetDistanceText}</p>
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
      state.recentReviews !== prev.recentReviews
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
