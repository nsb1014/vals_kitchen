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
import { renderGuestPortraitHtml } from '../presentation/guest-portrait.ts';

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
      state.syncFloorNoticesFromHud({ sticky: null, pacing: null });
      chromeMount.hidden = true;
      chromeMount.innerHTML = '';
      dock.hidden = true;
      dock.innerHTML = '';
      ticketsMenuOpen = false;
      return;
    }

    chromeMount.hidden = false;
    const initialGuestArriving =
      floor.pool.some((guest) => guest.stage === 'entering') &&
      !floor.pool.some(
        (guest) => guest.stage !== 'queued' && guest.stage !== 'entering',
      );
    dock.hidden = false;
    const canSetTable = selectCanSetFloorTable(state);
    const canClearTable = selectCanClearFloorTable(state);
    const canCloseDay = selectCanCloseDay(state);
    const waitingGuests = floor.pool.filter((g) => g.stage === 'waiting');
    const canTakeOrders = selectCanTakeFloorOrders(state);
    const step = nextTutorialStep(floor, state.day === 1);
    const prompt = tutorialPrompt(step);
    const sticky =
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
    const pacing = initialGuestArriving
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
        : null;
    state.syncFloorNoticesFromHud({ sticky, pacing });

    const ctx = getDomainContext();
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
        selected,
      });
      return {
        ticket: t,
        isOpen,
        selected,
        label,
        customer: guest?.customer,
        guestId: guest?.id,
      };
    });

    chromeMount.innerHTML = `
      <div class="floor-service-panel" data-testid="floor-service-panel">
        <div class="floor-actions-scroll">
          <div class="floor-actions">
            <button type="button" class="service-btn" id="floor-set-table" data-testid="floor-set-table" ${canSetTable ? '' : 'disabled'}>Set table</button>
            <button type="button" class="service-btn${waitingGuests.length > 0 ? ' primary' : ''}" id="floor-seat-next" data-testid="floor-seat-next" ${waitingGuests.length === 0 ? 'disabled' : ''}>Seat guest</button>
            <button type="button" class="service-btn${canTakeOrders ? ' primary' : ''}" id="floor-take-orders" data-testid="floor-take-orders" ${canTakeOrders ? '' : 'disabled'}>Take orders</button>
            <button type="button" class="service-btn" id="floor-clear-table" data-testid="floor-clear-table" ${canClearTable ? '' : 'disabled'}>Clear table</button>
            <button type="button" class="service-btn${canCloseDay ? ' primary' : ''}" id="floor-close-day" data-testid="close-day-btn" ${canCloseDay ? '' : 'disabled aria-hidden="true" style="visibility: hidden;"'}>Close Day</button>
          </div>
        </div>
      </div>
    `;

    const count = ticketMeta.length;
    const countLabel = count === 0 ? 'Tickets' : `Tickets (${count})`;
    const orderItems =
      ticketMeta.length === 0
        ? `<li class="floor-tickets-empty" data-testid="floor-tickets-empty">No active tickets</li>`
        : ticketMeta
            .map(({ ticket: t, isOpen, selected, label, guestId }) => {
              const wants = label.preferenceFull
                ? `<p class="floor-tickets-item-wants">${escapeHtml(label.preferenceFull)}</p>`
                : '';
              const portrait = guestId ? renderGuestPortraitHtml(guestId) : '';
              return `<li class="floor-tickets-item${selected ? ' selected' : ''}${t.status === 'plated' ? ' ready' : ''}" data-testid="floor-tickets-item">
                <button type="button" class="floor-tickets-item-btn" data-menu-ticket-id="${t.id}" ${isOpen ? '' : 'disabled'} aria-label="${escapeHtml(`${label.guestLabel}, ${label.statusLabel}`)}">
                  <span class="floor-tickets-item-head">
                    <span class="floor-tickets-item-identity">${portrait}<span class="floor-tickets-item-guest">${escapeHtml(label.guestLabel)}</span></span>
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
    document.removeEventListener('pointerdown', onDocumentPointer, true);
    document.removeEventListener('keydown', onDocumentKeydown);
    chromeMount.innerHTML = '';
    dock.remove();
  };
}
