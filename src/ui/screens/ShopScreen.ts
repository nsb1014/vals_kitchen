import {
  getDomainContext,
  getEquipmentCatalog,
  getEquipmentNameMap,
} from '../../app/content-loader.ts';
import { playSfx, unlockAudioOnGesture } from '../../assets/audio.ts';
import { useGameStore } from '../../store/game-store.ts';
import {
  buildEquipmentShopRows,
  buildIngredientShopRows,
  buildShopMilestoneStrip,
  buildUtilityShopRows,
  formatShopCost,
  purchaseFeedbackMessage,
  shopAvailabilityClass,
  shopRowActionLabel,
  shopRowDescription,
  type ShopRow,
} from '../presentation/shop-items.ts';
import { renderFoodIconHtml } from '../components/food-icon.ts';

export function mountShopScreen(container: HTMLElement): () => void {
  const root = document.createElement('div');
  root.className = 'screen-root';
  container.appendChild(root);
  root.innerHTML = `
    <section class="screen-panel sheet-tier-meta-full meta-screen" id="shop-screen" data-testid="shop-screen" hidden>
      <header class="screen-header">
        <h1 class="screen-title">Shop</h1>
        <p class="screen-subtitle" id="shop-cash">Cash: $0</p>
        <p class="shop-milestone-strip" id="shop-milestone" data-testid="shop-screen-milestone"></p>
      </header>
      <div class="shop-sections" id="shop-sections"></div>
    </section>
  `;

  const panel = root.querySelector('#shop-screen') as HTMLElement;
  const cashEl = root.querySelector('#shop-cash') as HTMLElement;
  const milestoneEl = root.querySelector('#shop-milestone') as HTMLElement;
  const sectionsEl = root.querySelector('#shop-sections') as HTMLElement;

  const renderRow = (row: ShopRow): string => {
    const canBuy = row.availability === 'available';
    const icon =
      row.kind === 'ingredient' ? renderFoodIconHtml(row.id, 28) : '';
    const meta =
      row.kind === 'ingredient' && row.availability === 'gate_locked'
        ? '🔒 Gate locked'
        : undefined;
    return `
      <article class="shop-item ${shopAvailabilityClass(row.availability)}" data-shop-row-id="${row.id}">
        <div class="shop-item-body">
          <div class="shop-item-title-row">${icon}<h3>${row.name}</h3></div>
          ${meta ? `<p class="shop-item-meta">${meta}</p>` : ''}
          <p class="shop-item-sub">${shopRowDescription(row)}</p>
        </div>
        <div class="shop-item-actions">
          <span class="shop-item-cost">${formatShopCost(row.cost, row.availability)}</span>
          <button type="button" class="shop-buy-btn" data-purchase-id="${row.kind === 'ingredient' ? `ingredient:${row.id}` : row.kind === 'equipment' ? `equipment:${row.id}` : row.id}" ${canBuy ? '' : 'disabled'}>${shopRowActionLabel(row)}</button>
        </div>
      </article>`;
  };

  const render = () => {
    const state = useGameStore.getState();
    const ctx = getDomainContext();
    const equipment = getEquipmentCatalog();
    const equipmentRows = buildEquipmentShopRows(state, equipment, ctx);
    const ingredientRows = buildIngredientShopRows(
      state,
      ctx.ingredients,
      getEquipmentNameMap(),
      ctx,
    );
    const utilityRows = buildUtilityShopRows(state, ctx);
    const milestone = buildShopMilestoneStrip(
      state,
      equipmentRows,
      ctx.ingredients,
    );

    cashEl.textContent = `Cash: $${state.cash.toLocaleString('en-US')}`;
    milestoneEl.textContent = milestone.text;
    milestoneEl.dataset.milestoneKind = milestone.kind;

    sectionsEl.innerHTML = `
      <section class="shop-section">
        <h2 class="shop-section-title">Kitchen Equipment</h2>
        ${
          equipmentRows.map((row) => renderRow(row)).join('') ||
          '<p class="screen-empty">All equipment owned.</p>'
        }
      </section>
      <section class="shop-section">
        <h2 class="shop-section-title">Layout</h2>
        ${utilityRows.map((row) => renderRow(row)).join('')}
      </section>
      <section class="shop-section">
        <h2 class="shop-section-title">Ingredients</h2>
        ${
          ingredientRows.map((row) => renderRow(row)).join('') ||
          '<p class="screen-empty">All eligible ingredients owned.</p>'
        }
      </section>
    `;

    sectionsEl
      .querySelectorAll<HTMLButtonElement>('.shop-buy-btn')
      .forEach((button) => {
        button.addEventListener('click', async () => {
          const id = button.dataset.purchaseId;
          if (!id) return;
          const store = useGameStore.getState();
          const allRows: ShopRow[] = [
            ...equipmentRows,
            ...utilityRows,
            ...ingredientRows,
          ];
          const row = allRows.find((candidate) => {
            if (id.startsWith('equipment:')) {
              return (
                candidate.kind === 'equipment' &&
                candidate.id === id.slice('equipment:'.length)
              );
            }
            if (id.startsWith('ingredient:')) {
              return (
                candidate.kind === 'ingredient' &&
                candidate.id === id.slice('ingredient:'.length)
              );
            }
            return candidate.id === id;
          });
          try {
            if (id.startsWith('equipment:')) {
              const equipmentId = id.slice('equipment:'.length);
              await store.dispatch({
                type: 'PURCHASE',
                purchase: { type: 'equipment', equipmentId },
              });
              store.startPlacement(equipmentId);
            } else if (id.startsWith('ingredient:')) {
              await store.dispatch({
                type: 'PURCHASE',
                purchase: {
                  type: 'ingredient',
                  ingredientId: id.slice('ingredient:'.length),
                },
              });
            } else if (id === 'table') {
              await store.dispatch({
                type: 'PURCHASE',
                purchase: { type: 'table' },
              });
              store.startPlacement('table_2seat');
            } else if (id.startsWith('decor:')) {
              const itemKey = id.slice('decor:'.length);
              await store.dispatch({
                type: 'PURCHASE',
                purchase: { type: 'decor', itemKey },
              });
              store.startPlacement(itemKey);
            } else if (id === 'grid_expansion') {
              await store.dispatch({
                type: 'PURCHASE',
                purchase: { type: 'grid_expansion' },
              });
            } else if (id === 'kitchen_annex') {
              await store.dispatch({
                type: 'PURCHASE',
                purchase: { type: 'kitchen_annex' },
              });
            } else {
              return;
            }
            void unlockAudioOnGesture();
            playSfx('purchase');
            if (row) {
              store.setFloorToast(purchaseFeedbackMessage(row));
            }
          } catch {
            store.setFloorToast('That item is no longer available.');
          }
        });
      });
  };

  const syncVisibility = () => {
    panel.hidden = useGameStore.getState().screen !== 'shop';
  };

  const unsubscribe = useGameStore.subscribe((state, prev) => {
    if (state.screen !== prev.screen) syncVisibility();
    if (
      state.cash !== prev.cash ||
      state.unlockedIngredientIds !== prev.unlockedIngredientIds ||
      state.purchasedEquipmentIds !== prev.purchasedEquipmentIds ||
      state.tableCount !== prev.tableCount ||
      state.decorPurchasedCounts !== prev.decorPurchasedCounts ||
      state.gridSize !== prev.gridSize ||
      state.kitchenAnnexOwned !== prev.kitchenAnnexOwned ||
      state.rating !== prev.rating ||
      state.prestige !== prev.prestige
    ) {
      render();
    }
  });

  render();
  syncVisibility();

  const onFoodAtlas = () => render();
  window.addEventListener('food-atlas-ready', onFoodAtlas);

  return () => {
    window.removeEventListener('food-atlas-ready', onFoodAtlas);
    unsubscribe();
    root.remove();
  };
}
