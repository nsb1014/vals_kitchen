import {
  ensureRecipesLoaded,
  getDomainContext,
  isRecipesContentReady,
} from '../../app/content-loader.ts';
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
import {
  ACHIEVEMENT_CATALOG,
  achievementBadgeUrl,
} from '../../domain/achievements/catalog.ts';
import { achievementProgressView } from '../../domain/achievements/nearest.ts';
import type { AxisKey } from '../../domain/types.ts';
import {
  buildInspectorIngredientList,
  inspectorFilterOptions,
  renderFlavorInspectorContent,
} from '../components/FlavorInspectorPanel.ts';

const ROW_HEIGHT = 96;
type RecipeBookTab = 'flavors' | 'recipes' | 'achievements';

export function mountRecipeBookScreen(container: HTMLElement): () => void {
  const root = document.createElement('div');
  root.className = 'screen-root';
  container.appendChild(root);
  root.innerHTML = `
    <section class="screen-panel sheet-tier-meta-full meta-screen" id="recipes-screen" data-testid="recipes-screen" hidden>
      <header class="screen-header">
        <h1 class="screen-title">Recipe Book</h1>
        <p class="screen-subtitle" id="recipe-progress">Loading…</p>
      </header>
      <div class="recipe-book-tabs" role="tablist" aria-label="Recipe Book sections">
        <button type="button" class="recipe-book-tab active" id="flavors-tab" role="tab" aria-selected="true">Flavors</button>
        <button type="button" class="recipe-book-tab" id="recipe-tab" role="tab" aria-selected="false">Recipes</button>
        <button type="button" class="recipe-book-tab" id="achievements-tab" role="tab" aria-selected="false">Achievements</button>
      </div>
      <div class="screen-toolbar" id="recipe-toolbar">
        <label class="screen-field screen-field-grow" id="flavor-filter-field">
          <span>Flavor filter</span>
          <select id="recipe-flavor-filter" class="screen-select">${inspectorFilterOptions()}</select>
        </label>
        <label class="screen-field screen-field-grow" id="recipe-search-field" hidden>
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
  const flavorsTabEl = root.querySelector('#flavors-tab') as HTMLButtonElement;
  const recipesTabEl = root.querySelector('#recipe-tab') as HTMLButtonElement;
  const achievementsTabEl = root.querySelector(
    '#achievements-tab',
  ) as HTMLButtonElement;
  const toolbarEl = root.querySelector('#recipe-toolbar') as HTMLElement;
  const flavorFilterFieldEl = root.querySelector('#flavor-filter-field') as HTMLElement;
  const flavorFilterEl = root.querySelector('#recipe-flavor-filter') as HTMLSelectElement;
  const recipeSearchFieldEl = root.querySelector('#recipe-search-field') as HTMLElement;
  const searchEl = root.querySelector('#recipe-search') as HTMLInputElement;
  const scrollEl = root.querySelector('#recipe-scroll') as HTMLElement;
  const innerEl = root.querySelector('#recipe-inner') as HTMLElement;
  const pagerEl = root.querySelector('#recipe-pager') as HTMLElement;

  let query = '';
  let pageIndex = 0;
  let recipesLoaded = isRecipesContentReady();
  let activeTab: RecipeBookTab = 'flavors';
  let selectedFlavorId: string | null = null;
  let flavorFilterAxis: AxisKey | 'none' = 'none';

  const getEntries = () => {
    const ctx = getDomainContext();
    const state = useGameStore.getState();
    const nameMap = new Map(
      ctx.ingredients.map((item) => [item.id, item.name]),
    );
    const filtered = filterDiscoveredRecipes(
      ctx.recipes,
      state.discoveredRecipeIds,
      query,
    );
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
    innerEl.className = 'recipe-virtual-inner';
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
          .map((entry) => {
            const ratio = Math.round((entry.masteryRatio ?? 0) * 100);
            return `
          <article class="recipe-row" style="height:${ROW_HEIGHT}px">
            <h3>${entry.name} <span class="recipe-mastery">${entry.masteryProgressLabel}</span></h3>
            <div class="recipe-mastery-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${ratio}" aria-label="Mastery progress">
              <span class="recipe-mastery-bar-fill" style="width:${ratio}%"></span>
            </div>
            <p class="recipe-meta">${entry.cuisineTag}</p>
            <p class="recipe-ingredients">${entry.ingredientIds.map((id, i) => `${renderFoodIconHtml(id, 20)}<span>${entry.ingredientNames[i] ?? id}</span>`).join(' ')}</p>
          </article>`;
          })
          .join('')}
      </div>`;

    renderPager(page.totalPages);
  };

  const renderAchievements = () => {
    const state = useGameStore.getState();
    const unlocked = new Set(state.unlockedAchievementIds);
    progressEl.textContent = `${unlocked.size} / ${ACHIEVEMENT_CATALOG.length} unlocked`;
    innerEl.className = 'recipe-virtual-inner achievement-list';
    innerEl.style.height = 'auto';
    innerEl.innerHTML = ACHIEVEMENT_CATALOG.map((achievement) => {
      const view = achievementProgressView(state, achievement, unlocked);
      const percent = Math.round(view.ratio * 100);
      const nearClass = view.nearComplete ? ' achievement-near-complete' : '';
      return `
        <article class="achievement-row ${view.unlocked ? 'achievement-unlocked' : 'achievement-locked'}${nearClass}" data-achievement-id="${achievement.id}" data-achievement-family="${achievement.family}">
          <img class="achievement-badge" src="${achievementBadgeUrl(achievement.id)}" alt="" width="48" height="48" />
          <div class="achievement-copy">
            <h3><span aria-hidden="true">${view.unlocked ? '✓' : '🔒'}</span> ${achievement.title}</h3>
            <p>${achievement.description}</p>
            <div class="achievement-progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${view.unlocked ? 100 : percent}" aria-label="${achievement.title} progress">
              <span class="achievement-progress-fill" style="width:${view.unlocked ? 100 : percent}%"></span>
            </div>
            <span class="achievement-status">${view.unlocked ? 'Unlocked' : `${view.progress} / ${view.threshold}`}</span>
          </div>
        </article>`;
    }).join('');
    pagerEl.innerHTML = '';
  };

  const renderFlavors = () => {
    const state = useGameStore.getState();
    if (
      !selectedFlavorId ||
      !state.unlockedIngredientIds.includes(selectedFlavorId)
    ) {
      selectedFlavorId = state.unlockedIngredientIds[0] ?? null;
    }
    progressEl.textContent = `${state.unlockedIngredientIds.length} ingredients unlocked`;
    innerEl.className = 'recipe-virtual-inner flavor-book-layout';
    innerEl.style.height = 'auto';
    innerEl.innerHTML = `
      <div class="inspector-list" id="recipe-flavor-list" role="listbox" aria-label="Unlocked ingredients">
        ${buildInspectorIngredientList(state.unlockedIngredientIds, flavorFilterAxis)}
      </div>
      <div class="inspector-detail" id="recipe-flavor-detail" data-testid="recipe-flavor-detail" aria-live="polite">
        ${
          selectedFlavorId
            ? renderFlavorInspectorContent(selectedFlavorId)
            : '<p class="screen-empty">Unlock ingredients to inspect flavors.</p>'
        }
      </div>
    `;
    innerEl
      .querySelectorAll<HTMLButtonElement>('[data-ingredient-id]')
      .forEach((button) => {
        const id = button.dataset.ingredientId;
        if (!id) return;
        button.classList.toggle('selected', id === selectedFlavorId);
        button.addEventListener('click', () => {
          selectedFlavorId = id;
          renderFlavors();
        });
      });
    pagerEl.innerHTML = '';
  };

  const renderRecipes = () => {
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

  const render = () => {
    const showingFlavors = activeTab === 'flavors';
    const showingRecipes = activeTab === 'recipes';
    flavorsTabEl.classList.toggle('active', showingFlavors);
    flavorsTabEl.setAttribute('aria-selected', String(showingFlavors));
    recipesTabEl.classList.toggle('active', showingRecipes);
    recipesTabEl.setAttribute('aria-selected', String(showingRecipes));
    achievementsTabEl.classList.toggle('active', activeTab === 'achievements');
    achievementsTabEl.setAttribute(
      'aria-selected',
      String(activeTab === 'achievements'),
    );
    toolbarEl.hidden = activeTab === 'achievements';
    flavorFilterFieldEl.hidden = !showingFlavors;
    recipeSearchFieldEl.hidden = !showingRecipes;
    pagerEl.hidden = !showingRecipes;
    if (showingFlavors) {
      renderFlavors();
    } else if (showingRecipes) {
      renderRecipes();
    } else {
      renderAchievements();
    }
  };

  const onScroll = () => {
    if (activeTab !== 'recipes' || !recipesLoaded) return;
    renderVirtualRows(getEntries());
  };

  scrollEl.addEventListener('scroll', onScroll, { passive: true });
  searchEl.addEventListener('input', () => {
    query = searchEl.value;
    pageIndex = 0;
    scrollEl.scrollTop = 0;
    render();
  });
  flavorFilterEl.addEventListener('change', () => {
    flavorFilterAxis = (flavorFilterEl.value as AxisKey | 'none') || 'none';
    render();
  });
  flavorsTabEl.addEventListener('click', () => {
    activeTab = 'flavors';
    scrollEl.scrollTop = 0;
    render();
  });
  recipesTabEl.addEventListener('click', () => {
    activeTab = 'recipes';
    scrollEl.scrollTop = 0;
    void ensureLoaded();
    render();
  });
  achievementsTabEl.addEventListener('click', () => {
    activeTab = 'achievements';
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
    if (visible && activeTab === 'recipes') void ensureLoaded();
  };

  const unsubscribe = useGameStore.subscribe((state, prev) => {
    if (state.screen !== prev.screen) syncVisibility();
    if (
      state.discoveredRecipeIds !== prev.discoveredRecipeIds ||
      state.recipeMastery !== prev.recipeMastery ||
      state.unlockedIngredientIds !== prev.unlockedIngredientIds ||
      state.unlockedAchievementIds !== prev.unlockedAchievementIds ||
      state.decorPurchasedCounts !== prev.decorPurchasedCounts ||
      state.tableCount !== prev.tableCount ||
      state.day !== prev.day ||
      state.prestige !== prev.prestige ||
      state.stats !== prev.stats
    ) {
      render();
    }
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
