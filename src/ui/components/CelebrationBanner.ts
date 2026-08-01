import {
  useGameStore,
  type GameStore,
} from '../../store/game-store.ts';
import { selectShowFloorCompose } from '../../store/selectors/service-day.ts';
import {
  achievementBadgeUrl,
  getAchievement,
} from '../../domain/achievements/catalog.ts';
import { bindNotificationSurfaceLifecycle } from '../notifications/surface-lifecycle.ts';
import { renderFoodIconHtml } from './food-icon.ts';

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Full service sheets own the user's attention and cover the banner position.
 * Ceremonies remain blocking even if a future flow displays one off the floor.
 */
export function selectNotificationUiBlocked(state: GameStore): boolean {
  return (
    Boolean(state.ceremony) ||
    (state.screen === 'restaurant' &&
      (selectShowFloorCompose(state) ||
        Boolean(state.pendingReview) ||
        Boolean(state.daySummary)))
  );
}

export function notificationSurfaceShouldRun(
  pageLifecycleActive: boolean,
  uiBlocked: boolean,
): boolean {
  return pageLifecycleActive && !uiBlocked;
}

export function mountCelebrationBanner(mount: HTMLElement): () => void {
  const host = document.createElement('div');
  host.className = 'celebration-banner-host';
  host.dataset.testid = 'celebration-banner-host';
  host.setAttribute('aria-live', 'polite');
  host.setAttribute('aria-atomic', 'true');
  mount.appendChild(host);

  let pageLifecycleActive = false;
  let uiBlocked = selectNotificationUiBlocked(useGameStore.getState());

  const syncNotificationSurface = () => {
    useGameStore
      .getState()
      .setNotificationSurfaceActive(
        notificationSurfaceShouldRun(pageLifecycleActive, uiBlocked),
      );
  };

  const syncHostVisibility = () => {
    const state = useGameStore.getState();
    host.hidden =
      uiBlocked || (!state.noticeActive && !state.celebrationQueue[0]);
  };

  const render = () => {
    const state = useGameStore.getState();
    const notice = state.noticeActive;
    const celebration = state.celebrationQueue[0];
    host.hidden = uiBlocked || (!notice && !celebration);
    if (!notice && !celebration) {
      host.innerHTML = '';
      return;
    }

    const celebrationHtml = celebration
      ? (() => {
          const icons = (celebration.ingredientIds ?? [])
            .map((ingredientId) => renderFoodIconHtml(ingredientId, 30))
            .join('');
          const achievement = celebration.achievementId
            ? getAchievement(celebration.achievementId)
            : undefined;
          const achievementIcon = achievement
            ? `<img class="celebration-achievement-badge" src="${achievementBadgeUrl(achievement.id)}" alt="" width="48" height="48" />`
            : '';
          const coveredAttributes = notice ? ' aria-hidden="true" inert' : '';
          return `
            <aside class="celebration-banner celebration-banner-${celebration.kind}" data-testid="celebration-banner"${coveredAttributes}>
              ${achievementIcon}
              ${icons ? `<div class="celebration-banner-icons">${icons}</div>` : ''}
              <div class="celebration-banner-copy">
                <strong class="celebration-banner-title">${escapeHtml(celebration.title)}</strong>
                <span class="celebration-banner-body">${escapeHtml(celebration.body)}</span>
              </div>
              <button class="celebration-banner-dismiss" type="button" aria-label="Dismiss celebration">×</button>
            </aside>
          `;
        })()
      : '';
    const noticeHtml = notice
      ? `
          <aside class="notice-banner notice-banner-${notice.source}" data-testid="notice-banner">
            <div class="notice-banner-copy">
              ${notice.title ? `<strong class="notice-banner-title">${escapeHtml(notice.title)}</strong>` : ''}
              <span class="notice-banner-body">${escapeHtml(notice.body)}</span>
            </div>
            <button class="notice-banner-dismiss" type="button" aria-label="Dismiss notice">×</button>
          </aside>
        `
      : '';

    host.innerHTML = `
      ${celebrationHtml}
      ${noticeHtml}
    `;
    host
      .querySelector('.celebration-banner-dismiss')
      ?.addEventListener(
        'click',
        () => useGameStore.getState().dismissCelebration(),
        { once: true },
      );
    host
      .querySelector('.notice-banner-dismiss')
      ?.addEventListener(
        'click',
        () => useGameStore.getState().dismissFrontNotice(),
        { once: true },
      );
  };

  const unsubscribe = useGameStore.subscribe((state, previous) => {
    const nextUiBlocked = selectNotificationUiBlocked(state);
    if (nextUiBlocked !== uiBlocked) {
      uiBlocked = nextUiBlocked;
      syncHostVisibility();
      syncNotificationSurface();
    }
    if (
      state.noticeActive !== previous.noticeActive ||
      state.celebrationQueue !== previous.celebrationQueue
    ) {
      render();
    }
  });
  const unbindSurfaceLifecycle = bindNotificationSurfaceLifecycle({
    isHostConnected: () => host.isConnected,
    setActive: (active) => {
      pageLifecycleActive = active;
      syncNotificationSurface();
    },
  });
  window.addEventListener('food-atlas-ready', render);
  render();

  return () => {
    unsubscribe();
    unbindSurfaceLifecycle();
    pageLifecycleActive = false;
    syncNotificationSurface();
    window.removeEventListener('food-atlas-ready', render);
    host.remove();
  };
}
