import {
  useGameStore,
  type Celebration,
  type CelebrationKind,
  type GameStore,
} from '../../store/game-store.ts';
import { selectShowFloorCompose } from '../../store/selectors/service-day.ts';
import {
  achievementBadgeUrl,
  getAchievement,
} from '../../domain/achievements/catalog.ts';
import { bindNotificationSurfaceLifecycle } from '../notifications/surface-lifecycle.ts';
import {
  noticeRunsOnScreen,
  type Notice,
} from '../../store/notification-timer.ts';
import {
  hasLocalNotificationBlockingSurface,
  NOTIFICATION_BLOCKING_SURFACE_CHANGE,
} from '../notifications/blocking-surface.ts';
import { renderFoodIconHtml } from './food-icon.ts';
import { mountMetaSheetEnhancer } from './MetaSheetEnhancer.ts';

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Banner dismiss stays pointer-reachable but out of sequential Tab order so
 * floor toolbar / primary chrome come first (status/toast pattern, not dialog).
 */
export const BANNER_DISMISS_TABINDEX = -1;

/** ARIA for the notice live region (tutorial / toast / pacing). */
export function noticeBannerAria(
  source: Notice['source'],
): { role: 'status'; 'aria-live': 'polite'; 'aria-label': string } {
  return {
    role: 'status',
    'aria-live': 'polite',
    'aria-label': source === 'tutorial' ? 'Tutorial' : 'Notice',
  };
}

/** ARIA for the celebration live region (recipe / mastery / achievement / prestige). */
export function celebrationBannerAria(
  kind: CelebrationKind,
): {
  role: 'status';
  'aria-live': 'polite';
  'aria-atomic': 'true';
  'aria-label': string;
} {
  const labels: Record<CelebrationKind, string> = {
    recipe: 'Recipe celebration',
    mastery: 'Mastery celebration',
    achievement: 'Achievement celebration',
    prestige: 'Prestige celebration',
  };
  return {
    role: 'status',
    'aria-live': 'polite',
    'aria-atomic': 'true',
    'aria-label': labels[kind],
  };
}

/** Stable identity so re-queued / next-FIFO celebrations re-announce. */
export function celebrationAnnounceKey(celebration: Celebration): string {
  return [
    celebration.kind,
    celebration.title,
    celebration.body,
    celebration.achievementId ?? '',
    celebration.level ?? '',
  ].join('\0');
}

export function celebrationAnnounceText(celebration: Celebration): string {
  return `${celebration.title}. ${celebration.body}`;
}

/**
 * Clear-then-set text so polite live regions re-fire for each new message
 * even when the same status node is reused.
 */
export function replaceLiveRegionText(
  target: { textContent: string | null },
  next: string,
): void {
  target.textContent = '';
  target.textContent = next;
}

/**
 * Escape dismisses the front banner when no blocking sheet owns focus.
 * Status regions do not take focus; dismiss remains tabindex=-1.
 */
export function resolveBannerEscapeAction(
  state: Pick<GameStore, 'noticeActive' | 'celebrationQueue'>,
  blocked: boolean,
): 'notice' | 'celebration' | null {
  if (blocked) return null;
  if (state.noticeActive) return 'notice';
  if (state.celebrationQueue[0]) return 'celebration';
  return null;
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
  frontContentVisible = true,
): boolean {
  return pageLifecycleActive && !uiBlocked && frontContentVisible;
}

export function noticeIsVisibleOnScreen(
  notice: Notice,
  screen: GameStore['screen'],
): boolean {
  return noticeRunsOnScreen(notice, screen);
}

export function mountCelebrationBanner(mount: HTMLElement): () => void {
  const host = document.createElement('div');
  host.className = 'celebration-banner-host';
  host.dataset.testid = 'celebration-banner-host';
  host.setAttribute('aria-live', 'polite');
  host.setAttribute('aria-atomic', 'true');
  mount.appendChild(host);

  let pageLifecycleActive = false;
  let lastCelebrationAnnounceKey: string | null = null;
  const computeUiBlocked = () =>
    selectNotificationUiBlocked(useGameStore.getState()) ||
    hasLocalNotificationBlockingSurface();
  let uiBlocked = computeUiBlocked();

  const isFrontContentVisible = () => {
    const state = useGameStore.getState();
    return state.noticeActive
      ? noticeIsVisibleOnScreen(state.noticeActive, state.screen)
      : true;
  };

  const syncBannerPresented = () => {
    // Exact presented signal for dwell: connected + not hidden. Screen id
    // alone must not resume the timer before the host is paint-ready.
    useGameStore
      .getState()
      .setNotificationBannerPresented(host.isConnected && !host.hidden);
  };

  const syncNotificationSurface = () => {
    useGameStore
      .getState()
      .setNotificationSurfaceActive(
        notificationSurfaceShouldRun(
          pageLifecycleActive,
          uiBlocked,
          isFrontContentVisible(),
        ),
      );
    syncBannerPresented();
  };

  const syncHostVisibility = () => {
    const state = useGameStore.getState();
    host.hidden =
      uiBlocked ||
      !isFrontContentVisible() ||
      (!state.noticeActive && !state.celebrationQueue[0]);
    syncBannerPresented();
  };

  const wireDismiss = (
    selector: string,
    dismiss: () => void,
  ): void => {
    host.querySelector(selector)?.addEventListener('click', dismiss, {
      once: true,
    });
  };

  const announceCelebrationIfNeeded = (celebration: Celebration): void => {
    const live = host.querySelector<HTMLElement>(
      '[data-testid="celebration-live-text"]',
    );
    if (!live) return;
    // Covered celebrations stay inert/hidden — announce once they become front.
    const aside = host.querySelector('.celebration-banner');
    if (aside?.hasAttribute('aria-hidden')) return;
    const key = celebrationAnnounceKey(celebration);
    if (key === lastCelebrationAnnounceKey) {
      // Remount after pause: keep polite text without clear-then-set retrigger.
      live.textContent = celebrationAnnounceText(celebration);
      live.removeAttribute('aria-hidden');
      live.setAttribute('aria-live', 'polite');
      live.setAttribute('role', 'status');
      return;
    }
    lastCelebrationAnnounceKey = key;
    live.removeAttribute('aria-hidden');
    live.setAttribute('aria-live', 'polite');
    live.setAttribute('role', 'status');
    replaceLiveRegionText(live, celebrationAnnounceText(celebration));
  };

  const announceNoticeIfNeeded = (notice: Notice): void => {
    const live = host.querySelector<HTMLElement>(
      '[data-testid="notice-live-text"]',
    );
    if (!live) return;
    // The visible aside already has role=status + aria-live. Keep the twin
    // empty/hidden so Playwright getByText and SR trees do not see two copies.
    void notice;
    live.textContent = '';
    live.setAttribute('aria-hidden', 'true');
    live.removeAttribute('aria-live');
    live.removeAttribute('role');
  };

  const render = () => {
    const state = useGameStore.getState();
    const notice = state.noticeActive;
    const celebration = state.celebrationQueue[0];
    const noticeVisible = notice
      ? noticeIsVisibleOnScreen(notice, state.screen)
      : false;
    // Park floor-scoped tips off the restaurant without dismissing them: keep
    // noticeActive + remaining dwell, but drop the DOM node so Settings is
    // uncovered and return remounts a fresh presentable banner.
    host.hidden =
      uiBlocked ||
      (notice ? !noticeVisible : false) ||
      (!notice && !celebration);
    syncBannerPresented();
    if ((!notice || !noticeVisible) && !celebration) {
      host.innerHTML = '';
      lastCelebrationAnnounceKey = null;
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
          // Only cover celebrations when a presentable notice is actually front.
          const coveredAttributes = noticeVisible ? ' aria-hidden="true" inert' : '';
          const aria = celebrationBannerAria(celebration.kind);
          return `
            <aside class="celebration-banner celebration-banner-${celebration.kind}" data-testid="celebration-banner" role="${aria.role}" aria-live="${aria['aria-live']}" aria-atomic="${aria['aria-atomic']}" aria-label="${aria['aria-label']}"${coveredAttributes}>
              ${achievementIcon}
              ${icons ? `<div class="celebration-banner-icons" aria-hidden="true">${icons}</div>` : ''}
              <div class="celebration-banner-copy" aria-hidden="true">
                <strong class="celebration-banner-title">${escapeHtml(celebration.title)}</strong>
                <span class="celebration-banner-body">${escapeHtml(celebration.body)}</span>
              </div>
              <button class="celebration-banner-dismiss" type="button" tabindex="${BANNER_DISMISS_TABINDEX}" aria-label="Dismiss celebration" data-testid="celebration-dismiss">×</button>
            </aside>
          `;
        })()
      : '';
    const noticeHtml =
      notice && noticeVisible
        ? (() => {
            const aria = noticeBannerAria(notice.source);
            return `
          <aside class="notice-banner notice-banner-${notice.source}" data-testid="notice-banner" role="${aria.role}" aria-live="${aria['aria-live']}" aria-label="${aria['aria-label']}">
            <div class="notice-banner-copy" aria-hidden="true">
              ${notice.title ? `<strong class="notice-banner-title">${escapeHtml(notice.title)}</strong>` : ''}
              <span class="notice-banner-body">${escapeHtml(notice.body)}</span>
            </div>
            <button class="notice-banner-dismiss" type="button" tabindex="${BANNER_DISMISS_TABINDEX}" aria-label="Dismiss notice">×</button>
          </aside>
        `;
          })()
        : '';

    // Live payloads sit outside the banner testids so banner.innerText stays a
    // stable copy+dismiss string across pause/resume remounts (no duplicate
    // announce text leaking into e2e checkpoints).
    host.innerHTML = `
      ${celebrationHtml}
      ${noticeHtml}
      <span class="banner-live-text" data-testid="celebration-live-text" aria-hidden="true"></span>
      <span class="banner-live-text" data-testid="notice-live-text" aria-hidden="true"></span>
    `;
    wireDismiss('.celebration-banner-dismiss', () =>
      useGameStore.getState().dismissCelebration(),
    );
    wireDismiss('.notice-banner-dismiss', () =>
      useGameStore.getState().dismissFrontNotice(),
    );

    if (celebration) announceCelebrationIfNeeded(celebration);
    else lastCelebrationAnnounceKey = null;
    if (notice && noticeVisible) announceNoticeIfNeeded(notice);
  };

  const syncLocalBlockingSurface = () => {
    const nextUiBlocked = computeUiBlocked();
    if (nextUiBlocked === uiBlocked) return;
    uiBlocked = nextUiBlocked;
    syncHostVisibility();
    syncNotificationSurface();
  };

  const onBannerEscape = (event: KeyboardEvent) => {
    if (event.key !== 'Escape' || event.defaultPrevented) return;
    const action = resolveBannerEscapeAction(
      useGameStore.getState(),
      uiBlocked || computeUiBlocked(),
    );
    if (!action) return;
    event.preventDefault();
    if (action === 'notice') useGameStore.getState().dismissFrontNotice();
    else useGameStore.getState().dismissCelebration();
  };

  const unsubscribe = useGameStore.subscribe((state, previous) => {
    const nextUiBlocked =
      selectNotificationUiBlocked(state) ||
      hasLocalNotificationBlockingSurface();
    if (nextUiBlocked !== uiBlocked) {
      uiBlocked = nextUiBlocked;
      syncHostVisibility();
      syncNotificationSurface();
    }
    if (
      state.noticeActive !== previous.noticeActive ||
      state.celebrationQueue !== previous.celebrationQueue ||
      state.screen !== previous.screen
    ) {
      render();
      syncNotificationSurface();
    }
    if (state.screen !== previous.screen) {
      // The screen router subscribes after this component, so CSS visibility
      // still reflects the previous screen during the synchronous store turn.
      // Reconcile once every subscriber has updated the root data attribute.
      queueMicrotask(() => {
        if (host.isConnected) syncLocalBlockingSurface();
      });
    }
  });
  window.addEventListener(
    NOTIFICATION_BLOCKING_SURFACE_CHANGE,
    syncLocalBlockingSurface,
  );
  window.addEventListener('keydown', onBannerEscape);
  const unbindSurfaceLifecycle = bindNotificationSurfaceLifecycle({
    isHostConnected: () => host.isConnected,
    setActive: (active) => {
      pageLifecycleActive = active;
      syncNotificationSurface();
    },
  });
  window.addEventListener('food-atlas-ready', render);
  render();
  const unmountMetaSheets = mountMetaSheetEnhancer();

  return () => {
    unmountMetaSheets();
    unsubscribe();
    unbindSurfaceLifecycle();
    pageLifecycleActive = false;
    syncNotificationSurface();
    window.removeEventListener('food-atlas-ready', render);
    window.removeEventListener('keydown', onBannerEscape);
    window.removeEventListener(
      NOTIFICATION_BLOCKING_SURFACE_CHANGE,
      syncLocalBlockingSurface,
    );
    host.remove();
    useGameStore.getState().setNotificationBannerPresented(false);
  };
}
