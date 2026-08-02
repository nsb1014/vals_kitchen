import type { RestaurantApp } from '../../canvas/RestaurantApp.ts';
import { getDomainContext } from '../../app/content-loader.ts';
import {
  MAX_DISH_INGREDIENTS,
  MIN_DISH_INGREDIENTS,
} from '../../domain/state/game-state.ts';
import { AXIS_KEYS, type AxisKey, type Band } from '../../domain/types.ts';
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
  composePantrySummary,
  type ComposeAxisBands,
  emptyComposePantryFilters,
  filterComposePantry,
  toggleComposeAxis,
} from '../presentation/compose-pantry.ts';
import { resolveIdealFlavorProfile } from '../presentation/ideal-flavor.ts';
import { requestRestaurantShopOpen } from '../events/restaurant-shop.ts';
import { renderFoodIconHtml } from './food-icon.ts';
import { mountFloorServiceHud } from './FloorServiceHud.ts';
import { mountCelebrationBanner } from './CelebrationBanner.ts';
import { worldToScreen } from '../../canvas/coordinates.ts';
import { computeChatBubblePlacement } from '../presentation/chat-bubble-placement.ts';

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

type RequestBandPosition = 'below' | 'in-range' | 'above';

function requestBandPosition(value: number, band: Band): RequestBandPosition {
  if (band === 'low') return value <= 3 ? 'in-range' : 'above';
  if (band === 'mid') {
    if (value < 3) return 'below';
    return value <= 7 ? 'in-range' : 'above';
  }
  return value >= 6 ? 'in-range' : 'below';
}

function requestBandPositionLabel(position: RequestBandPosition): string {
  if (position === 'in-range') return 'In range';
  return position === 'below' ? 'Below request' : 'Above request';
}

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
  const cleanupFloorHud = mountFloorServiceHud(chromeMount, overlayMount);

  let serveLockedUntil = 0;
  let bubbleEl: HTMLElement | null = null;
  let orderBubbleGuestId: string | null = null;
  let orderBubbleTimer: ReturnType<typeof setTimeout> | null = null;
  let composeWasVisible = false;
  let composeTicketId: string | null = null;
  let composeFocusReturn: HTMLElement | null = null;
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
    const panel = serviceOverlay.firstElementChild;
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
    }
  };

  const hideServicePanel = () => {
    servicePanelKind = null;
    servicePanelEnteredAt = Number.NEGATIVE_INFINITY;
    serviceOverlay.hidden = true;
    serviceOverlay.innerHTML = '';
  };

  type ComposeFocusIdentity = {
    attributes: Array<{
      name:
        | 'data-testid'
        | 'data-compose-ingredient-id'
        | 'data-compose-axis'
        | 'id';
      value: string;
    }>;
  };

  const composeFocusableSelector =
    'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

  const composeFocusIdentity = (): ComposeFocusIdentity | null => {
    const active = document.activeElement;
    if (!(active instanceof HTMLElement) || !serviceOverlay.contains(active))
      return null;
    const attributes = [
      'data-testid',
      'data-compose-ingredient-id',
      'data-compose-axis',
      'id',
    ] as const;
    const values = attributes.flatMap((name) => {
      const value = active.getAttribute(name);
      return value ? [{ name, value }] : [];
    });
    return values.length > 0 ? { attributes: values } : null;
  };

  const focusComposeIdentity = (identity: ComposeFocusIdentity | null) => {
    const panel = serviceOverlay.querySelector<HTMLElement>(
      '[data-testid="compose-sheet"]',
    );
    if (!panel) return;
    const match = identity
      ? Array.from(
          panel.querySelectorAll<HTMLElement>(composeFocusableSelector),
        ).find((element) =>
          identity.attributes.every(
            ({ name, value }) => element.getAttribute(name) === value,
          ),
        )
      : null;
    const target =
      match ??
      panel.querySelector<HTMLElement>('[data-testid="compose-close"]') ??
      panel.querySelector<HTMLElement>(composeFocusableSelector);
    target?.focus({ preventScroll: true });
  };

  const setComposeBackgroundIsolation = (active: boolean) => {
    const floorTickets = overlayMount.querySelector<HTMLElement>(
      '[data-testid="floor-tickets-dock"]',
    );
    for (const element of [
      statusMount,
      chromeMount,
      bubbleMount,
      canvasMount,
      floorTickets,
    ]) {
      if (!element) continue;
      element.inert = active;
      if (active) element.setAttribute('aria-hidden', 'true');
      else element.removeAttribute('aria-hidden');
    }
  };

  const resetComposeUi = () => {
    composeFlavorDetailsOpen = false;
    composeFilters = emptyComposePantryFilters();
  };

  const focusFloorAfterCompose = () => {
    const target =
      composeFocusReturn?.isConnected &&
      !serviceOverlay.contains(composeFocusReturn)
        ? composeFocusReturn
        : (document.querySelector(
            '[data-testid="restaurant-canvas"]',
          ) as HTMLElement | null);
    target?.focus({ preventScroll: true });
    composeFocusReturn = null;
  };

  const renderHud = () => {
    const state = useGameStore.getState();
    const activeDay = state.activeDay;
    const ratingModel = buildRatingDisplayModel(state.rating, state.prestige);
    const customersTotal = activeDay?.customers.length ?? 0;
    const customersServed = activeDay?.customersServed ?? 0;
    const customersLeft = Math.max(0, customersTotal - customersServed);
    const dayRatingDelta = activeDay?.dayRatingDelta ?? 0;
    const detailContent =
      hudDetail === 'cash'
        ? `<h2>Cash</h2>
           <p class="hud-detail-value">$${state.cash.toLocaleString('en-US')}</p>
           <p>Total cash gained since day 1: <strong>$${state.stats.totalEarnings.toLocaleString('en-US')}</strong></p>`
        : hudDetail === 'rating'
          ? `<h2>Rating</h2>
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
            ? `<h2>Prestige P${state.prestige}</h2>
               <p>Current permanent payout multiplier: <strong>${prestigeMultiplier(state.prestige).toFixed(2)}×</strong></p>
               <p>At P${state.prestige + 1}: <strong>${prestigeMultiplier(state.prestige + 1).toFixed(2)}×</strong></p>
               <p>Rating points until next level: <strong>${ratingModel.starsToPrestige.toFixed(1)}★</strong></p>`
            : hudDetail === 'day'
              ? `<h2>Day ${state.day}</h2>
                 <p>Rating change today: <strong>${dayRatingDelta >= 0 ? '+' : ''}${dayRatingDelta.toFixed(2)}★</strong></p>
                 <p>Cash gained today: <strong>+$${(activeDay?.dayEarnings ?? 0).toLocaleString('en-US')}</strong></p>
                 <p>Customers served: <strong>${customersServed}</strong></p>
                 <p>Customers left: <strong>${customersLeft}</strong></p>`
              : '';
    hud.innerHTML = `
      <button type="button" class="hud-stat hud-stat-button" data-hud-detail="cash" aria-expanded="${hudDetail === 'cash'}" aria-label="Cash details">
        <span class="hud-stat-label"><i aria-hidden="true">$</i> Cash</span>
        <strong>$${state.cash.toLocaleString('en-US')}</strong>
      </button>
      <button type="button" class="hud-stat hud-stat-button" data-hud-detail="rating" aria-expanded="${hudDetail === 'rating'}" aria-label="Restaurant rating details">
        <span class="hud-stat-label"><i aria-hidden="true">★</i> Rating</span>
        <strong>${state.rating.toFixed(1)}★</strong>
      </button>
      <button type="button" class="hud-stat hud-stat-button" data-hud-detail="prestige" aria-expanded="${hudDetail === 'prestige'}" aria-label="Prestige details">
        <span class="hud-stat-label"><i aria-hidden="true">◆</i> Prestige</span>
        <strong>P${state.prestige}</strong>
      </button>
      <button type="button" class="hud-stat hud-stat-button" data-hud-detail="day" aria-expanded="${hudDetail === 'day'}" aria-label="Day details">
        <span class="hud-stat-label"><i aria-hidden="true">☀</i> Day</span>
        <strong>${state.day}</strong>
      </button>
      <button type="button" class="hud-settings-button" data-testid="hud-settings" aria-label="Open settings">⚙</button>
      ${
        hudDetail
          ? `<aside class="hud-detail-menu" data-testid="hud-detail-menu" aria-live="polite">
               <button type="button" class="hud-detail-close" aria-label="Close details">×</button>
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

  const positionChatBubble = () => {
    if (!bubbleEl) return;
    const app = getRestaurantApp();
    if (!app) return;
    const anchor = orderBubbleGuestId
      ? app.getGuestScreenAnchor(orderBubbleGuestId)
      : app.getCustomerScreenAnchor();
    if (!anchor) {
      bubbleEl.hidden = true;
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
  };

  const renderChatBubble = () => {
    const state = useGameStore.getState();
    const customer = selectCurrentCustomer(state);
    const orderGuest = orderBubbleGuestId
      ? state.activeDay?.floor?.pool.find(
          (guest) => guest.customer.id === orderBubbleGuestId,
        )
      : undefined;
    const showOrderBubble = Boolean(orderGuest && state.activeDay?.floor);
    const showBubble =
      showOrderBubble ||
      (state.activeDay &&
        state.modifierDismissed &&
        customer &&
        !state.pendingReview &&
        selectIsAwaitingServe(state));

    if (!showBubble || (!customer && !orderGuest)) {
      if (bubbleEl) bubbleEl.hidden = true;
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
    bubbleEl.textContent = formatCustomerRequestText(
      orderGuest?.customer.preference ?? customer!.preference,
    );
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
        <div class="modal-card" role="dialog" aria-labelledby="ceremony-title">
          <h2 id="ceremony-title">Prestige Achieved!</h2>
          <p>Your restaurant reached 6★. Prestige level is now <strong>P${state.ceremonyPrestige ?? state.prestige}</strong>. Rating resets to 3.0★ and all future payouts scale up permanently.</p>
          <button type="button" class="service-btn primary" id="dismiss-ceremony">Continue</button>
        </div>
      `;
    } else {
      ceremonyModal.innerHTML = `
        <div class="modal-card" role="dialog" aria-labelledby="ceremony-title">
          <h2 id="ceremony-title">Soft Reset</h2>
          <p>Rating hit 0★. You keep prestige <strong>P${state.prestige}</strong> and your recipe book, but cash, ingredients (except starters), equipment, and layout were reset.</p>
          <button type="button" class="service-btn primary" id="dismiss-ceremony">Rebuild</button>
        </div>
      `;
    }

    ceremonyModal.querySelector('#dismiss-ceremony')?.addEventListener(
      'click',
      () => {
        useGameStore.getState().dismissCeremony();
      },
      { once: true },
    );
  };

  const renderServiceOverlay = () => {
    const state = useGameStore.getState();
    const composeVisible = selectShowFloorCompose(state);
    const composeOpenedNow = composeVisible && !composeWasVisible;
    const retainedComposeFocus =
      composeVisible && !composeOpenedNow ? composeFocusIdentity() : null;
    const nextComposeTicketId = composeVisible
      ? (selectFloorComposeTicket(state)?.id ?? null)
      : null;

    if (composeOpenedNow) {
      composeFocusReturn =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
      resetComposeUi();
    } else if (!composeVisible && composeWasVisible) {
      resetComposeUi();
      queueMicrotask(focusFloorAfterCompose);
    } else if (
      composeVisible &&
      composeTicketId !== null &&
      nextComposeTicketId !== composeTicketId
    ) {
      resetComposeUi();
    }
    composeWasVisible = composeVisible;
    composeTicketId = nextComposeTicketId;
    setComposeBackgroundIsolation(composeVisible);

    if (!selectShowServiceDayOverlay(state)) {
      hideServicePanel();
      return;
    }

    if (state.daySummary) {
      const masteryLine =
        'masteryLine' in state.daySummary ? state.daySummary.masteryLine : null;
      serviceOverlay.innerHTML = `
        <div class="service-panel sheet-tier-near-full" data-testid="day-summary-sheet">
          <div class="service-card sheet-card-layout">
            <header class="sheet-header">
              <h2 class="service-title" data-testid="day-summary-title">Day ${state.daySummary.completedDay} Summary</h2>
            </header>
            <div class="sheet-body-scroll">
            <p class="review-detail">${state.daySummary.earningsLine}</p>
            ${state.daySummary.bonusLine ? `<p class="review-detail review-positive">${state.daySummary.bonusLine}</p>` : ''}
            ${'volumeBonusLine' in state.daySummary && state.daySummary.volumeBonusLine ? `<p class="review-detail review-positive" data-testid="summary-volume-bonus">${state.daySummary.volumeBonusLine}</p>` : ''}
            <p class="review-detail">${state.daySummary.averageMatchText}</p>
            <p class="review-detail">${state.daySummary.ratingDeltaText}</p>
            <p class="review-detail">${state.daySummary.unlockProgressText}</p>
            <p class="review-detail">${state.daySummary.customersServedText}</p>
            ${masteryLine ? `<p class="review-detail review-positive" data-testid="summary-mastery">${masteryLine}</p>` : ''}
            </div>
            <footer class="sheet-footer service-actions day-summary-actions">
              <button type="button" class="service-btn" id="summary-back-floor" data-testid="summary-back-floor">Continue to Day ${state.daySummary.nextDay}</button>
              <button type="button" class="service-btn primary" id="summary-edit-restaurant" data-testid="summary-edit-restaurant">Shop &amp; Edit</button>
            </footer>
          </div>
        </div>
      `;
      revealServicePanel('day-summary');
      serviceOverlay.querySelector('#summary-back-floor')?.addEventListener(
        'click',
        () => {
          const store = useGameStore.getState();
          store.dismissDaySummary();
          store.navigateTo('restaurant');
        },
        { once: true },
      );
      serviceOverlay
        .querySelector('#summary-edit-restaurant')
        ?.addEventListener(
          'click',
          () => {
            const store = useGameStore.getState();
            store.dismissDaySummary();
            store.navigateTo('restaurant');
            if (!store.editLayoutMode) store.toggleEditLayout();
            requestRestaurantShopOpen();
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

    if (!state.activeDay) {
      hideServicePanel();
      return;
    }

    if (!state.modifierDismissed) {
      const modifier = selectActiveModifier(state);
      serviceOverlay.innerHTML = `
        <div class="service-panel sheet-tier-mid" data-testid="modifier-sheet">
          <div class="service-card">
            <h2 class="service-title">Today's Modifier</h2>
            <p class="service-subtitle"><strong>${modifier?.name ?? 'Normal Day'}</strong></p>
            <p class="service-subtitle">${modifier?.description ?? 'No special effects today.'}</p>
            <p class="queue-badge">${state.activeDay.customers.length} customers expected</p>
            <div class="service-actions">
              <button type="button" class="service-btn primary" id="start-service-btn" data-testid="start-service-btn">Start Service</button>
            </div>
          </div>
        </div>
      `;
      revealServicePanel('modifier');
      serviceOverlay.querySelector('#start-service-btn')?.addEventListener(
        'click',
        () => {
          useGameStore.getState().dismissModifier();
        },
        { once: true },
      );
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
                  <span class="review-identity-kicker">Review from</span>
                  <h2 class="service-title" data-testid="review-guest-name">${escapeHtml(reviewArchetype?.name ?? 'Customer')}</h2>
                </span>
              </header>`
        : `
              <header class="sheet-header">
                <h2 class="service-title">Customer Review</h2>
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
      serviceOverlay.innerHTML = `
        <div class="service-panel sheet-tier-mid" data-testid="review-sheet">
          <div class="service-card sheet-card-layout">
            ${reviewIdentity}
            <div class="sheet-body-scroll">
            ${progress && !floorActive ? `<p class="queue-badge">Customer ${progress.current} of ${progress.total}</p>` : ''}
            <p class="review-stars" data-testid="review-stars" aria-label="${review.starsText}">${renderStarGlyphs(review.starsFilled)}</p>
            <p class="review-detail" data-testid="review-score">${review.starsText}</p>
            <p class="review-detail">Tip: ${review.tipText}</p>
            <p class="review-detail ${review.ratingDeltaPositive ? 'review-positive' : 'review-negative'}">Rating ${review.ratingDeltaText}</p>
            ${ratingModifierLine ? `<p class="review-detail review-negative">${escapeHtml(ratingModifierLine)}</p>` : ''}
            ${review.recipeLine ? `<p class="review-detail review-positive">${review.recipeLine}</p>` : ''}
            ${review.masteryLine ? `<p class="review-detail review-positive" data-testid="review-mastery">${review.masteryLine}</p>` : ''}
            </div>
            <footer class="sheet-footer service-actions">
              ${
                canClose
                  ? '<button type="button" class="service-btn primary" id="close-day-btn" data-testid="close-day-btn">Close Day</button>'
                  : canAdvance
                    ? '<button type="button" class="service-btn primary" id="next-customer-btn" data-testid="next-customer-btn">Next Customer</button>'
                    : floorActive
                      ? '<button type="button" class="service-btn primary" id="continue-service-btn" data-testid="continue-service-btn">Continue service</button>'
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
        () => {
          const store = useGameStore.getState() as {
            dismissPendingReview?: () => void;
          };
          if (typeof store.dismissPendingReview === 'function') {
            store.dismissPendingReview();
          } else {
            useGameStore.setState({ pendingReview: null });
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
              <button type="button" class="compose-ingredient-inspect" id="ingredient-inspect-${item.id}" data-compose-inspect-id="${item.id}" data-testid="ingredient-inspect" aria-label="Inspect ${name}">Inspect</button>
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
      const axisChips = orderedFilterAxes
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

        if (ticketGuest) {
          const preference = ticketGuest.customer.preference;
          const ideal = resolveIdealFlavorProfile(preference);
          const requestText = formatCustomerRequestText(preference);
          const requestRows = requestedAxes
            .map((axis) => {
              const band = requestedBands[axis]!;
              const targetValue = ideal[axis];
              const currentValue = preview.profile?.[axis] ?? 0;
              const position = requestBandPosition(currentValue, band);
              const positionLabel = requestBandPositionLabel(position);
              return `<div class="compose-request-axis" data-testid="compose-request-axis">
                <div class="compose-request-axis-head">
                  <strong>${escapeHtml(`${bandLabel(band)} ${AXIS_LABELS[axis]}`)}</strong>
                  <span class="compose-request-status ${position}">${escapeHtml(positionLabel)}</span>
                </div>
                <div class="compose-request-bars" aria-hidden="true">
                  <span class="compose-request-bar target">
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
        <div class="service-panel sheet-tier-near-full" data-testid="compose-sheet" role="dialog" aria-modal="true" aria-labelledby="compose-title">
          <div class="service-card sheet-card-layout compose-sheet-card">
            <header class="sheet-header compose-sheet-header">
              <div>
                <h2 id="compose-title" class="service-title">Plate Dish</h2>
                ${ticketBadge}
              </div>
              <button type="button" class="icon-btn" data-testid="compose-close" aria-label="Close cooking sheet">✕</button>
            </header>
            <section class="compose-selection" aria-label="Selected ingredients">
              <div class="compose-section-heading">
                <strong>Selected</strong>
                <span>${preview.ingredientCount} / ${MAX_DISH_INGREDIENTS}</span>
              </div>
              <div class="compose-selected-strip">${selectedStrip}</div>
            </section>
            <section class="compose-filters" aria-label="Pantry filters">
              <div class="compose-axis-row" role="group" aria-label="Filter ingredients by one flavor">
                ${axisChips}
              </div>
              <p class="compose-filter-summary" data-testid="compose-filter-summary" aria-live="polite">${escapeHtml(composePantrySummary(composeFilters, matchingCount, requestedBands))}</p>
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
                <span>${preview.profile ? 'Tune each requested flavor into range' : `Pick ${MIN_DISH_INGREDIENTS}–${MAX_DISH_INGREDIENTS} ingredients`}</span>
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
        serviceOverlay
          .querySelectorAll<HTMLButtonElement>('[data-compose-axis]')
          .forEach((button) => {
            const selected =
              composeFilters.selectedAxis ===
              (button.dataset.composeAxis as AxisKey);
            button.classList.toggle('selected', selected);
            button.setAttribute('aria-pressed', String(selected));
          });
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
      queueMicrotask(() => {
        const current = useGameStore.getState();
        if (
          !selectShowFloorCompose(current) ||
          current.flavorInspectorIngredientId
        ) {
          return;
        }
        focusComposeIdentity(composeOpenedNow ? null : retainedComposeFocus);
      });
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

  const sync = () => {
    renderHud();
    renderCeremony();
    renderServiceOverlay();
    renderChatBubble();
  };

  const onComposeKeydown = (event: KeyboardEvent) => {
    const state = useGameStore.getState();
    if (state.flavorInspectorIngredientId || !selectShowFloorCompose(state)) {
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      state.closeComposeSheet();
      return;
    }
    if (event.key !== 'Tab') return;
    const panel = serviceOverlay.querySelector<HTMLElement>(
      '[data-testid="compose-sheet"]',
    );
    if (!panel) return;
    const focusable = Array.from(
      panel.querySelectorAll<HTMLElement>(composeFocusableSelector),
    ).filter((element) => element.getClientRects().length > 0);
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;
    if (!panel.contains(active)) {
      event.preventDefault();
      first.focus();
    } else if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const unsubscribe = useGameStore.subscribe((state, prev) => {
    const previousTicketIds = new Set(
      prev.activeDay?.floor?.tickets.map((ticket) => ticket.id) ?? [],
    );
    const newTicket = state.activeDay?.floor?.tickets.find(
      (ticket) => !previousTicketIds.has(ticket.id),
    );
    if (newTicket) {
      orderBubbleGuestId = newTicket.customerId;
      if (orderBubbleTimer) clearTimeout(orderBubbleTimer);
      orderBubbleTimer = setTimeout(() => {
        orderBubbleGuestId = null;
        orderBubbleTimer = null;
        renderChatBubble();
      }, 2400);
    }
    const domainChanged =
      state.screen !== prev.screen ||
      state.activeDay !== prev.activeDay ||
      state.modifierDismissed !== prev.modifierDismissed ||
      state.pendingReview !== prev.pendingReview ||
      state.daySummary !== prev.daySummary ||
      state.ceremony !== prev.ceremony ||
      state.editLayoutMode !== prev.editLayoutMode ||
      state.cash !== prev.cash ||
      state.rating !== prev.rating ||
      state.prestige !== prev.prestige ||
      state.day !== prev.day ||
      state.composeSheetOpen !== prev.composeSheetOpen ||
      state.composeDraftIngredientIds !== prev.composeDraftIngredientIds ||
      state.activeDay?.queueIndex !== prev.activeDay?.queueIndex ||
      state.activeDay?.floor !== prev.activeDay?.floor ||
      state.floorPlayerGrid !== prev.floorPlayerGrid;

    if (domainChanged) {
      sync();
    }
  });

  window.addEventListener('resize', positionChatBubble);
  document.addEventListener('keydown', onComposeKeydown);
  const onFoodAtlas = () => sync();
  window.addEventListener('food-atlas-ready', onFoodAtlas);
  sync();

  return () => {
    unsubscribe();
    statusHudResizeObserver?.disconnect();
    surface?.style.removeProperty('--vk-status-hud-height');
    cleanupCelebrationBanner();
    cleanupFloorHud();
    window.removeEventListener('resize', positionChatBubble);
    document.removeEventListener('keydown', onComposeKeydown);
    window.removeEventListener('food-atlas-ready', onFoodAtlas);
    if (orderBubbleTimer) clearTimeout(orderBubbleTimer);
    setComposeBackgroundIsolation(false);
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
