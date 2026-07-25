import { useGameStore } from '../../store/game-store.ts';
import { getEquipmentNameMap } from '../../app/content-loader.ts';
import { selectUnplacedItems } from '../../store/selectors/shop.ts';

export function mountLayoutToolbar(container: HTMLElement): () => void {
  container.innerHTML = `
    <div class="layout-toolbar">
      <button type="button" id="toggle-edit-layout" class="layout-btn" data-testid="toggle-edit-layout" aria-pressed="true">
        Edit Layout
      </button>
      <div class="layout-stats" aria-live="polite">
        <span id="seating-capacity">Seats: 4</span>
        <span id="grid-size">Grid: 4×4</span>
      </div>
    </div>
    <div class="placement-palette" id="placement-palette" hidden></div>
    <p class="placement-hint" id="placement-hint" hidden></p>
  `;

  const toggleBtn = container.querySelector<HTMLButtonElement>('#toggle-edit-layout');
  const seatingEl = container.querySelector('#seating-capacity');
  const gridEl = container.querySelector('#grid-size');
  const paletteEl = container.querySelector('#placement-palette') as HTMLElement;
  const hintEl = container.querySelector('#placement-hint') as HTMLElement;

  const sync = () => {
    const state = useGameStore.getState();
    const hideLayout = Boolean(state.activeDay) || Boolean(state.daySummary);
    container.hidden = hideLayout || state.screen !== 'restaurant';
    if (hideLayout || state.screen !== 'restaurant') return;
    if (toggleBtn) {
      toggleBtn.textContent = state.editLayoutMode ? 'Done Editing' : 'Edit Layout';
      toggleBtn.setAttribute('aria-pressed', String(state.editLayoutMode));
    }
    if (seatingEl) {
      seatingEl.textContent = `Seats: ${state.seatingCapacity}`;
    }
    if (gridEl) {
      gridEl.textContent = `Grid: ${state.gridSize.w}×${state.gridSize.h}`;
    }

    const unplaced = selectUnplacedItems(state, getEquipmentNameMap());
    if (state.editLayoutMode && unplaced.length > 0) {
      paletteEl.hidden = false;
      paletteEl.innerHTML = unplaced
        .map(
          (item, index) =>
            `<button type="button" class="placement-chip${state.pendingPlacementItemKey === item.itemKey ? ' active' : ''}" data-item-key="${item.itemKey}" data-item-index="${index}">${item.label}</button>`,
        )
        .join('');
      paletteEl.querySelectorAll<HTMLButtonElement>('.placement-chip').forEach((button) => {
        button.addEventListener('click', () => {
          const itemKey = button.dataset.itemKey;
          if (!itemKey) return;
          const current = useGameStore.getState();
          if (current.pendingPlacementItemKey === itemKey) {
            current.cancelPlacement();
            return;
          }
          current.startPlacement(itemKey);
        });
      });
    } else {
      paletteEl.hidden = true;
      paletteEl.innerHTML = '';
    }

    if (state.pendingPlacementItemKey && state.editLayoutMode) {
      hintEl.hidden = false;
      hintEl.textContent = 'Tap an empty grid tile to place the selected item.';
    } else {
      hintEl.hidden = true;
      hintEl.textContent = '';
    }
  };

  toggleBtn?.addEventListener('click', () => {
    useGameStore.getState().toggleEditLayout();
  });

  const unsubscribe = useGameStore.subscribe((state, prev) => {
    if (
      state.editLayoutMode !== prev.editLayoutMode ||
      state.seatingCapacity !== prev.seatingCapacity ||
      state.gridSize !== prev.gridSize ||
      state.activeDay !== prev.activeDay ||
      state.daySummary !== prev.daySummary ||
      state.screen !== prev.screen ||
      state.placements !== prev.placements ||
      state.tableCount !== prev.tableCount ||
      state.purchasedEquipmentIds !== prev.purchasedEquipmentIds ||
      state.pendingPlacementItemKey !== prev.pendingPlacementItemKey
    ) {
      sync();
    }
  });

  sync();

  return () => {
    unsubscribe();
  };
}
