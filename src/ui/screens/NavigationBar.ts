import { showScreen } from '../../app/screenRouter.ts';
import { useGameStore, type ScreenId } from '../../store/game-store.ts';
import {
  NAV_SCREENS,
  navigationLockReason,
  selectCanNavigateTo,
  shouldShowNavigationLockHint,
} from '../../store/selectors/navigation.ts';

const NAV_LABELS: Record<ScreenId, string> = {
  restaurant: 'Floor',
  shop: 'Shop',
  inspector: 'Flavors',
  recipes: 'Recipes',
  rating: 'Rating',
  settings: 'Settings',
};

export function mountNavigationBar(container: HTMLElement): () => void {
  container.innerHTML = `
    <nav class="bottom-nav" id="bottom-nav" aria-label="Main navigation">
      ${NAV_SCREENS.map(
        (id) =>
          `<button type="button" class="nav-btn" data-screen="${id}" data-testid="nav-${id}" aria-label="${NAV_LABELS[id]}">${NAV_LABELS[id]}</button>`,
      ).join('')}
    </nav>
    <p class="nav-lock-hint" id="nav-lock-hint" hidden></p>
  `;

  const nav = container.querySelector('#bottom-nav') as HTMLElement;
  const hint = container.querySelector('#nav-lock-hint') as HTMLElement;

  nav.querySelectorAll<HTMLButtonElement>('.nav-btn').forEach((button) => {
    button.addEventListener('click', () => {
      const target = button.dataset.screen as ScreenId;
      const state = useGameStore.getState();
      if (!selectCanNavigateTo(state, target)) {
        const reason = navigationLockReason(state);
        if (reason) state.setFloorToast(reason);
        return;
      }
      state.navigateTo(target);
      showScreen(target);
    });
  });

  const sync = () => {
    const state = useGameStore.getState();
    const showHint = shouldShowNavigationLockHint(state);
    hint.hidden = !showHint;
    hint.textContent = showHint ? (navigationLockReason(state) ?? '') : '';

    nav.querySelectorAll<HTMLButtonElement>('.nav-btn').forEach((button) => {
      const target = button.dataset.screen as ScreenId;
      const active = state.screen === target;
      const locked = !selectCanNavigateTo(state, target) && !active;
      button.classList.toggle('active', active);
      // Keep clickable so a blocked tap can show a transient floor toast (not a pinned banner).
      button.disabled = false;
      button.setAttribute('aria-disabled', locked ? 'true' : 'false');
      button.classList.toggle('nav-btn-locked', locked);
      button.setAttribute('aria-current', active ? 'page' : 'false');
    });

    nav.hidden = Boolean(state.activeDay && !state.daySummary && state.screen === 'restaurant');
  };

  const unsubscribe = useGameStore.subscribe((state, prev) => {
    if (
      state.screen !== prev.screen ||
      state.activeDay !== prev.activeDay ||
      state.daySummary !== prev.daySummary
    ) {
      sync();
    }
  });

  sync();

  return () => {
    unsubscribe();
    container.innerHTML = '';
  };
}
