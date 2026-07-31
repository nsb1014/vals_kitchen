import type { PurchaseKind } from '../../domain/economy/purchases.ts';
import {
  getDomainContext,
  getEquipmentCatalog,
  getEquipmentNameMap,
} from '../../app/content-loader.ts';
import { useGameStore, type GameStore } from '../../store/game-store.ts';
import { selectShowLayoutHud } from '../../store/selectors/layout.ts';
import { selectUnplacedItems } from '../../store/selectors/shop.ts';
import {
  buildEquipmentShopRows,
  buildIngredientShopRows,
  buildUtilityShopRows,
  formatShopCost,
  shopAvailabilityClass,
  shopAvailabilityLabel,
  type ShopRow,
} from '../presentation/shop-items.ts';
import { renderFoodIconHtml } from './food-icon.ts';

export async function purchaseAndStartPlacement(
  store: Pick<GameStore, 'dispatch' | 'startPlacement'>,
  purchase: PurchaseKind,
  itemKey: string,
): Promise<void> {
  await store.dispatch({ type: 'PURCHASE', purchase });
  store.startPlacement(itemKey);
}

type CatalogTab = 'ingredients' | 'equipment' | 'layout';

function shopRowDescription(row: ShopRow): string {
  if (row.kind === 'ingredient') {
    return row.availability === 'gate_locked'
      ? `Requires ${row.equipmentGateName}`
      : row.category;
  }
  if (row.kind === 'equipment') {
    return `Unlocks ${row.groupName} ingredients`;
  }
  return row.description;
}

function placementItemKey(row: ShopRow): string | null {
  if (row.kind === 'equipment') return row.id;
  if (row.kind === 'table') return 'table_2seat';
  if (row.kind === 'decor') return row.id.replace(/^decor:/, '');
  return null;
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
  let catalogTab: CatalogTab = 'ingredients';

  const renderCatalog = (state: GameStore) => {
    catalogBtn?.setAttribute('aria-expanded', String(catalogOpen));
    if (!catalogOpen) {
      catalogEl.hidden = true;
      catalogEl.innerHTML = '';
      return;
    }

    const ctx = getDomainContext();
    const ingredientRows = buildIngredientShopRows(
      state,
      ctx.ingredients,
      getEquipmentNameMap(),
      ctx,
    );
    const equipmentRows = buildEquipmentShopRows(
      state,
      getEquipmentCatalog(),
      ctx,
    );
    const utilityRows = buildUtilityShopRows(state, ctx);
    const rows: ShopRow[] =
      catalogTab === 'ingredients'
        ? ingredientRows
        : catalogTab === 'equipment'
          ? equipmentRows
          : utilityRows;
    const unplaced = selectUnplacedItems(state, getEquipmentNameMap());
    const renderPurchaseRow = (row: ShopRow, index: number) => `
      <button type="button" class="layout-catalog-row ${shopAvailabilityClass(row.availability)}" data-catalog-index="${index}" ${row.availability === 'available' ? '' : 'disabled'}>
        <span class="layout-catalog-row-copy">
          <strong>${row.kind === 'ingredient' ? renderFoodIconHtml(row.id, 26) : ''}${row.name}</strong>
          <small>${shopRowDescription(row)}</small>
        </span>
        <span class="layout-catalog-row-action">
          <strong>${formatShopCost(row.cost, row.availability)}</strong>
          <small>${shopAvailabilityLabel(row.availability)}</small>
        </span>
      </button>
    `;

    catalogEl.hidden = false;
    catalogEl.innerHTML = `
      <header class="layout-catalog-header">
        <div>
          <h2>Edit Restaurant</h2>
          <p>Cash: $${state.cash.toLocaleString('en-US')}</p>
        </div>
        <button type="button" class="layout-catalog-close" aria-label="Close furniture catalog">×</button>
      </header>
      <div class="recipe-book-tabs layout-shop-tabs" role="tablist" aria-label="Restaurant shop sections">
        <button type="button" class="recipe-book-tab${catalogTab === 'ingredients' ? ' active' : ''}" data-catalog-tab="ingredients" role="tab" aria-selected="${catalogTab === 'ingredients'}">Ingredients</button>
        <button type="button" class="recipe-book-tab${catalogTab === 'equipment' ? ' active' : ''}" data-catalog-tab="equipment" role="tab" aria-selected="${catalogTab === 'equipment'}">Kitchen Equipment</button>
        <button type="button" class="recipe-book-tab${catalogTab === 'layout' ? ' active' : ''}" data-catalog-tab="layout" role="tab" aria-selected="${catalogTab === 'layout'}">Layout</button>
      </div>
      <div class="layout-catalog-scroll">
        ${
          catalogTab === 'layout'
            ? `<section class="layout-catalog-group">
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
              </section>`
            : ''
        }
        <section class="layout-catalog-group">
          ${rows.map((row, index) => renderPurchaseRow(row, index)).join('') || '<p class="layout-catalog-empty">Everything in this section is unlocked.</p>'}
        </section>
      </div>
    `;

    catalogEl
      .querySelector<HTMLButtonElement>('.layout-catalog-close')
      ?.addEventListener('click', () => {
        catalogOpen = false;
        renderCatalog(useGameStore.getState());
      });
    catalogEl
      .querySelectorAll<HTMLButtonElement>('[data-catalog-tab]')
      .forEach((button) => {
        button.addEventListener('click', () => {
          const tab = button.dataset.catalogTab;
          if (tab !== 'ingredients' && tab !== 'equipment' && tab !== 'layout') {
            return;
          }
          catalogTab = tab;
          renderCatalog(useGameStore.getState());
        });
      });
    catalogEl.querySelectorAll<HTMLButtonElement>('.layout-catalog-row').forEach((button) => {
      button.addEventListener('click', async () => {
        const index = Number(button.dataset.catalogIndex);
        const row = rows[index];
        if (!row || row.availability !== 'available') return;
        button.disabled = true;
        const store = useGameStore.getState();
        try {
          const itemKey = placementItemKey(row);
          if (itemKey) {
            await purchaseAndStartPlacement(store, row.purchase, itemKey);
            catalogOpen = false;
          } else {
            await store.dispatch({ type: 'PURCHASE', purchase: row.purchase });
          }
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
    if (catalogOpen) catalogTab = 'ingredients';
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
