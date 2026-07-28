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
import { computeWeightedSatisfaction } from '../../domain/flavor/scoring.ts';
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
import {
  buildReviewDisplay,
  formatReviewModifierLine,
  renderStarGlyphs,
} from '../presentation/review-display.ts';
import { prestigeRatingDeltaMultiplier } from '../../domain/balance/prestige-pacing.ts';
import {
  bandLabel,
  clearComposeAxes,
  clearComposeNameQuery,
  composePantrySummary,
  type ComposeAxisBands,
  emptyComposePantryFilters,
  filterComposePantry,
  setComposeNameQuery,
  toggleComposeAxis,
} from '../presentation/compose-pantry.ts';
import { resolveIdealFlavorProfile } from '../presentation/ideal-flavor.ts';
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
  let composeFilters = emptyComposePantryFilters();
  let composeWasVisible = false;
  let composeTicketId: string | null = null;
  let composeFocusReturn: HTMLElement | null = null;

  const resetComposeFilters = () => {
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
    syncStatusHudHeight();
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
    const nextComposeTicketId = composeVisible
      ? (selectFloorComposeTicket(state)?.id ?? null)
      : null;

    if (composeOpenedNow) {
      composeFocusReturn =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
      resetComposeFilters();
    } else if (!composeVisible && composeWasVisible) {
      resetComposeFilters();
      queueMicrotask(focusFloorAfterCompose);
    } else if (
      composeVisible &&
      composeTicketId !== null &&
      nextComposeTicketId !== composeTicketId
    ) {
      resetComposeFilters();
    }
    composeWasVisible = composeVisible;
    composeTicketId = nextComposeTicketId;

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
        <div class="service-panel sheet-tier-near-full" data-testid="day-summary-sheet">
          <div class="service-card sheet-card-layout">
            <header class="sheet-header">
              <h2 class="service-title" data-testid="day-summary-title">Day Summary</h2>
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
            <footer class="sheet-footer service-actions">
              <button type="button" class="service-btn" id="summary-back-floor" data-testid="summary-back-floor">Back to floor</button>
              <button type="button" class="service-btn primary" id="summary-visit-shop" data-testid="summary-visit-shop">Visit shop</button>
            </footer>
          </div>
        </div>
      `;
      serviceOverlay.querySelector('#summary-back-floor')?.addEventListener(
        'click',
        () => {
          const store = useGameStore.getState();
          store.dismissDaySummary();
          store.navigateTo('restaurant');
        },
        { once: true },
      );
      serviceOverlay.querySelector('#summary-visit-shop')?.addEventListener(
        'click',
        () => {
          const store = useGameStore.getState();
          store.dismissDaySummary();
          store.navigateTo('shop');
        },
        { once: true },
      );
      return;
    }

    if (selectShowOpenForService(state)) {
      serviceOverlay.hidden = false;
      serviceOverlay.innerHTML = `
        <div class="service-panel sheet-tier-compact" data-testid="open-service-sheet">
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
        },
        { once: true },
      );
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
      serviceOverlay.hidden = false;
      serviceOverlay.innerHTML = `
        <div class="service-panel sheet-tier-mid" data-testid="review-sheet">
          <div class="service-card sheet-card-layout">
            <header class="sheet-header">
              <h2 class="service-title">Customer Review</h2>
            </header>
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
      const requestMatch =
        preview.profile && ticketGuest
          ? 10 *
            computeWeightedSatisfaction(
              preview.profile,
              ticketGuest.customer.preference,
            )
          : null;
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
          return '<p class="compose-empty" data-testid="compose-empty">No ingredients match. Clear a filter to see more.</p>';
        }
        return matches
          .map((item) => {
            const selected = currentDraft.includes(item.id);
            const toggle = canToggleIngredient(item.id, currentDraft);
            const disabled = !selected && !toggle.allowed;
            const name = escapeHtml(item.name);
            return `<button type="button" class="ingredient-chip${selected ? ' selected' : ''}" data-compose-ingredient-id="${item.id}" data-testid="ingredient-chip" ${disabled ? 'disabled' : ''} aria-label="${name}" title="${name}" aria-pressed="${selected}">${renderFoodIconHtml(item.id, 24)}<span>${name}</span></button>`;
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
      const axisChips = orderedFilterAxes.map((axis) => {
        const selected = composeFilters.selectedAxes.includes(axis);
        const band = requestedBands[axis];
        const label = band
          ? `${bandLabel(band)} ${AXIS_LABELS[axis]}`
          : AXIS_LABELS[axis];
        return `<button type="button" class="filter-axis-chip${selected ? ' selected' : ''}${band ? ' requested' : ''}" data-compose-axis="${axis}" aria-pressed="${selected}" title="${band ? 'Filters ingredients that contribute to this request' : `Filters ingredients with ${AXIS_LABELS[axis]}`}">${escapeHtml(label)}</button>`;
      }).join('');

      const matchingCount = filterComposePantry(
        unlocked,
        composeFilters,
        requestedBands,
      ).length;
      const flavorPreview = buildFlavorBarsViewModel(
        preview.profile ?? emptyFlavorProfile(),
      ).axes
        .map(
          (axis) => `<div class="compose-flavor-mini">
                <span>${escapeHtml(axis.label)}</span>
                <span class="compose-flavor-mini-track" role="meter" aria-label="${escapeHtml(axis.label)}" aria-valuemin="0" aria-valuemax="${axis.max}" aria-valuenow="${axis.value}">
                  <span class="compose-flavor-mini-fill" style="width:${Math.min(100, Math.max(0, (axis.value / axis.max) * 100)).toFixed(1)}%"></span>
                </span>
                <span class="compose-flavor-mini-value">${axis.displayValue}</span>
              </div>`,
        )
        .join('');

      let ticketBadge = '';
      let orderPanel = '';
      if (ticket) {
        const archetypeName = ticketGuest
          ? ctx.archetypes.find((a) => a.id === ticketGuest.customer.archetypeId)
              ?.name
          : undefined;
        const label = formatFloorTicketLabel({
          ticket,
          customer: ticketGuest?.customer,
          archetypeName,
          partyNumber:
            (state.activeDay?.floor?.pool.findIndex(
              (guest) => guest.customer.id === ticket.customerId,
            ) ?? 0) + 1,
          selected: true,
        });
        ticketBadge = `<p class="queue-badge">${escapeHtml(label.guestLabel)}</p>`;

        if (ticketGuest) {
          const preference = ticketGuest.customer.preference;
          const ideal = resolveIdealFlavorProfile(preference);
          const requestText = formatCustomerRequestText(preference);
          const requestRows = requestedAxes
            .map((axis) => {
              const band = requestedBands[axis]!;
              const targetValue = ideal[axis];
              const currentValue = preview.profile?.[axis] ?? 0;
              return `<div class="compose-request-axis" data-testid="compose-request-axis">
                <div class="compose-request-axis-head">
                  <strong>${escapeHtml(`${bandLabel(band)} ${AXIS_LABELS[axis]}`)}</strong>
                  <span>${currentValue.toFixed(1)} dish · ${targetValue.toFixed(1)} target</span>
                </div>
                <div class="compose-request-bars">
                  <span class="compose-request-bar target" title="Achievable target ${targetValue.toFixed(1)}">
                    <span style="width:${Math.min(100, Math.max(0, targetValue * 10)).toFixed(1)}%"></span>
                  </span>
                  <span class="compose-request-bar current" title="Current dish ${currentValue.toFixed(1)}">
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
            <div class="compose-request-axis-list">${requestRows}</div>
          </aside>`;
        }
      }

      serviceOverlay.hidden = false;
      serviceOverlay.innerHTML = `
        <div class="service-panel sheet-tier-near-full" data-testid="compose-sheet" role="dialog" aria-labelledby="compose-title">
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
              <div class="compose-axis-row">
                <button type="button" class="filter-axis-chip${composeFilters.selectedAxes.length === 0 ? ' selected' : ''}" data-compose-all aria-pressed="${composeFilters.selectedAxes.length === 0}">All</button>
                ${axisChips}
              </div>
              <div class="compose-search-row">
                <label class="compose-search-field">
                  <span class="sr-only">Search ingredients by name</span>
                  <input type="search" class="compose-search-input" data-testid="compose-search" placeholder="Search ingredients" autocomplete="off" value="${escapeHtml(composeFilters.nameQuery)}" />
                </label>
                <button type="button" class="compose-search-clear" data-testid="compose-search-clear" ${composeFilters.nameQuery ? '' : 'hidden'}>Clear</button>
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
                <span>${requestMatch === null ? `Pick ${MIN_DISH_INGREDIENTS}–${MAX_DISH_INGREDIENTS} ingredients` : `Current request match ${requestMatch.toFixed(1)} / 10`}</span>
              </div>
              <div class="compose-flavor-strip" aria-label="Dish flavor preview">${flavorPreview}</div>
              <button type="button" class="service-btn primary" id="plate-btn" data-testid="plate-btn" ${canPlate ? '' : 'disabled'}>Plate</button>
            </footer>
          </div>
        </div>
      `;

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
              const currentDraft = selectComposeDraftIds(
                useGameStore.getState(),
              );
              const toggle = canToggleIngredient(id, currentDraft);
              if (!toggle.allowed) return;
              void useGameStore.getState().dispatch({
                type: 'SET_COMPOSE_DRAFT',
                ingredientIds: toggle.nextIds,
              });
            });
          });
      };

      const updateFilterUi = () => {
        const pantry = serviceOverlay.querySelector<HTMLElement>(
          '[data-testid="compose-pantry"] .ingredient-grid',
        );
        const summary = serviceOverlay.querySelector(
          '[data-testid="compose-filter-summary"]',
        );
        const clear = serviceOverlay.querySelector<HTMLButtonElement>(
          '[data-testid="compose-search-clear"]',
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
        if (summary) {
          summary.textContent = composePantrySummary(
            composeFilters,
            count,
            requestedBands,
          );
        }
        if (clear) clear.hidden = composeFilters.nameQuery.length === 0;
        serviceOverlay
          .querySelector<HTMLButtonElement>('[data-compose-all]')
          ?.setAttribute(
            'aria-pressed',
            String(composeFilters.selectedAxes.length === 0),
          );
        serviceOverlay
          .querySelector<HTMLButtonElement>('[data-compose-all]')
          ?.classList.toggle(
            'selected',
            composeFilters.selectedAxes.length === 0,
          );
        serviceOverlay
          .querySelectorAll<HTMLButtonElement>('[data-compose-axis]')
          .forEach((button) => {
            const selected = composeFilters.selectedAxes.includes(
              button.dataset.composeAxis as AxisKey,
            );
            button.classList.toggle('selected', selected);
            button.setAttribute('aria-pressed', String(selected));
          });
      };

      bindIngredientButtons(serviceOverlay);
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

      serviceOverlay
        .querySelector('[data-compose-all]')
        ?.addEventListener('click', () => {
          composeFilters = clearComposeAxes(composeFilters);
          updateFilterUi();
        });

      const searchInput = serviceOverlay.querySelector<HTMLInputElement>(
        '[data-testid="compose-search"]',
      );
      searchInput?.addEventListener('input', () => {
        composeFilters = setComposeNameQuery(composeFilters, searchInput.value);
        updateFilterUi();
      });
      serviceOverlay
        .querySelector('[data-testid="compose-search-clear"]')
        ?.addEventListener('click', () => {
          composeFilters = clearComposeNameQuery(composeFilters);
          if (searchInput) searchInput.value = '';
          updateFilterUi();
          searchInput?.focus({ preventScroll: true });
        });

      serviceOverlay.querySelector('#plate-btn')?.addEventListener(
        'click',
        () => {
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
        },
        { once: true },
      );
      if (composeOpenedNow) {
        queueMicrotask(() => {
          serviceOverlay
            .querySelector<HTMLElement>('[data-testid="compose-search"]')
            ?.focus({ preventScroll: true });
        });
      }
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

      const flavorPreview = preview.profile
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

    serviceOverlay.hidden = true;
    serviceOverlay.innerHTML = '';
  };

  const sync = () => {
    renderHud();
    renderCeremony();
    renderServiceOverlay();
    renderChatBubble();
  };

  const onComposeKeydown = (event: KeyboardEvent) => {
    if (event.key !== 'Escape') return;
    const state = useGameStore.getState();
    if (state.flavorInspectorIngredientId || !selectShowFloorCompose(state)) {
      return;
    }
    event.preventDefault();
    state.closeComposeSheet();
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
