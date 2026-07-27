import type { PurchaseKind } from '../../domain/economy/purchases.ts';
import { getDomainContext, getEquipmentNameMap } from '../../app/content-loader.ts';
import { useGameStore, type GameStore } from '../../store/game-store.ts';
import {
  buildLayoutCatalogRows,
  selectShowLayoutHud,
  type LayoutCatalogRow,
} from '../../store/selectors/layout.ts';
import { selectUnplacedItems } from '../../store/selectors/shop.ts';

export async function purchaseAndStartPlacement(
  store: Pick<GameStore, 'dispatch' | 'startPlacement'>,
  purchase: PurchaseKind,
  itemKey: string,
): Promise<void> {
  await store.dispatch({ type: 'PURCHASE', purchase });
  store.startPlacement(itemKey);
}

function catalogAvailabilityLabel(row: LayoutCatalogRow): string {
  switch (row.availability) {
    case 'available':
      return 'Buy & place';
    case 'unaffordable':
      return 'Not enough cash';
    case 'cap_reached':
      return 'Decor limit reached';
  }
}

export function mountLayoutToolbar(container: HTMLElement): () => void {
  container.innerHTML = `
    <div class="layout-toolbar">
      <button type="button" id="toggle-edit-layout" class="layout-btn" data-testid="toggle-edit-layout" aria-pressed="false">
        Done Editing
      </button>
      <button type="button" id="open-layout-catalog" class="layout-btn layout-catalog-plus" data-testid="open-layout-catalog" aria-label="Open furniture catalog" aria-expanded="false">
        +
      </button>
      <div class="layout-stats" aria-live="polite">
        <span id="seating-capacity">Seats: 4</span>
        <span id="grid-size">Grid: 4×4</span>
      </div>
    </div>
    <section class="layout-catalog-sheet" id="layout-catalog-sheet" data-testid="layout-catalog-sheet" aria-label="Furniture catalog" hidden></section>
    <p class="placement-hint" id="placement-hint" hidden></p>
  `;

  const toggleBtn = container.querySelector<HTMLButtonElement>('#toggle-edit-layout');
  const catalogBtn = container.querySelector<HTMLButtonElement>('#open-layout-catalog');
  const seatingEl = container.querySelector('#seating-capacity');
  const gridEl = container.querySelector('#grid-size');
  const catalogEl = container.querySelector('#layout-catalog-sheet') as HTMLElement;
  const hintEl = container.querySelector('#placement-hint') as HTMLElement;
  let catalogOpen = false;

  const renderCatalog = (state: GameStore) => {
    catalogBtn?.setAttribute('aria-expanded', String(catalogOpen));
    if (!catalogOpen) {
      catalogEl.hidden = true;
      catalogEl.innerHTML = '';
      return;
    }

    const catalogRows = buildLayoutCatalogRows(state, getDomainContext());
    const tableRows = catalogRows.filter((row) => row.kind === 'table');
    const decorRows = catalogRows.filter((row) => row.kind === 'decor');
    const unplaced = selectUnplacedItems(state, getEquipmentNameMap());
    const renderPurchaseRow = (row: LayoutCatalogRow, index: number) => `
      <button
        type="button"
        class="layout-catalog-row"
        data-catalog-index="${index}"
        ${row.availability === 'available' ? '' : 'disabled'}
      >
        <span>${row.label}</span>
        <span class="layout-catalog-row-action">
          <strong>$${row.cost.toLocaleString('en-US')}</strong>
          <small>${catalogAvailabilityLabel(row)}</small>
        </span>
      </button>
    `;

    catalogEl.hidden = false;
    catalogEl.innerHTML = `
      <header class="layout-catalog-header">
        <div>
          <h2>Furniture Catalog</h2>
          <p>Buy an item, then tap a valid tile to place it.</p>
        </div>
        <button type="button" class="layout-catalog-close" aria-label="Close furniture catalog">×</button>
      </header>
      <div class="layout-catalog-scroll">
        <section class="layout-catalog-group">
          <h3>Buy &amp; place — Tables</h3>
          ${tableRows.map((row) => renderPurchaseRow(row, catalogRows.indexOf(row))).join('')}
        </section>
        <section class="layout-catalog-group">
          <h3>Owned, not placed</h3>
          <div class="placement-palette">
            ${
              unplaced.length > 0
                ? unplaced
                    .map(
                      (item, index) =>
                        `<button type="button" class="placement-chip${state.pendingPlacementItemKey === item.itemKey ? ' active' : ''}" data-item-key="${item.itemKey}" data-item-index="${index}">${item.label}</button>`,
                    )
                    .join('')
                : '<p class="layout-catalog-empty">Everything you own is placed.</p>'
            }
          </div>
        </section>
        <section class="layout-catalog-group">
          <h3>Buy &amp; place — Decorations</h3>
          ${decorRows.map((row) => renderPurchaseRow(row, catalogRows.indexOf(row))).join('')}
        </section>
      </div>
    `;

    catalogEl
      .querySelector<HTMLButtonElement>('.layout-catalog-close')
      ?.addEventListener('click', () => {
        catalogOpen = false;
        renderCatalog(useGameStore.getState());
      });
    catalogEl.querySelectorAll<HTMLButtonElement>('.layout-catalog-row').forEach((button) => {
      button.addEventListener('click', async () => {
        const index = Number(button.dataset.catalogIndex);
        const row = catalogRows[index];
        if (!row || row.availability !== 'available') return;
        button.disabled = true;
        const store = useGameStore.getState();
        try {
          await purchaseAndStartPlacement(store, row.purchase, row.itemKey);
          catalogOpen = false;
        } catch {
          store.setFloorToast('That item is no longer available.');
        }
        sync();
      });
    });
    catalogEl.querySelectorAll<HTMLButtonElement>('.placement-chip').forEach((button) => {
      button.addEventListener('click', () => {
        const itemKey = button.dataset.itemKey;
        if (!itemKey) return;
        const current = useGameStore.getState();
        if (current.pendingPlacementItemKey === itemKey) {
          current.cancelPlacement();
          return;
        }
        current.startPlacement(itemKey);
        catalogOpen = false;
        sync();
      });
    });
  };

  const sync = () => {
    const state = useGameStore.getState();
    const showLayout = selectShowLayoutHud(state);
    container.hidden = !showLayout;
    if (!showLayout) {
      catalogOpen = false;
      return;
    }
    if (toggleBtn) {
      toggleBtn.textContent = 'Done Editing';
      toggleBtn.setAttribute('aria-pressed', String(state.editLayoutMode));
    }
    if (seatingEl) {
      seatingEl.textContent = `Seats: ${state.seatingCapacity}`;
    }
    if (gridEl) {
      gridEl.textContent = `Grid: ${state.gridSize.w}×${state.gridSize.h}`;
    }

    renderCatalog(state);

    if (state.editLayoutMode) {
      hintEl.hidden = false;
      if (state.pendingPlacementItemKey) {
        hintEl.textContent = 'Tap an empty valid tile to place the selected item.';
      } else if (state.kitchenAnnexOwned) {
        const roomLabel = state.activeFloorRoom === 'back_kitchen' ? 'Back kitchen' : 'Main floor';
        hintEl.textContent = `${roomLabel}: drag furniture, or drop a station on the connecting door to move it to the other room. Tap the door to switch rooms.`;
      } else {
        hintEl.textContent =
          'Drag tables and kitchen stations to a valid tile. Chairs stay with their table.';
      }
    } else {
      hintEl.hidden = true;
      hintEl.textContent = '';
    }
  };

  toggleBtn?.addEventListener('click', () => {
    useGameStore.getState().toggleEditLayout();
  });
  catalogBtn?.addEventListener('click', () => {
    catalogOpen = !catalogOpen;
    renderCatalog(useGameStore.getState());
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
      state.backKitchenPlacements !== prev.backKitchenPlacements ||
      state.activeFloorRoom !== prev.activeFloorRoom ||
      state.tableCount !== prev.tableCount ||
      state.decorPurchasedCounts !== prev.decorPurchasedCounts ||
      state.cash !== prev.cash ||
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
