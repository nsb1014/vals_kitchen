import { nextTutorialStep, tutorialPrompt } from '../../domain/floor/tutorial.ts';
import { useGameStore } from '../../store/game-store.ts';
import {
  selectAdjacentSeatedCustomerIds,
  selectCanTakeFloorOrders,
} from '../../store/selectors/service-day.ts';

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
    const unsetTables = floor.tables.filter((t) => t.state === 'unset');
    const dirtyTables = floor.tables.filter((t) => t.state === 'dirty');
    const waitingGuests = floor.pool.filter((g) => g.stage === 'waiting');
    const canTakeOrders = selectCanTakeFloorOrders(state);
    const tutorial = tutorialPrompt(nextTutorialStep(floor, state.day === 1));
    const selectedTicketId = floor.selectedTicketId;

    const ticketStrip = floor.tickets
      .map((t) => {
        const isOpen = t.status === 'open';
        const selected = isOpen && selectedTicketId === t.id;
        return `<button type="button" class="floor-ticket${selected ? ' selected' : ''}" data-testid="floor-ticket" data-ticket-id="${t.id}" ${isOpen ? '' : 'disabled'}>${t.id} (${t.status})</button>`;
      })
      .join('');

    mount.innerHTML = `
      <div class="floor-service-panel" data-testid="floor-service-panel">
        ${tutorial ? `<p class="floor-tutorial" data-testid="floor-tutorial">${tutorial}</p>` : ''}
        <div class="floor-ticket-strip" data-testid="floor-ticket-strip">
          ${ticketStrip || '<span class="floor-ticket-empty">No tickets</span>'}
        </div>
        <div class="floor-actions">
          ${
            unsetTables.length > 0
              ? `<button type="button" class="service-btn" id="floor-set-all" data-testid="floor-set-all">Set all tables (${unsetTables.length})</button>`
              : ''
          }
          <button type="button" class="service-btn primary" id="floor-seat-next" data-testid="floor-seat-next" ${waitingGuests.length === 0 ? 'disabled' : ''}>Seat next</button>
          ${
            canTakeOrders
              ? `<button type="button" class="service-btn primary" id="floor-take-orders" data-testid="floor-take-orders">Take orders</button>`
              : ''
          }
          ${
            dirtyTables.length > 0
              ? `<button type="button" class="service-btn" id="floor-clear-dirty" data-testid="floor-clear-dirty">Clear dirty (${dirtyTables.length})</button>`
              : ''
          }
        </div>
      </div>
    `;

    mount.querySelector('#floor-set-all')?.addEventListener('click', () => {
      const current = useGameStore.getState().activeDay?.floor;
      if (!current) return;
      for (const table of current.tables) {
        if (table.state === 'unset') {
          void useGameStore.getState().dispatch({
            type: 'FLOOR_SET_TABLE',
            placementId: table.placementId,
          });
        }
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

    mount.querySelector('#floor-clear-dirty')?.addEventListener('click', () => {
      const current = useGameStore.getState().activeDay?.floor;
      if (!current) return;
      for (const table of current.tables) {
        if (table.state === 'dirty') {
          void useGameStore.getState().dispatch({
            type: 'FLOOR_CLEAR_TABLE',
            placementId: table.placementId,
          });
        }
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
