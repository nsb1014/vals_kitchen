import {
  getDomainContext,
  getEquipmentCatalog,
  getEquipmentNameMap,
} from '../../app/content-loader.ts';
import { useGameStore } from '../../store/game-store.ts';
import {
  buildEquipmentShopRows,
  buildIngredientShopRows,
  buildUtilityShopRows,
  formatShopCost,
  shopAvailabilityClass,
  shopAvailabilityLabel,
} from '../presentation/shop-items.ts';
import { renderFoodIconHtml } from '../components/food-icon.ts';

export function mountShopScreen(container: HTMLElement): () => void {
  const root = document.createElement('div');
  root.className = 'screen-root';
  container.appendChild(root);
  root.innerHTML = `
    <section class="screen-panel" id="shop-screen" data-testid="shop-screen" hidden>
      <header class="screen-header">
        <h1 class="screen-title">Shop</h1>
        <p class="screen-subtitle" id="shop-cash">Cash: $0</p>
      </header>
      <div class="shop-sections" id="shop-sections"></div>
    </section>
  `;

  const panel = root.querySelector('#shop-screen') as HTMLElement;
  const cashEl = root.querySelector('#shop-cash') as HTMLElement;
  const sectionsEl = root.querySelector('#shop-sections') as HTMLElement;

  const renderRow = (
    title: string,
    subtitle: string,
    cost: number,
    availability: ReturnType<typeof buildEquipmentShopRows>[number]['availability'],
    purchaseId: string,
    meta?: string,
    iconIngredientId?: string,
  ): string => {
    const canBuy = availability === 'available';
    const icon = iconIngredientId ? renderFoodIconHtml(iconIngredientId, 28) : '';
    return `
      <article class="shop-item ${shopAvailabilityClass(availability)}">
        <div class="shop-item-body">
          <div class="shop-item-title-row">${icon}<h3>${title}</h3></div>
          ${meta ? `<p class="shop-item-meta">${meta}</p>` : ''}
          <p class="shop-item-sub">${subtitle}</p>
        </div>
        <div class="shop-item-actions">
          <span class="shop-item-cost">${formatShopCost(cost, availability)}</span>
          <button type="button" class="shop-buy-btn" data-purchase-id="${purchaseId}" ${canBuy ? '' : 'disabled'}>${shopAvailabilityLabel(availability)}</button>
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

    cashEl.textContent = `Cash: $${state.cash.toLocaleString('en-US')}`;

    sectionsEl.innerHTML = `
      <section class="shop-section">
        <h2 class="shop-section-title">Kitchen Equipment</h2>
        ${equipmentRows
          .map((row) =>
            renderRow(
              row.name,
              `Unlocks ${row.groupName} ingredients`,
              row.cost,
              row.availability,
              `equipment:${row.id}`,
            ),
          )
          .join('') || '<p class="screen-empty">All equipment owned.</p>'}
      </section>
      <section class="shop-section">
        <h2 class="shop-section-title">Ingredients</h2>
        ${ingredientRows
          .slice(0, 80)
          .map((row) =>
            renderRow(
              row.name,
              row.availability === 'gate_locked'
                ? `Requires ${row.equipmentGateName}`
                : row.category,
              row.cost,
              row.availability,
              `ingredient:${row.id}`,
              row.availability === 'gate_locked' ? '🔒 Gate locked' : undefined,
              row.id,
            ),
          )
          .join('') || '<p class="screen-empty">All eligible ingredients owned.</p>'}
      </section>
      <section class="shop-section">
        <h2 class="shop-section-title">Layout</h2>
        ${utilityRows
          .map((row) =>
            renderRow(row.name, row.description, row.cost, row.availability, row.id),
          )
          .join('')}
      </section>
    `;

    sectionsEl.querySelectorAll<HTMLButtonElement>('.shop-buy-btn').forEach((button) => {
      button.addEventListener('click', async () => {
        const id = button.dataset.purchaseId;
        if (!id) return;
        const store = useGameStore.getState();
        if (id.startsWith('equipment:')) {
          const equipmentId = id.slice('equipment:'.length);
          await store.dispatch({
            type: 'PURCHASE',
            purchase: { type: 'equipment', equipmentId },
          });
          store.startPlacement(equipmentId);
          return;
        }
        if (id.startsWith('ingredient:')) {
          await store.dispatch({
            type: 'PURCHASE',
            purchase: { type: 'ingredient', ingredientId: id.slice('ingredient:'.length) },
          });
          return;
        }
        if (id === 'table') {
          await store.dispatch({ type: 'PURCHASE', purchase: { type: 'table' } });
          store.startPlacement('table_2seat');
          return;
        }
        if (id === 'grid_expansion') {
          await store.dispatch({ type: 'PURCHASE', purchase: { type: 'grid_expansion' } });
          return;
        }
        if (id === 'kitchen_annex') {
          await store.dispatch({ type: 'PURCHASE', purchase: { type: 'kitchen_annex' } });
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
      state.gridSize !== prev.gridSize ||
      state.kitchenAnnexOwned !== prev.kitchenAnnexOwned
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
