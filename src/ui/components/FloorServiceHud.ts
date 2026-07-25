import { nextTutorialStep, tutorialPrompt } from '../../domain/floor/tutorial.ts';
import { useGameStore } from '../../store/game-store.ts';

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
    const tutorial = tutorialPrompt(nextTutorialStep(floor, state.day === 1));

    const ticketStrip = floor.tickets
      .map(
        (t) =>
          `<span class="floor-ticket" data-testid="floor-ticket">${t.id} (${t.status})</span>`,
      )
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
  };

  const unsubscribe = useGameStore.subscribe((state, prev) => {
    if (
      state.activeDay?.floor !== prev.activeDay?.floor ||
      state.modifierDismissed !== prev.modifierDismissed ||
      state.daySummary !== prev.daySummary ||
      state.pendingReview !== prev.pendingReview ||
      state.ceremony !== prev.ceremony
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
