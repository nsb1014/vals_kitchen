import { nextTutorialStep, tutorialPrompt } from '../../domain/floor/tutorial.ts';
import { getDomainContext } from '../../app/content-loader.ts';
import { useGameStore } from '../../store/game-store.ts';
import {
  selectAdjacentDirtyTablePlacementIds,
  selectAdjacentSeatedCustomerIds,
  selectAdjacentUnsetTablePlacementIds,
  selectCanClearFloorTable,
  selectCanSetFloorTable,
  selectCanTakeFloorOrders,
} from '../../store/selectors/service-day.ts';
import { formatFloorTicketLabel } from '../presentation/floor-ticket.ts';

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function mountFloorServiceHud(mount: HTMLElement): () => void {
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
      mount.hidden = true;
      mount.innerHTML = '';
      return;
    }

    mount.hidden = false;
    const canSetTable = selectCanSetFloorTable(state);
    const canClearTable = selectCanClearFloorTable(state);
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
    let partyCounter = 0;
    for (const g of floor.pool) {
      if (g.stage === 'done') continue;
      partyCounter += 1;
      partyIndexByCustomerId.set(g.customer.id, partyCounter);
    }

    const ticketStrip = floor.tickets
      .map((t) => {
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
        return `<button type="button" class="floor-ticket${selected ? ' selected' : ''}${t.status === 'plated' ? ' ready' : ''}" data-testid="floor-ticket" data-ticket-id="${t.id}" ${isOpen ? '' : 'disabled'} title="${escapeHtml(label.preferenceSummary || label.buttonText)}"><span class="floor-ticket-guest">${escapeHtml(label.guestLabel)}</span><span class="floor-ticket-status">${escapeHtml(label.statusLabel)}</span>${label.preferenceSummary ? `<span class="floor-ticket-pref">${escapeHtml(label.preferenceSummary)}</span>` : ''}</button>`;
      })
      .join('');

    mount.innerHTML = `
      <div class="floor-service-panel" data-testid="floor-service-panel">
        ${tutorial ? `<p class="floor-tutorial" data-testid="floor-tutorial">${tutorial}</p>` : ''}
        ${pacingHint ? `<p class="floor-pacing" data-testid="floor-pacing">${pacingHint}</p>` : ''}
        <div class="floor-ticket-strip" data-testid="floor-ticket-strip">
          ${ticketStrip || '<span class="floor-ticket-empty">No tickets</span>'}
        </div>
        <div class="floor-actions">
          ${
            canSetTable
              ? `<button type="button" class="service-btn" id="floor-set-table" data-testid="floor-set-table">Set table</button>`
              : ''
          }
          <button type="button" class="service-btn primary" id="floor-seat-next" data-testid="floor-seat-next" ${waitingGuests.length === 0 ? 'disabled' : ''}>Seat guest</button>
          ${
            canTakeOrders
              ? `<button type="button" class="service-btn primary" id="floor-take-orders" data-testid="floor-take-orders">Take orders</button>`
              : ''
          }
          ${
            canClearTable
              ? `<button type="button" class="service-btn" id="floor-clear-table" data-testid="floor-clear-table">Clear table</button>`
              : ''
          }
        </div>
        ${
          floorToast
            ? `<p class="floor-toast" data-testid="floor-toast">${floorToast}</p>`
            : ''
        }
      </div>
    `;

    mount.querySelector('#floor-set-table')?.addEventListener('click', () => {
      const placementIds = selectAdjacentUnsetTablePlacementIds(useGameStore.getState());
      for (const placementId of placementIds) {
        void useGameStore.getState().dispatch({
          type: 'FLOOR_SET_TABLE',
          placementId,
        });
      }
    });

    mount.querySelector('#floor-seat-next')?.addEventListener('click', () => {
      void useGameStore.getState().dispatch({ type: 'FLOOR_SEAT_NEXT' });
    });

    mount.querySelector('#floor-take-orders')?.addEventListener('click', () => {
      const customerIds = selectAdjacentSeatedCustomerIds(useGameStore.getState());
      if (customerIds.length === 0) return;
      void useGameStore.getState().dispatch({
        type: 'FLOOR_TAKE_ORDERS',
        customerIds,
      });
    });

    mount.querySelector('#floor-clear-table')?.addEventListener('click', () => {
      const placementIds = selectAdjacentDirtyTablePlacementIds(useGameStore.getState());
      for (const placementId of placementIds) {
        void useGameStore.getState().dispatch({
          type: 'FLOOR_CLEAR_TABLE',
          placementId,
        });
      }
    });

    mount.querySelectorAll<HTMLButtonElement>('[data-ticket-id]').forEach((button) => {
      button.addEventListener('click', () => {
        const ticketId = button.dataset.ticketId;
        if (!ticketId) return;
        const ticket = useGameStore.getState().activeDay?.floor?.tickets.find((t) => t.id === ticketId);
        if (ticket?.status === 'open') {
          useGameStore.getState().setFloorSelectedTicket(ticketId);
        } else {
          useGameStore.getState().setFloorSelectedTicket(null);
        }
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
    mount.innerHTML = '';
  };
}
