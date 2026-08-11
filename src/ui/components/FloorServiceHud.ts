import {
  isTutorialSkipped,
  nextTutorialStep,
  tutorialPrompt,
  type TutorialStepId,
} from '../../domain/floor/tutorial.ts';
import type { FloorDay } from '../../domain/floor/types.ts';
import { getDomainContext } from '../../app/content-loader.ts';
import { useGameStore } from '../../store/game-store.ts';
import {
  selectAdjacentDirtyTablePlacementIds,
  selectAdjacentSeatedCustomerIds,
  selectAdjacentUnsetTablePlacementIds,
  selectCanClearFloorTable,
  selectCanCloseDay,
  selectCanRequestSeatFloorGuest,
  selectCanSetFloorTable,
  selectCanTakeFloorOrders,
} from '../../store/selectors/service-day.ts';
import type { RestaurantApp } from '../../canvas/RestaurantApp.ts';
import {
  formatFloorTicketLabel,
  renderFloorTicketOrderCuesHtml,
} from '../presentation/floor-ticket.ts';
import { buildFloorTicketPanelViewModel } from '../presentation/floor-ticket-panel.ts';
import { renderGuestPortraitHtml } from '../presentation/guest-portrait.ts';
import {
  buildFlavorBarsViewModel,
  IDEAL_FLAVOR_GROUP_ORDER,
  renderFlavorBarsHtml,
} from '../presentation/flavor-profile.ts';
import { resolveIdealFlavorProfile } from '../presentation/ideal-flavor.ts';
import { notifyNotificationBlockingSurfaceChanged } from '../notifications/blocking-surface.ts';
import { bindFloorActionsToolbar } from '../presentation/floor-action-keyboard.ts';
import {
  FLOOR_CTA_MIN_IN_FLIGHT_MS,
  floorActionIconHtml,
  readFloorCanvasInFlight,
  renderFloorActionLabelHtml,
  resolveFloorCtaInFlight,
  type FloorCtaAction,
} from '../presentation/floor-action-feedback.ts';

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

type TicketsPanelView = 'order' | 'ideal';

type DockFocusIdentity =
  | { kind: 'toggle' }
  | { kind: 'close' }
  | { kind: 'tab'; view: TicketsPanelView }
  | { kind: 'ticket'; ticketId: string };

const ORDER_TAB_ID = 'floor-tickets-tab-order';
const IDEAL_TAB_ID = 'floor-tickets-tab-ideal';
const ORDER_PANEL_ID = 'floor-tickets-panel-order';
const IDEAL_PANEL_ID = 'floor-tickets-panel-ideal';

export function buildFloorTutorialNotice(
  floor: FloorDay,
  step: TutorialStepId | null,
  prompt: string | null,
): { id: string; body: string } | null {
  if (!step) return null;
  const entryStage = floor.pool.find(
    (guest) =>
      guest.stage === 'entering' ||
      guest.stage === 'waiting' ||
      guest.stage === 'seating',
  )?.stage;
  const body =
    step === 'wait_seat' && entryStage === 'entering'
      ? 'The first guest is arriving…'
      : step === 'wait_seat' && entryStage === 'waiting'
        ? 'Seat the waiting guest.'
      : step === 'wait_seat' && entryStage === 'seating'
        ? 'Guest is heading to the table…'
        : prompt;
  if (!body) return null;
  return {
    id:
      step === 'wait_seat' && entryStage
        ? `tutorial:${step}:${entryStage}`
        : `tutorial:${step}`,
    body,
  };
}

/**
 * Quiet, non-queued floor guidance for the chrome hint line. Skipped day-1
 * tutorial never returns copy; day>1 keeps a single persistent status line.
 */
export function resolveFloorHudHint(input: {
  day: number;
  rating: number;
  prestige: number;
  floor: FloorDay;
  tutorialSkipped?: boolean;
}): string | null {
  if (input.tutorialSkipped ?? isTutorialSkipped()) return null;

  const step = nextTutorialStep(input.floor, input.day === 1);
  const prompt = tutorialPrompt(step);
  const tutorial = buildFloorTutorialNotice(input.floor, step, prompt);
  if (tutorial) return tutorial.body;

  const initialGuestArriving =
    input.floor.pool.some((guest) => guest.stage === 'entering') &&
    !input.floor.pool.some(
      (guest) => guest.stage !== 'queued' && guest.stage !== 'entering',
    );
  if (initialGuestArriving) return 'The first guest is arriving…';

  if (input.day > 1) {
    return `Day ${input.day} · ${input.rating.toFixed(1)}★ · P${input.prestige} — match tastes, grow mastery`;
  }
  return null;
}

export function mountFloorServiceHud(
  chromeMount: HTMLElement,
  /** Host above the cooking overlay stacking context (typically overlay-mount). */
  ticketsHost: HTMLElement,
  getRestaurantApp: () => RestaurantApp | null,
): () => void {
  let ticketsMenuOpen = false;
  let ticketsPanelView: TicketsPanelView = 'order';
  let knownTicketIds = new Set(
    useGameStore
      .getState()
      .activeDay?.floor?.tickets.map((ticket) => ticket.id) ?? [],
  );
  const arrivingTicketIds = new Set<string>();
  const arrivalTimers = new Set<ReturnType<typeof setTimeout>>();
  let knownCarriedTicketId: string | null =
    useGameStore.getState().activeDay?.floor?.carriedTicketId ?? null;
  let unbindFloorActionsKeyboard: (() => void) | null = null;
  /** Presentation-only: which primary CTA was just invoked while walk/settle runs. */
  let pendingFloorAction:
    | 'set-table'
    | 'seat'
    | 'take-orders'
    | 'clear'
    | null = null;
  let pendingFloorActionStartedAt = 0;
  let pendingFloorActionTimer: ReturnType<typeof setTimeout> | null = null;
  let seatActionSawSeating = false;

  const clearPendingFloorActionTimer = () => {
    if (pendingFloorActionTimer) {
      clearTimeout(pendingFloorActionTimer);
      pendingFloorActionTimer = null;
    }
  };

  const beginPendingFloorAction = (
    action: Exclude<FloorCtaAction, 'close-day' | 'deliver'>,
  ) => {
    pendingFloorAction = action;
    pendingFloorActionStartedAt = performance.now();
    seatActionSawSeating = action === 'seat' ? false : seatActionSawSeating;
    clearPendingFloorActionTimer();
    pendingFloorActionTimer = setTimeout(() => {
      pendingFloorActionTimer = null;
      render();
    }, FLOOR_CTA_MIN_IN_FLIGHT_MS + 16);
  };

  const dock = document.createElement('div');
  dock.className = 'floor-tickets-dock';
  dock.dataset.testid = 'floor-tickets-dock';
  dock.hidden = true;
  ticketsHost.appendChild(dock);

  const captureDockFocus = (): DockFocusIdentity | null => {
    const active = document.activeElement;
    if (!(active instanceof HTMLElement) || !dock.contains(active)) return null;
    if (active.matches('[data-testid="floor-tickets-toggle"]')) {
      return { kind: 'toggle' };
    }
    if (active.matches('[data-testid="floor-tickets-close"]')) {
      return { kind: 'close' };
    }
    const tabView = active.dataset.ticketsView;
    if (tabView === 'order' || tabView === 'ideal') {
      return { kind: 'tab', view: tabView };
    }
    const ticketId = active.dataset.menuTicketId;
    return ticketId ? { kind: 'ticket', ticketId } : null;
  };

  const restoreDockFocus = (identity: DockFocusIdentity | null) => {
    if (!identity) return;
    const target =
      identity.kind === 'toggle'
        ? dock.querySelector<HTMLElement>(
            '[data-testid="floor-tickets-toggle"]',
          )
        : identity.kind === 'close'
          ? dock.querySelector<HTMLElement>(
              '[data-testid="floor-tickets-close"]',
            )
          : identity.kind === 'tab'
            ? dock.querySelector<HTMLElement>(
                `[data-tickets-view="${identity.view}"]`,
              )
            : dock.querySelector<HTMLElement>(
                `[data-menu-ticket-id="${CSS.escape(identity.ticketId)}"]`,
              );
    (
      target ??
      dock.querySelector<HTMLElement>('[data-testid="floor-tickets-toggle"]')
    )?.focus({ preventScroll: true });
  };

  const onDocumentPointer = (event: PointerEvent) => {
    if (!ticketsMenuOpen) return;
    const target = event.target as Node | null;
    if (target && dock.contains(target)) return;
    ticketsMenuOpen = false;
    // Close in place during the capture phase. Rebuilding chrome here would
    // remove an outside floor-action target before its click can fire.
    const menu = dock.querySelector<HTMLElement>('#floor-tickets-menu');
    const toggle = dock.querySelector<HTMLElement>('#floor-tickets-toggle');
    if (menu) menu.hidden = true;
    toggle?.setAttribute('aria-expanded', 'false');
    notifyNotificationBlockingSurfaceChanged();
  };

  const onDocumentKeydown = (event: KeyboardEvent) => {
    if (!ticketsMenuOpen || event.key !== 'Escape') return;
    event.preventDefault();
    ticketsMenuOpen = false;
    render({ kind: 'toggle' });
  };

  document.addEventListener('pointerdown', onDocumentPointer, true);
  document.addEventListener('keydown', onDocumentKeydown);

  const render = (focusAfter?: DockFocusIdentity | null) => {
    const focusIdentity =
      focusAfter === undefined ? captureDockFocus() : focusAfter;
    const state = useGameStore.getState();
    const floor = state.activeDay?.floor;
    const reserveChrome = () => {
      unbindFloorActionsKeyboard?.();
      unbindFloorActionsKeyboard = null;
      chromeMount.hidden = false;
      chromeMount.style.visibility = 'hidden';
      chromeMount.inert = true;
      chromeMount.setAttribute('aria-hidden', 'true');
      if (!chromeMount.firstElementChild) {
        chromeMount.innerHTML = `
          <div class="floor-service-panel floor-service-panel--reserve"></div>
        `;
      }
      dock.hidden = true;
      dock.innerHTML = '';
      ticketsMenuOpen = false;
      notifyNotificationBlockingSurfaceChanged();
    };
    // Keep the chrome strip mounted for the whole floor day (including review /
    // summary popups) so canvas height does not jump when overlays open.
    if (!floor && state.daySummary) {
      state.syncFloorNoticesFromHud({ sticky: null, pacing: null });
      reserveChrome();
      return;
    }

    if (!floor) {
      state.syncFloorNoticesFromHud({ sticky: null, pacing: null });
      chromeMount.hidden = true;
      chromeMount.style.removeProperty('visibility');
      chromeMount.inert = false;
      chromeMount.removeAttribute('aria-hidden');
      chromeMount.innerHTML = '';
      dock.hidden = true;
      dock.innerHTML = '';
      ticketsMenuOpen = false;
      ticketsPanelView = 'order';
      notifyNotificationBlockingSurfaceChanged();
      return;
    }

    chromeMount.hidden = false;
    const interactive =
      state.modifierDismissed &&
      !state.daySummary &&
      !state.pendingReview &&
      !state.ceremony;

    if (!interactive) {
      // Blocking sheets pause the shared notice surface. Keep the last HUD
      // pacing identity so closing a temporary sheet does not replay a cue
      // that already completed for the same gameplay state.
      reserveChrome();
      return;
    }
    chromeMount.style.removeProperty('visibility');
    chromeMount.inert = false;
    chromeMount.removeAttribute('aria-hidden');
    dock.hidden = false;
    const canSetTable = selectCanSetFloorTable(state);
    const canClearTable = selectCanClearFloorTable(state);
    const canCloseDay = selectCanCloseDay(state);
    const canRequestSeatGuest = selectCanRequestSeatFloorGuest(state);
    const canTakeOrders = selectCanTakeFloorOrders(state);
    const step = nextTutorialStep(floor, state.day === 1);
    const emphasize = (actionStep: typeof step, available: boolean) =>
      available && (step === null || step === actionStep);
    const emphasizeSetTable = emphasize('set_tables', canSetTable);
    const entryStage = floor.pool.find(
      (guest) =>
        guest.stage === 'entering' ||
        guest.stage === 'waiting' ||
        guest.stage === 'seating',
    )?.stage;
    const emphasizeSeatGuest =
      entryStage === 'waiting' &&
      emphasize('wait_seat', canRequestSeatGuest);
    const emphasizeTakeOrders = emphasize('take_orders', canTakeOrders);
    const emphasizeClearTable = emphasize('clear', canClearTable);
    const emphasizeCloseDay = emphasize('close', canCloseDay);
    const seatingInFlight = floor.pool.some(
      (guest) => guest.stage === 'seating',
    );
    const canvasBeat = readFloorCanvasInFlight(document);
    const minHoldElapsed =
      pendingFloorAction !== null &&
      performance.now() - pendingFloorActionStartedAt >=
        FLOOR_CTA_MIN_IN_FLIGHT_MS;

    const setTableFlight = resolveFloorCtaInFlight({
      action: 'set-table',
      pendingAction: pendingFloorAction,
      seatingInFlight,
      seatActionSawSeating,
      canvasBeat,
      actionCompleted: !canSetTable,
      minHoldElapsed,
    });
    const seatFlight = resolveFloorCtaInFlight({
      action: 'seat',
      pendingAction: pendingFloorAction,
      seatingInFlight,
      seatActionSawSeating,
      canvasBeat,
      actionCompleted: false,
      minHoldElapsed,
    });
    seatActionSawSeating = seatFlight.sawSeating;
    const takeOrdersFlight = resolveFloorCtaInFlight({
      action: 'take-orders',
      pendingAction: pendingFloorAction,
      seatingInFlight,
      seatActionSawSeating,
      canvasBeat,
      actionCompleted: !canTakeOrders,
      minHoldElapsed,
    });
    const clearFlight = resolveFloorCtaInFlight({
      action: 'clear',
      pendingAction: pendingFloorAction,
      seatingInFlight,
      seatActionSawSeating,
      canvasBeat,
      actionCompleted: !canClearTable,
      minHoldElapsed,
    });

    if (
      (pendingFloorAction === 'set-table' && setTableFlight.clearPending) ||
      (pendingFloorAction === 'take-orders' && takeOrdersFlight.clearPending) ||
      (pendingFloorAction === 'clear' && clearFlight.clearPending) ||
      (pendingFloorAction === 'seat' && seatFlight.clearPending)
    ) {
      pendingFloorAction = null;
      seatActionSawSeating = false;
      clearPendingFloorActionTimer();
    }

    const inFlightSetTable = setTableFlight.inFlight;
    const inFlightSeat = seatFlight.inFlight;
    const inFlightTakeOrders = takeOrdersFlight.inFlight;
    const inFlightClear = clearFlight.inFlight;
    const actionClass = (
      primary: boolean,
      inFlight: boolean,
    ): string => {
      const classes = ['service-btn'];
      if (primary) classes.push('primary');
      if (inFlight) classes.push('in-flight');
      return classes.join(' ');
    };
    const hudHint = resolveFloorHudHint({
      day: state.day,
      rating: state.rating,
      prestige: state.prestige,
      floor,
    });
    // Instructional copy stays on the quiet HUD hint line. Never cycle it
    // through the shared top banner (achievements / actionable toasts only).
    state.syncFloorNoticesFromHud({ sticky: null, pacing: null });

    const selectedTicketId = floor.selectedTicketId;
    const ctx = getDomainContext();
    const guestLabelByCustomerId: Record<string, string> = {};
    const ticketMeta = floor.tickets.map((t) => {
      const isOpen = t.status === 'open';
      const selected = isOpen && selectedTicketId === t.id;
      const guest = floor.pool.find((g) => g.customer.id === t.customerId);
      const archetypeName = guest
        ? ctx.archetypes.find((a) => a.id === guest.customer.archetypeId)?.name
        : undefined;
      const label = formatFloorTicketLabel({
        ticket: t,
        customer: guest?.customer,
        archetypeName,
        selected,
      });
      guestLabelByCustomerId[t.customerId] = label.guestLabel;
      return {
        ticket: t,
        isOpen,
        selected,
        label,
        customer: guest?.customer,
        guestId: guest?.id,
      };
    });
    const ticketPanel = buildFloorTicketPanelViewModel({
      tickets: floor.tickets,
      selectedTicketId,
      carriedTicketId: floor.carriedTicketId,
      guestLabelByCustomerId,
    });
    const ticketMetaById = new Map(
      ticketMeta.map((row) => [row.ticket.id, row] as const),
    );
    const capacityHelpId = 'floor-ticket-capacity-help';

    chromeMount.innerHTML = `
      <div class="floor-service-panel" data-testid="floor-service-panel">
        ${
          hudHint
            ? `<p class="hud-hint" data-testid="hud-hint" role="status" aria-live="polite">${escapeHtml(hudHint)}</p>`
            : ''
        }
        <div class="floor-actions-scroll">
          <div class="floor-actions">
            <button type="button" class="${actionClass(emphasizeSetTable, inFlightSetTable)}" id="floor-set-table" data-testid="floor-set-table" ${canSetTable ? '' : 'disabled'} ${inFlightSetTable ? 'aria-busy="true"' : ''}>${renderFloorActionLabelHtml('set-table', 'Set table')}</button>
            <button type="button" class="${actionClass(emphasizeSeatGuest, inFlightSeat)}" id="floor-seat-next" data-testid="floor-seat-next" ${canRequestSeatGuest ? '' : 'disabled'} ${inFlightSeat ? 'aria-busy="true"' : ''}>${renderFloorActionLabelHtml('seat', 'Seat guest')}</button>
            <button type="button" class="${actionClass(emphasizeTakeOrders, inFlightTakeOrders)}" id="floor-take-orders" data-testid="floor-take-orders" ${canTakeOrders ? '' : 'disabled'} ${ticketPanel.capacityFull ? `aria-describedby="${capacityHelpId}"` : ''} ${inFlightTakeOrders ? 'aria-busy="true"' : ''}>${renderFloorActionLabelHtml('take-orders', 'Take orders')}</button>
            <button type="button" class="${actionClass(emphasizeClearTable, inFlightClear)}" id="floor-clear-table" data-testid="floor-clear-table" ${canClearTable ? '' : 'disabled'} ${inFlightClear ? 'aria-busy="true"' : ''}>${renderFloorActionLabelHtml('clear', 'Clear table')}</button>
            <button type="button" class="${actionClass(emphasizeCloseDay, false)}" id="floor-close-day" data-testid="close-day-btn" ${canCloseDay ? '' : 'disabled aria-hidden="true" hidden'}>${renderFloorActionLabelHtml('close-day', 'Close Day')}</button>
          </div>
        </div>
        ${ticketPanel.capacityMessage ? `<p class="sr-only" id="${capacityHelpId}">${ticketPanel.capacityMessage}</p>` : ''}
      </div>
    `;

    const orderItems =
      ticketPanel.rows.length === 0
        ? `<li class="floor-tickets-empty" data-testid="floor-tickets-empty">No active tickets</li>`
        : ticketPanel.rows
            .map((row) => {
              const meta = ticketMetaById.get(row.ticketId)!;
              const { ticket: t, label, guestId } = meta;
              const cueRow = renderFloorTicketOrderCuesHtml(
                label.preferenceCues,
                escapeHtml,
              );
              const detail = label.preferenceFull
                ? `<details class="floor-tickets-item-detail"><summary>Full request</summary><p class="floor-tickets-item-wants">${escapeHtml(label.preferenceFull)}</p></details>`
                : '';
              const portrait = guestId ? renderGuestPortraitHtml(guestId) : '';
              const rowBody = `
                  <span class="floor-tickets-item-head">
                    <span class="floor-tickets-item-identity">${portrait}<span class="floor-tickets-item-guest">${escapeHtml(label.guestLabel)}</span></span>
                    <span class="floor-tickets-item-status">${escapeHtml(row.statusLabel)}</span>
                  </span>
                  ${cueRow}`;
              const rowControl = row.selectable
                ? `<button type="button" class="floor-tickets-item-btn" data-menu-ticket-id="${t.id}" aria-label="${escapeHtml(`${label.guestLabel}, ${row.statusLabel}`)}" aria-pressed="${row.selected}">${rowBody}</button>`
                : `<div class="floor-tickets-item-btn" data-static-ticket-id="${t.id}">${rowBody}</div>`;
              return `<li class="floor-tickets-item${row.selected ? ' selected' : ''}${t.status === 'plated' ? ' ready' : ''}${row.carrying ? ' carrying' : ''}${arrivingTicketIds.has(t.id) ? ' arriving' : ''}" data-testid="floor-tickets-item">
                ${rowControl}
                ${detail}
              </li>`;
            })
            .join('');

    const idealTicket = ticketPanel.subjectTicketId
      ? ticketMetaById.get(ticketPanel.subjectTicketId)
      : undefined;
    let idealBody: string;
    if (!idealTicket?.customer) {
      idealBody = `<p class="floor-tickets-empty" data-testid="floor-tickets-ideal-empty">No active order</p>`;
    } else {
      const ideal = resolveIdealFlavorProfile(idealTicket.customer.preference);
      const bars = renderFlavorBarsHtml(
        buildFlavorBarsViewModel(ideal, {
          title: idealTicket.label.guestLabel,
          subtitle: 'Ideal flavor profile',
        }),
        {
          showValues: true,
          showTemp: false,
          showZeroValues: true,
          groupOrder: IDEAL_FLAVOR_GROUP_ORDER,
        },
      );
      idealBody = `<div class="floor-tickets-ideal-wrap" data-testid="floor-tickets-ideal-wrap">
        <div class="floor-tickets-ideal" data-testid="floor-tickets-ideal">${bars}</div>
        <p class="floor-tickets-ideal-scroll-hint" data-testid="floor-tickets-ideal-scroll-hint" hidden>Scroll for mouthfeel</p>
      </div>`;
    }

    const carrying = Boolean(ticketPanel.carriedTicketId);
    if (carrying && ticketPanel.carriedTicketId !== knownCarriedTicketId) {
      ticketsMenuOpen = true;
      ticketsPanelView = 'order';
    }
    knownCarriedTicketId = ticketPanel.carriedTicketId;

    const toggleDisplay = carrying
      ? `${ticketPanel.toggleText} → deliver`
      : ticketPanel.toggleText;
    const toggleInner = carrying
      ? `${floorActionIconHtml('deliver')}<span class="floor-action-label">${escapeHtml(toggleDisplay)}</span>`
      : escapeHtml(toggleDisplay);

    dock.innerHTML = `
      <button
        type="button"
        class="floor-tickets-toggle${carrying ? ' carrying in-flight' : ''}"
        id="floor-tickets-toggle"
        data-testid="floor-tickets-toggle"
        aria-expanded="${ticketsMenuOpen ? 'true' : 'false'}"
        aria-controls="floor-tickets-menu"
        aria-haspopup="true"
        ${carrying ? 'aria-busy="true"' : ''}
        aria-label="${escapeHtml(
          carrying
            ? `${ticketPanel.toggleAriaLabel}. Open tickets to deliver`
            : ticketPanel.toggleAriaLabel,
        )}"
      >${toggleInner}</button>
      <div
        class="floor-tickets-menu"
        id="floor-tickets-menu"
        data-testid="floor-tickets-menu"
        role="region"
        aria-label="Active tickets"
        ${ticketsMenuOpen ? '' : 'hidden'}
      >
        <div class="floor-tickets-menu-header">
          <div class="floor-tickets-view-tabs" role="tablist" aria-label="Ticket views">
            <button type="button" id="${ORDER_TAB_ID}" role="tab" class="floor-tickets-view-tab${ticketsPanelView === 'order' ? ' active' : ''}" data-testid="tickets-view-order" data-tickets-view="order" aria-selected="${ticketsPanelView === 'order'}" aria-controls="${ORDER_PANEL_ID}" tabindex="${ticketsPanelView === 'order' ? '0' : '-1'}">Order</button>
            <button type="button" id="${IDEAL_TAB_ID}" role="tab" class="floor-tickets-view-tab${ticketsPanelView === 'ideal' ? ' active' : ''}" data-testid="tickets-view-ideal" data-tickets-view="ideal" aria-selected="${ticketsPanelView === 'ideal'}" aria-controls="${IDEAL_PANEL_ID}" tabindex="${ticketsPanelView === 'ideal' ? '0' : '-1'}">Ideal</button>
          </div>
          <button type="button" class="floor-tickets-close" data-testid="floor-tickets-close" aria-label="Close tickets menu">Close</button>
        </div>
        ${ticketPanel.capacityMessage ? `<p class="floor-tickets-capacity" data-testid="floor-tickets-capacity">${ticketPanel.capacityMessage}</p>` : ''}
        <div class="floor-tickets-panel-body" id="${ORDER_PANEL_ID}" role="tabpanel" aria-labelledby="${ORDER_TAB_ID}" ${ticketsPanelView === 'order' ? 'data-testid="floor-tickets-panel"' : 'hidden'}>
          <ul class="floor-tickets-list" data-testid="floor-tickets-list">${orderItems}</ul>
        </div>
        <div class="floor-tickets-panel-body" id="${IDEAL_PANEL_ID}" role="tabpanel" aria-labelledby="${IDEAL_TAB_ID}" ${ticketsPanelView === 'ideal' ? 'data-testid="floor-tickets-panel"' : 'hidden'}>
          ${idealBody}
        </div>
      </div>
    `;

    unbindFloorActionsKeyboard?.();
    const panel = chromeMount.querySelector<HTMLElement>(
      '[data-testid="floor-service-panel"]',
    );
    unbindFloorActionsKeyboard = panel
      ? bindFloorActionsToolbar(panel)
      : null;

    chromeMount
      .querySelector('#floor-set-table')
      ?.addEventListener('click', () => {
        beginPendingFloorAction('set-table');
        const placementIds = selectAdjacentUnsetTablePlacementIds(
          useGameStore.getState(),
        );
        for (const placementId of placementIds) {
          void useGameStore.getState().dispatch({
            type: 'FLOOR_SET_TABLE',
            placementId,
          });
        }
        render();
      });

    chromeMount
      .querySelector('#floor-seat-next')
      ?.addEventListener('click', () => {
        beginPendingFloorAction('seat');
        getRestaurantApp()?.requestSeatNextGuest();
        render();
      });

    chromeMount
      .querySelector('#floor-take-orders')
      ?.addEventListener('click', () => {
        beginPendingFloorAction('take-orders');
        const customerIds = selectAdjacentSeatedCustomerIds(
          useGameStore.getState(),
        );
        if (customerIds.length === 0) {
          render();
          return;
        }
        void useGameStore.getState().dispatch({
          type: 'FLOOR_TAKE_ORDERS',
          customerIds: [customerIds[0]!],
        });
        render();
      });

    chromeMount
      .querySelector('#floor-clear-table')
      ?.addEventListener('click', () => {
        beginPendingFloorAction('clear');
        const placementIds = selectAdjacentDirtyTablePlacementIds(
          useGameStore.getState(),
        );
        for (const placementId of placementIds) {
          void useGameStore.getState().dispatch({
            type: 'FLOOR_CLEAR_TABLE',
            placementId,
          });
        }
        render();
      });

    chromeMount
      .querySelector('#floor-close-day')
      ?.addEventListener('click', () => {
        void useGameStore.getState().dispatch({ type: 'CLOSE_DAY' });
      });

    const selectOpenTicket = (ticketId: string) => {
      const current = useGameStore.getState();
      const currentFloor = current.activeDay?.floor;
      // Defense in depth: the presentation renders static rows while carrying,
      // and the handler independently refuses a stale programmatic click.
      if (
        !currentFloor ||
        currentFloor.tickets.some(
          (ticket) =>
            ticket.id === currentFloor.carriedTicketId &&
            ticket.status === 'plated',
        )
      ) {
        return;
      }
      const ticket = currentFloor.tickets.find((t) => t.id === ticketId);
      if (ticket?.status === 'open') {
        current.setFloorSelectedTicket(ticketId);
      }
    };

    dock
      .querySelector('#floor-tickets-toggle')
      ?.addEventListener('click', (event) => {
        event.stopPropagation();
        const opening = !ticketsMenuOpen;
        ticketsMenuOpen = opening;
        // Opening always lands on Order so ticket rows are actionable; Ideal
        // remains a tab. Arrival auto-Ideal only applies while the menu is open.
        if (opening) ticketsPanelView = 'order';
        render();
      });

    dock
      .querySelector('[data-testid="floor-tickets-close"]')
      ?.addEventListener('click', (event) => {
        event.stopPropagation();
        ticketsMenuOpen = false;
        render({ kind: 'toggle' });
      });

    dock
      .querySelectorAll<HTMLButtonElement>('[data-tickets-view]')
      .forEach((button) => {
        button.addEventListener('click', (event) => {
          event.stopPropagation();
          const view = button.dataset.ticketsView;
          if (view !== 'order' && view !== 'ideal') return;
          ticketsPanelView = view;
          render({ kind: 'tab', view });
        });
        button.addEventListener('keydown', (event) => {
          const view = button.dataset.ticketsView;
          if (view !== 'order' && view !== 'ideal') return;
          let nextView: TicketsPanelView | null = null;
          if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
            nextView = view === 'order' ? 'ideal' : 'order';
          } else if (event.key === 'Home') {
            nextView = 'order';
          } else if (event.key === 'End') {
            nextView = 'ideal';
          }
          if (!nextView) return;
          event.preventDefault();
          ticketsPanelView = nextView;
          render({ kind: 'tab', view: nextView });
        });
      });

    dock
      .querySelectorAll<HTMLButtonElement>('[data-menu-ticket-id]')
      .forEach((button) => {
        button.addEventListener('click', () => {
          const ticketId = button.dataset.menuTicketId;
          if (!ticketId) return;
          selectOpenTicket(ticketId);
        });
      });

    const idealScrollHost = dock.querySelector<HTMLElement>(
      '#floor-tickets-panel-ideal:not([hidden])',
    );
    const idealHint = dock.querySelector<HTMLElement>(
      '[data-testid="floor-tickets-ideal-scroll-hint"]',
    );
    if (idealScrollHost && idealHint) {
      const updateIdealScrollHint = () => {
        const overflows =
          idealScrollHost.scrollHeight > idealScrollHost.clientHeight + 8;
        const atBottom =
          idealScrollHost.scrollTop + idealScrollHost.clientHeight >=
          idealScrollHost.scrollHeight - 8;
        idealHint.hidden = !overflows || atBottom;
      };
      updateIdealScrollHint();
      idealScrollHost.addEventListener('scroll', updateIdealScrollHint, {
        passive: true,
      });
    }

    if (carrying && ticketsMenuOpen) {
      dock
        .querySelector('.floor-tickets-item.carrying')
        ?.scrollIntoView({ block: 'nearest' });
    }

    restoreDockFocus(focusIdentity);
    notifyNotificationBlockingSurfaceChanged();
  };

  const unsubscribe = useGameStore.subscribe((state, prev) => {
    const nextTicketIds = new Set(
      state.activeDay?.floor?.tickets.map((ticket) => ticket.id) ?? [],
    );
    for (const ticketId of nextTicketIds) {
      if (knownTicketIds.has(ticketId)) continue;
      // Flash Ideal only when the menu is already open so a later open still
      // defaults to the selectable Order list.
      if (ticketsMenuOpen) ticketsPanelView = 'ideal';
      arrivingTicketIds.add(ticketId);
      const timer = setTimeout(() => {
        arrivingTicketIds.delete(ticketId);
        arrivalTimers.delete(timer);
        dock
          .querySelector(`[data-menu-ticket-id="${CSS.escape(ticketId)}"]`)
          ?.closest('.floor-tickets-item')
          ?.classList.remove('arriving');
      }, 900);
      arrivalTimers.add(timer);
    }
    knownTicketIds = nextTicketIds;

    if (
      state.activeDay?.floor !== prev.activeDay?.floor ||
      state.screen !== prev.screen ||
      state.floorPlayerGrid !== prev.floorPlayerGrid ||
      state.floorToast !== prev.floorToast ||
      state.modifierDismissed !== prev.modifierDismissed ||
      state.daySummary !== prev.daySummary ||
      state.pendingReview !== prev.pendingReview ||
      state.ceremony !== prev.ceremony ||
      state.activeDay?.floor?.selectedTicketId !==
        prev.activeDay?.floor?.selectedTicketId ||
      state.activeDay?.floor?.tickets !== prev.activeDay?.floor?.tickets ||
      state.activeDay?.floor?.carriedTicketId !==
        prev.activeDay?.floor?.carriedTicketId
    ) {
      render();
    }
  });

  render();

  return () => {
    unsubscribe();
    clearPendingFloorActionTimer();
    unbindFloorActionsKeyboard?.();
    unbindFloorActionsKeyboard = null;
    document.removeEventListener('pointerdown', onDocumentPointer, true);
    document.removeEventListener('keydown', onDocumentKeydown);
    for (const timer of arrivalTimers) clearTimeout(timer);
    arrivalTimers.clear();
    chromeMount.innerHTML = '';
    dock.remove();
    notifyNotificationBlockingSurfaceChanged();
  };
}
