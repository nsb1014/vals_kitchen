import { nextTutorialStep, tutorialPrompt } from '../../domain/floor/tutorial.ts';
import { getDomainContext } from '../../app/content-loader.ts';
import { useGameStore } from '../../store/game-store.ts';
import {
  selectAdjacentDirtyTablePlacementIds,
  selectAdjacentSeatedCustomerIds,
  selectAdjacentUnsetTablePlacementIds,
  selectCanClearFloorTable,
  selectCanCloseDay,
  selectCanSetFloorTable,
  selectCanTakeFloorOrders,
} from '../../store/selectors/service-day.ts';
import {
  buildFlavorBarsViewModel,
  renderFlavorBarsHtml,
} from '../presentation/flavor-profile.ts';
import { resolveIdealFlavorProfile } from '../presentation/ideal-flavor.ts';
import {
  formatFloorTicketLabel,
  visibleFloorTickets,
} from '../presentation/floor-ticket.ts';

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

type TicketsPanelView = 'order' | 'ideal';

export function mountFloorServiceHud(
  chromeMount: HTMLElement,
  /** Host above the cooking overlay stacking context (typically overlay-mount). */
  ticketsHost: HTMLElement,
): () => void {
  let ticketsMenuOpen = false;
  let ticketsPanelView: TicketsPanelView = 'order';
  let knownTicketIds = new Set(
    useGameStore.getState().activeDay?.floor?.tickets.map((ticket) => ticket.id) ??
      [],
  );
  const arrivingTicketIds = new Set<string>();
  const arrivalTimers = new Set<ReturnType<typeof setTimeout>>();

  const dock = document.createElement('div');
  dock.className = 'floor-tickets-dock';
  dock.dataset.testid = 'floor-tickets-dock';
  dock.hidden = true;
  ticketsHost.appendChild(dock);

  const onDocumentPointer = (event: PointerEvent) => {
    if (!ticketsMenuOpen) return;
    const target = event.target as Node | null;
    if (target && dock.contains(target)) return;
    ticketsMenuOpen = false;
    render();
  };

  const onDocumentKeydown = (event: KeyboardEvent) => {
    if (!ticketsMenuOpen || event.key !== 'Escape') return;
    ticketsMenuOpen = false;
    render();
  };

  document.addEventListener('pointerdown', onDocumentPointer, true);
  document.addEventListener('keydown', onDocumentKeydown);

  const render = () => {
    const state = useGameStore.getState();
    const floor = state.activeDay?.floor;
    const show =
      floor &&
      state.modifierDismissed &&
      !state.daySummary &&
      !state.pendingReview &&
      !state.ceremony;

    if (!show || !floor) {
      chromeMount.hidden = true;
      chromeMount.innerHTML = '';
      dock.hidden = true;
      dock.innerHTML = '';
      ticketsMenuOpen = false;
      return;
    }

    chromeMount.hidden = false;
    dock.hidden = false;
    const canSetTable = selectCanSetFloorTable(state);
    const canClearTable = selectCanClearFloorTable(state);
    const canCloseDay = selectCanCloseDay(state);
    const waitingGuests = floor.pool.filter((g) => g.stage === 'waiting');
    const canTakeOrders = selectCanTakeFloorOrders(state);
    const tutorial = tutorialPrompt(nextTutorialStep(floor, state.day === 1));
    const selectedTicketId = floor.selectedTicketId;
    const floorToast = state.floorToast;
    const pacingHint =
      state.day > 1
        ? `Day ${state.day} · ${state.rating.toFixed(1)}★ · P${state.prestige} — match tastes, grow mastery`
        : null;

    const ctx = getDomainContext();
    const partyIndexByCustomerId = new Map<string, number>();
    for (const [index, guest] of floor.pool.entries()) {
      partyIndexByCustomerId.set(guest.customer.id, index + 1);
    }

    const ticketMeta = visibleFloorTickets(floor.tickets).map((t) => {
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
        partyNumber: partyIndexByCustomerId.get(t.customerId) ?? 1,
        selected,
      });
      return { ticket: t, isOpen, selected, label, customer: guest?.customer };
    });

    const ticketStrip = ticketMeta
      .map(({ ticket: t, isOpen, selected, label }) => {
        return `<button type="button" class="floor-ticket${selected ? ' selected' : ''}${t.status === 'plated' ? ' ready' : ''}${arrivingTicketIds.has(t.id) ? ' arriving' : ''}" data-testid="floor-ticket" data-ticket-id="${t.id}" ${isOpen ? '' : 'disabled'} title="${escapeHtml(label.buttonText)}"><span class="floor-ticket-guest">${escapeHtml(label.guestLabel)}</span><span class="floor-ticket-status">${escapeHtml(label.statusLabel)}</span></button>`;
      })
      .join('');

    chromeMount.innerHTML = `
      <div class="floor-service-panel" data-testid="floor-service-panel">
        ${tutorial ? `<p class="floor-tutorial" data-testid="floor-tutorial">${tutorial}</p>` : ''}
        ${pacingHint ? `<p class="floor-pacing" data-testid="floor-pacing">${pacingHint}</p>` : ''}
        <div class="floor-ticket-strip" data-testid="floor-ticket-strip">
          ${ticketStrip || '<span class="floor-ticket-empty">No tickets</span>'}
        </div>
        <div class="floor-actions">
          <button type="button" class="service-btn" id="floor-set-table" data-testid="floor-set-table" ${canSetTable ? '' : 'disabled'}>Set table</button>
          <button type="button" class="service-btn${waitingGuests.length > 0 ? ' primary' : ''}" id="floor-seat-next" data-testid="floor-seat-next" ${waitingGuests.length === 0 ? 'disabled' : ''}>Seat guest</button>
          <button type="button" class="service-btn${canTakeOrders ? ' primary' : ''}" id="floor-take-orders" data-testid="floor-take-orders" ${canTakeOrders ? '' : 'disabled'}>Take orders</button>
          <button type="button" class="service-btn" id="floor-clear-table" data-testid="floor-clear-table" ${canClearTable ? '' : 'disabled'}>Clear table</button>
          <button type="button" class="service-btn${canCloseDay ? ' primary' : ''}" id="floor-close-day" data-testid="close-day-btn" ${canCloseDay ? '' : 'disabled'}>Close Day</button>
        </div>
        ${
          floorToast
            ? `<p class="floor-toast" data-testid="floor-toast">${floorToast}</p>`
            : ''
        }
      </div>
    `;

    const count = ticketMeta.length;
    const countLabel = count === 0 ? 'Tickets' : `Tickets (${count})`;
    const orderItems =
      ticketMeta.length === 0
        ? `<li class="floor-tickets-empty" data-testid="floor-tickets-empty">No active tickets</li>`
        : ticketMeta
            .map(({ ticket: t, isOpen, selected, label }) => {
              const wants = label.preferenceFull
                ? `<p class="floor-tickets-item-wants">${escapeHtml(label.preferenceFull)}</p>`
                : '';
              return `<li class="floor-tickets-item${selected ? ' selected' : ''}${t.status === 'plated' ? ' ready' : ''}" data-testid="floor-tickets-item">
                <button type="button" class="floor-tickets-item-btn" data-menu-ticket-id="${t.id}" ${isOpen ? '' : 'disabled'} aria-label="${escapeHtml(`${label.guestLabel}, ${label.statusLabel}`)}">
                  <span class="floor-tickets-item-head">
                    <span class="floor-tickets-item-guest">${escapeHtml(label.guestLabel)}</span>
                    <span class="floor-tickets-item-status">${escapeHtml(label.statusLabel)}</span>
                  </span>
                  ${wants}
                </button>
              </li>`;
            })
            .join('');

    const idealTicket =
      ticketMeta.find((row) => row.selected) ??
      ticketMeta.find((row) => row.isOpen) ??
      ticketMeta[0];
    let idealBody: string;
    if (!idealTicket?.customer) {
      idealBody = `<p class="floor-tickets-empty" data-testid="floor-tickets-ideal-empty">No active order</p>`;
    } else {
      const ideal = resolveIdealFlavorProfile(idealTicket.customer.preference);
      const bars = renderFlavorBarsHtml(
        buildFlavorBarsViewModel(ideal, {
          title: idealTicket.label.guestLabel,
          subtitle: 'Scored flavor targets',
        }),
        { showValues: true, showTemp: false },
      );
      idealBody = `<div class="floor-tickets-ideal" data-testid="floor-tickets-ideal">${bars}</div>`;
    }

    const panelBody =
      ticketsPanelView === 'order'
        ? `<ul class="floor-tickets-list" data-testid="floor-tickets-list">${orderItems}</ul>`
        : idealBody;

    dock.innerHTML = `
      <button
        type="button"
        class="floor-tickets-toggle"
        id="floor-tickets-toggle"
        data-testid="floor-tickets-toggle"
        aria-expanded="${ticketsMenuOpen ? 'true' : 'false'}"
        aria-controls="floor-tickets-menu"
        aria-haspopup="true"
      >${escapeHtml(countLabel)}</button>
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
            <button type="button" role="tab" class="floor-tickets-view-tab${ticketsPanelView === 'order' ? ' active' : ''}" data-testid="tickets-view-order" data-tickets-view="order" aria-selected="${ticketsPanelView === 'order' ? 'true' : 'false'}">Order</button>
            <button type="button" role="tab" class="floor-tickets-view-tab${ticketsPanelView === 'ideal' ? ' active' : ''}" data-testid="tickets-view-ideal" data-tickets-view="ideal" aria-selected="${ticketsPanelView === 'ideal' ? 'true' : 'false'}">Ideal</button>
          </div>
          <button type="button" class="floor-tickets-close" data-testid="floor-tickets-close" aria-label="Close tickets menu">Close</button>
        </div>
        <div class="floor-tickets-panel-body" data-testid="floor-tickets-panel">${panelBody}</div>
      </div>
    `;

    chromeMount.querySelector('#floor-set-table')?.addEventListener('click', () => {
      const placementIds = selectAdjacentUnsetTablePlacementIds(useGameStore.getState());
      for (const placementId of placementIds) {
        void useGameStore.getState().dispatch({
          type: 'FLOOR_SET_TABLE',
          placementId,
        });
      }
    });

    chromeMount.querySelector('#floor-seat-next')?.addEventListener('click', () => {
      void useGameStore.getState().dispatch({ type: 'FLOOR_SEAT_NEXT' });
    });

    chromeMount.querySelector('#floor-take-orders')?.addEventListener('click', () => {
      const customerIds = selectAdjacentSeatedCustomerIds(useGameStore.getState());
      if (customerIds.length === 0) return;
      void useGameStore.getState().dispatch({
        type: 'FLOOR_TAKE_ORDERS',
        customerIds,
      });
    });

    chromeMount.querySelector('#floor-clear-table')?.addEventListener('click', () => {
      const placementIds = selectAdjacentDirtyTablePlacementIds(useGameStore.getState());
      for (const placementId of placementIds) {
        void useGameStore.getState().dispatch({
          type: 'FLOOR_CLEAR_TABLE',
          placementId,
        });
      }
    });

    chromeMount.querySelector('#floor-close-day')?.addEventListener('click', () => {
      void useGameStore.getState().dispatch({ type: 'CLOSE_DAY' });
    });

    const selectOpenTicket = (ticketId: string) => {
      const ticket = useGameStore.getState().activeDay?.floor?.tickets.find((t) => t.id === ticketId);
      if (ticket?.status === 'open') {
        useGameStore.getState().setFloorSelectedTicket(ticketId);
      } else {
        useGameStore.getState().setFloorSelectedTicket(null);
      }
    };

    chromeMount.querySelectorAll<HTMLButtonElement>('[data-ticket-id]').forEach((button) => {
      button.addEventListener('click', () => {
        const ticketId = button.dataset.ticketId;
        if (!ticketId) return;
        selectOpenTicket(ticketId);
      });
    });

    dock.querySelector('#floor-tickets-toggle')?.addEventListener('click', (event) => {
      event.stopPropagation();
      ticketsMenuOpen = !ticketsMenuOpen;
      render();
    });

    dock.querySelector('[data-testid="floor-tickets-close"]')?.addEventListener('click', (event) => {
      event.stopPropagation();
      ticketsMenuOpen = false;
      render();
    });

    dock.querySelectorAll<HTMLButtonElement>('[data-tickets-view]').forEach((button) => {
      button.addEventListener('click', (event) => {
        event.stopPropagation();
        const view = button.dataset.ticketsView;
        if (view === 'order' || view === 'ideal') {
          ticketsPanelView = view;
          render();
        }
      });
    });

    dock.querySelectorAll<HTMLButtonElement>('[data-menu-ticket-id]').forEach((button) => {
      button.addEventListener('click', () => {
        const ticketId = button.dataset.menuTicketId;
        if (!ticketId) return;
        selectOpenTicket(ticketId);
      });
    });
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
          .querySelector(`[data-ticket-id="${CSS.escape(ticketId)}"]`)
          ?.classList.remove('arriving');
        chromeMount
          .querySelector(`[data-ticket-id="${CSS.escape(ticketId)}"]`)
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
      state.activeDay?.floor?.selectedTicketId !== prev.activeDay?.floor?.selectedTicketId ||
      state.activeDay?.floor?.tickets !== prev.activeDay?.floor?.tickets
    ) {
      render();
    }
  });

  render();

  return () => {
    unsubscribe();
    for (const timer of arrivalTimers) clearTimeout(timer);
    arrivalTimers.clear();
    document.removeEventListener('pointerdown', onDocumentPointer, true);
    document.removeEventListener('keydown', onDocumentKeydown);
    chromeMount.innerHTML = '';
    dock.remove();
  };
}
