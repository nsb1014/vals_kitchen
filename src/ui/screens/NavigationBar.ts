import { showScreen } from '../../app/screenRouter.ts';
import { useGameStore, type ScreenId } from '../../store/game-store.ts';
import {
  NAV_SCREENS,
  navigationLockReason,
  selectCanNavigateTo,
  selectNavigationLocked,
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
      if (!selectCanNavigateTo(state, target)) return;
      state.navigateTo(target);
      showScreen(target);
    });
  });

  const sync = () => {
    const state = useGameStore.getState();
    const locked = selectNavigationLocked(state);
    hint.hidden = !locked;
    hint.textContent = navigationLockReason(state) ?? '';

    nav.querySelectorAll<HTMLButtonElement>('.nav-btn').forEach((button) => {
      const target = button.dataset.screen as ScreenId;
      const active = state.screen === target;
      const disabled = !selectCanNavigateTo(state, target);
      button.classList.toggle('active', active);
      button.disabled = disabled && !active;
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
