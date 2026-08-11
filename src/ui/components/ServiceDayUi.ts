import type { RestaurantApp } from '../../canvas/RestaurantApp.ts';
import { getDomainContext } from '../../app/content-loader.ts';
import {
  MAX_DISH_INGREDIENTS,
  MIN_DISH_INGREDIENTS,
} from '../../domain/state/game-state.ts';
import { AXIS_KEYS, type AxisKey } from '../../domain/types.ts';
import {
  AXIS_LABELS,
  emptyFlavorProfile,
} from '../../domain/flavor/axis-labels.ts';
import { useGameStore } from '../../store/game-store.ts';
import {
  selectCanAdvanceCustomer,
  selectCanCloseDay,
  selectComposeDraftIds,
  selectCurrentCustomer,
  selectFloorComposeTicket,
  selectIsAwaitingServe,
  selectActiveModifier,
  selectQueueProgress,
  selectShowFloorCompose,
  selectShowOpenForService,
  selectShowServiceDayOverlay,
} from '../../store/selectors/service-day.ts';
import { formatCustomerRequestText } from '../presentation/customer-request.ts';
import { formatFloorTicketLabel } from '../presentation/floor-ticket.ts';
import { renderGuestPortraitHtml } from '../presentation/guest-portrait.ts';
import {
  canToggleIngredient,
  computeDishPreview,
} from '../presentation/dish-preview.ts';
import {
  buildFlavorBarsViewModel,
  renderFlavorBarsHtml,
} from '../presentation/flavor-profile.ts';
import {
  buildOrderBubbleSpeech,
  isOrderBubbleOwnedByFloor,
  orderBubbleSeed,
  renderOrderBubbleHtml,
} from '../presentation/order-bubble.ts';
import { FLAVOR_INSPECTOR_LONG_PRESS_HINT } from './FlavorInspectorPanel.ts';
import {
  buildReviewDisplay,
  formatReviewModifierLine,
  renderStarGlyphs,
} from '../presentation/review-display.ts';
import { prestigeRatingDeltaMultiplier } from '../../domain/balance/prestige-pacing.ts';
import { prestigeMultiplier } from '../../domain/economy/tips.ts';
import {
  buildRatingDisplayModel,
  formatRecentReview,
} from '../presentation/rating-display.ts';
import {
  bandLabel,
  clearComposeAxisFilter,
  composePantryLowMatchHint,
  composePantrySummary,
  type ComposeAxisBands,
  emptyComposePantryFilters,
  filterComposePantry,
  setComposeSearchQuery,
  toggleComposeAxis,
} from '../presentation/compose-pantry.ts';
import {
  buildComposeTicketRail,
  renderComposeTicketRailHtml,
} from '../presentation/compose-ticket-rail.ts';
import { formatRequestBandStatus, requestBandShadePercents } from '../presentation/compose-request.ts';
import {
  buildComposeProgress,
  composeProgressMeterHtml,
} from '../presentation/compose-progress.ts';
import { buildFloorTicketPanelViewModel } from '../presentation/floor-ticket-panel.ts';
import { resolveIdealFlavorProfile } from '../presentation/ideal-flavor.ts';
import { requestRestaurantShopOpen } from '../events/restaurant-shop.ts';
import { renderFoodIconHtml } from './food-icon.ts';
import { mountFloorServiceHud } from './FloorServiceHud.ts';
import { mountCelebrationBanner } from './CelebrationBanner.ts';
import { worldToScreen } from '../../canvas/coordinates.ts';
import { computeChatBubblePlacement } from '../presentation/chat-bubble-placement.ts';
import { notifyNotificationBlockingSurfaceChanged } from '../notifications/blocking-surface.ts';
import { hudDetailDialogAriaAttrString } from '../presentation/hud-detail-dialog.ts';
import {
  clearTutorialSkip,
  isTutorialSkipped,
  nextTutorialStep,
  skipTutorial,
} from '../../domain/floor/tutorial.ts';

const SERVE_LOCK_MS = 300;
const LONG_PRESS_MS = 450;
const SERVICE_PANEL_ENTER_MS = 180;

type ServicePanelKind =
  | 'open-service'
  | 'modifier'
  | 'review'
  | 'day-summary'
  | 'floor-compose'
  | 'queue-compose';

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function mountServiceDayUi(
  overlayMount: HTMLElement,
  bubbleMount: HTMLElement,
  getRestaurantApp: () => RestaurantApp | null,
  chromeMount: HTMLElement,
  statusMount: HTMLElement,
  canvasMount: HTMLElement,
): () => void {
  statusMount.innerHTML = `
    <div class="game-hud" id="game-hud" data-testid="game-hud"></div>
  `;
  overlayMount.innerHTML = `
    <div class="service-overlay" id="service-overlay" data-testid="service-overlay" hidden></div>
    <div class="modal-backdrop" id="ceremony-modal" data-testid="ceremony-modal" hidden></div>
  `;

  const hud = statusMount.querySelector('#game-hud') as HTMLElement;
  const serviceOverlay = overlayMount.querySelector(
    '#service-overlay',
  ) as HTMLElement;
  const ceremonyModal = overlayMount.querySelector(
    '#ceremony-modal',
  ) as HTMLElement;
  const surface = statusMount.closest('.game-surface') as HTMLElement | null;

  const syncStatusHudHeight = () => {
    if (!surface) return;
    surface.style.setProperty(
      '--vk-status-hud-height',
      `${statusMount.offsetHeight}px`,
    );
  };

  const statusHudResizeObserver =
    typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(() => {
          syncStatusHudHeight();
        })
      : null;
  statusHudResizeObserver?.observe(statusMount);

  const cleanupCelebrationBanner = mountCelebrationBanner(overlayMount);
  // Tickets dock must live under overlay-mount so it stacks above the cooking panel.
  const cleanupFloorHud = mountFloorServiceHud(
    chromeMount,
    overlayMount,
    getRestaurantApp,
  );

  const tutorialSkipHost = document.createElement('div');
  tutorialSkipHost.className = 'tutorial-skip-host';
  tutorialSkipHost.dataset.testid = 'tutorial-skip-host';
  tutorialSkipHost.hidden = true;
  tutorialSkipHost.innerHTML = `<button type="button" class="tutorial-skip-btn" data-testid="skip-tutorial" aria-label="Skip tutorial">Skip tutorial</button>`;
  overlayMount.appendChild(tutorialSkipHost);
  const skipTutorialBtn = tutorialSkipHost.querySelector(
    '[data-testid="skip-tutorial"]',
  ) as HTMLButtonElement;

  const syncTutorialSkipAffordance = () => {
    const state = useGameStore.getState();
    const floor = state.activeDay?.floor;
    const step =
      floor && state.screen === 'restaurant'
        ? nextTutorialStep(floor, state.day === 1)
        : null;
    const show =
      state.screen === 'restaurant' &&
      state.day === 1 &&
      step !== null &&
      !isTutorialSkipped() &&
      state.modifierDismissed &&
      !state.serviceStartPending &&
      !state.ceremony &&
      !state.daySummary &&
      !state.pendingReview;
    tutorialSkipHost.hidden = !show;
  };

  skipTutorialBtn.addEventListener('click', () => {
    skipTutorial();
    const store = useGameStore.getState();
    if (store.noticeActive?.source === 'tutorial') {
      store.dismissFrontNotice();
    }
    syncTutorialSkipAffordance();
  });

  // Clear skip before Settings → Replay tutorial runs its bubble-phase handler.
  const onReplayTutorialPointer = (event: Event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (target.closest('[data-testid="replay-tutorial-btn"]')) {
      clearTutorialSkip();
    }
  };
  document.addEventListener('click', onReplayTutorialPointer, true);

  let serveLockedUntil = 0;
  let bubbleEl: HTMLElement | null = null;
  let orderBubbleGuestId: string | null = null;
  let orderBubbleTimer: ReturnType<typeof setTimeout> | null = null;
  let orderBubbleBlocksNotice = false;
  let composeWasVisible = false;
  let composeTicketId: string | null = null;
  let blockingFocusReturn: HTMLElement | null = null;
  let summaryFocusExit: 'open-day' | 'shop' | null = null;
  let reviewFocusExit: 'open-day' | null = null;
  let composeFlavorDetailsOpen = false;
  let composeFilters = emptyComposePantryFilters();
  let hudDetail: 'cash' | 'rating' | 'prestige' | 'day' | null = null;
  let servicePanelKind: ServicePanelKind | null = null;
  let servicePanelEnteredAt = Number.NEGATIVE_INFINITY;

  const revealServicePanel = (kind: ServicePanelKind) => {
    const now = performance.now();
    if (servicePanelKind !== kind) servicePanelEnteredAt = now;
    servicePanelKind = kind;
    serviceOverlay.hidden = false;
    // Floor compose mounts a dismiss scrim before the sheet; always mark the
    // `.service-panel` so enter animation / data-panel-entering land on the sheet.
    const panel = serviceOverlay.querySelector(':scope > .service-panel');
    const entryElapsed = now - servicePanelEnteredAt;
    if (
      entryElapsed < SERVICE_PANEL_ENTER_MS &&
      panel instanceof HTMLElement
    ) {
      panel.dataset.panelEntering = '';
      panel.style.setProperty(
        '--vk-service-panel-enter-delay',
        `${-Math.max(0, entryElapsed)}ms`,
      );
      // Clear on animation end (or timeout fallback when motion is disabled) so
      // mid-enter re-renders keep the marker without leaving it stuck.
      const clearEntering = () => {
        if (panel.dataset.panelEntering !== undefined) {
          delete panel.dataset.panelEntering;
          panel.style.removeProperty('--vk-service-panel-enter-delay');
        }
      };
      panel.addEventListener('animationend', clearEntering, { once: true });
      window.setTimeout(clearEntering, SERVICE_PANEL_ENTER_MS + 32);
    }
  };

  const hideServicePanel = () => {
    servicePanelKind = null;
    servicePanelEnteredAt = Number.NEGATIVE_INFINITY;
    serviceOverlay.hidden = true;
    serviceOverlay.innerHTML = '';
  };

  type BlockingScopeKind =
    | 'ceremony'
    | 'day-summary'
    | 'review'
    | 'floor-compose';

  type BlockingScope = {
    kind: BlockingScopeKind;
    key: string;
    root: HTMLElement;
    title: HTMLElement;
  };

  type FocusIdentity = {
    attributes: Array<{
      name:
        | 'data-testid'
        | 'data-compose-ingredient-id'
        | 'data-compose-axis'
        | 'aria-label'
        | 'id';
      value: string;
    }>;
  };

  const blockingFocusableSelector =
    'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

  let activeBlockingScope: BlockingScope | null = null;
  const isolationSnapshots = new Map<
    HTMLElement,
    {
      ownedInert: boolean;
      ownedAriaHidden: boolean;
      previousAriaHidden: string | null;
    }
  >();

  const focusIdentity = (scope: BlockingScope): FocusIdentity | null => {
    const active = document.activeElement;
    if (!(active instanceof HTMLElement) || !scope.root.contains(active))
      return null;
    const attributes = [
      'data-testid',
      'data-compose-ingredient-id',
      'data-compose-axis',
      'aria-label',
      'id',
    ] as const;
    const values = attributes.flatMap((name) => {
      const value = active.getAttribute(name);
      return value ? [{ name, value }] : [];
    });
    return values.length > 0 ? { attributes: values } : null;
  };

  const focusIdentityInScope = (
    scope: BlockingScope,
    identity: FocusIdentity | null,
  ) => {
    const match = identity
      ? Array.from(
          scope.root.querySelectorAll<HTMLElement>('*'),
        ).find((element) =>
          identity.attributes.every(
            ({ name, value }) => element.getAttribute(name) === value,
          ),
        )
      : null;
    const target =
      match && !match.matches(':disabled, [inert]') ? match : scope.title;
    target?.focus({ preventScroll: true });
  };

  const restoreIsolation = (element: HTMLElement) => {
    const snapshot = isolationSnapshots.get(element);
    if (!snapshot) return;
    if (snapshot.ownedInert && element.inert) element.inert = false;
    if (
      snapshot.ownedAriaHidden &&
      element.getAttribute('aria-hidden') === 'true'
    ) {
      if (snapshot.previousAriaHidden === null) {
        element.removeAttribute('aria-hidden');
      } else {
        element.setAttribute('aria-hidden', snapshot.previousAriaHidden);
      }
    }
    isolationSnapshots.delete(element);
  };

  const syncBackgroundIsolation = (scope: BlockingScope | null) => {
    const targets = new Set<HTMLElement>();
    if (scope) {
      if (surface) {
        for (const child of Array.from(surface.children)) {
          if (child instanceof HTMLElement && child !== overlayMount) {
            targets.add(child);
          }
        }
      } else {
        for (const element of [statusMount, chromeMount, canvasMount]) {
          targets.add(element);
        }
      }
      targets.add(bubbleMount);
      for (const child of Array.from(overlayMount.children)) {
        if (!(child instanceof HTMLElement)) continue;
        if (child.id === 'flavor-inspector-modal') continue;
        if (child.contains(scope.root)) continue;
        targets.add(child);
      }
    }

    for (const element of Array.from(isolationSnapshots.keys())) {
      if (!targets.has(element) || !element.isConnected) {
        restoreIsolation(element);
      }
    }
    for (const element of targets) {
      const existing = isolationSnapshots.get(element);
      if (existing) {
        if (!element.inert) {
          existing.ownedInert = true;
          element.inert = true;
        }
        if (element.getAttribute('aria-hidden') !== 'true') {
          existing.ownedAriaHidden = true;
          existing.previousAriaHidden = element.getAttribute('aria-hidden');
          element.setAttribute('aria-hidden', 'true');
        }
        continue;
      }
      const previousAriaHidden = element.getAttribute('aria-hidden');
      const ownedInert = !element.inert;
      const ownedAriaHidden = previousAriaHidden !== 'true';
      isolationSnapshots.set(element, {
        ownedInert,
        ownedAriaHidden,
        previousAriaHidden,
      });
      if (ownedInert) element.inert = true;
      if (ownedAriaHidden) element.setAttribute('aria-hidden', 'true');
    }
  };

  const resetComposeUi = () => {
    composeFlavorDetailsOpen = false;
    composeFilters = emptyComposePantryFilters();
  };

  const isSafeFocusReturn = (
    target: HTMLElement | null,
  ): target is HTMLElement => {
    if (
      !target ||
      target === document.body ||
      target === document.documentElement ||
      !target.isConnected ||
      overlayMount.contains(target) ||
      target.hidden ||
      target.closest('[hidden], [inert], [aria-hidden="true"]')
    ) {
      return false;
    }
    const style = getComputedStyle(target);
    return style.display !== 'none' && style.visibility !== 'hidden';
  };

  const focusAfterBlockingScope = () => {
    const target = isSafeFocusReturn(blockingFocusReturn)
      ? blockingFocusReturn
      : (document.querySelector(
          '[data-testid="restaurant-canvas"]',
        ) as HTMLElement | null);
    target?.focus({ preventScroll: true });
    blockingFocusReturn = null;
  };

  const renderHud = () => {
    const state = useGameStore.getState();
    const activeDay = state.activeDay;
    const displayDay = state.daySummary?.completedDay ?? state.day;
    const ratingModel = buildRatingDisplayModel(state.rating, state.prestige);
    const customersTotal = activeDay?.customers.length ?? 0;
    const customersServed = activeDay?.customersServed ?? 0;
    const customersLeft = Math.max(0, customersTotal - customersServed);
    const dayRatingDelta = activeDay?.dayRatingDelta ?? 0;
    const detailTitle =
      hudDetail === 'cash'
        ? 'Cash'
        : hudDetail === 'rating'
          ? 'Rating'
          : hudDetail === 'prestige'
            ? `Prestige P${state.prestige}`
            : hudDetail === 'day'
              ? `Day ${displayDay}`
              : '';
    const detailContent =
      hudDetail === 'cash'
        ? `<h2 id="hud-detail-title">Cash</h2>
           <p class="hud-detail-value">$${state.cash.toLocaleString('en-US')}</p>
           <p>Total cash gained since day 1: <strong>$${state.stats.totalEarnings.toLocaleString('en-US')}</strong></p>`
        : hudDetail === 'rating'
          ? `<h2 id="hud-detail-title">Rating</h2>
             <p class="hud-detail-value">${ratingModel.ratingText}</p>
             <p>${ratingModel.prestigeDistanceText}</p>
             <p>${ratingModel.softResetDistanceText}</p>
             <p>Current payout multiplier: <strong>${ratingModel.ratingMultiplierText}</strong></p>
             <h3>Recent reviews</h3>
             <ul class="hud-detail-list">${
               state.recentReviews.length > 0
                 ? state.recentReviews
                     .slice(0, 4)
                     .map(
                       (review) =>
                         `<li>${escapeHtml(formatRecentReview(review))}</li>`,
                     )
                     .join('')
                 : '<li>No reviews yet.</li>'
             }</ul>`
          : hudDetail === 'prestige'
            ? `<h2 id="hud-detail-title">Prestige P${state.prestige}</h2>
               <p>Current permanent payout multiplier: <strong>${prestigeMultiplier(state.prestige).toFixed(2)}×</strong></p>
               <p>At P${state.prestige + 1}: <strong>${prestigeMultiplier(state.prestige + 1).toFixed(2)}×</strong></p>
               <p>Rating points until next level: <strong>${ratingModel.starsToPrestige.toFixed(1)}★</strong></p>`
            : hudDetail === 'day'
              ? state.daySummary
                ? `<h2 id="hud-detail-title">Day ${displayDay}</h2>
                   <p data-testid="hud-day-earnings">${escapeHtml(state.daySummary.earningsLine)}</p>
                   <p data-testid="hud-day-rating-change">${escapeHtml(state.daySummary.ratingDeltaText)}</p>
                   <p data-testid="hud-day-customers-served">${escapeHtml(state.daySummary.customersServedText)}</p>
                   <p>${escapeHtml(state.daySummary.averageMatchText)}</p>`
                : `<h2 id="hud-detail-title">Day ${displayDay}</h2>
                   <p>Rating change today: <strong>${dayRatingDelta >= 0 ? '+' : ''}${dayRatingDelta.toFixed(2)}★</strong></p>
                   <p>Cash gained today: <strong>+$${(activeDay?.dayEarnings ?? 0).toLocaleString('en-US')}</strong></p>
                   <p>Customers served: <strong>${customersServed}</strong></p>
                   <p>Customers left: <strong>${customersLeft}</strong></p>`
              : '';
    const detailMenuId = 'hud-detail-menu';
    const detailDialogAria = hudDetailDialogAriaAttrString('hud-detail-title');
    hud.innerHTML = `
      <button type="button" class="hud-stat hud-stat-button" data-hud-detail="cash" aria-expanded="${hudDetail === 'cash'}" aria-haspopup="dialog" aria-controls="${detailMenuId}" aria-label="Cash details">
        <span class="hud-stat-label"><i aria-hidden="true">$</i> Cash</span>
        <strong>$${state.cash.toLocaleString('en-US')}</strong>
      </button>
      <button type="button" class="hud-stat hud-stat-button" data-hud-detail="rating" aria-expanded="${hudDetail === 'rating'}" aria-haspopup="dialog" aria-controls="${detailMenuId}" aria-label="Restaurant rating details">
        <span class="hud-stat-label"><i aria-hidden="true">★</i> Rating</span>
        <strong>${state.rating.toFixed(1)}★</strong>
      </button>
      <button type="button" class="hud-stat hud-stat-button" data-hud-detail="prestige" aria-expanded="${hudDetail === 'prestige'}" aria-haspopup="dialog" aria-controls="${detailMenuId}" aria-label="Prestige details">
        <span class="hud-stat-label"><i aria-hidden="true">◆</i> Prestige</span>
        <strong>P${state.prestige}</strong>
      </button>
      <button type="button" class="hud-stat hud-stat-button" data-hud-detail="day" aria-expanded="${hudDetail === 'day'}" aria-haspopup="dialog" aria-controls="${detailMenuId}" aria-label="Day details">
        <span class="hud-stat-label"><i aria-hidden="true">☀</i> Day</span>
        <strong>${displayDay}</strong>
      </button>
      <button type="button" class="hud-settings-button" data-testid="hud-settings" aria-label="Open settings">⚙</button>
      ${
        hudDetail
          ? `<aside id="${detailMenuId}" class="hud-detail-menu" data-testid="hud-detail-menu" ${detailDialogAria} aria-label="${escapeHtml(detailTitle)} details">
               <button type="button" class="hud-detail-close" aria-label="Close ${escapeHtml(detailTitle)} details">×</button>
               ${detailContent}
             </aside>`
          : ''
      }
    `;
    hud
      .querySelectorAll<HTMLButtonElement>('[data-hud-detail]')
      .forEach((button) => {
        button.addEventListener('click', () => {
          const detail = button.dataset.hudDetail as typeof hudDetail;
          hudDetail = hudDetail === detail ? null : detail;
          renderHud();
        });
      });
    hud
      .querySelector('[data-testid="hud-settings"]')
      ?.addEventListener('click', () => {
        hudDetail = null;
        useGameStore.getState().navigateTo('settings');
      });
    hud.querySelector('.hud-detail-close')?.addEventListener('click', () => {
      hudDetail = null;
      renderHud();
    });
    syncStatusHudHeight();
  };

  const syncOrderBubbleNoticeBlock = () => {
    const next = Boolean(
      bubbleEl?.classList.contains('order-bubble') && !bubbleEl.hidden,
    );
    if (next === orderBubbleBlocksNotice) return;
    orderBubbleBlocksNotice = next;
    notifyNotificationBlockingSurfaceChanged();
  };

  const clearOrderBubble = () => {
    orderBubbleGuestId = null;
    if (orderBubbleTimer) clearTimeout(orderBubbleTimer);
    orderBubbleTimer = null;
    if (bubbleEl) {
      bubbleEl.hidden = true;
      bubbleEl.classList.remove('order-bubble', 'order-bubble-pulse');
    }
    syncOrderBubbleNoticeBlock();
  };

  const positionChatBubble = () => {
    if (!serviceOverlay.hidden || !ceremonyModal.hidden) {
      clearOrderBubble();
      return;
    }
    if (!bubbleEl) return;
    const app = getRestaurantApp();
    if (!app) return;
    const anchor = orderBubbleGuestId
      ? app.getGuestScreenAnchor(orderBubbleGuestId)
      : app.getCustomerScreenAnchor();
    if (!anchor) {
      bubbleEl.hidden = true;
      syncOrderBubbleNoticeBlock();
      return;
    }
    bubbleEl.hidden = false;
    const mountRect = bubbleMount.getBoundingClientRect();
    const placement = computeChatBubblePlacement(
      anchor,
      mountRect,
      { width: bubbleEl.offsetWidth, height: bubbleEl.offsetHeight },
    );
    bubbleEl.style.left = `${placement.left}px`;
    bubbleEl.style.top = `${placement.top}px`;
    bubbleEl.style.setProperty(
      '--vk-bubble-tail-offset-x',
      `${placement.tailOffsetX}px`,
    );
    syncOrderBubbleNoticeBlock();
  };

  const renderChatBubble = () => {
    const state = useGameStore.getState();
    const floor = state.activeDay?.floor;
    if (
      orderBubbleGuestId &&
      !isOrderBubbleOwnedByFloor(floor, orderBubbleGuestId)
    ) {
      clearOrderBubble();
    }
    // A service sheet owns the current conversation. Keep older order speech
    // from competing visually with modifiers, cooking, reviews, or summaries.
    if (!serviceOverlay.hidden || !ceremonyModal.hidden) {
      clearOrderBubble();
      return;
    }
    const customer = selectCurrentCustomer(state);
    const orderGuest = orderBubbleGuestId
      ? floor?.pool.find(
          (guest) => guest.customer.id === orderBubbleGuestId,
        )
      : undefined;
    const showOrderBubble = Boolean(
      orderGuest && isOrderBubbleOwnedByFloor(floor, orderBubbleGuestId),
    );
    const showBubble =
      showOrderBubble ||
      (!floor &&
        state.activeDay &&
        state.modifierDismissed &&
        customer &&
        !state.pendingReview &&
        selectIsAwaitingServe(state));

    if (!showBubble || (!customer && !orderGuest)) {
      if (bubbleEl) bubbleEl.hidden = true;
      syncOrderBubbleNoticeBlock();
      return;
    }

    if (!bubbleEl) {
      bubbleEl = document.createElement('div');
      bubbleEl.className = 'chat-bubble';
      bubbleEl.dataset.testid = 'chat-bubble';
      bubbleEl.setAttribute('role', 'status');
      bubbleMount.appendChild(bubbleEl);
    }

    bubbleEl.classList.toggle('order-bubble', showOrderBubble);
    bubbleEl.classList.toggle('order-bubble-pulse', showOrderBubble);
    const preference =
      orderGuest?.customer.preference ?? customer!.preference;
    const ticketId =
      showOrderBubble && orderBubbleGuestId
        ? floor?.tickets.find(
            (ticket) =>
              ticket.customerId === orderBubbleGuestId &&
              ticket.status === 'open',
          )?.id
        : null;
    const seedGuestId =
      orderGuest?.customer.id ?? customer!.id;
    const speech = buildOrderBubbleSpeech({
      preference,
      seed: orderBubbleSeed({
        guestId: seedGuestId,
        ticketId,
      }),
      archetypeId: orderGuest?.customer.archetypeId ?? customer?.archetypeId,
    });
    bubbleEl.innerHTML = renderOrderBubbleHtml(speech);
    bubbleEl.hidden = false;
    positionChatBubble();
  };

  const renderCeremony = () => {
    const state = useGameStore.getState();
    if (!state.ceremony) {
      ceremonyModal.hidden = true;
      ceremonyModal.innerHTML = '';
      return;
    }

    ceremonyModal.hidden = false;
    if (state.ceremony === 'prestige') {
      ceremonyModal.innerHTML = `
        <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="ceremony-title">
          <h2 id="ceremony-title" tabindex="-1">Prestige Achieved!</h2>
          <p>Your restaurant reached 6★. Prestige level is now <strong>P${state.ceremonyPrestige ?? state.prestige}</strong>. Rating resets to 3.0★ and all future payouts scale up permanently.</p>
          ${state.presentationSaveError ? `<p class="save-feedback save-feedback-error" role="alert">${escapeHtml(state.presentationSaveError)} Please try again.</p>` : ''}
          <button type="button" class="service-btn primary" id="dismiss-ceremony" ${state.presentationSavePending ? 'disabled aria-busy="true"' : ''}>${state.presentationSavePending ? 'Saving…' : 'Continue'}</button>
        </div>
      `;
    } else {
      ceremonyModal.innerHTML = `
        <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="ceremony-title">
          <h2 id="ceremony-title" tabindex="-1">Soft Reset</h2>
          <p>Rating hit 0★. You keep prestige <strong>P${state.prestige}</strong> and your recipe book, but cash, ingredients (except starters), equipment, and layout were reset.</p>
          ${state.presentationSaveError ? `<p class="save-feedback save-feedback-error" role="alert">${escapeHtml(state.presentationSaveError)} Please try again.</p>` : ''}
          <button type="button" class="service-btn primary" id="dismiss-ceremony" ${state.presentationSavePending ? 'disabled aria-busy="true"' : ''}>${state.presentationSavePending ? 'Saving…' : 'Rebuild'}</button>
        </div>
      `;
    }

    ceremonyModal.querySelector('#dismiss-ceremony')?.addEventListener(
      'click',
      async () => {
        try {
          await useGameStore.getState().dismissCeremony();
        } catch {
          // The store keeps the ceremony visible and renders retry feedback.
        }
      },
      { once: true },
    );
  };

  const renderServiceOverlay = () => {
    const state = useGameStore.getState();
    const composeVisible = selectShowFloorCompose(state);
    const composeOpenedNow = composeVisible && !composeWasVisible;
    const nextComposeTicketId = composeVisible
      ? (selectFloorComposeTicket(state)?.id ?? null)
      : null;

    if (composeOpenedNow) {
      resetComposeUi();
    } else if (!composeVisible && composeWasVisible) {
      resetComposeUi();
    } else if (
      composeVisible &&
      composeTicketId !== null &&
      nextComposeTicketId !== composeTicketId
    ) {
      resetComposeUi();
    }
    composeWasVisible = composeVisible;
    composeTicketId = nextComposeTicketId;

    if (state.ceremony) {
      hideServicePanel();
      return;
    }

    if (!selectShowServiceDayOverlay(state)) {
      hideServicePanel();
      return;
    }

    if (state.daySummary) {
      const masteryLine =
        'masteryLine' in state.daySummary ? state.daySummary.masteryLine : null;
      serviceOverlay.innerHTML = `
        <div class="service-panel sheet-tier-near-full summary-service-panel" data-testid="day-summary-sheet" role="dialog" aria-modal="true" aria-labelledby="day-summary-title">
          <div class="service-card sheet-card-layout">
            <header class="sheet-header">
              <h2 id="day-summary-title" class="service-title" data-testid="day-summary-title" tabindex="-1">Day ${state.daySummary.completedDay} Summary</h2>
            </header>
            <div class="sheet-body-scroll">
            <p class="review-detail" data-testid="summary-earnings">${escapeHtml(state.daySummary.earningsLine)}</p>
            ${state.daySummary.bonusLine ? `<p class="review-detail review-positive">${escapeHtml(state.daySummary.bonusLine)}</p>` : ''}
            ${'volumeBonusLine' in state.daySummary && state.daySummary.volumeBonusLine ? `<p class="review-detail review-positive" data-testid="summary-volume-bonus">${escapeHtml(state.daySummary.volumeBonusLine)}</p>` : ''}
            <p class="review-detail">${escapeHtml(state.daySummary.averageMatchText)}</p>
            <p class="review-detail" data-testid="summary-rating-change">${escapeHtml(state.daySummary.ratingDeltaText)}</p>
            <p class="review-detail">${escapeHtml(state.daySummary.unlockProgressText)}</p>
            <p class="review-detail" data-testid="summary-customers-served">${escapeHtml(state.daySummary.customersServedText)}</p>
            ${masteryLine ? `<p class="review-detail review-positive" data-testid="summary-mastery">${escapeHtml(masteryLine)}</p>` : ''}
            ${state.presentationSaveError ? `<p class="save-feedback save-feedback-error" role="alert">${escapeHtml(state.presentationSaveError)} Please try again.</p>` : ''}
            </div>
            <footer class="sheet-footer service-actions day-summary-actions">
              <button type="button" class="service-btn" id="summary-back-floor" data-testid="summary-back-floor" ${state.presentationSavePending ? 'disabled aria-busy="true"' : ''}>${state.presentationSavePending ? 'Saving…' : `Continue to Day ${state.daySummary.nextDay}`}</button>
              <button type="button" class="service-btn primary" id="summary-edit-restaurant" data-testid="summary-edit-restaurant" ${state.presentationSavePending ? 'disabled aria-busy="true"' : ''}>${state.presentationSavePending ? 'Saving…' : 'Shop &amp; Edit'}</button>
            </footer>
          </div>
        </div>
      `;
      revealServicePanel('day-summary');
      serviceOverlay.querySelector('#summary-back-floor')?.addEventListener(
        'click',
        async () => {
          summaryFocusExit = 'open-day';
          const store = useGameStore.getState();
          try {
            await store.dismissDaySummary();
            store.navigateTo('restaurant');
          } catch {
            summaryFocusExit = null;
          }
        },
        { once: true },
      );
      serviceOverlay
        .querySelector('#summary-edit-restaurant')
        ?.addEventListener(
          'click',
          async () => {
            summaryFocusExit = 'shop';
            const store = useGameStore.getState();
            try {
              await store.dismissDaySummary();
              store.navigateTo('restaurant');
              if (!store.editLayoutMode) store.toggleEditLayout();
              requestRestaurantShopOpen();
            } catch {
              summaryFocusExit = null;
            }
          },
          { once: true },
        );
      return;
    }

    if (selectShowOpenForService(state)) {
      serviceOverlay.innerHTML = `
        <div class="service-panel open-service-panel" data-testid="open-service-sheet">
          <div class="service-card">
            <h2 class="service-title">Open for service?</h2>
            <p class="service-subtitle">Set tables, seat guests from the door, cook at the station, and deliver.</p>
            <div class="service-actions">
              <button type="button" class="service-btn primary" id="open-day-btn" data-testid="open-day-btn">Open Restaurant</button>
              <button type="button" class="service-btn" id="edit-restaurant-btn" data-testid="edit-restaurant-btn">Shop &amp; Edit</button>
            </div>
          </div>
        </div>
      `;
      revealServicePanel('open-service');
      serviceOverlay.querySelector('#open-day-btn')?.addEventListener(
        'click',
        () => {
          useGameStore.getState().dispatch({ type: 'OPEN_DAY' });
        },
        { once: true },
      );
      serviceOverlay.querySelector('#edit-restaurant-btn')?.addEventListener(
        'click',
        () => {
          const store = useGameStore.getState();
          if (!store.editLayoutMode) store.toggleEditLayout();
          requestRestaurantShopOpen();
        },
        { once: true },
      );
      return;
    }

    if (!state.activeDay && !state.pendingReview) {
      hideServicePanel();
      return;
    }

    if (state.activeDay && !state.modifierDismissed) {
      const modifier = selectActiveModifier(state);
      serviceOverlay.innerHTML = `
        <div class="service-panel sheet-tier-mid" data-testid="modifier-sheet">
          <div class="service-card">
            <h2 class="service-title">Today's Modifier</h2>
            <p class="service-subtitle"><strong>${modifier?.name ?? 'Normal Day'}</strong></p>
            <p class="service-subtitle">${modifier?.description ?? 'No special effects today.'}</p>
            <p class="queue-badge">${state.activeDay.customers.length} customers expected</p>
            ${
              state.serviceStartError
                ? `<p class="save-feedback save-feedback-error" data-testid="service-start-error" role="alert">Could not save service progress. ${escapeHtml(state.serviceStartError)} Please try again.</p>`
                : ''
            }
            <div class="service-actions">
              <button type="button" class="service-btn primary" id="start-service-btn" data-testid="start-service-btn" ${state.serviceStartPending ? 'disabled aria-busy="true"' : ''}>${state.serviceStartPending ? 'Saving…' : 'Start Service'}</button>
            </div>
          </div>
        </div>
      `;
      revealServicePanel('modifier');
      const startServiceButton = serviceOverlay.querySelector<HTMLButtonElement>(
        '#start-service-btn',
      );
      startServiceButton?.addEventListener('click', async () => {
        if (startServiceButton.disabled) return;
        startServiceButton.disabled = true;
        try {
          await useGameStore.getState().dismissModifier();
        } catch {
          // The store restores a retryable modifier sheet with an alert.
        }
      });
      return;
    }

    if (state.pendingReview) {
      const review = buildReviewDisplay(state.pendingReview);
      const reviewCustomer = state.activeDay?.customers.find(
        (customer) => customer.id === state.pendingReview?.customerId,
      );
      const reviewGuest = state.activeDay?.floor?.pool.find(
        (guest) => guest.customer.id === state.pendingReview?.customerId,
      );
      const reviewArchetype = reviewCustomer
        ? getDomainContext().archetypes.find(
            (archetype) => archetype.id === reviewCustomer.archetypeId,
          )
        : undefined;
      const reviewIdentity = reviewCustomer
        ? `
              <header class="sheet-header review-identity" data-testid="review-guest-identity">
                ${renderGuestPortraitHtml(reviewGuest?.id ?? reviewCustomer.id)}
                <span class="review-identity-copy">
                  <span id="review-context-title" class="review-identity-kicker" role="heading" aria-level="2" tabindex="-1">Review from</span>
                  <h2 id="review-guest-title" class="service-title" data-testid="review-guest-name">${escapeHtml(reviewArchetype?.name ?? 'Customer')}</h2>
                </span>
              </header>`
        : `
              <header class="sheet-header">
                <h2 id="review-title" class="service-title" tabindex="-1">Customer Review</h2>
              </header>`;
      const ratingModifierLine = formatReviewModifierLine(
        selectActiveModifier(state),
        state.pendingReview.matchStars,
        prestigeRatingDeltaMultiplier(state.prestige),
      );
      const progress = selectQueueProgress(state);
      const canClose = selectCanCloseDay(state);
      const canAdvance =
        selectCanAdvanceCustomer(state) && !state.activeDay?.floor;
      const floorActive = Boolean(state.activeDay?.floor);
      const postResetReview =
        !state.activeDay && state.pendingReview.afterSoftReset === true;
      serviceOverlay.innerHTML = `
        <div class="service-panel sheet-tier-mid review-service-panel" data-testid="review-sheet" role="dialog" aria-modal="true" aria-labelledby="${reviewCustomer ? 'review-context-title review-guest-title' : 'review-title'}">
          <div class="service-card sheet-card-layout">
            ${reviewIdentity}
            <div class="sheet-body-scroll">
            ${progress && !floorActive ? `<p class="queue-badge">Customer ${progress.current} of ${progress.total}</p>` : ''}
            <p class="review-stars" data-testid="review-stars" aria-label="${review.starsText}">${renderStarGlyphs(review.starsFilled)}</p>
            <p class="review-detail" data-testid="review-score">${review.starsText}</p>
            <p class="review-detail">Tip: ${review.tipText}</p>
            <p class="review-detail ${review.ratingDeltaPositive ? 'review-positive' : 'review-negative'}">Rating ${review.ratingDeltaText}</p>
            ${ratingModifierLine ? `<p class="review-detail review-negative">${escapeHtml(ratingModifierLine)}</p>` : ''}
            ${review.recipeLine ? `<p class="review-detail review-positive">${escapeHtml(review.recipeLine)}</p>` : ''}
            ${review.masteryLine ? `<p class="review-detail review-positive" data-testid="review-mastery">${escapeHtml(review.masteryLine)}</p>` : ''}
            ${state.presentationSaveError ? `<p class="save-feedback save-feedback-error" role="alert">${escapeHtml(state.presentationSaveError)} Please try again.</p>` : ''}
            </div>
            <footer class="sheet-footer service-actions">
              ${
                canClose
                  ? '<button type="button" class="service-btn primary" id="close-day-btn" data-testid="close-day-btn">Close Day</button>'
                  : canAdvance
                    ? '<button type="button" class="service-btn primary" id="next-customer-btn" data-testid="next-customer-btn">Next Customer</button>'
                    : floorActive
                      ? `<button type="button" class="service-btn primary" id="continue-service-btn" data-testid="continue-service-btn" ${state.presentationSavePending ? 'disabled aria-busy="true"' : ''}>${state.presentationSavePending ? 'Saving…' : 'Continue service'}</button>`
                      : postResetReview
                        ? `<button type="button" class="service-btn primary" id="continue-service-btn" data-testid="continue-service-btn" ${state.presentationSavePending ? 'disabled aria-busy="true"' : ''}>${state.presentationSavePending ? 'Saving…' : 'Continue'}</button>`
                      : ''
              }
            </footer>
          </div>
        </div>
      `;
      revealServicePanel('review');
      serviceOverlay.querySelector('#next-customer-btn')?.addEventListener(
        'click',
        () => {
          useGameStore.getState().dispatch({ type: 'NEXT_CUSTOMER' });
        },
        { once: true },
      );
      serviceOverlay.querySelector('#close-day-btn')?.addEventListener(
        'click',
        () => {
          useGameStore.getState().dispatch({ type: 'CLOSE_DAY' });
        },
        { once: true },
      );
      serviceOverlay.querySelector('#continue-service-btn')?.addEventListener(
        'click',
        async () => {
          reviewFocusExit = postResetReview ? 'open-day' : null;
          try {
            await useGameStore.getState().dismissPendingReview();
          } catch {
            // The store keeps the review visible and renders retry feedback.
            reviewFocusExit = null;
          }
        },
        { once: true },
      );
      return;
    }

    if (selectShowFloorCompose(state)) {
      const draftIds = selectComposeDraftIds(state);
      const ctx = getDomainContext();
      const preview = computeDishPreview(draftIds, ctx.ingredientsById);
      const ticket = selectFloorComposeTicket(state);
      const ticketGuest = ticket
        ? state.activeDay?.floor?.pool.find(
            (guest) => guest.customer.id === ticket.customerId,
          )
        : undefined;
      const canPlate =
        preview.isValidCount && ticket && Date.now() >= serveLockedUntil;
      const unlocked = state.unlockedIngredientIds.flatMap((id) => {
        const ingredient = ctx.ingredientsById.get(id);
        return ingredient ? [ingredient] : [];
      });
      const requestedBands: ComposeAxisBands = {};
      if (ticketGuest) {
        for (const axis of AXIS_KEYS) {
          const primaryBand = ticketGuest.customer.preference.primary[axis];
          if (primaryBand) requestedBands[axis] = primaryBand;
          if (ticketGuest.customer.preference.avoid[axis]) {
            requestedBands[axis] = 'low';
          }
        }
      }
      const requestedAxes = AXIS_KEYS.filter(
        (axis) => requestedBands[axis] !== undefined,
      );
      const composeProgress = buildComposeProgress({
        ingredientCount: preview.ingredientCount,
        requestedBands,
        profile: preview.profile,
        minIngredients: MIN_DISH_INGREDIENTS,
        maxIngredients: MAX_DISH_INGREDIENTS,
      });
      const progressHtml = composeProgressMeterHtml(composeProgress, escapeHtml);

      const renderIngredientButtons = (): string => {
        const currentDraft = selectComposeDraftIds(useGameStore.getState());
        const matches = filterComposePantry(
          unlocked,
          composeFilters,
          requestedBands,
        );
        if (matches.length === 0) {
          return '<p class="compose-empty" data-testid="compose-empty">No ingredients match this flavor.</p>';
        }
        return matches
          .map((item) => {
            const selected = currentDraft.includes(item.id);
            const toggle = canToggleIngredient(item.id, currentDraft);
            const disabled = !selected && !toggle.allowed;
            const name = escapeHtml(item.name);
            return `<div class="compose-ingredient-card">
              <button type="button" class="ingredient-chip${selected ? ' selected' : ''}" data-compose-ingredient-id="${item.id}" data-testid="ingredient-chip" ${disabled ? 'disabled' : ''} aria-label="${name}" title="${name}" aria-pressed="${selected}">${renderFoodIconHtml(item.id, 32)}<span>${name}</span></button>
              <button type="button" class="compose-ingredient-inspect" id="ingredient-inspect-${item.id}" data-compose-inspect-id="${item.id}" data-testid="ingredient-inspect" aria-label="Inspect ${name}. Long-press the ingredient chip to inspect." title="Inspect · or long-press the chip"><span aria-hidden="true">i</span></button>
            </div>`;
          })
          .join('');
      };

      const selectedStrip =
        draftIds.length === 0
          ? '<span class="compose-selected-empty">Nothing selected yet</span>'
          : draftIds
              .map((id) => {
                const item = ctx.ingredientsById.get(id);
                const name = escapeHtml(item?.name ?? id);
                return `<button type="button" class="compose-selected-chip" data-compose-ingredient-id="${id}" aria-label="Remove ${name}" title="${name}">${renderFoodIconHtml(id, 20)}<span>${name}</span><span aria-hidden="true">×</span></button>`;
              })
              .join('');

      const orderedFilterAxes = [
        ...requestedAxes,
        ...AXIS_KEYS.filter((axis) => !requestedAxes.includes(axis)),
      ];
      const allChipSelected = composeFilters.selectedAxis === null;
      // Not a `.filter-axis-chip`: axis chips hide on compact mobile; All stays
      // visible as a pantry-scope control without counting as a flavor filter.
      const allChip = `<button type="button" class="compose-all-chip${allChipSelected ? ' selected' : ''}" data-compose-all data-testid="compose-all-ingredients" aria-pressed="${allChipSelected}" title="Show all unlocked ingredients">All ingredients</button>`;
      const axisChips =
        allChip +
        orderedFilterAxes
          .map((axis) => {
            const selected = composeFilters.selectedAxis === axis;
            const band = requestedBands[axis];
            const label = band
              ? `${bandLabel(band)} ${AXIS_LABELS[axis]}`
              : AXIS_LABELS[axis];
            return `<button type="button" class="filter-axis-chip${selected ? ' selected' : ''}${band ? ' requested' : ''}" data-compose-axis="${axis}" aria-pressed="${selected}" title="${band ? 'Filters ingredients that contribute to this request' : `Filters ingredients with ${AXIS_LABELS[axis]}`}">${escapeHtml(label)}</button>`;
          })
          .join('');
      const matchingCount = filterComposePantry(
        unlocked,
        composeFilters,
        requestedBands,
      ).length;
      const lowMatchHint = composePantryLowMatchHint(
        matchingCount,
        composeFilters,
      );
      const searchQueryEscaped = escapeHtml(composeFilters.searchQuery);
      const searchClearHidden = composeFilters.searchQuery.trim()
        ? ''
        : 'hidden';

      const flavorPreview = buildFlavorBarsViewModel(
        preview.profile ?? emptyFlavorProfile(),
      )
        .axes.map(
          (axis) => `<div class="compose-flavor-mini">
                <span>${escapeHtml(axis.label)}</span>
                <span class="compose-flavor-mini-track" aria-hidden="true">
                  <span class="compose-flavor-mini-fill" style="width:${Math.min(100, Math.max(0, (axis.value / axis.max) * 100)).toFixed(1)}%"></span>
                </span>
              </div>`,
        )
        .join('');

      let ticketBadge = '';
      let orderPanel = '';
      let ticketRailHtml = '';
      if (ticket) {
        const archetypeName = ticketGuest
          ? ctx.archetypes.find(
              (a) => a.id === ticketGuest.customer.archetypeId,
            )?.name
          : undefined;
        const label = formatFloorTicketLabel({
          ticket,
          customer: ticketGuest?.customer,
          archetypeName,
          selected: true,
        });
        ticketBadge = `<div class="compose-ticket-identity">${ticketGuest ? renderGuestPortraitHtml(ticketGuest.id) : ''}<p class="queue-badge">${escapeHtml(label.guestLabel)}</p></div>`;

        const floor = state.activeDay?.floor;
        if (floor) {
          const guestLabelByCustomerId: Record<string, string> = {};
          const guestIdByCustomerId: Record<string, string> = {};
          for (const guest of floor.pool) {
            guestIdByCustomerId[guest.customer.id] = guest.id;
            const arch = ctx.archetypes.find(
              (a) => a.id === guest.customer.archetypeId,
            )?.name;
            guestLabelByCustomerId[guest.customer.id] = arch?.trim() || 'Guest';
          }
          const panel = buildFloorTicketPanelViewModel({
            tickets: floor.tickets,
            selectedTicketId: floor.selectedTicketId,
            carriedTicketId: floor.carriedTicketId,
            guestLabelByCustomerId,
          });
          ticketRailHtml = renderComposeTicketRailHtml(
            buildComposeTicketRail(panel.rows, {
              activeTicketId: ticket.id,
              guestIdByCustomerId,
            }),
            {
              escapeHtml,
              // Rail portraits share the compose sheet with the header portrait;
              // a rail-scoped testid keeps e2e locators strict-mode unique.
              renderPortrait: (guestId) =>
                renderGuestPortraitHtml(guestId, {
                  testId: 'rail-guest-portrait',
                }),
            },
          );
        }

        if (ticketGuest) {
          const preference = ticketGuest.customer.preference;
          const ideal = resolveIdealFlavorProfile(preference);
          const requestText = formatCustomerRequestText(preference);
          const requestRows = requestedAxes
            .map((axis) => {
              const band = requestedBands[axis]!;
              const targetValue = ideal[axis];
              const currentValue = preview.profile?.[axis] ?? 0;
              const status = formatRequestBandStatus(currentValue, band);
              const shade = requestBandShadePercents(band);
              // Compose stays qualitative: signed deltas stay in format helpers /
              // Ideal tab numerics, not in the cook-sheet status chip.
              return `<div class="compose-request-axis" data-testid="compose-request-axis">
                <div class="compose-request-axis-head">
                  <strong>${escapeHtml(`${bandLabel(band)} ${AXIS_LABELS[axis]}`)}</strong>
                  <span class="compose-request-status ${status.position}">${escapeHtml(status.label)}</span>
                </div>
                <div class="compose-request-bars" aria-hidden="true">
                  <span class="compose-request-bar target">
                    <span class="compose-request-band" style="left:${shade.leftPct.toFixed(1)}%;width:${shade.widthPct.toFixed(1)}%"></span>
                    <span style="width:${Math.min(100, Math.max(0, targetValue * 10)).toFixed(1)}%"></span>
                  </span>
                  <span class="compose-request-bar current">
                    <span style="width:${Math.min(100, Math.max(0, currentValue * 10)).toFixed(1)}%"></span>
                  </span>
                </div>
              </div>`;
            })
            .join('');
          orderPanel = `<aside class="compose-order-panel" data-testid="compose-order-panel" aria-label="Pinned order target">
            <div class="compose-order-panel-head">
              <div>
                <strong>${escapeHtml(label.guestLabel)}</strong>
                <p>${escapeHtml(requestText)}</p>
              </div>
              <span class="compose-order-legend"><i></i> target <i></i> dish</span>
            </div>
            <span class="compose-order-mobile-legend"><i></i> target <i></i> dish</span>
            <div class="compose-request-axis-list">${requestRows}</div>
          </aside>`;
        }
      }

      serviceOverlay.innerHTML = `
        <button type="button" class="compose-dismiss-scrim" data-testid="compose-dismiss-scrim" aria-label="Close cooking sheet and return to floor"></button>
        <div class="service-panel sheet-tier-near-full compose-sheet-panel" data-testid="compose-sheet" role="dialog" aria-modal="true" aria-labelledby="compose-title">
          <div class="service-card sheet-card-layout compose-sheet-card">
            <header class="sheet-header compose-sheet-header">
              <div>
                <h2 id="compose-title" class="service-title" tabindex="-1">Plate Dish</h2>
                ${ticketBadge}
              </div>
              <button type="button" class="icon-btn" data-testid="compose-close" aria-label="Close cooking sheet">✕</button>
            </header>
            ${ticketRailHtml}
            <section class="compose-selection" aria-label="Selected ingredients">
              <div class="compose-section-heading">
                <strong>Selected</strong>
              </div>
              ${progressHtml}
              <div class="compose-selected-strip">${selectedStrip}</div>
            </section>
            <section class="compose-filters" aria-label="Pantry filters">
              <div class="compose-search-row">
                <div class="compose-search-field">
                  <label class="sr-only" for="compose-search-input">Search ingredients</label>
                  <input id="compose-search-input" class="compose-search-input" type="search" data-testid="compose-search-input" placeholder="Search ingredients" value="${searchQueryEscaped}" autocomplete="off" enterkeyhint="search" />
                </div>
                <button type="button" class="compose-search-clear" data-testid="compose-search-clear" aria-label="Clear search" ${searchClearHidden}>Clear</button>
              </div>
              <div class="compose-axis-row" role="group" aria-label="Filter ingredients by one flavor">
                ${axisChips}
              </div>
              <p class="compose-filter-summary" data-testid="compose-filter-summary" aria-live="polite">${escapeHtml(composePantrySummary(composeFilters, matchingCount, requestedBands))}</p>
              <p class="compose-inspect-hint" data-testid="compose-inspect-hint">${escapeHtml(FLAVOR_INSPECTOR_LONG_PRESS_HINT)}</p>
              ${lowMatchHint ? `<p class="compose-filter-hint" data-testid="compose-filter-hint">${escapeHtml(lowMatchHint)}</p>` : ''}
            </section>
            <div class="compose-workspace">
              <div class="sheet-body-scroll compose-pantry" data-testid="compose-pantry">
                <div class="ingredient-grid" role="group" aria-label="Unlocked ingredients">${renderIngredientButtons()}</div>
              </div>
              ${orderPanel}
            </div>
            <footer class="sheet-footer compose-sheet-footer">
              <div class="compose-footer-copy">
                <span>Dish flavor</span>
                <span>${preview.profile ? escapeHtml(composeProgress.coherenceLabel) : escapeHtml(composeProgress.statusHint)}</span>
              </div>
              <button type="button" class="compose-flavor-toggle" data-testid="compose-flavor-toggle" aria-expanded="${composeFlavorDetailsOpen}">${composeFlavorDetailsOpen ? 'Hide flavor details' : 'Flavor details'}</button>
              <div class="compose-flavor-strip${composeFlavorDetailsOpen ? ' expanded' : ''}" aria-label="Dish flavor preview"${composeFlavorDetailsOpen ? ' tabindex="0"' : ''}>${flavorPreview}</div>
              <button type="button" class="service-btn primary" id="plate-btn" data-testid="plate-btn" ${canPlate ? '' : 'disabled'}>Plate</button>
            </footer>
          </div>
        </div>
      `;
      revealServicePanel('floor-compose');
      const composePanel = serviceOverlay.querySelector<HTMLElement>(
        '[data-testid="compose-sheet"]',
      );
      const inspectorOpen = Boolean(state.flavorInspectorIngredientId);
      if (composePanel && inspectorOpen) {
        composePanel.inert = true;
        composePanel.setAttribute('aria-hidden', 'true');
      }

      let cancelActiveLongPress: (() => void) | null = null;
      const bindIngredientButtons = (root: HTMLElement) => {
        root
          .querySelectorAll<HTMLButtonElement>('[data-compose-ingredient-id]')
          .forEach((button) => {
            let pressTimer: ReturnType<typeof setTimeout> | null = null;
            let startX = 0;
            let startY = 0;
            let longPressed = false;

            const clearPress = () => {
              if (pressTimer) clearTimeout(pressTimer);
              pressTimer = null;
              if (cancelActiveLongPress === clearPress) {
                cancelActiveLongPress = null;
              }
            };

            button.addEventListener('pointerdown', (event) => {
              clearPress();
              startX = event.clientX;
              startY = event.clientY;
              longPressed = false;
              cancelActiveLongPress = clearPress;
              pressTimer = setTimeout(() => {
                longPressed = true;
                const id = button.dataset.composeIngredientId;
                if (id) useGameStore.getState().openFlavorInspector(id);
              }, LONG_PRESS_MS);
            });
            button.addEventListener('pointermove', (event) => {
              if (
                Math.hypot(event.clientX - startX, event.clientY - startY) > 8
              ) {
                clearPress();
              }
            });
            button.addEventListener('pointerup', clearPress);
            button.addEventListener('pointercancel', clearPress);
            button.addEventListener('pointerleave', clearPress);
            button.addEventListener('click', (event) => {
              if (longPressed) {
                event.preventDefault();
                longPressed = false;
                return;
              }
              const id = button.dataset.composeIngredientId;
              if (!id) return;
              const current = useGameStore.getState();
              const activeTicket = selectFloorComposeTicket(current);
              if (!activeTicket) return;
              const currentDraft = selectComposeDraftIds(current);
              const toggle = canToggleIngredient(id, currentDraft);
              if (!toggle.allowed) return;
              void current.dispatch({
                type: 'FLOOR_SET_TICKET_DRAFT',
                ticketId: activeTicket.id,
                ingredientIds: toggle.nextIds,
              });
            });
          });

        root
          .querySelectorAll<HTMLButtonElement>('[data-compose-inspect-id]')
          .forEach((button) => {
            button.addEventListener('click', () => {
              const id = button.dataset.composeInspectId;
              if (id) useGameStore.getState().openFlavorInspector(id);
            });
          });
      };

      const updateFilterUi = () => {
        const pantry = serviceOverlay.querySelector<HTMLElement>(
          '[data-testid="compose-pantry"] .ingredient-grid',
        );
        if (pantry) {
          pantry.innerHTML = renderIngredientButtons();
          bindIngredientButtons(pantry);
        }
        const count = filterComposePantry(
          unlocked,
          composeFilters,
          requestedBands,
        ).length;
        const summary = serviceOverlay.querySelector(
          '[data-testid="compose-filter-summary"]',
        );
        if (summary) {
          summary.textContent = composePantrySummary(
            composeFilters,
            count,
            requestedBands,
          );
        }
        const hintText = composePantryLowMatchHint(count, composeFilters);
        let hint = serviceOverlay.querySelector<HTMLElement>(
          '[data-testid="compose-filter-hint"]',
        );
        const filtersSection = serviceOverlay.querySelector('.compose-filters');
        if (hintText) {
          if (!hint && filtersSection) {
            hint = document.createElement('p');
            hint.className = 'compose-filter-hint';
            hint.dataset.testid = 'compose-filter-hint';
            filtersSection.appendChild(hint);
          }
          if (hint) hint.textContent = hintText;
        } else {
          hint?.remove();
        }
        serviceOverlay
          .querySelectorAll<HTMLButtonElement>('[data-compose-axis]')
          .forEach((button) => {
            const selected =
              composeFilters.selectedAxis ===
              (button.dataset.composeAxis as AxisKey);
            button.classList.toggle('selected', selected);
            button.setAttribute('aria-pressed', String(selected));
          });
        const allBtn = serviceOverlay.querySelector<HTMLButtonElement>(
          '[data-compose-all]',
        );
        if (allBtn) {
          const selected = composeFilters.selectedAxis === null;
          allBtn.classList.toggle('selected', selected);
          allBtn.setAttribute('aria-pressed', String(selected));
        }
        const clearBtn = serviceOverlay.querySelector<HTMLButtonElement>(
          '[data-testid="compose-search-clear"]',
        );
        if (clearBtn) {
          clearBtn.hidden = composeFilters.searchQuery.trim().length === 0;
        }
      };

      bindIngredientButtons(serviceOverlay);
      serviceOverlay
        .querySelector<HTMLButtonElement>(
          '[data-testid="compose-flavor-toggle"]',
        )
        ?.addEventListener('click', (event) => {
          composeFlavorDetailsOpen = !composeFlavorDetailsOpen;
          const button = event.currentTarget as HTMLButtonElement;
          button.setAttribute(
            'aria-expanded',
            String(composeFlavorDetailsOpen),
          );
          button.textContent = composeFlavorDetailsOpen
            ? 'Hide flavor details'
            : 'Flavor details';
          serviceOverlay
            .querySelector<HTMLElement>('.compose-flavor-strip')
            ?.classList.toggle('expanded', composeFlavorDetailsOpen);
          const flavorStrip = serviceOverlay.querySelector<HTMLElement>(
            '.compose-flavor-strip',
          );
          if (composeFlavorDetailsOpen)
            flavorStrip?.setAttribute('tabindex', '0');
          else flavorStrip?.removeAttribute('tabindex');
        });
      serviceOverlay
        .querySelector('[data-testid="compose-pantry"]')
        ?.addEventListener('scroll', () => cancelActiveLongPress?.(), {
          passive: true,
        });

      serviceOverlay
        .querySelector('[data-testid="compose-close"]')
        ?.addEventListener(
          'click',
          () => useGameStore.getState().closeComposeSheet(),
          { once: true },
        );
      serviceOverlay
        .querySelector('[data-testid="compose-dismiss-scrim"]')
        ?.addEventListener(
          'click',
          () => useGameStore.getState().closeComposeSheet(),
          { once: true },
        );

      serviceOverlay
        .querySelectorAll<HTMLButtonElement>('[data-compose-axis]')
        .forEach((button) => {
          button.addEventListener('click', () => {
            composeFilters = toggleComposeAxis(
              composeFilters,
              button.dataset.composeAxis as AxisKey,
            );
            updateFilterUi();
          });
        });
      serviceOverlay
        .querySelector<HTMLButtonElement>('[data-compose-all]')
        ?.addEventListener('click', () => {
          composeFilters = clearComposeAxisFilter(composeFilters);
          updateFilterUi();
        });

      const searchInput = serviceOverlay.querySelector<HTMLInputElement>(
        '[data-testid="compose-search-input"]',
      );
      searchInput?.addEventListener('input', () => {
        composeFilters = setComposeSearchQuery(
          composeFilters,
          searchInput.value,
        );
        updateFilterUi();
      });
      serviceOverlay
        .querySelector<HTMLButtonElement>('[data-testid="compose-search-clear"]')
        ?.addEventListener('click', () => {
          composeFilters = setComposeSearchQuery(composeFilters, '');
          if (searchInput) searchInput.value = '';
          updateFilterUi();
          searchInput?.focus();
        });

      serviceOverlay
        .querySelectorAll<HTMLButtonElement>('[data-compose-rail-ticket]')
        .forEach((button) => {
          button.addEventListener('click', () => {
            const ticketId = button.dataset.composeRailTicket;
            if (!ticketId) return;
            const current = useGameStore.getState();
            const currentFloor = current.activeDay?.floor;
            if (
              currentFloor?.carriedTicketId &&
              currentFloor.tickets.some(
                (row) =>
                  row.id === currentFloor.carriedTicketId &&
                  row.status === 'plated',
              )
            ) {
              return;
            }
            current.setFloorSelectedTicket(ticketId);
          });
        });

      serviceOverlay.querySelector('#plate-btn')?.addEventListener(
        'click',
        () => {
          if (Date.now() < serveLockedUntil) return;
          const current = useGameStore.getState();
          const activeTicket = selectFloorComposeTicket(current);
          if (!activeTicket) return;
          serveLockedUntil = Date.now() + SERVE_LOCK_MS;
          void current.dispatch({
            type: 'FLOOR_PLATE',
            ticketId: activeTicket.id,
          });
        },
        { once: true },
      );
      return;
    }

    if (selectIsAwaitingServe(state) && !state.activeDay?.floor) {
      const draftIds = selectComposeDraftIds(state);
      const ctx = getDomainContext();
      const preview = computeDishPreview(draftIds, ctx.ingredientsById);
      const progress = selectQueueProgress(state);
      const canServe = preview.isValidCount && Date.now() >= serveLockedUntil;

      const ingredientButtons = state.unlockedIngredientIds
        .map((id) => {
          const item = ctx.ingredientsById.get(id);
          const selected = draftIds.includes(id);
          const toggle = canToggleIngredient(id, draftIds);
          const disabled = !selected && !toggle.allowed;
          return `<button type="button" class="ingredient-chip${selected ? ' selected' : ''}" data-ingredient-id="${id}" data-testid="ingredient-chip" ${disabled ? 'disabled' : ''} aria-pressed="${selected}">${renderFoodIconHtml(id, 32)}<span>${item?.name ?? id}</span></button>`;
        })
        .join('');

      const flavorPreview = preview.profile
        ? `<div class="flavor-preview flavor-preview-bars" aria-label="Dish flavor preview">${renderFlavorBarsHtml(
            buildFlavorBarsViewModel(preview.profile),
            { showValues: false },
          )}</div>`
        : '';

      serviceOverlay.innerHTML = `
        <div class="service-panel">
          <div class="service-card">
            <h2 class="service-title">Compose Dish</h2>
            ${progress ? `<p class="queue-badge">Customer ${progress.current} of ${progress.total}</p>` : ''}
            <p class="compose-meta">Pick ${MIN_DISH_INGREDIENTS}–${MAX_DISH_INGREDIENTS} ingredients (${preview.ingredientCount} selected)</p>
            <div class="ingredient-grid" role="group" aria-label="Unlocked ingredients">${ingredientButtons}</div>
            ${flavorPreview}
            <div class="service-actions">
              <button type="button" class="service-btn primary" id="serve-btn" data-testid="serve-btn" ${canServe ? '' : 'disabled'}>Serve</button>
            </div>
          </div>
        </div>
      `;
      revealServicePanel('queue-compose');

      serviceOverlay
        .querySelectorAll<HTMLButtonElement>('[data-ingredient-id]')
        .forEach((button) => {
          let pressTimer: ReturnType<typeof setTimeout> | null = null;

          const clearPress = () => {
            if (pressTimer) {
              clearTimeout(pressTimer);
              pressTimer = null;
            }
          };

          button.addEventListener('pointerdown', () => {
            clearPress();
            pressTimer = setTimeout(() => {
              const id = button.dataset.ingredientId;
              if (id) useGameStore.getState().openFlavorInspector(id);
            }, LONG_PRESS_MS);
          });
          button.addEventListener('pointerup', clearPress);
          button.addEventListener('pointercancel', clearPress);
          button.addEventListener('pointerleave', clearPress);

          button.addEventListener('click', () => {
            const id = button.dataset.ingredientId;
            if (!id) return;
            const currentDraft = selectComposeDraftIds(useGameStore.getState());
            const toggle = canToggleIngredient(id, currentDraft);
            if (!toggle.allowed) return;
            useGameStore.getState().dispatch({
              type: 'SET_COMPOSE_DRAFT',
              ingredientIds: toggle.nextIds,
            });
          });
        });

      serviceOverlay.querySelector('#serve-btn')?.addEventListener(
        'click',
        () => {
          if (Date.now() < serveLockedUntil) return;
          serveLockedUntil = Date.now() + SERVE_LOCK_MS;
          const ids = selectComposeDraftIds(useGameStore.getState());
          useGameStore
            .getState()
            .dispatch({ type: 'SERVE_DISH', ingredientIds: ids });
        },
        { once: true },
      );
      return;
    }

    hideServicePanel();
  };

  const currentBlockingScope = (): BlockingScope | null => {
    const state = useGameStore.getState();
    if (state.ceremony) {
      const root = ceremonyModal.querySelector<HTMLElement>('[role="dialog"]');
      const title = ceremonyModal.querySelector<HTMLElement>('#ceremony-title');
      return root && title
        ? { kind: 'ceremony', key: state.ceremony, root, title }
        : null;
    }
    if (state.daySummary) {
      const root = serviceOverlay.querySelector<HTMLElement>(
        '[data-testid="day-summary-sheet"]',
      );
      const title = serviceOverlay.querySelector<HTMLElement>(
        '#day-summary-title',
      );
      return root && title
        ? {
            kind: 'day-summary',
            key: String(state.daySummary.completedDay),
            root,
            title,
          }
        : null;
    }
    if (state.pendingReview) {
      const root = serviceOverlay.querySelector<HTMLElement>(
        '[data-testid="review-sheet"]',
      );
      const title = serviceOverlay.querySelector<HTMLElement>(
        '#review-context-title, #review-title',
      );
      return root && title
        ? {
            kind: 'review',
            key: state.pendingReview.customerId ?? 'customer-review',
            root,
            title,
          }
        : null;
    }
    if (selectShowFloorCompose(state)) {
      const root = serviceOverlay.querySelector<HTMLElement>(
        '[data-testid="compose-sheet"]',
      );
      const title = serviceOverlay.querySelector<HTMLElement>('#compose-title');
      return root && title
        ? {
            kind: 'floor-compose',
            key: selectFloorComposeTicket(state)?.id ?? 'untargeted',
            root,
            title,
          }
        : null;
    }
    return null;
  };

  const sameBlockingScope = (
    left: BlockingScope | null,
    right: BlockingScope | null,
  ) => left?.kind === right?.kind && left?.key === right?.key;

  const queueScopeFocus = (
    scope: BlockingScope,
    identity: FocusIdentity | null,
  ) => {
    queueMicrotask(() => {
      const current = activeBlockingScope;
      if (
        useGameStore.getState().flavorInspectorIngredientId ||
        !current ||
        !sameBlockingScope(current, scope) ||
        !current.root.isConnected
      ) {
        return;
      }
      focusIdentityInScope(current, identity);
    });
  };

  const initialScopeFocus = (scope: BlockingScope): FocusIdentity | null =>
    scope.kind === 'floor-compose'
      ? {
          attributes: [
            { name: 'data-testid', value: 'compose-close' },
          ],
        }
      : null;

  const reconcileBlockingScope = (
    previous: BlockingScope | null,
    next: BlockingScope | null,
    retainedFocus: FocusIdentity | null,
    focusBeforeRender: HTMLElement | null,
  ) => {
    syncBackgroundIsolation(next);
    activeBlockingScope = next;

    if (!previous && next) {
      blockingFocusReturn = focusBeforeRender;
      queueScopeFocus(next, initialScopeFocus(next));
      return;
    }
    if (previous && next) {
      if (!sameBlockingScope(previous, next)) {
        queueScopeFocus(next, initialScopeFocus(next));
      } else {
        queueScopeFocus(next, retainedFocus);
      }
      return;
    }
    if (!previous || next) return;

    const summaryExit =
      previous.kind === 'day-summary' ? summaryFocusExit : null;
    const reviewExit = previous.kind === 'review' ? reviewFocusExit : null;
    summaryFocusExit = null;
    reviewFocusExit = null;
    if (summaryExit === 'shop') {
      blockingFocusReturn = null;
      return;
    }
    if (summaryExit === 'open-day' || reviewExit === 'open-day') {
      blockingFocusReturn = null;
      queueMicrotask(() => {
        serviceOverlay
          .querySelector<HTMLElement>('[data-testid="open-day-btn"]')
          ?.focus({ preventScroll: true });
      });
      return;
    }
    queueMicrotask(focusAfterBlockingScope);
  };

  const sync = () => {
    const previousScope = activeBlockingScope;
    const retainedFocus = previousScope
      ? focusIdentity(previousScope)
      : null;
    const focusBeforeRender =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    renderHud();
    renderCeremony();
    renderServiceOverlay();
    renderChatBubble();
    syncTutorialSkipAffordance();
    reconcileBlockingScope(
      previousScope,
      currentBlockingScope(),
      retainedFocus,
      focusBeforeRender,
    );
  };

  const onBlockingScopeKeydown = (event: KeyboardEvent) => {
    const state = useGameStore.getState();
    if (state.flavorInspectorIngredientId) return;
    const scope = activeBlockingScope;
    if (!scope) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      if (scope.kind === 'floor-compose') {
        state.closeComposeSheet();
      } else {
        event.stopPropagation();
      }
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = Array.from(
      scope.root.querySelectorAll<HTMLElement>(blockingFocusableSelector),
    ).filter((element) => element.getClientRects().length > 0);
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;
    if (active === scope.title || !scope.root.contains(active)) {
      event.preventDefault();
      (event.shiftKey ? last : first).focus();
    } else if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const unsubscribe = useGameStore.subscribe((state, prev) => {
    if (
      prev.flavorInspectorIngredientId &&
      !state.flavorInspectorIngredientId &&
      activeBlockingScope?.kind === 'ceremony'
    ) {
      queueScopeFocus(activeBlockingScope, null);
    }
    const previousTicketIds = new Set(
      prev.activeDay?.floor?.tickets.map((ticket) => ticket.id) ?? [],
    );
    const newTicket = state.activeDay?.floor?.tickets.find(
      (ticket) => !previousTicketIds.has(ticket.id),
    );
    if (newTicket) {
      orderBubbleGuestId = newTicket.customerId;
      if (orderBubbleTimer) clearTimeout(orderBubbleTimer);
      // Keep under the floor notice dwell so the bubble yields the banner
      // quickly; pulse CSS is visual-only and must not extend lifetime.
      orderBubbleTimer = setTimeout(() => {
        clearOrderBubble();
        renderChatBubble();
      }, 2400);
    }
    const floorChanged = state.activeDay?.floor !== prev.activeDay?.floor;
    if (
      floorChanged &&
      orderBubbleGuestId &&
      !isOrderBubbleOwnedByFloor(state.activeDay?.floor, orderBubbleGuestId)
    ) {
      clearOrderBubble();
    }
    const domainChanged =
      state.screen !== prev.screen ||
      state.activeDay !== prev.activeDay ||
      state.modifierDismissed !== prev.modifierDismissed ||
      state.serviceStartPending !== prev.serviceStartPending ||
      state.serviceStartError !== prev.serviceStartError ||
      state.pendingReview !== prev.pendingReview ||
      state.daySummary !== prev.daySummary ||
      state.ceremony !== prev.ceremony ||
      state.presentationSavePending !== prev.presentationSavePending ||
      state.presentationSaveError !== prev.presentationSaveError ||
      state.editLayoutMode !== prev.editLayoutMode ||
      state.cash !== prev.cash ||
      state.rating !== prev.rating ||
      state.prestige !== prev.prestige ||
      state.day !== prev.day ||
      state.composeSheetOpen !== prev.composeSheetOpen ||
      state.composeDraftIngredientIds !== prev.composeDraftIngredientIds ||
      state.activeDay?.queueIndex !== prev.activeDay?.queueIndex ||
      floorChanged ||
      state.floorPlayerGrid !== prev.floorPlayerGrid;

    if (domainChanged) {
      sync();
    }
  });

  window.addEventListener('resize', positionChatBubble);
  document.addEventListener('keydown', onBlockingScopeKeydown, true);
  const onFoodAtlas = () => sync();
  window.addEventListener('food-atlas-ready', onFoodAtlas);
  sync();

  return () => {
    unsubscribe();
    statusHudResizeObserver?.disconnect();
    surface?.style.removeProperty('--vk-status-hud-height');
    cleanupCelebrationBanner();
    cleanupFloorHud();
    document.removeEventListener('click', onReplayTutorialPointer, true);
    tutorialSkipHost.remove();
    window.removeEventListener('resize', positionChatBubble);
    document.removeEventListener('keydown', onBlockingScopeKeydown, true);
    window.removeEventListener('food-atlas-ready', onFoodAtlas);
    clearOrderBubble();
    syncBackgroundIsolation(null);
    bubbleEl?.remove();
    statusMount.innerHTML = '';
    overlayMount.innerHTML = '';
  };
}

export function computeBubbleAnchorFromWorld(
  worldX: number,
  worldY: number,
  camera: {
    x: number;
    y: number;
    scale: number;
    stageOffsetX: number;
    stageOffsetY: number;
  },
  canvasRect: DOMRect,
): { x: number; y: number } {
  const screen = worldToScreen(worldX, worldY, camera);
  return {
    x: canvasRect.left + screen.x,
    y: canvasRect.top + screen.y - 8,
  };
}
