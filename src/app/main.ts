import '../ui/styles/global.css';
import '../ui/styles/service-day.css';
import '../ui/styles/screens.css';
import { loadBootContent, preloadDeferredContent } from './content-loader.ts';
import { mountAppShell } from './AppShell.ts';
import { showScreen, subscribeScreenFromStore } from './screenRouter.ts';
import { mountLayoutToolbar } from '../ui/components/LayoutToolbar.ts';
import { mountServiceDayUi } from '../ui/components/ServiceDayUi.ts';
import { mountNavigationBar } from '../ui/screens/NavigationBar.ts';
import { useGameStore } from '../store/game-store.ts';
import type { RestaurantApp } from '../canvas/RestaurantApp.ts';
import { attachAudioBridge } from './audio-bridge.ts';
import { installE2eBridge } from './e2e-bridge.ts';

async function bootstrap(): Promise<void> {
  installE2eBridge();
  await loadBootContent();

  const { canvasMount, chromeMount, overlayMount, bubbleMount, hud, surface } = mountAppShell();
  showScreen('restaurant');

  const screensMount = document.createElement('div');
  screensMount.id = 'screens-mount';
  screensMount.className = 'screens-mount';
  surface.appendChild(screensMount);

  const navMount = document.createElement('div');
  navMount.id = 'nav-mount';
  navMount.className = 'nav-mount';
  surface.appendChild(navMount);

  await useGameStore.getState().hydrate();
  mountLayoutToolbar(hud);
  mountNavigationBar(navMount);

  const [
    { mountFlavorInspectorScreen, mountFlavorInspectorModal },
    { mountShopScreen },
    { mountRecipeBookScreen },
    { mountRatingScreen },
    { mountSettingsScreen },
  ] = await Promise.all([
    import('../ui/screens/FlavorInspectorScreen.ts'),
    import('../ui/screens/ShopScreen.ts'),
    import('../ui/screens/RecipeBookScreen.ts'),
    import('../ui/screens/RatingScreen.ts'),
    import('../ui/screens/SettingsScreen.ts'),
  ]);

  const teardownScreens = [
    mountFlavorInspectorScreen(screensMount),
    mountShopScreen(screensMount),
    mountRecipeBookScreen(screensMount),
    mountRatingScreen(screensMount),
    mountSettingsScreen(screensMount),
  ];
  const teardownFlavorModal = mountFlavorInspectorModal(overlayMount);

  preloadDeferredContent();

  let restaurantApp: RestaurantApp | null = null;
  const teardownServiceUi = mountServiceDayUi(
    overlayMount,
    bubbleMount,
    () => restaurantApp,
    chromeMount,
  );

  const unsubscribeScreen = subscribeScreenFromStore(
    useGameStore.subscribe,
    () => useGameStore.getState().screen,
  );

  const { RestaurantApp: RestaurantAppClass } = await import('../canvas/RestaurantApp.ts');
  restaurantApp = await RestaurantAppClass.create(canvasMount);
  restaurantApp.start();

  let teardownAudioUnlock: (() => void) | undefined;
  void import('../assets/runtime-bootstrap.ts').then(async ({ bootstrapRuntimeAssets }) => {
    teardownAudioUnlock = await bootstrapRuntimeAssets({
      surface,
      onRestaurantAtlasesReady: () => {
        restaurantApp?.syncFromStore(useGameStore.getState());
      },
    });
  });

  const loadFoodWhenNeeded = () => {
    void import('../assets/runtime-bootstrap.ts').then(({ preloadFoodIconsIfNeeded }) =>
      preloadFoodIconsIfNeeded(),
    );
  };
  useGameStore.subscribe((state, prev) => {
    const foodScreen = state.screen === 'shop' || state.screen === 'inspector' || state.screen === 'recipes';
    const wasFoodScreen =
      prev.screen === 'shop' || prev.screen === 'inspector' || prev.screen === 'recipes';
    if (foodScreen && !wasFoodScreen) loadFoodWhenNeeded();
    if (state.activeDay && !prev.activeDay) loadFoodWhenNeeded();
  });
  if (useGameStore.getState().activeDay) loadFoodWhenNeeded();

  const teardownAudioBridge = attachAudioBridge();

  window.addEventListener('beforeunload', () => {
    unsubscribeScreen();
    teardownFlavorModal();
    teardownScreens.forEach((teardown) => teardown());
    teardownServiceUi();
    teardownAudioUnlock?.();
    teardownAudioBridge();
    restaurantApp?.destroy();
  });
}

bootstrap().catch((error) => {
  console.error('Boot failed', error);
  const root = document.querySelector('#game-root');
  if (root) {
    root.innerHTML = `<p class="boot-error">Failed to start: ${String(error)}</p>`;
  }
});
