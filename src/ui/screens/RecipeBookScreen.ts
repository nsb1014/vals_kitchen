import { ensureRecipesLoaded, getDomainContext, isRecipesContentReady } from '../../app/content-loader.ts';
import { useGameStore } from '../../store/game-store.ts';
import {
  buildRecipeBookProgress,
  filterDiscoveredRecipes,
  mapRecipeToEntry,
  paginateRecipeEntries,
  RECIPE_PAGE_SIZE,
  virtualWindowRange,
} from '../presentation/recipe-book.ts';
import { renderFoodIconHtml } from '../components/food-icon.ts';

const ROW_HEIGHT = 88;

export function mountRecipeBookScreen(container: HTMLElement): () => void {
  const root = document.createElement('div');
  root.className = 'screen-root';
  container.appendChild(root);
  root.innerHTML = `
    <section class="screen-panel" id="recipes-screen" data-testid="recipes-screen" hidden>
      <header class="screen-header">
        <h1 class="screen-title">Recipe Book</h1>
        <p class="screen-subtitle" id="recipe-progress">Loading…</p>
      </header>
      <div class="screen-toolbar">
        <label class="screen-field screen-field-grow">
          <span>Search</span>
          <input type="search" id="recipe-search" class="screen-input" placeholder="Search discovered recipes" enterkeyhint="search" />
        </label>
      </div>
      <div class="recipe-virtual-scroll" id="recipe-scroll">
        <div class="recipe-virtual-inner" id="recipe-inner"></div>
      </div>
      <div class="recipe-pager" id="recipe-pager"></div>
    </section>
  `;

  const panel = root.querySelector('#recipes-screen') as HTMLElement;
  const progressEl = root.querySelector('#recipe-progress') as HTMLElement;
  const searchEl = root.querySelector('#recipe-search') as HTMLInputElement;
  const scrollEl = root.querySelector('#recipe-scroll') as HTMLElement;
  const innerEl = root.querySelector('#recipe-inner') as HTMLElement;
  const pagerEl = root.querySelector('#recipe-pager') as HTMLElement;

  let query = '';
  let pageIndex = 0;
  let recipesLoaded = isRecipesContentReady();

  const getEntries = () => {
    const ctx = getDomainContext();
    const state = useGameStore.getState();
    const nameMap = new Map(ctx.ingredients.map((item) => [item.id, item.name]));
    const filtered = filterDiscoveredRecipes(ctx.recipes, state.discoveredRecipeIds, query);
    return filtered.map((recipe) =>
      mapRecipeToEntry(
        recipe,
        nameMap,
        state.recipeMastery[recipe.id] ?? { level: 0, progress: 0 },
      ),
    );
  };

  const renderPager = (totalPages: number) => {
    pagerEl.innerHTML = `
      <button type="button" class="pager-btn" id="recipe-prev" ${pageIndex <= 0 ? 'disabled' : ''}>Prev</button>
      <span class="pager-label">Page ${pageIndex + 1} / ${totalPages}</span>
      <button type="button" class="pager-btn" id="recipe-next" ${pageIndex >= totalPages - 1 ? 'disabled' : ''}>Next</button>
    `;
    pagerEl.querySelector('#recipe-prev')?.addEventListener('click', () => {
      pageIndex = Math.max(0, pageIndex - 1);
      render();
    });
    pagerEl.querySelector('#recipe-next')?.addEventListener('click', () => {
      pageIndex += 1;
      render();
    });
  };

  const renderVirtualRows = (entries: ReturnType<typeof getEntries>) => {
    const page = paginateRecipeEntries(entries, pageIndex, RECIPE_PAGE_SIZE);
    const { start, end, offsetY, totalHeight } = virtualWindowRange(
      scrollEl.scrollTop,
      scrollEl.clientHeight || 400,
      page.entries.length,
      ROW_HEIGHT,
    );

    innerEl.style.height = `${totalHeight}px`;
    const slice = page.entries.slice(start, end);
    innerEl.innerHTML = `
      <div class="recipe-window" style="transform: translateY(${offsetY}px)">
        ${slice
          .map(
            (entry) => `
          <article class="recipe-row" style="height:${ROW_HEIGHT}px">
            <h3>${entry.name} <span class="recipe-mastery">${entry.masteryProgressLabel}</span></h3>
            <p class="recipe-meta">${entry.cuisineTag}</p>
            <p class="recipe-ingredients">${entry.ingredientIds.map((id, i) => `${renderFoodIconHtml(id, 20)}<span>${entry.ingredientNames[i] ?? id}</span>`).join(' ')}</p>
          </article>`,
          )
          .join('')}
      </div>`;

    renderPager(page.totalPages);
  };

  const render = () => {
    const ctx = getDomainContext();
    const state = useGameStore.getState();
    const progress = buildRecipeBookProgress(
      state.discoveredRecipeIds,
      ctx.recipes.length || (recipesLoaded ? 0 : 1000),
    );
    progressEl.textContent = recipesLoaded
      ? progress.percentLabel
      : 'Loading recipe corpus…';

    if (!recipesLoaded) {
      innerEl.innerHTML = '<p class="screen-empty">Fetching recipes…</p>';
      return;
    }

    const entries = getEntries();
    if (entries.length === 0) {
      innerEl.innerHTML =
        '<p class="screen-empty">No discovered recipes yet. Match named combos while serving customers.</p>';
      pagerEl.innerHTML = '';
      return;
    }

    renderVirtualRows(entries);
  };

  const onScroll = () => {
    if (!recipesLoaded) return;
    renderVirtualRows(getEntries());
  };

  scrollEl.addEventListener('scroll', onScroll, { passive: true });
  searchEl.addEventListener('input', () => {
    query = searchEl.value;
    pageIndex = 0;
    scrollEl.scrollTop = 0;
    render();
  });

  const ensureLoaded = async () => {
    if (recipesLoaded) return;
    await ensureRecipesLoaded();
    recipesLoaded = true;
    render();
  };

  const syncVisibility = () => {
    const visible = useGameStore.getState().screen === 'recipes';
    panel.hidden = !visible;
    if (visible) void ensureLoaded();
  };

  const unsubscribe = useGameStore.subscribe((state, prev) => {
    if (state.screen !== prev.screen) syncVisibility();
    if (state.discoveredRecipeIds !== prev.discoveredRecipeIds) render();
  });

  syncVisibility();
  render();

  const onFoodAtlas = () => render();
  window.addEventListener('food-atlas-ready', onFoodAtlas);

  return () => {
    window.removeEventListener('food-atlas-ready', onFoodAtlas);
    unsubscribe();
    scrollEl.removeEventListener('scroll', onScroll);
    root.remove();
  };
}
