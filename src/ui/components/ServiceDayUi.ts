import type { RestaurantApp } from '../../canvas/RestaurantApp.ts';
import { getDomainContext } from '../../app/content-loader.ts';
import {
  MAX_DISH_INGREDIENTS,
  MIN_DISH_INGREDIENTS,
} from '../../domain/state/game-state.ts';
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
import {
  canToggleIngredient,
  computeDishPreview,
} from '../presentation/dish-preview.ts';
import {
  buildFlavorBarsViewModel,
  renderFlavorBarsHtml,
} from '../presentation/flavor-profile.ts';
import { buildReviewDisplay, renderStarGlyphs } from '../presentation/review-display.ts';
import { renderFoodIconHtml } from './food-icon.ts';
import { mountFloorServiceHud } from './FloorServiceHud.ts';
import { mountCelebrationBanner } from './CelebrationBanner.ts';
import { worldToScreen } from '../../canvas/coordinates.ts';

const SERVE_LOCK_MS = 300;
const LONG_PRESS_MS = 450;

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
  _canvasMount: HTMLElement,
): () => void {
  statusMount.innerHTML = `
    <div class="game-hud" id="game-hud" data-testid="game-hud"></div>
  `;
  overlayMount.innerHTML = `
    <div class="service-overlay" id="service-overlay" data-testid="service-overlay" hidden></div>
    <div class="modal-backdrop" id="ceremony-modal" data-testid="ceremony-modal" hidden></div>
  `;

  const hud = statusMount.querySelector('#game-hud') as HTMLElement;
  const serviceOverlay = overlayMount.querySelector('#service-overlay') as HTMLElement;
  const ceremonyModal = overlayMount.querySelector('#ceremony-modal') as HTMLElement;

  const cleanupCelebrationBanner = mountCelebrationBanner(overlayMount);
  // Tickets dock must live under overlay-mount so it stacks above the cooking panel.
  const cleanupFloorHud = mountFloorServiceHud(chromeMount, overlayMount);

  let serveLockedUntil = 0;
  let bubbleEl: HTMLElement | null = null;

  const renderHud = () => {
    const state = useGameStore.getState();
    hud.innerHTML = `
      <div class="hud-stat" aria-label="Cash">
        <span>Cash</span>
        <strong>$${state.cash.toLocaleString('en-US')}</strong>
      </div>
      <div class="hud-stat" aria-label="Restaurant rating">
        <span>Rating</span>
        <strong>${state.rating.toFixed(1)}★</strong>
      </div>
      <div class="hud-stat" aria-label="Prestige">
        <span>Prestige</span>
        <strong>P${state.prestige}</strong>
      </div>
      <div class="hud-stat" aria-label="Day">
        <span>Day</span>
        <strong>${state.day}</strong>
      </div>
    `;
  };

  const positionChatBubble = () => {
    if (!bubbleEl) return;
    const app = getRestaurantApp();
    if (!app) return;
    const anchor = app.getCustomerScreenAnchor();
    if (!anchor) {
      bubbleEl.hidden = true;
      return;
    }
    bubbleEl.hidden = false;
    bubbleEl.style.left = `${anchor.x}px`;
    bubbleEl.style.top = `${anchor.y}px`;
  };

  const renderChatBubble = () => {
    const state = useGameStore.getState();
    const customer = selectCurrentCustomer(state);
    const showBubble =
      state.activeDay &&
      state.modifierDismissed &&
      customer &&
      !state.pendingReview &&
      selectIsAwaitingServe(state);

    if (!showBubble || !customer) {
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

    bubbleEl.textContent = formatCustomerRequestText(customer.preference);
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

    ceremonyModal.querySelector('#dismiss-ceremony')?.addEventListener('click', () => {
      useGameStore.getState().dismissCeremony();
    }, { once: true });
  };

  const renderServiceOverlay = () => {
    const state = useGameStore.getState();

    if (!selectShowServiceDayOverlay(state)) {
      serviceOverlay.hidden = true;
      serviceOverlay.innerHTML = '';
      return;
    }

    if (state.daySummary) {
      const masteryLine =
        'masteryLine' in state.daySummary ? state.daySummary.masteryLine : null;
      serviceOverlay.hidden = false;
      serviceOverlay.innerHTML = `
        <div class="service-panel">
          <div class="service-card">
            <h2 class="service-title" data-testid="day-summary-title">Day Summary</h2>
            <p class="review-detail">${state.daySummary.earningsLine}</p>
            ${state.daySummary.bonusLine ? `<p class="review-detail review-positive">${state.daySummary.bonusLine}</p>` : ''}
            ${'volumeBonusLine' in state.daySummary && state.daySummary.volumeBonusLine ? `<p class="review-detail review-positive" data-testid="summary-volume-bonus">${state.daySummary.volumeBonusLine}</p>` : ''}
            <p class="review-detail">${state.daySummary.averageMatchText}</p>
            <p class="review-detail">${state.daySummary.ratingDeltaText}</p>
            <p class="review-detail">${state.daySummary.unlockProgressText}</p>
            <p class="review-detail">${state.daySummary.customersServedText}</p>
            ${masteryLine ? `<p class="review-detail review-positive" data-testid="summary-mastery">${masteryLine}</p>` : ''}
            <div class="service-actions">
              <button type="button" class="service-btn" id="summary-back-floor" data-testid="summary-back-floor">Back to floor</button>
              <button type="button" class="service-btn primary" id="summary-visit-shop" data-testid="summary-visit-shop">Visit shop</button>
            </div>
          </div>
        </div>
      `;
      serviceOverlay.querySelector('#summary-back-floor')?.addEventListener('click', () => {
        const store = useGameStore.getState();
        store.dismissDaySummary();
        store.navigateTo('restaurant');
      }, { once: true });
      serviceOverlay.querySelector('#summary-visit-shop')?.addEventListener('click', () => {
        const store = useGameStore.getState();
        store.dismissDaySummary();
        store.navigateTo('shop');
      }, { once: true });
      return;
    }

    if (selectShowOpenForService(state)) {
      serviceOverlay.hidden = false;
      serviceOverlay.innerHTML = `
        <div class="service-panel">
          <div class="service-card">
            <h2 class="service-title">Open for service?</h2>
            <p class="service-subtitle">Set tables, seat guests from the door, cook at the station, and deliver.</p>
            <div class="service-actions">
              <button type="button" class="service-btn primary" id="open-day-btn" data-testid="open-day-btn">Open Restaurant</button>
              <button type="button" class="service-btn" id="edit-restaurant-btn" data-testid="edit-restaurant-btn">Edit Restaurant</button>
            </div>
          </div>
        </div>
      `;
      serviceOverlay.querySelector('#open-day-btn')?.addEventListener('click', () => {
        useGameStore.getState().dispatch({ type: 'OPEN_DAY' });
      }, { once: true });
      serviceOverlay.querySelector('#edit-restaurant-btn')?.addEventListener('click', () => {
        const store = useGameStore.getState();
        if (!store.editLayoutMode) store.toggleEditLayout();
      }, { once: true });
      return;
    }

    if (!state.activeDay) {
      serviceOverlay.hidden = true;
      serviceOverlay.innerHTML = '';
      return;
    }

    if (!state.modifierDismissed) {
      const modifier = selectActiveModifier(state);
      serviceOverlay.hidden = false;
      serviceOverlay.innerHTML = `
        <div class="service-panel">
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
      serviceOverlay.querySelector('#start-service-btn')?.addEventListener('click', () => {
        useGameStore.getState().dismissModifier();
      }, { once: true });
      return;
    }

    if (state.pendingReview) {
      const review = buildReviewDisplay(state.pendingReview);
      const progress = selectQueueProgress(state);
      const canClose = selectCanCloseDay(state);
      const canAdvance = selectCanAdvanceCustomer(state) && !state.activeDay?.floor;
      const floorActive = Boolean(state.activeDay?.floor);
      serviceOverlay.hidden = false;
      serviceOverlay.innerHTML = `
        <div class="service-panel">
          <div class="service-card">
            <h2 class="service-title">Customer Review</h2>
            ${progress && !floorActive ? `<p class="queue-badge">Customer ${progress.current} of ${progress.total}</p>` : ''}
            <p class="review-stars" data-testid="review-stars" aria-label="${review.starsText}">${renderStarGlyphs(review.starsFilled)}</p>
            <p class="review-detail" data-testid="review-score">${review.starsText}</p>
            <p class="review-detail">Tip: ${review.tipText}</p>
            <p class="review-detail ${review.ratingDeltaPositive ? 'review-positive' : 'review-negative'}">Rating ${review.ratingDeltaText}</p>
            ${review.recipeLine ? `<p class="review-detail review-positive">${review.recipeLine}</p>` : ''}
            ${review.masteryLine ? `<p class="review-detail review-positive" data-testid="review-mastery">${review.masteryLine}</p>` : ''}
            <div class="service-actions">
              ${
                canClose
                  ? '<button type="button" class="service-btn primary" id="close-day-btn" data-testid="close-day-btn">Close Day</button>'
                  : canAdvance
                    ? '<button type="button" class="service-btn primary" id="next-customer-btn" data-testid="next-customer-btn">Next Customer</button>'
                    : floorActive
                      ? '<button type="button" class="service-btn primary" id="continue-service-btn" data-testid="continue-service-btn">Continue service</button>'
                      : ''
              }
            </div>
          </div>
        </div>
      `;
      serviceOverlay.querySelector('#next-customer-btn')?.addEventListener('click', () => {
        useGameStore.getState().dispatch({ type: 'NEXT_CUSTOMER' });
      }, { once: true });
      serviceOverlay.querySelector('#close-day-btn')?.addEventListener('click', () => {
        useGameStore.getState().dispatch({ type: 'CLOSE_DAY' });
      }, { once: true });
      serviceOverlay.querySelector('#continue-service-btn')?.addEventListener('click', () => {
        const store = useGameStore.getState() as {
          dismissPendingReview?: () => void;
        };
        if (typeof store.dismissPendingReview === 'function') {
          store.dismissPendingReview();
        } else {
          useGameStore.setState({ pendingReview: null });
        }
      }, { once: true });
      return;
    }

    if (selectShowFloorCompose(state)) {
      const draftIds = selectComposeDraftIds(state);
      const ctx = getDomainContext();
      const preview = computeDishPreview(draftIds, ctx.ingredientsById);
      const ticket = selectFloorComposeTicket(state);
      const canPlate = preview.isValidCount && ticket && Date.now() >= serveLockedUntil;

      const ingredientButtons = state.unlockedIngredientIds
        .map((id) => {
          const item = ctx.ingredientsById.get(id);
          const selected = draftIds.includes(id);
          const toggle = canToggleIngredient(id, draftIds);
          const disabled = !selected && !toggle.allowed;
          return `<button type="button" class="ingredient-chip${selected ? ' selected' : ''}" data-ingredient-id="${id}" data-testid="ingredient-chip" ${disabled ? 'disabled' : ''} aria-pressed="${selected}">${renderFoodIconHtml(id, 24)}<span>${item?.name ?? id}</span></button>`;
        })
        .join('');

      const flavorPreview =
        preview.profile
          ? `<div class="flavor-preview flavor-preview-bars" aria-label="Dish flavor preview">${renderFlavorBarsHtml(
              buildFlavorBarsViewModel(preview.profile),
              { showValues: false },
            )}</div>`
          : '';

      let ticketBadge = '';
      if (ticket) {
        const guest = state.activeDay?.floor?.pool.find((g) => g.customer.id === ticket.customerId);
        const archetypeName = guest
          ? ctx.archetypes.find((a) => a.id === guest.customer.archetypeId)?.name
          : undefined;
        const label = formatFloorTicketLabel({
          ticket,
          customer: guest?.customer,
          archetypeName,
          partyNumber: 1,
          selected: true,
        });
        ticketBadge = `<p class="queue-badge">${escapeHtml(`${label.guestLabel} · ${label.statusLabel}`)}</p>`;
      }

      serviceOverlay.hidden = false;
      serviceOverlay.innerHTML = `
        <div class="service-panel">
          <div class="service-card">
            <h2 class="service-title">Plate Dish</h2>
            ${ticketBadge}
            <p class="compose-meta">Pick ${MIN_DISH_INGREDIENTS}–${MAX_DISH_INGREDIENTS} ingredients (${preview.ingredientCount} selected)</p>
            <div class="ingredient-grid" role="group" aria-label="Unlocked ingredients">${ingredientButtons}</div>
            ${flavorPreview}
            <div class="service-actions">
              <button type="button" class="service-btn primary" id="plate-btn" data-testid="plate-btn" ${canPlate ? '' : 'disabled'}>Plate</button>
            </div>
          </div>
        </div>
      `;

      serviceOverlay.querySelectorAll<HTMLButtonElement>('[data-ingredient-id]').forEach((button) => {
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

      serviceOverlay.querySelector('#plate-btn')?.addEventListener('click', () => {
        if (Date.now() < serveLockedUntil) return;
        const current = useGameStore.getState();
        const activeTicket = selectFloorComposeTicket(current);
        if (!activeTicket) return;
        serveLockedUntil = Date.now() + SERVE_LOCK_MS;
        const ids = selectComposeDraftIds(current);
        void current.dispatch({
          type: 'FLOOR_PLATE',
          ticketId: activeTicket.id,
          ingredientIds: ids,
        });
      }, { once: true });
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
          return `<button type="button" class="ingredient-chip${selected ? ' selected' : ''}" data-ingredient-id="${id}" data-testid="ingredient-chip" ${disabled ? 'disabled' : ''} aria-pressed="${selected}">${renderFoodIconHtml(id, 24)}<span>${item?.name ?? id}</span></button>`;
        })
        .join('');

      const flavorPreview =
        preview.profile
          ? `<div class="flavor-preview flavor-preview-bars" aria-label="Dish flavor preview">${renderFlavorBarsHtml(
              buildFlavorBarsViewModel(preview.profile),
              { showValues: false },
            )}</div>`
          : '';

      serviceOverlay.hidden = false;
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

      serviceOverlay.querySelectorAll<HTMLButtonElement>('[data-ingredient-id]').forEach((button) => {
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

      serviceOverlay.querySelector('#serve-btn')?.addEventListener('click', () => {
        if (Date.now() < serveLockedUntil) return;
        serveLockedUntil = Date.now() + SERVE_LOCK_MS;
        const ids = selectComposeDraftIds(useGameStore.getState());
        useGameStore.getState().dispatch({ type: 'SERVE_DISH', ingredientIds: ids });
      }, { once: true });
      return;
    }

    serviceOverlay.hidden = true;
    serviceOverlay.innerHTML = '';
  };

  const sync = () => {
    renderHud();
    renderCeremony();
    renderServiceOverlay();
    renderChatBubble();
  };

  const unsubscribe = useGameStore.subscribe((state, prev) => {
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
      state.composeDraftIngredientIds !== prev.composeDraftIngredientIds ||
      state.activeDay?.queueIndex !== prev.activeDay?.queueIndex ||
      state.activeDay?.floor !== prev.activeDay?.floor ||
      state.floorPlayerGrid !== prev.floorPlayerGrid;

    if (domainChanged) {
      sync();
    }
  });

  window.addEventListener('resize', positionChatBubble);
  const onFoodAtlas = () => sync();
  window.addEventListener('food-atlas-ready', onFoodAtlas);
  sync();

  return () => {
    unsubscribe();
    cleanupCelebrationBanner();
    cleanupFloorHud();
    window.removeEventListener('resize', positionChatBubble);
    window.removeEventListener('food-atlas-ready', onFoodAtlas);
    bubbleEl?.remove();
    statusMount.innerHTML = '';
    overlayMount.innerHTML = '';
  };
}

export function computeBubbleAnchorFromWorld(
  worldX: number,
  worldY: number,
  camera: { x: number; y: number; scale: number; stageOffsetX: number; stageOffsetY: number },
  canvasRect: DOMRect,
): { x: number; y: number } {
  const screen = worldToScreen(worldX, worldY, camera);
  return {
    x: canvasRect.left + screen.x,
    y: canvasRect.top + screen.y - 8,
  };
}
