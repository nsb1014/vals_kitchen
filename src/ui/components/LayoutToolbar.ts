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
  shopRowActionLabel,
  shopAvailabilityClass,
  type ShopRow,
} from '../presentation/shop-items.ts';
import { renderFoodIconHtml } from './food-icon.ts';
import { OPEN_RESTAURANT_SHOP_EVENT } from '../events/restaurant-shop.ts';
import { notifyNotificationBlockingSurfaceChanged } from '../notifications/blocking-surface.ts';

export async function purchaseAndStartPlacement(
  store: Pick<GameStore, 'dispatch' | 'setActiveFloorRoom' | 'startPlacement'>,
  purchase: PurchaseKind,
  itemKey: string,
  placementRoom?: GameStore['activeFloorRoom'],
): Promise<void> {
  await store.dispatch({ type: 'PURCHASE', purchase });
  if (placementRoom) store.setActiveFloorRoom(placementRoom);
  store.startPlacement(itemKey);
}

type CatalogTab = 'ingredients' | 'equipment' | 'layout';
type CatalogFocusIdentity =
  | { kind: 'tab'; tab: CatalogTab }
  | { kind: 'row'; rowId: string }
  | { kind: 'close' };

const CATALOG_TAB_IDS: Record<CatalogTab, string> = {
  ingredients: 'restaurant-shop-tab-ingredients',
  equipment: 'restaurant-shop-tab-equipment',
  layout: 'restaurant-shop-tab-layout',
};

const CATALOG_PANEL_IDS: Record<CatalogTab, string> = {
  ingredients: 'restaurant-shop-panel-ingredients',
  equipment: 'restaurant-shop-panel-equipment',
  layout: 'restaurant-shop-panel-layout',
};

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
      <button type="button" id="open-layout-catalog" class="layout-btn layout-catalog-plus" data-testid="open-layout-catalog" aria-label="Open restaurant shop" aria-expanded="false" aria-controls="layout-catalog-sheet">
        Shop
      </button>
      <div class="layout-stats" aria-live="polite">
        <span id="seating-capacity">Seats: 4</span>
        <span id="grid-size">Grid: 4×4</span>
      </div>
    </div>
    <section class="layout-catalog-sheet" id="layout-catalog-sheet" data-testid="layout-catalog-sheet" role="dialog" aria-modal="false" aria-labelledby="restaurant-shop-title" hidden></section>
    <div class="placement-guidance" id="placement-guidance" hidden>
      <p class="placement-hint" id="placement-hint"></p>
      <button type="button" class="layout-btn placement-cancel" id="cancel-placement" data-testid="cancel-placement">Cancel placement</button>
    </div>
  `;

  const toggleBtn = container.querySelector<HTMLButtonElement>('#toggle-edit-layout');
  const catalogBtn = container.querySelector<HTMLButtonElement>('#open-layout-catalog');
  const seatingEl = container.querySelector('#seating-capacity');
  const gridEl = container.querySelector('#grid-size');
  const catalogEl = container.querySelector('#layout-catalog-sheet') as HTMLElement;
  const hintEl = container.querySelector('#placement-hint') as HTMLElement;
  const placementGuidanceEl = container.querySelector('#placement-guidance') as HTMLElement;
  const cancelPlacementBtn = container.querySelector<HTMLButtonElement>('#cancel-placement');
  let catalogOpen = false;
  let catalogTab: CatalogTab = 'ingredients';
  let pendingCatalogFocus: CatalogFocusIdentity | null = null;
  let catalogScrollTop = 0;
  let focusPlacementCancelAfterSync = false;

  const syncCatalogViewport = () => {
    const rootZoom =
      Number.parseFloat(getComputedStyle(document.documentElement).zoom) || 1;
    if (catalogOpen && window.innerWidth <= 420 && rootZoom > 1) {
      catalogEl.dataset.zoomCompensated = 'true';
      const viewportWidth = window.innerWidth / rootZoom;
      const viewportHeight = window.innerHeight / rootZoom;
      catalogEl.style.width = `${viewportWidth}px`;
      catalogEl.style.maxWidth = `${viewportWidth}px`;
      catalogEl.style.height = `${viewportHeight}px`;
      catalogEl.style.maxHeight = `${viewportHeight}px`;
      catalogEl.style.top = '0px';
      catalogEl.style.bottom = 'auto';
      const fixedOffset = catalogEl.getBoundingClientRect().top / rootZoom;
      catalogEl.style.top = `${-fixedOffset}px`;
      return;
    }
    delete catalogEl.dataset.zoomCompensated;
    catalogEl.style.removeProperty('width');
    catalogEl.style.removeProperty('max-width');
    catalogEl.style.removeProperty('height');
    catalogEl.style.removeProperty('max-height');
    catalogEl.style.removeProperty('top');
    catalogEl.style.removeProperty('bottom');
  };

  const captureCatalogFocus = (): CatalogFocusIdentity | null => {
    const active = document.activeElement;
    if (!(active instanceof HTMLElement) || !catalogEl.contains(active)) {
      return null;
    }
    const tab = active.dataset.catalogTab;
    if (tab === 'ingredients' || tab === 'equipment' || tab === 'layout') {
      return { kind: 'tab', tab };
    }
    const rowId = active.dataset.catalogRowId;
    if (rowId) return { kind: 'row', rowId };
    if (active.matches('.layout-catalog-close')) return { kind: 'close' };
    return null;
  };

  const restoreCatalogFocus = (identity: CatalogFocusIdentity | null) => {
    if (!identity || !catalogOpen) return;
    const target =
      identity.kind === 'tab'
        ? catalogEl.querySelector<HTMLElement>(
            `[data-catalog-tab="${identity.tab}"]`,
          )
        : identity.kind === 'row'
          ? catalogEl.querySelector<HTMLElement>(
              `[data-catalog-row-id="${CSS.escape(identity.rowId)}"]:not(:disabled)`,
            )
          : catalogEl.querySelector<HTMLElement>('.layout-catalog-close');
    (
      target ??
      catalogEl.querySelector<HTMLElement>(
        `[data-catalog-tab="${catalogTab}"]`,
      )
    )?.focus({ preventScroll: true });
  };

  const closeCatalog = (restoreShopFocus: boolean) => {
    catalogOpen = false;
    pendingCatalogFocus = null;
    catalogScrollTop = 0;
    renderCatalog(useGameStore.getState());
    if (restoreShopFocus) catalogBtn?.focus({ preventScroll: true });
  };

  const openCatalog = () => {
    const state = useGameStore.getState();
    if (
      !selectShowLayoutHud(state) ||
      state.activeDay ||
      state.daySummary ||
      state.pendingPlacementItemKey
    ) {
      return;
    }
    catalogOpen = true;
    catalogTab = 'ingredients';
    catalogScrollTop = 0;
    pendingCatalogFocus = { kind: 'tab', tab: catalogTab };
    renderCatalog(state);
  };

  const renderCatalog = (state: GameStore) => {
    const focusIdentity = pendingCatalogFocus ?? captureCatalogFocus();
    pendingCatalogFocus = null;
    const previousScroll = catalogEl.querySelector<HTMLElement>(
      '.layout-catalog-scroll',
    );
    if (previousScroll) catalogScrollTop = previousScroll.scrollTop;
    catalogBtn?.setAttribute('aria-expanded', String(catalogOpen));
    container.classList.toggle('layout-catalog-open', catalogOpen);
    if (!catalogOpen) {
      const wasBlockingNotifications = !catalogEl.hidden;
      catalogEl.hidden = true;
      catalogEl.innerHTML = '';
      if (wasBlockingNotifications) {
        notifyNotificationBlockingSurfaceChanged();
      }
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
    const renderPurchaseRow = (row: ShopRow) => `
      <button type="button" class="layout-catalog-row ${shopAvailabilityClass(row.availability)}" data-catalog-row-id="${row.id}" ${row.availability === 'available' ? '' : 'disabled'}>
        <span class="layout-catalog-row-copy">
          <strong>${row.kind === 'ingredient' ? renderFoodIconHtml(row.id, 26) : ''}${row.name}</strong>
          <small>${shopRowDescription(row)}</small>
        </span>
        <span class="layout-catalog-row-action">
          <strong>${formatShopCost(row.cost, row.availability)}</strong>
          <small>${shopRowActionLabel(row)}</small>
        </span>
      </button>
    `;

    const startsBlockingNotifications = catalogEl.hidden;
    catalogEl.hidden = false;
    syncCatalogViewport();
    catalogEl.innerHTML = `
      <header class="layout-catalog-header">
        <div>
          <h2 id="restaurant-shop-title">Restaurant shop</h2>
          <p>Cash: $${state.cash.toLocaleString('en-US')}</p>
        </div>
        <button type="button" class="layout-catalog-close" aria-label="Close restaurant shop">×</button>
      </header>
      <div class="recipe-book-tabs layout-shop-tabs" role="tablist" aria-label="Restaurant shop sections">
        <button type="button" id="${CATALOG_TAB_IDS.ingredients}" class="recipe-book-tab${catalogTab === 'ingredients' ? ' active' : ''}" data-catalog-tab="ingredients" role="tab" aria-selected="${catalogTab === 'ingredients'}" aria-controls="${CATALOG_PANEL_IDS.ingredients}" tabindex="${catalogTab === 'ingredients' ? '0' : '-1'}">Ingredients</button>
        <button type="button" id="${CATALOG_TAB_IDS.equipment}" class="recipe-book-tab${catalogTab === 'equipment' ? ' active' : ''}" data-catalog-tab="equipment" role="tab" aria-selected="${catalogTab === 'equipment'}" aria-controls="${CATALOG_PANEL_IDS.equipment}" tabindex="${catalogTab === 'equipment' ? '0' : '-1'}">Kitchen Equipment</button>
        <button type="button" id="${CATALOG_TAB_IDS.layout}" class="recipe-book-tab${catalogTab === 'layout' ? ' active' : ''}" data-catalog-tab="layout" role="tab" aria-selected="${catalogTab === 'layout'}" aria-controls="${CATALOG_PANEL_IDS.layout}" tabindex="${catalogTab === 'layout' ? '0' : '-1'}">Layout</button>
      </div>
      <div class="layout-catalog-scroll" id="${CATALOG_PANEL_IDS[catalogTab]}" role="tabpanel" aria-labelledby="${CATALOG_TAB_IDS[catalogTab]}">
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
          ${rows.map((row) => renderPurchaseRow(row)).join('') || '<p class="layout-catalog-empty">Everything in this section is unlocked.</p>'}
        </section>
      </div>
      ${(['ingredients', 'equipment', 'layout'] as const)
        .filter((tab) => tab !== catalogTab)
        .map(
          (tab) =>
            `<div class="layout-catalog-scroll" id="${CATALOG_PANEL_IDS[tab]}" role="tabpanel" aria-labelledby="${CATALOG_TAB_IDS[tab]}" hidden></div>`,
        )
        .join('')}
    `;
    if (startsBlockingNotifications) {
      notifyNotificationBlockingSurfaceChanged();
    }

    const scroll = catalogEl.querySelector<HTMLElement>(
      '.layout-catalog-scroll:not([hidden])',
    );
    if (scroll) scroll.scrollTop = catalogScrollTop;

    catalogEl
      .querySelector<HTMLButtonElement>('.layout-catalog-close')
      ?.addEventListener('click', () => {
        closeCatalog(true);
      });
    catalogEl
      .querySelectorAll<HTMLButtonElement>('[data-catalog-tab]')
      .forEach((button) => {
        const activateTab = (tab: CatalogTab) => {
          catalogScrollTop = 0;
          catalogTab = tab;
          pendingCatalogFocus = { kind: 'tab', tab };
          renderCatalog(useGameStore.getState());
        };
        button.addEventListener('click', () => {
          const tab = button.dataset.catalogTab;
          if (tab !== 'ingredients' && tab !== 'equipment' && tab !== 'layout') {
            return;
          }
          activateTab(tab);
        });
        button.addEventListener('keydown', (event) => {
          const tab = button.dataset.catalogTab;
          if (tab !== 'ingredients' && tab !== 'equipment' && tab !== 'layout') {
            return;
          }
          const tabs: CatalogTab[] = ['ingredients', 'equipment', 'layout'];
          const index = tabs.indexOf(tab);
          let next: CatalogTab | null = null;
          if (event.key === 'ArrowRight') next = tabs[(index + 1) % tabs.length]!;
          if (event.key === 'ArrowLeft') next = tabs[(index - 1 + tabs.length) % tabs.length]!;
          if (event.key === 'Home') next = tabs[0]!;
          if (event.key === 'End') next = tabs[tabs.length - 1]!;
          if (!next) return;
          event.preventDefault();
          activateTab(next);
        });
      });
    catalogEl.querySelectorAll<HTMLButtonElement>('.layout-catalog-row').forEach((button) => {
      button.addEventListener('click', async () => {
        const rowId = button.dataset.catalogRowId;
        const row = rows.find((candidate) => candidate.id === rowId);
        if (!row || row.availability !== 'available') return;
        button.disabled = true;
        const store = useGameStore.getState();
        try {
          const itemKey = placementItemKey(row);
          if (itemKey) {
            catalogOpen = false;
            renderCatalog(store);
            const placementRoom =
              row.kind === 'table' || row.kind === 'decor'
                ? 'main'
                : undefined;
            await purchaseAndStartPlacement(
              store,
              row.purchase,
              itemKey,
              placementRoom,
            );
            focusPlacementCancelAfterSync = true;
          } else {
            const rowIndex = rows.indexOf(row);
            const nextRow =
              rows.slice(rowIndex + 1).find((candidate) => candidate.availability === 'available') ??
              rows.find(
                (candidate) =>
                  candidate.id !== row.id && candidate.availability === 'available',
              );
            pendingCatalogFocus = nextRow
              ? { kind: 'row', rowId: nextRow.id }
              : { kind: 'tab', tab: catalogTab };
            await store.dispatch({ type: 'PURCHASE', purchase: row.purchase });
          }
        } catch {
          catalogOpen = true;
          pendingCatalogFocus = { kind: 'row', rowId: row.id };
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
        closeCatalog(false);
        focusPlacementCancelAfterSync = true;
        sync();
      });
    });

    restoreCatalogFocus(focusIdentity);
  };

  const sync = () => {
    const state = useGameStore.getState();
    const showLayout = selectShowLayoutHud(state);
    container.hidden = !showLayout;
    if (!showLayout) {
      catalogOpen = false;
      renderCatalog(state);
      placementGuidanceEl.hidden = true;
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
      placementGuidanceEl.hidden = false;
      if (state.pendingPlacementItemKey) {
        const pendingItem = selectUnplacedItems(
          state,
          getEquipmentNameMap(),
        ).find((item) => item.itemKey === state.pendingPlacementItemKey);
        const pendingName = pendingItem?.label ?? 'selected item';
        const validZone =
          pendingItem?.kind === 'equipment'
            ? 'a valid kitchen tile'
            : 'a valid dining tile';
        hintEl.textContent = `Place ${pendingName}: tap ${validZone}.`;
        cancelPlacementBtn?.removeAttribute('hidden');
      } else if (state.kitchenAnnexOwned) {
        const roomLabel = state.activeFloorRoom === 'back_kitchen' ? 'Back kitchen' : 'Main floor';
        hintEl.textContent = `${roomLabel}: drag furniture, open Shop for purchases, or drop a station on the connecting door to move it. Tap the door to switch rooms.`;
        cancelPlacementBtn?.setAttribute('hidden', '');
      } else {
        hintEl.textContent =
          'Drag furniture, or open Shop to buy ingredients, equipment, tables, and decor. Seats move with their table.';
        cancelPlacementBtn?.setAttribute('hidden', '');
      }
    } else {
      placementGuidanceEl.hidden = true;
      hintEl.textContent = '';
      cancelPlacementBtn?.setAttribute('hidden', '');
    }

    if (focusPlacementCancelAfterSync && state.pendingPlacementItemKey) {
      focusPlacementCancelAfterSync = false;
      cancelPlacementBtn?.focus({ preventScroll: true });
    }
  };

  toggleBtn?.addEventListener('click', () => {
    catalogOpen = false;
    useGameStore.getState().toggleEditLayout();
  });
  catalogBtn?.addEventListener('click', () => {
    if (catalogOpen) {
      closeCatalog(true);
    } else {
      openCatalog();
    }
  });
  cancelPlacementBtn?.addEventListener('click', () => {
    useGameStore.getState().cancelPlacement();
    catalogBtn?.focus({ preventScroll: true });
  });

  const onOpenRestaurantShop = () => {
    openCatalog();
  };
  const onDocumentKeydown = (event: KeyboardEvent) => {
    if (!catalogOpen || event.key !== 'Escape') return;
    event.preventDefault();
    closeCatalog(true);
  };
  window.addEventListener(OPEN_RESTAURANT_SHOP_EVENT, onOpenRestaurantShop);
  window.addEventListener('resize', syncCatalogViewport);
  document.addEventListener('keydown', onDocumentKeydown);
  const rootStyleObserver = new MutationObserver(syncCatalogViewport);
  rootStyleObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['style'],
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
    window.removeEventListener(OPEN_RESTAURANT_SHOP_EVENT, onOpenRestaurantShop);
    window.removeEventListener('resize', syncCatalogViewport);
    document.removeEventListener('keydown', onDocumentKeydown);
    rootStyleObserver.disconnect();
  };
}
