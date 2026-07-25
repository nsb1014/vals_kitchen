import { createStore } from 'zustand/vanilla';
import { ensureContentForAction, getDomainContext } from '../app/content-loader.ts';
import { isDayComplete } from '../domain/day/serve.ts';
import { dayBonusEarnings } from '../domain/economy/tips.ts';
import { validatePlacement } from '../domain/economy/purchases.ts';
import { gameReducer, type GameAction, type ReducerEvent } from '../domain/reducer.ts';
import {
  createNewGameState,
  type GameState,
  type Placement,
} from '../domain/state/game-state.ts';
import { exportSaveCode, parseSaveCode } from '../persistence/index.ts';
import { defaultSaveRepository, requestPersistentStorage } from '../persistence/index.ts';
import type { RecentReviewEntry } from '../ui/presentation/rating-display.ts';
import { buildDaySummaryDisplay, type DaySummaryDisplay } from '../ui/presentation/day-summary-display.ts';
import { selectCanNavigateTo } from './selectors/navigation.ts';

import { mapReducerEventsToUi } from './service-events.ts';

export type ScreenId =
  | 'restaurant'
  | 'shop'
  | 'inspector'
  | 'recipes'
  | 'rating'
  | 'settings';

export interface ServeReview {
  matchStars: number;
  tip: number;
  ratingDelta: number;
  recipeName: string | null;
}

export type CeremonyKind = 'prestige' | 'soft_reset';

interface StoreMeta {
  screen: ScreenId;
  editLayoutMode: boolean;
  hydrated: boolean;
  persistGranted: boolean;
  modifierDismissed: boolean;
  pendingReview: ServeReview | null;
  daySummary: DaySummaryDisplay | null;
  ceremony: CeremonyKind | null;
  ceremonyPrestige: number | null;
  dayStartRating: number | null;
  recentReviews: RecentReviewEntry[];
  flavorInspectorIngredientId: string | null;
  pendingPlacementItemKey: string | null;
  audioEnabled: boolean;
  musicEnabled: boolean;
}

export interface GameStore extends GameState, StoreMeta {
  hydrate: () => Promise<void>;
  dispatch: (action: GameAction) => Promise<void>;
  dismissModifier: () => void;
  dismissDaySummary: () => void;
  dismissCeremony: () => void;
  toggleEditLayout: () => void;
  navigateTo: (screen: ScreenId) => void;
  openFlavorInspector: (ingredientId: string) => void;
  closeFlavorInspector: () => void;
  startPlacement: (itemKey: string) => void;
  cancelPlacement: () => void;
  importSaveCode: (code: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  exportSaveCodeToClipboard: () => Promise<{ ok: true; code: string } | { ok: false; error: string }>;
  setAudioEnabled: (enabled: boolean) => void;
  setMusicEnabled: (enabled: boolean) => void;
  movePlacement: (placementId: string, x: number, y: number) => boolean;
  canPlaceAt: (placement: Placement, excludeId?: string) => boolean;
  autosave: () => Promise<void>;
}

const META_KEYS = [
  'hydrate',
  'dispatch',
  'dismissModifier',
  'dismissDaySummary',
  'dismissCeremony',
  'toggleEditLayout',
  'movePlacement',
  'canPlaceAt',
  'autosave',
  'navigateTo',
  'openFlavorInspector',
  'closeFlavorInspector',
  'startPlacement',
  'cancelPlacement',
  'importSaveCode',
  'exportSaveCodeToClipboard',
  'setAudioEnabled',
  'setMusicEnabled',
  'screen',
  'editLayoutMode',
  'hydrated',
  'persistGranted',
  'modifierDismissed',
  'pendingReview',
  'daySummary',
  'ceremony',
  'ceremonyPrestige',
  'dayStartRating',
  'recentReviews',
  'flavorInspectorIngredientId',
  'pendingPlacementItemKey',
  'audioEnabled',
  'musicEnabled',
] as const;

function pickGameState(store: GameStore): GameState {
  const copy = { ...store } as Record<string, unknown>;
  for (const key of META_KEYS) {
    delete copy[key];
  }
  return copy as unknown as GameState;
}

function mergeReducerState(
  current: GameStore,
  nextState: GameState,
): Partial<GameStore> {
  const recentReviews =
    current.recentReviews.length > 0 ? current.recentReviews : [];
  return {
    ...nextState,
    screen: current.screen,
    editLayoutMode: current.editLayoutMode,
    hydrated: current.hydrated,
    persistGranted: current.persistGranted,
    modifierDismissed: current.modifierDismissed,
    pendingReview: current.pendingReview,
    daySummary: current.daySummary,
    ceremony: current.ceremony,
    ceremonyPrestige: current.ceremonyPrestige,
    dayStartRating: current.dayStartRating,
    recentReviews,
    flavorInspectorIngredientId: current.flavorInspectorIngredientId,
    pendingPlacementItemKey: current.pendingPlacementItemKey,
    audioEnabled: current.audioEnabled,
    musicEnabled: current.musicEnabled,
  };
}

function applyReducerEvents(
  events: ReducerEvent[],
  patch: Partial<GameStore>,
  before: GameState,
  existingReviews: RecentReviewEntry[],
): void {
  Object.assign(patch, mapReducerEventsToUi(events, before, existingReviews));
}

function buildDaySummary(
  before: GameState,
  after: GameState,
): DaySummaryDisplay {
  const activeDay = before.activeDay!;
  const averageMatch =
    activeDay.customersServed > 0
      ? activeDay.dayMatchSum / activeDay.customersServed
      : 0;
  const dayBonus = dayBonusEarnings(activeDay.dayEarnings, averageMatch);
  return buildDaySummaryDisplay({
    dayEarnings: activeDay.dayEarnings,
    dayBonus,
    averageMatch,
    ratingStart: before.rating,
    ratingEnd: after.rating,
    customersServed: activeDay.customersServed,
    unlockCount: before.unlockedIngredientIds.length,
    totalIngredients: getDomainContext().ingredients.length,
  });
}

export const useGameStore = createStore<GameStore>((set, get) => ({
  ...createNewGameState(),
  screen: 'restaurant',
  editLayoutMode: true,
  hydrated: false,
  persistGranted: false,
  modifierDismissed: false,
  pendingReview: null,
  daySummary: null,
  ceremony: null,
  ceremonyPrestige: null,
  dayStartRating: null,
  recentReviews: [],
  flavorInspectorIngredientId: null,
  pendingPlacementItemKey: null,
  audioEnabled: true,
  musicEnabled: false,

  async hydrate() {
    const persist = await requestPersistentStorage();
    const loaded = await defaultSaveRepository.load();
    const state = loaded.state ?? createNewGameState();
    set({
      ...state,
      screen: 'restaurant',
      editLayoutMode: state.activeDay ? false : true,
      hydrated: true,
      persistGranted: persist.granted,
      modifierDismissed: state.activeDay ? true : false,
      pendingReview: null,
      daySummary: null,
      ceremony: null,
      ceremonyPrestige: null,
      dayStartRating: state.activeDay ? state.rating : null,
      recentReviews: [],
      flavorInspectorIngredientId: null,
      pendingPlacementItemKey: null,
      audioEnabled: true,
      musicEnabled: false,
    });
  },

  async dispatch(action) {
    await ensureContentForAction(action.type);
    const ctx = getDomainContext();
    const current = get();
    const before = pickGameState(current);
    const result = gameReducer(before, action, ctx);
    const patch: Partial<GameStore> = mergeReducerState(current, result.state);
    applyReducerEvents(result.events, patch, before, current.recentReviews);

    switch (action.type) {
      case 'OPEN_DAY':
        patch.modifierDismissed = false;
        patch.pendingReview = null;
        patch.daySummary = null;
        patch.ceremony = null;
        patch.ceremonyPrestige = null;
        patch.dayStartRating = before.rating;
        patch.editLayoutMode = false;
        break;
      case 'NEXT_CUSTOMER':
        patch.pendingReview = null;
        break;
      case 'CLOSE_DAY':
        patch.daySummary = buildDaySummary(before, result.state);
        patch.modifierDismissed = false;
        patch.pendingReview = null;
        patch.dayStartRating = null;
        patch.editLayoutMode = true;
        break;
      case 'SET_COMPOSE_DRAFT':
      case 'SERVE_DISH':
        break;
      default:
        break;
    }

    set(patch);

    if (
      action.type === 'SET_COMPOSE_DRAFT' ||
      action.type === 'SERVE_DISH' ||
      action.type === 'CLOSE_DAY' ||
      action.type === 'PURCHASE'
    ) {
      void get().autosave();
    }
  },

  navigateTo(screen) {
    const current = get();
    if (!selectCanNavigateTo(current, screen)) return;
    set({ screen, flavorInspectorIngredientId: null });
  },

  openFlavorInspector(ingredientId) {
    set({ flavorInspectorIngredientId: ingredientId });
  },

  closeFlavorInspector() {
    set({ flavorInspectorIngredientId: null });
  },

  startPlacement(itemKey) {
    const current = get();
    if (current.activeDay) return;
    set({ pendingPlacementItemKey: itemKey, screen: 'restaurant', editLayoutMode: true });
  },

  cancelPlacement() {
    set({ pendingPlacementItemKey: null });
  },

  async importSaveCode(code) {
    try {
      const imported = parseSaveCode(code);
      set({
        ...imported,
        screen: 'restaurant',
        editLayoutMode: !imported.activeDay,
        hydrated: true,
        modifierDismissed: imported.activeDay ? true : false,
        pendingReview: null,
        daySummary: null,
        ceremony: null,
        ceremonyPrestige: null,
        dayStartRating: imported.activeDay ? imported.rating : null,
        recentReviews: [],
        flavorInspectorIngredientId: null,
        pendingPlacementItemKey: null,
      });
      await get().autosave();
      return { ok: true as const };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { ok: false as const, error: message };
    }
  },

  async exportSaveCodeToClipboard() {
    try {
      const code = exportSaveCode(pickGameState(get()));
      try {
        if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(code);
        }
      } catch {
        // Clipboard may be denied (headless Safari/Chrome, HTTP); code export still succeeds.
      }
      return { ok: true as const, code };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { ok: false as const, error: message };
    }
  },

  setAudioEnabled(enabled) {
    set({ audioEnabled: enabled });
  },

  setMusicEnabled(enabled) {
    set({ musicEnabled: enabled });
  },

  dismissModifier() {
    set({ modifierDismissed: true });
  },

  dismissDaySummary() {
    set({ daySummary: null });
  },

  dismissCeremony() {
    set({ ceremony: null, ceremonyPrestige: null });
  },

  toggleEditLayout() {
    const current = get();
    if (current.activeDay) return;
    set({ editLayoutMode: !current.editLayoutMode });
  },

  canPlaceAt(placement, excludeId) {
    return validatePlacement(pickGameState(get()), placement, excludeId);
  },

  movePlacement(placementId, x, y) {
    const current = get();
    if (current.activeDay) return false;
    const existing = current.placements.find((item) => item.id === placementId);
    if (!existing) return false;

    const moved: Placement = { ...existing, x, y };
    if (!validatePlacement(pickGameState(current), moved, placementId)) {
      return false;
    }

    try {
      const result = gameReducer(
        pickGameState(current),
        { type: 'MOVE_ITEM', placementId, x, y },
        getDomainContext(),
      );
      set(mergeReducerState(current, result.state));
      void get().autosave();
      return true;
    } catch {
      return false;
    }
  },

  async autosave() {
    if (typeof indexedDB === 'undefined') return;
    await defaultSaveRepository.save(pickGameState(get()));
  },
}));

export function getGameStateSnapshot(): GameState {
  return pickGameState(useGameStore.getState());
}

export function selectCanCloseDayFromStore(): boolean {
  return isDayComplete(pickGameState(useGameStore.getState()));
}
