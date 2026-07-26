import { createStore } from 'zustand/vanilla';
import { ensureContentForAction, getDomainContext } from '../app/content-loader.ts';
import { isDayComplete } from '../domain/day/serve.ts';
import { dayBonusEarnings, volumeBonusEarnings } from '../domain/economy/tips.ts';
import {
  findTransferDropCell,
  isConnectingDoorCell,
  validatePlacement,
} from '../domain/economy/purchases.ts';
import { gameReducer, type GameAction, type ReducerEvent } from '../domain/reducer.ts';
import {
  connectingDoorInterior,
  otherFloorRoom,
  type FloorRoomId,
} from '../domain/floor/starter-map.ts';
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
  masteryLine?: string | null;
}

export type CeremonyKind = 'prestige' | 'soft_reset';

interface StoreMeta {
  screen: ScreenId;
  editLayoutMode: boolean;
  /** Which same-size floor screen is shown (main dining+kitchen vs back kitchen). */
  activeFloorRoom: FloorRoomId;
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
  floorPlayerGrid: { x: number; y: number } | null;
  floorToast: string | null;
}

export interface GameStore extends GameState, StoreMeta {
  hydrate: () => Promise<void>;
  dispatch: (action: GameAction) => Promise<void>;
  dismissModifier: () => void;
  dismissPendingReview: () => void;
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
  setFloorNavPosition: (pos: { x: number; y: number }) => void;
  setFloorSelectedTicket: (ticketId: string | null) => void;
  setFloorToast: (message: string | null) => void;
  setActiveFloorRoom: (room: FloorRoomId) => void;
  enterConnectingDoor: () => boolean;
  movePlacement: (placementId: string, x: number, y: number) => boolean;
  transferPlacementViaDoor: (placementId: string) => boolean;
  canPlaceAt: (placement: Placement, excludeId?: string) => boolean;
  activeRoomPlacements: () => Placement[];
  autosave: () => Promise<void>;
}

const META_KEYS = [
  'hydrate',
  'dispatch',
  'dismissModifier',
  'dismissPendingReview',
  'dismissDaySummary',
  'dismissCeremony',
  'toggleEditLayout',
  'movePlacement',
  'transferPlacementViaDoor',
  'canPlaceAt',
  'activeRoomPlacements',
  'setActiveFloorRoom',
  'enterConnectingDoor',
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
  'setFloorNavPosition',
  'setFloorSelectedTicket',
  'setFloorToast',
  'floorPlayerGrid',
  'floorToast',
  'screen',
  'editLayoutMode',
  'activeFloorRoom',
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

const FLOOR_TOAST_MS = 2000;
let floorToastClearTimer: ReturnType<typeof setTimeout> | null = null;

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
    activeFloorRoom: current.activeFloorRoom,
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
    floorPlayerGrid: current.floorPlayerGrid,
    floorToast: current.floorToast,
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

function shouldAutosaveAfterDispatch(actionType: GameAction['type']): boolean {
  return (
    actionType === 'SET_COMPOSE_DRAFT' ||
    actionType === 'SERVE_DISH' ||
    actionType === 'CLOSE_DAY' ||
    actionType === 'PURCHASE' ||
    actionType === 'OPEN_DAY' ||
    actionType === 'PLACE_ITEM' ||
    actionType === 'MOVE_ITEM' ||
    actionType === 'TRANSFER_ITEM_ROOM' ||
    actionType === 'REMOVE_ITEM' ||
    actionType.startsWith('FLOOR_')
  );
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
  const volumeBonus = volumeBonusEarnings(
    activeDay.dayEarnings,
    activeDay.customersServed,
    before.seatingCapacity,
  );
  const masteryLines: string[] = [];
  for (const [recipeId, afterEntry] of Object.entries(after.recipeMastery)) {
    const beforeEntry = before.recipeMastery[recipeId];
    const beforeLevel = beforeEntry?.level ?? 0;
    if (afterEntry.level > beforeLevel) {
      masteryLines.push(`${recipeId} → Lv.${afterEntry.level}`);
    }
  }
  return buildDaySummaryDisplay({
    dayEarnings: activeDay.dayEarnings,
    dayBonus,
    volumeBonus,
    averageMatch,
    ratingStart: before.rating,
    ratingEnd: after.rating,
    customersServed: activeDay.customersServed,
    seatingCapacity: before.seatingCapacity,
    unlockCount: before.unlockedIngredientIds.length,
    totalIngredients: getDomainContext().ingredients.length,
    masteryLines,
  });
}

export const useGameStore = createStore<GameStore>((set, get) => ({
  ...createNewGameState(),
  screen: 'restaurant',
  editLayoutMode: false,
  activeFloorRoom: 'main',
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
  floorPlayerGrid: null,
  floorToast: null,

  async hydrate() {
    const persist = await requestPersistentStorage();
    const loaded = await defaultSaveRepository.load();
    const state = loaded.state ?? createNewGameState();
    set({
      ...state,
      screen: 'restaurant',
      editLayoutMode: false,
      activeFloorRoom: 'main',
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
      floorPlayerGrid: state.activeDay?.floor?.playerPosition ?? null,
      floorToast: null,
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
        patch.activeFloorRoom = 'main';
        patch.floorPlayerGrid = result.state.activeDay?.floor?.playerPosition ?? null;
        patch.floorToast = null;
        break;
      case 'NEXT_CUSTOMER':
        patch.pendingReview = null;
        break;
      case 'CLOSE_DAY':
        patch.daySummary = buildDaySummary(before, result.state);
        patch.modifierDismissed = false;
        patch.pendingReview = null;
        patch.dayStartRating = null;
        patch.editLayoutMode = false;
        patch.activeFloorRoom = 'main';
        patch.floorPlayerGrid = null;
        patch.floorToast = null;
        break;
      case 'SET_COMPOSE_DRAFT':
      case 'SERVE_DISH':
        break;
      case 'FLOOR_PLATE':
        patch.composeDraftIngredientIds = undefined;
        break;
      default:
        break;
    }

    set(patch);

    if (shouldAutosaveAfterDispatch(action.type)) {
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
        editLayoutMode: false,
        activeFloorRoom: 'main',
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
        floorPlayerGrid: null,
        floorToast: null,
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

  setFloorNavPosition(pos) {
    const prev = get().floorPlayerGrid;
    if (prev?.x === pos.x && prev?.y === pos.y) return;
    set({ floorPlayerGrid: { x: pos.x, y: pos.y } });
  },

  setFloorSelectedTicket(ticketId) {
    const current = get();
    const floor = current.activeDay?.floor;
    if (!floor) return;
    set({
      activeDay: {
        ...current.activeDay!,
        floor: { ...floor, selectedTicketId: ticketId },
      },
    });
  },

  setFloorToast(message) {
    if (floorToastClearTimer) {
      clearTimeout(floorToastClearTimer);
      floorToastClearTimer = null;
    }
    set({ floorToast: message });
    if (message) {
      floorToastClearTimer = setTimeout(() => {
        if (get().floorToast === message) {
          set({ floorToast: null });
        }
        floorToastClearTimer = null;
      }, FLOOR_TOAST_MS);
    }
  },

  dismissModifier() {
    set({ modifierDismissed: true });
  },

  dismissPendingReview() {
    set({ pendingReview: null });
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
    const next = !current.editLayoutMode;
    set({
      editLayoutMode: next,
      activeFloorRoom: next ? current.activeFloorRoom : 'main',
      pendingPlacementItemKey: next ? current.pendingPlacementItemKey : null,
    });
  },

  activeRoomPlacements() {
    const current = get();
    return current.activeFloorRoom === 'main'
      ? current.placements
      : current.backKitchenPlacements;
  },

  setActiveFloorRoom(room) {
    const current = get();
    if (room === 'back_kitchen' && !current.kitchenAnnexOwned) return;
    set({ activeFloorRoom: room });
  },

  enterConnectingDoor() {
    const current = get();
    if (!current.kitchenAnnexOwned) return false;
    const nextRoom = otherFloorRoom(current.activeFloorRoom);
    const spawn = connectingDoorInterior(
      nextRoom,
      current.gridSize.w,
      current.gridSize.h,
    );
    set({
      activeFloorRoom: nextRoom,
      floorPlayerGrid: spawn,
    });
    return true;
  },

  canPlaceAt(placement, excludeId) {
    const current = get();
    return validatePlacement(
      pickGameState(current),
      placement,
      excludeId,
      current.activeFloorRoom,
    );
  },

  movePlacement(placementId, x, y) {
    const current = get();
    if (current.activeDay) return false;
    const room = current.activeFloorRoom;
    const existing = current.activeRoomPlacements().find((item) => item.id === placementId);
    if (!existing) return false;

    if (isConnectingDoorCell(pickGameState(current), room, x, y)) {
      return get().transferPlacementViaDoor(placementId);
    }

    const moved: Placement = { ...existing, x, y };
    if (!validatePlacement(pickGameState(current), moved, placementId, room)) {
      return false;
    }

    try {
      const result = gameReducer(
        pickGameState(current),
        { type: 'MOVE_ITEM', placementId, x, y, room },
        getDomainContext(),
      );
      set(mergeReducerState(current, result.state));
      void get().autosave();
      return true;
    } catch {
      return false;
    }
  },

  transferPlacementViaDoor(placementId) {
    const current = get();
    if (current.activeDay || !current.kitchenAnnexOwned) return false;
    const fromRoom = current.activeFloorRoom;
    const toRoom = otherFloorRoom(fromRoom);
    const drop = findTransferDropCell(pickGameState(current), toRoom);
    if (!drop) return false;

    try {
      const result = gameReducer(
        pickGameState(current),
        {
          type: 'TRANSFER_ITEM_ROOM',
          placementId,
          fromRoom,
          toRoom,
          x: drop.x,
          y: drop.y,
        },
        getDomainContext(),
      );
      set({
        ...mergeReducerState(current, result.state),
        activeFloorRoom: toRoom,
      });
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
