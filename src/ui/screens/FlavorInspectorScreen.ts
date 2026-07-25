import { useGameStore } from '../../store/game-store.ts';
import {
  buildInspectorIngredientList,
  inspectorFilterOptions,
  renderFlavorInspectorContent,
} from '../components/FlavorInspectorPanel.ts';
import type { AxisKey } from '../../domain/types.ts';

export function mountFlavorInspectorScreen(container: HTMLElement): () => void {
  const root = document.createElement('div');
  root.className = 'screen-root';
  container.appendChild(root);
  root.innerHTML = `
    <section class="screen-panel" id="inspector-screen" data-testid="inspector-screen" hidden>
      <header class="screen-header">
        <h1 class="screen-title">Flavor Inspector</h1>
        <p class="screen-subtitle">16-axis profiles for unlocked ingredients</p>
      </header>
      <div class="screen-toolbar">
        <label class="screen-field">
          <span>Filter</span>
          <select id="inspector-filter" class="screen-select">${inspectorFilterOptions()}</select>
        </label>
      </div>
      <div class="inspector-layout">
        <div class="inspector-list" id="inspector-list" role="listbox" aria-label="Unlocked ingredients"></div>
        <div class="inspector-detail" id="inspector-detail" data-testid="inspector-detail" aria-live="polite"></div>
      </div>
    </section>
  `;

  const panel = root.querySelector('#inspector-screen') as HTMLElement;
  const listEl = root.querySelector('#inspector-list') as HTMLElement;
  const detailEl = root.querySelector('#inspector-detail') as HTMLElement;
  const filterEl = root.querySelector('#inspector-filter') as HTMLSelectElement;

  let selectedId: string | null = null;
  let filterAxis: AxisKey | 'none' = 'none';

  const renderList = () => {
    const state = useGameStore.getState();
    listEl.innerHTML = buildInspectorIngredientList(state.unlockedIngredientIds, filterAxis);
    if (!selectedId || !state.unlockedIngredientIds.includes(selectedId)) {
      selectedId = state.unlockedIngredientIds[0] ?? null;
    }
    listEl.querySelectorAll<HTMLButtonElement>('[data-ingredient-id]').forEach((button) => {
      const id = button.dataset.ingredientId!;
      button.classList.toggle('selected', id === selectedId);
      button.addEventListener('click', () => {
        selectedId = id;
        renderList();
        renderDetail();
      });
    });
  };

  const renderDetail = () => {
    if (!selectedId) {
      detailEl.innerHTML = '<p class="screen-empty">Unlock ingredients to inspect flavors.</p>';
      return;
    }
    detailEl.innerHTML = renderFlavorInspectorContent(selectedId);
  };

  filterEl.addEventListener('change', () => {
    filterAxis = (filterEl.value as AxisKey | 'none') || 'none';
    renderList();
    renderDetail();
  });

  const syncVisibility = () => {
    const state = useGameStore.getState();
    panel.hidden = state.screen !== 'inspector';
  };

  const unsubscribe = useGameStore.subscribe((state, prev) => {
    if (state.screen !== prev.screen) syncVisibility();
    if (state.unlockedIngredientIds !== prev.unlockedIngredientIds) {
      renderList();
      renderDetail();
    }
  });

  renderList();
  renderDetail();
  syncVisibility();

  const onFoodAtlas = () => {
    renderList();
    renderDetail();
  };
  window.addEventListener('food-atlas-ready', onFoodAtlas);

  return () => {
    window.removeEventListener('food-atlas-ready', onFoodAtlas);
    unsubscribe();
    root.remove();
  };
}

export function mountFlavorInspectorModal(overlayMount: HTMLElement): () => void {
  const modal = document.createElement('div');
  modal.id = 'flavor-inspector-modal';
  modal.className = 'modal-backdrop';
  modal.hidden = true;
  overlayMount.appendChild(modal);

  const render = () => {
    const state = useGameStore.getState();
    const ingredientId = state.flavorInspectorIngredientId;
    if (!ingredientId) {
      modal.hidden = true;
      modal.innerHTML = '';
      return;
    }

    modal.hidden = false;
    modal.innerHTML = `
      <div class="modal-card flavor-modal-card" role="dialog" aria-labelledby="flavor-modal-title">
        <div class="modal-card-header">
          <h2 id="flavor-modal-title">Ingredient Profile</h2>
          <button type="button" class="icon-btn" id="close-flavor-modal" aria-label="Close">✕</button>
        </div>
        ${renderFlavorInspectorContent(ingredientId)}
        <button type="button" class="service-btn" id="close-flavor-modal-bottom">Back to compose</button>
      </div>
    `;

    const close = () => useGameStore.getState().closeFlavorInspector();
    modal.querySelector('#close-flavor-modal')?.addEventListener('click', close);
    modal.querySelector('#close-flavor-modal-bottom')?.addEventListener('click', close);
    modal.addEventListener(
      'click',
      (event) => {
        if (event.target === modal) close();
      },
      { once: true },
    );
  };

  const unsubscribe = useGameStore.subscribe((state, prev) => {
    if (state.flavorInspectorIngredientId !== prev.flavorInspectorIngredientId) {
      render();
    }
  });

  render();

  return () => {
    unsubscribe();
    modal.remove();
  };
}
