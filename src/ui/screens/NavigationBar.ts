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
  recipes: 'Recipe Book',
  rating: 'Rating',
  settings: 'Settings',
};

const NAV_ICONS: Record<ScreenId, string> = {
  restaurant: '<path d="M3 11.5 12 4l9 7.5v8a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  shop: '<path d="M4 9h16l-1.4-5H5.4zM6 9v11h12V9M9 20v-6h6v6"/>',
  inspector: '<path d="M7 3h10M9 3v5l-4.5 8a3 3 0 0 0 2.6 4.5h9.8a3 3 0 0 0 2.6-4.5L15 8V3M7 15h10"/>',
  recipes: '<path d="M4 5.5A3.5 3.5 0 0 1 7.5 2H12v18H7.5A3.5 3.5 0 0 0 4 23.5zM20 5.5A3.5 3.5 0 0 0 16.5 2H12v18h4.5a3.5 3.5 0 0 1 3.5 3.5z"/>',
  rating: '<path d="m12 2.5 2.9 5.9 6.5.9-4.7 4.6 1.1 6.5-5.8-3-5.8 3 1.1-6.5-4.7-4.6 6.5-.9z"/>',
  settings: '<path d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7zM19.4 15a8 8 0 0 0 0-6l2-1.5-2-3.4-2.4 1a8 8 0 0 0-5.2-3L11.5 0h-4L7 3a8 8 0 0 0-3.9 3.9l-2.7-1-2 3.4L.6 11a8 8 0 0 0 0 2l-2.2 1.7 2 3.4 2.7-1A8 8 0 0 0 7 21l.5 3h4l.3-2.1a8 8 0 0 0 5.2-3l2.4 1 2-3.4z"/>',
};

export function mountNavigationBar(container: HTMLElement): () => void {
  container.innerHTML = `
    <nav class="bottom-nav" id="bottom-nav" aria-label="Main navigation">
      ${NAV_SCREENS.map(
        (id) =>
          `<button type="button" class="nav-btn" data-screen="${id}" data-testid="nav-${id}" aria-label="${NAV_LABELS[id]}"><svg class="nav-icon" viewBox="0 0 24 24" aria-hidden="true">${NAV_ICONS[id]}</svg><span>${NAV_LABELS[id]}</span></button>`,
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
