import { useGameStore } from '../../store/game-store.ts';
import {
  achievementBadgeUrl,
  getAchievement,
} from '../../domain/achievements/catalog.ts';
import { renderFoodIconHtml } from './food-icon.ts';

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function mountCelebrationBanner(mount: HTMLElement): () => void {
  const host = document.createElement('div');
  host.className = 'celebration-banner-host';
  host.dataset.testid = 'celebration-banner-host';
  host.setAttribute('aria-live', 'polite');
  host.setAttribute('aria-atomic', 'true');
  mount.appendChild(host);

  const render = () => {
    const celebration = useGameStore.getState().celebrationQueue[0];
    host.hidden = !celebration;
    if (!celebration) {
      host.innerHTML = '';
      return;
    }

    const icons = (celebration.ingredientIds ?? [])
      .map((ingredientId) => renderFoodIconHtml(ingredientId, 30))
      .join('');
    const achievement = celebration.achievementId
      ? getAchievement(celebration.achievementId)
      : undefined;
    const achievementIcon = achievement
      ? `<img class="celebration-achievement-badge" src="${achievementBadgeUrl(achievement.id)}" alt="" width="48" height="48" />`
      : '';
    host.innerHTML = `
      <aside class="celebration-banner celebration-banner-${celebration.kind}" data-testid="celebration-banner">
        ${achievementIcon}
        ${icons ? `<div class="celebration-banner-icons">${icons}</div>` : ''}
        <div class="celebration-banner-copy">
          <strong class="celebration-banner-title">${escapeHtml(celebration.title)}</strong>
          <span class="celebration-banner-body">${escapeHtml(celebration.body)}</span>
        </div>
        <button class="celebration-banner-dismiss" type="button" aria-label="Dismiss celebration">×</button>
      </aside>
    `;
    host
      .querySelector('.celebration-banner-dismiss')
      ?.addEventListener('click', () => useGameStore.getState().dismissCelebration(), {
        once: true,
      });
  };

  const unsubscribe = useGameStore.subscribe((state, previous) => {
    if (state.celebrationQueue !== previous.celebrationQueue) render();
  });
  window.addEventListener('food-atlas-ready', render);
  render();

  return () => {
    unsubscribe();
    window.removeEventListener('food-atlas-ready', render);
    host.remove();
  };
}
