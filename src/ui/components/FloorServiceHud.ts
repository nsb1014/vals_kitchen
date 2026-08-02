import {
  nextTutorialStep,
  tutorialPrompt,
} from '../../domain/floor/tutorial.ts';
import { getDomainContext } from '../../app/content-loader.ts';
import { useGameStore } from '../../store/game-store.ts';
import {
  selectAdjacentDirtyTablePlacementIds,
  selectAdjacentSeatedCustomerIds,
  selectAdjacentUnsetTablePlacementIds,
  selectCanClearFloorTable,
  selectCanCloseDay,
  selectCanSeatFloorGuest,
  selectCanSetFloorTable,
  selectCanTakeFloorOrders,
} from '../../store/selectors/service-day.ts';
import { formatFloorTicketLabel } from '../presentation/floor-ticket.ts';
import { buildFloorTicketPanelViewModel } from '../presentation/floor-ticket-panel.ts';
import { renderGuestPortraitHtml } from '../presentation/guest-portrait.ts';
import {
  buildFlavorBarsViewModel,
  renderFlavorBarsHtml,
} from '../presentation/flavor-profile.ts';
import { resolveIdealFlavorProfile } from '../presentation/ideal-flavor.ts';
import { notifyNotificationBlockingSurfaceChanged } from '../notifications/blocking-surface.ts';

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

export function mountFloorServiceHud(
  chromeMount: HTMLElement,
  /** Host above the cooking overlay stacking context (typically overlay-mount). */
  ticketsHost: HTMLElement,
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
    const initialGuestArriving =
      floor.pool.some((guest) => guest.stage === 'entering') &&
      !floor.pool.some(
        (guest) => guest.stage !== 'queued' && guest.stage !== 'entering',
      );
    dock.hidden = false;
    const canSetTable = selectCanSetFloorTable(state);
    const canClearTable = selectCanClearFloorTable(state);
    const canCloseDay = selectCanCloseDay(state);
    const canSeatGuest = selectCanSeatFloorGuest(state);
    const canTakeOrders = selectCanTakeFloorOrders(state);
    const step = nextTutorialStep(floor, state.day === 1);
    const prompt = tutorialPrompt(step);
    const emphasize = (actionStep: typeof step, available: boolean) =>
      available && (step === null || step === actionStep);
    const emphasizeSetTable = emphasize('set_tables', canSetTable);
    const emphasizeSeatGuest = emphasize('wait_seat', canSeatGuest);
    const emphasizeTakeOrders = emphasize('take_orders', canTakeOrders);
    const emphasizeClearTable = emphasize('clear', canClearTable);
    const emphasizeCloseDay = emphasize('close', canCloseDay);
    const tutorialNotice =
      prompt && step
        ? {
            id: `tutorial:${step}`,
            source: 'tutorial' as const,
            body: prompt,
            stepId: step,
          }
        : null;
    const selectedTicketId = floor.selectedTicketId;
    const pacingHint =
      state.day > 1
        ? `Day ${state.day} · ${state.rating.toFixed(1)}★ · P${state.prestige} — match tastes, grow mastery`
        : null;
    // Day-one guidance introduces each state once, then yields the room to the
    // contextual action emphasis and object highlights. Treat it as a paced
    // notice instead of permanent chrome so experienced play does not require
    // dismissing seven separate instructions.
    const pacing =
      tutorialNotice ??
      (initialGuestArriving
        ? {
            id: `pacing:first-guest-arriving:${state.day}`,
            source: 'pacing' as const,
            body: 'The first guest is arriving…',
          }
        : pacingHint
          ? {
              id: `pacing:day:${state.day}`,
              source: 'pacing' as const,
              body: pacingHint,
            }
          : null);
    state.syncFloorNoticesFromHud({ sticky: null, pacing });

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
        <div class="floor-actions-scroll">
          <div class="floor-actions">
            <button type="button" class="service-btn${emphasizeSetTable ? ' primary' : ''}" id="floor-set-table" data-testid="floor-set-table" ${canSetTable ? '' : 'disabled'}><span class="floor-action-label">Set table</span></button>
            <button type="button" class="service-btn${emphasizeSeatGuest ? ' primary' : ''}" id="floor-seat-next" data-testid="floor-seat-next" ${canSeatGuest ? '' : 'disabled'}><span class="floor-action-label">Seat guest</span></button>
            <button type="button" class="service-btn${emphasizeTakeOrders ? ' primary' : ''}" id="floor-take-orders" data-testid="floor-take-orders" ${canTakeOrders ? '' : 'disabled'} ${ticketPanel.capacityFull ? `aria-describedby="${capacityHelpId}"` : ''}><span class="floor-action-label">Take orders</span></button>
            <button type="button" class="service-btn${emphasizeClearTable ? ' primary' : ''}" id="floor-clear-table" data-testid="floor-clear-table" ${canClearTable ? '' : 'disabled'}><span class="floor-action-label">Clear table</span></button>
            <button type="button" class="service-btn${emphasizeCloseDay ? ' primary' : ''}" id="floor-close-day" data-testid="close-day-btn" ${canCloseDay ? '' : 'disabled aria-hidden="true" hidden'}><span class="floor-action-label">Close Day</span></button>
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
              const wants = label.preferenceFull
                ? `<p class="floor-tickets-item-wants">${escapeHtml(label.preferenceFull)}</p>`
                : '';
              const portrait = guestId ? renderGuestPortraitHtml(guestId) : '';
              const rowBody = `
                  <span class="floor-tickets-item-head">
                    <span class="floor-tickets-item-identity">${portrait}<span class="floor-tickets-item-guest">${escapeHtml(label.guestLabel)}</span></span>
                    <span class="floor-tickets-item-status">${escapeHtml(row.statusLabel)}</span>
                  </span>
                  ${wants}`;
              const rowControl = row.selectable
                ? `<button type="button" class="floor-tickets-item-btn" data-menu-ticket-id="${t.id}" aria-label="${escapeHtml(`${label.guestLabel}, ${row.statusLabel}`)}" aria-pressed="${row.selected}">${rowBody}</button>`
                : `<div class="floor-tickets-item-btn" data-static-ticket-id="${t.id}">${rowBody}</div>`;
              return `<li class="floor-tickets-item${row.selected ? ' selected' : ''}${t.status === 'plated' ? ' ready' : ''}${row.carrying ? ' carrying' : ''}${arrivingTicketIds.has(t.id) ? ' arriving' : ''}" data-testid="floor-tickets-item">
                ${rowControl}
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
        { showValues: true, showTemp: false, showZeroValues: true },
      );
      idealBody = `<div class="floor-tickets-ideal" data-testid="floor-tickets-ideal">${bars}</div>`;
    }

    dock.innerHTML = `
      <button
        type="button"
        class="floor-tickets-toggle"
        id="floor-tickets-toggle"
        data-testid="floor-tickets-toggle"
        aria-expanded="${ticketsMenuOpen ? 'true' : 'false'}"
        aria-controls="floor-tickets-menu"
        aria-haspopup="true"
        aria-label="${escapeHtml(ticketPanel.toggleAriaLabel)}"
      >${escapeHtml(ticketPanel.toggleText)}</button>
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

    chromeMount
      .querySelector('#floor-set-table')
      ?.addEventListener('click', () => {
        const placementIds = selectAdjacentUnsetTablePlacementIds(
          useGameStore.getState(),
        );
        for (const placementId of placementIds) {
          void useGameStore.getState().dispatch({
            type: 'FLOOR_SET_TABLE',
            placementId,
          });
        }
      });

    chromeMount
      .querySelector('#floor-seat-next')
      ?.addEventListener('click', () => {
        void useGameStore.getState().dispatch({ type: 'FLOOR_SEAT_NEXT' });
      });

    chromeMount
      .querySelector('#floor-take-orders')
      ?.addEventListener('click', () => {
        const customerIds = selectAdjacentSeatedCustomerIds(
          useGameStore.getState(),
        );
        if (customerIds.length === 0) return;
        void useGameStore.getState().dispatch({
          type: 'FLOOR_TAKE_ORDERS',
          customerIds: [customerIds[0]!],
        });
      });

    chromeMount
      .querySelector('#floor-clear-table')
      ?.addEventListener('click', () => {
        const placementIds = selectAdjacentDirtyTablePlacementIds(
          useGameStore.getState(),
        );
        for (const placementId of placementIds) {
          void useGameStore.getState().dispatch({
            type: 'FLOOR_CLEAR_TABLE',
            placementId,
          });
        }
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
        ticketsMenuOpen = !ticketsMenuOpen;
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

    restoreDockFocus(focusIdentity);
    notifyNotificationBlockingSurfaceChanged();
  };

  const unsubscribe = useGameStore.subscribe((state, prev) => {
    const nextTicketIds = new Set(
      state.activeDay?.floor?.tickets.map((ticket) => ticket.id) ?? [],
    );
    for (const ticketId of nextTicketIds) {
      if (knownTicketIds.has(ticketId)) continue;
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
      state.floorPlayerGrid !== prev.floorPlayerGrid ||
      state.floorToast !== prev.floorToast ||
      state.modifierDismissed !== prev.modifierDismissed ||
      state.daySummary !== prev.daySummary ||
      state.pendingReview !== prev.pendingReview ||
      state.ceremony !== prev.ceremony ||
      state.activeDay?.floor?.selectedTicketId !==
        prev.activeDay?.floor?.selectedTicketId ||
      state.activeDay?.floor?.tickets !== prev.activeDay?.floor?.tickets
    ) {
      render();
    }
  });

  render();

  return () => {
    unsubscribe();
    document.removeEventListener('pointerdown', onDocumentPointer, true);
    document.removeEventListener('keydown', onDocumentKeydown);
    for (const timer of arrivalTimers) clearTimeout(timer);
    arrivalTimers.clear();
    chromeMount.innerHTML = '';
    dock.remove();
    notifyNotificationBlockingSurfaceChanged();
  };
}
