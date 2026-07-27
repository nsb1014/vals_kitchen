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
import {
  ACHIEVEMENT_CATALOG,
  achievementBadgeUrl,
} from '../../domain/achievements/catalog.ts';
import { achievementProgress } from '../../domain/achievements/evaluate.ts';

const ROW_HEIGHT = 88;
type RecipeBookTab = 'recipes' | 'achievements';

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
      <div class="recipe-book-tabs" role="tablist" aria-label="Recipe Book sections">
        <button type="button" class="recipe-book-tab active" id="recipe-tab" role="tab" aria-selected="true">Recipes</button>
        <button type="button" class="recipe-book-tab" id="achievements-tab" role="tab" aria-selected="false">Achievements</button>
      </div>
      <div class="screen-toolbar" id="recipe-toolbar">
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
  const recipesTabEl = root.querySelector('#recipe-tab') as HTMLButtonElement;
  const achievementsTabEl = root.querySelector(
    '#achievements-tab',
  ) as HTMLButtonElement;
  const toolbarEl = root.querySelector('#recipe-toolbar') as HTMLElement;
  const searchEl = root.querySelector('#recipe-search') as HTMLInputElement;
  const scrollEl = root.querySelector('#recipe-scroll') as HTMLElement;
  const innerEl = root.querySelector('#recipe-inner') as HTMLElement;
  const pagerEl = root.querySelector('#recipe-pager') as HTMLElement;

  let query = '';
  let pageIndex = 0;
  let recipesLoaded = isRecipesContentReady();
  let activeTab: RecipeBookTab = 'recipes';

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

  const renderAchievements = () => {
    const state = useGameStore.getState();
    const unlocked = new Set(state.unlockedAchievementIds);
    progressEl.textContent = `${unlocked.size} / ${ACHIEVEMENT_CATALOG.length} unlocked`;
    innerEl.className = 'recipe-virtual-inner achievement-list';
    innerEl.style.height = 'auto';
    innerEl.innerHTML = ACHIEVEMENT_CATALOG.map((achievement) => {
      const isUnlocked = unlocked.has(achievement.id);
      const progress = Math.min(
        achievementProgress(state, achievement),
        achievement.threshold,
      );
      return `
        <article class="achievement-row ${isUnlocked ? 'achievement-unlocked' : 'achievement-locked'}" data-achievement-id="${achievement.id}">
          <img class="achievement-badge" src="${achievementBadgeUrl(achievement.id)}" alt="" width="48" height="48" />
          <div class="achievement-copy">
            <h3><span aria-hidden="true">${isUnlocked ? '✓' : '🔒'}</span> ${achievement.title}</h3>
            <p>${achievement.description}</p>
            <span class="achievement-status">${isUnlocked ? 'Unlocked' : `${progress} / ${achievement.threshold}`}</span>
          </div>
        </article>`;
    }).join('');
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
    const showingRecipes = activeTab === 'recipes';
    recipesTabEl.classList.toggle('active', showingRecipes);
    recipesTabEl.setAttribute('aria-selected', String(showingRecipes));
    achievementsTabEl.classList.toggle('active', !showingRecipes);
    achievementsTabEl.setAttribute('aria-selected', String(!showingRecipes));
    toolbarEl.hidden = !showingRecipes;
    pagerEl.hidden = !showingRecipes;
    if (showingRecipes) {
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
  recipesTabEl.addEventListener('click', () => {
    activeTab = 'recipes';
    scrollEl.scrollTop = 0;
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
    if (visible) void ensureLoaded();
  };

  const unsubscribe = useGameStore.subscribe((state, prev) => {
    if (state.screen !== prev.screen) syncVisibility();
    if (
      state.discoveredRecipeIds !== prev.discoveredRecipeIds ||
      state.recipeMastery !== prev.recipeMastery ||
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
