import { createStore } from 'zustand/vanilla';
import {
  ensureContentForAction,
  getDomainContext,
} from '../app/content-loader.ts';
import { isDayComplete } from '../domain/day/serve.ts';
import type { AchievementId } from '../domain/achievements/catalog.ts';
import {
  dayBonusEarnings,
  volumeBonusEarnings,
} from '../domain/economy/tips.ts';
import {
  findTransferDropCell,
  isConnectingDoorCell,
  validatePlacement,
} from '../domain/economy/purchases.ts';
import {
  gameReducer,
  type GameAction,
  type ReducerEvent,
} from '../domain/reducer.ts';
import {
  connectingDoorInterior,
  otherFloorRoom,
  type FloorRoomId,
} from '../domain/floor/starter-map.ts';
import {
  isCookStationItemKey,
  playerNearPlacement,
  resolveFloorComposeTicket,
} from '../domain/floor/index.ts';
import {
  nextTutorialStep,
  tutorialPrompt,
} from '../domain/floor/tutorial.ts';
import { applyAppShellMotionPreference } from '../ui/presentation/motion-preference.ts';
import {
  createNewGameState,
  type GameState,
  type Placement,
} from '../domain/state/game-state.ts';
import {
  exportSaveCodeSnapshot,
  parseSaveCodeSnapshot,
  type GameSaveSnapshot,
  type PresentationCheckpoint,
} from '../persistence/index.ts';
import {
  defaultSaveRepository,
  requestPersistentStorage,
} from '../persistence/index.ts';
import type { SaveRepository } from '../persistence/SaveRepository.ts';
import type { RecentReviewEntry } from '../ui/presentation/rating-display.ts';
import {
  buildDaySummaryDisplay,
  type DaySummaryDisplay,
} from '../ui/presentation/day-summary-display.ts';
import { selectCanNavigateTo } from './selectors/navigation.ts';
import { selectCanOpenFloorCompose } from './selectors/service-day.ts';

import { mapReducerEventsToUi } from './service-events.ts';
import {
  clearNotificationTimers,
  resolveNoticeScope,
  restartNoticeTimer,
  syncNotificationTimer as syncNotificationTimerController,
  type Notice,
} from './notification-timer.ts';

export {
  CELEBRATION_DURATION_MS,
  NOTICE_DURATION_MS,
} from './notification-timer.ts';
export type { Notice, NoticeSource } from './notification-timer.ts';

export type ScreenId =
  'restaurant' | 'shop' | 'inspector' | 'recipes' | 'rating' | 'settings';

export interface ServeReview {
  customerId?: string;
  /** The triggering review remains visible after a soft reset clears activeDay. */
  afterSoftReset?: boolean;
  matchStars: number;
  tip: number;
  ratingDelta: number;
  recipeName: string | null;
  masteryLine?: string | null;
}

export type CeremonyKind = 'prestige' | 'soft_reset';

export type CelebrationKind = 'recipe' | 'mastery' | 'achievement' | 'prestige';

export interface Celebration {
  kind: CelebrationKind;
  title: string;
  body: string;
  ingredientIds?: string[];
  achievementId?: AchievementId;
  level?: number;
}

export interface FloorNoticesFromHud {
  sticky: Notice | null;
  pacing: Notice | null;
}

interface StoreMeta {
  screen: ScreenId;
  editLayoutMode: boolean;
  /** Which same-size floor screen is shown (main dining+kitchen vs back kitchen). */
  activeFloorRoom: FloorRoomId;
  hydrated: boolean;
  persistGranted: boolean;
  modifierDismissed: boolean;
  serviceStartPending: boolean;
  serviceStartError: string | null;
  pendingReview: ServeReview | null;
  daySummary: DaySummaryDisplay | null;
  ceremony: CeremonyKind | null;
  ceremonyPrestige: number | null;
  dayStartRating: number | null;
  recentReviews: RecentReviewEntry[];
  presentationSavePending: boolean;
  presentationSaveError: string | null;
  flavorInspectorIngredientId: string | null;
  pendingPlacementItemKey: string | null;
  audioEnabled: boolean;
  musicEnabled: boolean;
  /** Master volume 0–1 (session meta; default 1). */
  audioVolume: number;
  /** Manual reduced-motion override (session meta; default false). */
  reducedMotion: boolean;
  floorPlayerGrid: { x: number; y: number } | null;
  floorToast: string | null;
  noticeActive: Notice | null;
  noticeSticky: Notice | null;
  tutorialDismissedStepId: NonNullable<Notice['stepId']> | null;
  notificationSurfaceActive: boolean;
  celebrationQueue: Celebration[];
  /** Ephemeral UI state. Never included in GameState persistence. */
  composeSheetOpen: boolean;
}

export interface GameStore extends GameState, StoreMeta {
  hydrate: () => Promise<void>;
  dispatch: (action: GameAction) => Promise<void>;
  dismissModifier: () => Promise<void>;
  dismissPendingReview: () => Promise<void>;
  dismissDaySummary: () => Promise<void>;
  dismissCeremony: () => Promise<void>;
  toggleEditLayout: () => void;
  navigateTo: (screen: ScreenId) => void;
  openFlavorInspector: (ingredientId: string) => void;
  closeFlavorInspector: () => void;
  startPlacement: (itemKey: string) => void;
  cancelPlacement: () => void;
  importSaveCode: (
    code: string,
  ) => Promise<{ ok: true } | { ok: false; error: string }>;
  exportSaveCodeToClipboard: () => Promise<
    { ok: true; code: string } | { ok: false; error: string }
  >;
  setAudioEnabled: (enabled: boolean) => void;
  setMusicEnabled: (enabled: boolean) => void;
  setAudioVolume: (volume: number) => void;
  setReducedMotion: (enabled: boolean) => void;
  /** Re-arm day-1 tutorial tips (clears dismiss + pacing gate). */
  replayTutorial: () => void;
  setFloorNavPosition: (pos: { x: number; y: number }) => void;
  setFloorSelectedTicket: (ticketId: string | null) => void;
  openComposeSheet: () => void;
  closeComposeSheet: () => void;
  setFloorToast: (message: string | null) => void;
  syncFloorNoticesFromHud: (notices: FloorNoticesFromHud) => void;
  dismissFrontNotice: () => void;
  enqueueCelebration: (celebration: Celebration) => void;
  dismissCelebration: () => void;
  clearCelebrations: () => void;
  setNotificationSurfaceActive: (active: boolean) => void;
  syncNotificationTimer: () => void;
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
  'setAudioVolume',
  'setReducedMotion',
  'replayTutorial',
  'setFloorNavPosition',
  'setFloorSelectedTicket',
  'openComposeSheet',
  'closeComposeSheet',
  'setFloorToast',
  'syncFloorNoticesFromHud',
  'dismissFrontNotice',
  'enqueueCelebration',
  'dismissCelebration',
  'clearCelebrations',
  'setNotificationSurfaceActive',
  'syncNotificationTimer',
  'floorPlayerGrid',
  'floorToast',
  'noticeActive',
  'noticeSticky',
  'tutorialDismissedStepId',
  'notificationSurfaceActive',
  'celebrationQueue',
  'composeSheetOpen',
  'screen',
  'editLayoutMode',
  'activeFloorRoom',
  'hydrated',
  'persistGranted',
  'modifierDismissed',
  'serviceStartPending',
  'serviceStartError',
  'pendingReview',
  'daySummary',
  'ceremony',
  'ceremonyPrestige',
  'dayStartRating',
  'recentReviews',
  'presentationSavePending',
  'presentationSaveError',
  'flavorInspectorIngredientId',
  'pendingPlacementItemKey',
  'audioEnabled',
  'musicEnabled',
  'audioVolume',
  'reducedMotion',
] as const;

let toastNoticeSequence = 0;
let lastHudPacingNotice: Notice | null = null;
let gameSaveRepository: Pick<SaveRepository, 'load' | 'save'> =
  defaultSaveRepository;
let serviceStartFence: Promise<void> | null = null;
let presentationSaveFence: Promise<void> | null = null;
let serviceStartGeneration = 0;
let gameplayInteractionGeneration = 0;

/**
 * Identifies the current ephemeral gameplay interaction context.
 *
 * Consumers may capture this before beginning an asynchronous interaction and
 * compare it after the work settles. The value is deliberately module-local
 * state rather than GameStore state so it can never leak into a save.
 */
export function getGameplayInteractionGeneration(): number {
  return gameplayInteractionGeneration;
}

function invalidateServiceStartTransition(): Promise<void> | null {
  gameplayInteractionGeneration += 1;
  serviceStartGeneration += 1;
  const superseded = serviceStartFence;
  serviceStartFence = null;
  return superseded;
}

async function waitForSupersededServiceStart(
  superseded: Promise<void> | null,
): Promise<void> {
  if (!superseded) return;
  try {
    await superseded;
  } catch {
    // The superseded caller still receives its own failure. Replacement state
    // persistence must proceed independently after the old write settles.
  }
}

/** Replaces persistence for deterministic store integration tests. */
export function setGameSaveRepositoryForTests(
  repository: Pick<SaveRepository, 'load' | 'save'> | null,
): void {
  gameSaveRepository = repository ?? defaultSaveRepository;
  invalidateServiceStartTransition();
}

async function persistGameSnapshot(store: GameStore): Promise<void> {
  if (
    typeof indexedDB === 'undefined' &&
    gameSaveRepository === defaultSaveRepository
  ) {
    return;
  }
  const snapshot = pickGameSaveSnapshot(store);
  await gameSaveRepository.save(snapshot.state, snapshot.presentation);
}

async function acknowledgePresentationCheckpoint(
  get: () => GameStore,
  set: (patch: Partial<GameStore>) => void,
  clearedCheckpoint: Partial<GameStore>,
  checkpointStillCurrent: (store: GameStore) => boolean,
): Promise<void> {
  if (get().presentationSavePending) {
    if (presentationSaveFence) await presentationSaveFence;
    return;
  }
  set({ presentationSavePending: true, presentationSaveError: null });
  const save = persistGameSnapshot({ ...get(), ...clearedCheckpoint });
  const acknowledgement = save.then(
    () => {
      set({
        ...(checkpointStillCurrent(get()) ? clearedCheckpoint : {}),
        presentationSavePending: false,
        presentationSaveError: null,
      });
    },
    (error: unknown) => {
      set({
        presentationSavePending: false,
        presentationSaveError:
          error instanceof Error ? error.message : 'Could not save progress.',
      });
      throw error;
    },
  );
  presentationSaveFence = acknowledgement;
  try {
    await acknowledgement;
  } finally {
    if (presentationSaveFence === acknowledgement) {
      presentationSaveFence = null;
    }
  }
}

function recoverDayStartRating(
  state: GameState,
  persistedRating: number | null,
): number | null {
  if (persistedRating !== null || !state.activeDay) return persistedRating;
  if (state.activeDay.ratingResetOccurred) return state.rating;
  return state.rating - (state.activeDay.dayRatingDelta ?? 0);
}

function sameNotice(left: Notice | null, right: Notice | null): boolean {
  return (
    left === right ||
    (left?.id === right?.id &&
      left?.source === right?.source &&
      left?.title === right?.title &&
      left?.body === right?.body &&
      left?.stepId === right?.stepId)
  );
}

function floorToastFromNotice(notice: Notice | null): string | null {
  return notice?.source === 'toast' ? notice.body : null;
}

function clearStoreNotificationTimers(): void {
  lastHudPacingNotice = null;
  clearNotificationTimers();
}

function syncStoreNotificationTimer(): void {
  const state = useGameStore.getState();
  syncNotificationTimerController(
    {
      noticeActive: state.noticeActive,
      noticeSticky: state.noticeSticky,
      notificationSurfaceActive: state.notificationSurfaceActive,
      celebrationHead: state.celebrationQueue[0] ?? null,
    },
    {
      dismissNotice(notice) {
        const current = useGameStore.getState();
        if (current.noticeActive !== notice) return;
        const nextNotice = current.noticeSticky;
        useGameStore.setState({
          noticeActive: nextNotice,
          floorToast: floorToastFromNotice(nextNotice),
        });
        syncStoreNotificationTimer();
      },
      dismissCelebration(celebration) {
        const current = useGameStore.getState();
        if (current.celebrationQueue[0] !== celebration) return;
        useGameStore.setState({
          celebrationQueue: current.celebrationQueue.slice(1),
        });
        syncStoreNotificationTimer();
      },
    },
  );
}

function pickGameState(store: GameStore): GameState {
  const copy = { ...store } as Record<string, unknown>;
  for (const key of META_KEYS) {
    delete copy[key];
  }
  return copy as unknown as GameState;
}

function pickPresentationCheckpoint(store: GameStore): PresentationCheckpoint {
  return {
    pendingReview: store.pendingReview,
    daySummary: store.daySummary,
    ceremony: store.ceremony,
    ceremonyPrestige: store.ceremonyPrestige,
    dayStartRating: store.dayStartRating,
    recentReviews: store.recentReviews,
  };
}

function pickGameSaveSnapshot(store: GameStore): GameSaveSnapshot {
  return {
    state: pickGameState(store),
    presentation: pickPresentationCheckpoint(store),
  };
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
    serviceStartPending: current.serviceStartPending,
    serviceStartError: current.serviceStartError,
    pendingReview: current.pendingReview,
    daySummary: current.daySummary,
    ceremony: current.ceremony,
    ceremonyPrestige: current.ceremonyPrestige,
    dayStartRating: current.dayStartRating,
    recentReviews,
    presentationSavePending: current.presentationSavePending,
    presentationSaveError: current.presentationSaveError,
    flavorInspectorIngredientId: current.flavorInspectorIngredientId,
    pendingPlacementItemKey: current.pendingPlacementItemKey,
    audioEnabled: current.audioEnabled,
    musicEnabled: current.musicEnabled,
    audioVolume: current.audioVolume,
    reducedMotion: current.reducedMotion,
    floorPlayerGrid: current.floorPlayerGrid,
    floorToast: current.floorToast,
    noticeActive: current.noticeActive,
    noticeSticky: current.noticeSticky,
    tutorialDismissedStepId: current.tutorialDismissedStepId,
    notificationSurfaceActive: current.notificationSurfaceActive,
    celebrationQueue: current.celebrationQueue,
    composeSheetOpen: current.composeSheetOpen,
  };
}

function applyReducerEvents(
  events: ReducerEvent[],
  patch: Partial<GameStore>,
  before: GameState,
  existingReviews: RecentReviewEntry[],
  existingCelebrations: Celebration[],
): Celebration[] {
  const uiPatch = mapReducerEventsToUi(
    events,
    before,
    existingReviews,
    existingCelebrations,
  );
  Object.assign(patch, uiPatch);
  return uiPatch.celebrationQueue?.slice(existingCelebrations.length) ?? [];
}

function shouldAutosaveAfterDispatch(actionType: GameAction['type']): boolean {
  return (
    actionType === 'SET_COMPOSE_DRAFT' ||
    actionType === 'SERVE_DISH' ||
    actionType === 'NEXT_CUSTOMER' ||
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

function canPlateFromCurrentInteraction(
  state: GameStore,
  ticketId: string,
): boolean {
  if (
    state.screen !== 'restaurant' ||
    !selectCanOpenFloorCompose(state)
  ) {
    return false;
  }
  const floor = state.activeDay?.floor;
  const player = state.floorPlayerGrid ?? floor?.playerPosition;
  if (!floor || !player) return false;
  if (resolveFloorComposeTicket(floor)?.id !== ticketId) return false;

  const roomPlacements =
    state.activeFloorRoom === 'back_kitchen'
      ? state.backKitchenPlacements
      : state.placements;
  const ownedEquipment = new Set(state.purchasedEquipmentIds);
  return roomPlacements.some(
    (placement) =>
      isCookStationItemKey(placement.itemKey) &&
      ownedEquipment.has(placement.itemKey) &&
      playerNearPlacement(player, placement),
  );
}

function buildDaySummary(
  before: GameState,
  after: GameState,
  ratingStart: number,
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
    completedDay: before.day,
    nextDay: after.day,
    dayEarnings: activeDay.dayEarnings,
    dayBonus,
    volumeBonus,
    averageMatch,
    ratingStart,
    ratingEnd: after.rating,
    ratingDelta: activeDay.dayRatingDelta,
    ratingResetOccurred: activeDay.ratingResetOccurred,
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
  serviceStartPending: false,
  serviceStartError: null,
  pendingReview: null,
  daySummary: null,
  ceremony: null,
  ceremonyPrestige: null,
  dayStartRating: null,
  recentReviews: [],
  presentationSavePending: false,
  presentationSaveError: null,
  flavorInspectorIngredientId: null,
  pendingPlacementItemKey: null,
  audioEnabled: true,
  musicEnabled: false,
  audioVolume: 1,
  reducedMotion: false,
  floorPlayerGrid: null,
  floorToast: null,
  noticeActive: null,
  noticeSticky: null,
  tutorialDismissedStepId: null,
  notificationSurfaceActive: false,
  celebrationQueue: [],
  composeSheetOpen: false,

  async hydrate() {
    const supersededServiceStart = invalidateServiceStartTransition();
    const persist = await requestPersistentStorage();
    const loaded = await gameSaveRepository.load();
    const state = loaded.state ?? createNewGameState();
    set({
      ...state,
      screen: 'restaurant',
      editLayoutMode: false,
      activeFloorRoom: state.activeDay?.floor?.playerRoom ?? 'main',
      hydrated: true,
      persistGranted: persist.granted,
      modifierDismissed: state.activeDay?.serviceStarted ?? false,
      serviceStartPending: false,
      serviceStartError: null,
      ...loaded.presentation,
      presentationSavePending: false,
      presentationSaveError: null,
      dayStartRating: recoverDayStartRating(
        state,
        loaded.presentation.dayStartRating,
      ),
      flavorInspectorIngredientId: null,
      pendingPlacementItemKey: null,
      audioEnabled: true,
      musicEnabled: false,
      audioVolume: 1,
      reducedMotion: false,
      floorPlayerGrid: state.activeDay?.floor?.playerPosition ?? null,
      floorToast: null,
      noticeActive: null,
      noticeSticky: null,
      tutorialDismissedStepId: null,
      celebrationQueue: [],
      composeSheetOpen: false,
    });
    clearStoreNotificationTimers();
    syncStoreNotificationTimer();
    if (supersededServiceStart) {
      await waitForSupersededServiceStart(supersededServiceStart);
      await persistGameSnapshot(get());
    }
  },

  async dispatch(action) {
    const interactionGeneration = gameplayInteractionGeneration;
    const contentLoad = ensureContentForAction(action.type);
    if (contentLoad) {
      await contentLoad;
    }
    if (
      action.type === 'FLOOR_DELIVER' &&
      gameplayInteractionGeneration !== interactionGeneration
    ) {
      throw new Error(
        'Delivery was cancelled because the gameplay context changed',
      );
    }
    const ctx = getDomainContext();
    const current = get();
    if (
      action.type === 'FLOOR_DELIVER' &&
      current.activeFloorRoom !== 'main'
    ) {
      throw new Error('Dishes can only be delivered on the main dining floor');
    }
    if (
      action.type === 'FLOOR_PLATE' &&
      !canPlateFromCurrentInteraction(current, action.ticketId)
    ) {
      throw new Error(
        'The selected ticket can only be plated beside an owned station in the current room',
      );
    }
    const before = pickGameState(current);
    const result = gameReducer(before, action, ctx);
    if (
      action.type === 'START_SERVICE' &&
      before.activeDay?.serviceStarted === true &&
      result.state.activeDay?.serviceStarted === true
    ) {
      if (serviceStartFence) {
        await serviceStartFence;
      } else if (!current.modifierDismissed) {
        set({ modifierDismissed: true });
      }
      return;
    }
    const patch: Partial<GameStore> = mergeReducerState(current, result.state);
    const mappedCelebrations = applyReducerEvents(
      result.events,
      patch,
      before,
      current.recentReviews,
      current.celebrationQueue,
    );
    const resetsNotificationLifecycle =
      action.type === 'OPEN_DAY' ||
      action.type === 'CLOSE_DAY' ||
      (before.activeDay !== null && result.state.activeDay === null);
    const supersededServiceStart = resetsNotificationLifecycle
      ? invalidateServiceStartTransition()
      : null;

    switch (action.type) {
      case 'OPEN_DAY':
        patch.serviceStartPending = false;
        patch.serviceStartError = null;
        patch.pendingReview = null;
        patch.daySummary = null;
        patch.ceremony = null;
        patch.ceremonyPrestige = null;
        patch.dayStartRating = before.rating;
        patch.editLayoutMode = false;
        patch.activeFloorRoom = 'main';
        patch.floorPlayerGrid =
          result.state.activeDay?.floor?.playerPosition ?? null;
        break;
      case 'NEXT_CUSTOMER':
        patch.pendingReview = null;
        break;
      case 'CLOSE_DAY':
        patch.daySummary = buildDaySummary(
          before,
          result.state,
          current.dayStartRating ?? before.rating,
        );
        patch.pendingReview = null;
        patch.dayStartRating = null;
        patch.editLayoutMode = false;
        patch.activeFloorRoom = 'main';
        patch.floorPlayerGrid = null;
        patch.serviceStartPending = false;
        patch.serviceStartError = null;
        break;
      case 'SET_COMPOSE_DRAFT':
      case 'SERVE_DISH':
        break;
      case 'FLOOR_PLATE':
        patch.composeDraftIngredientIds = undefined;
        patch.composeSheetOpen = false;
        break;
      default:
        break;
    }

    patch.modifierDismissed = Boolean(
      result.state.activeDay?.serviceStarted &&
        !current.serviceStartPending,
    );
    if (action.type === 'START_SERVICE') {
      patch.modifierDismissed = false;
      patch.serviceStartPending = true;
      patch.serviceStartError = null;
    }

    if (resetsNotificationLifecycle) {
      patch.floorToast = null;
      patch.noticeActive = null;
      patch.noticeSticky = null;
      patch.tutorialDismissedStepId = null;
      patch.celebrationQueue = mappedCelebrations;
      patch.composeSheetOpen = false;
      if (result.state.activeDay === null) {
        patch.dayStartRating = null;
      }
    }

    if (
      patch.pendingReview ||
      patch.daySummary ||
      patch.ceremony ||
      result.state.activeDay === null
    ) {
      patch.composeSheetOpen = false;
    }
    if (patch.pendingReview || patch.daySummary || patch.ceremony) {
      patch.presentationSavePending = false;
      patch.presentationSaveError = null;
    }

    set(patch);
    if (resetsNotificationLifecycle) {
      clearStoreNotificationTimers();
    }
    syncStoreNotificationTimer();

    if (action.type === 'START_SERVICE') {
      const startedDay = result.state.activeDay!;
      const transitionGeneration = ++serviceStartGeneration;
      const transition = (async () => {
        try {
          await persistGameSnapshot(get());
          if (serviceStartGeneration !== transitionGeneration) return;
          const succeeded = get();
          if (
            succeeded.activeDay?.seed === startedDay.seed &&
            succeeded.activeDay.serviceStarted
          ) {
            set({
              modifierDismissed: true,
              serviceStartPending: false,
              serviceStartError: null,
            });
          }
        } catch (error) {
          if (serviceStartGeneration !== transitionGeneration) {
            throw error;
          }
          const failed = get();
          if (
            failed.activeDay?.seed === startedDay.seed &&
            failed.activeDay.serviceStarted
          ) {
            set({
              activeDay: { ...failed.activeDay, serviceStarted: false },
              modifierDismissed: false,
            });
          }

          // Ordinary autosaves wait on the transition fence. Persist the
          // rolled-back boundary directly so no queued started snapshot can
          // become the durable winner after this promise rejects.
          let reportedError = error;
          try {
            await persistGameSnapshot(get());
          } catch (compensationError) {
            const transitionMessage =
              error instanceof Error ? error.message : String(error);
            const compensationMessage =
              compensationError instanceof Error
                ? compensationError.message
                : String(compensationError);
            reportedError = new Error(
              `${transitionMessage} Rollback save also failed: ${compensationMessage}`,
              { cause: error },
            );
          }
          if (serviceStartGeneration !== transitionGeneration) {
            throw reportedError;
          }
          set({
            serviceStartPending: false,
            serviceStartError:
              reportedError instanceof Error
                ? reportedError.message
                : 'Could not save service progress.',
          });
          throw reportedError;
        }
      })();
      serviceStartFence = transition;
      try {
        await transition;
      } finally {
        if (
          serviceStartGeneration === transitionGeneration &&
          serviceStartFence === transition
        ) {
          serviceStartFence = null;
        }
      }
      return;
    }
    if (shouldAutosaveAfterDispatch(action.type)) {
      if (supersededServiceStart) {
        await waitForSupersededServiceStart(supersededServiceStart);
        await get().autosave();
      } else {
        void get().autosave().catch(() => undefined);
      }
    }
  },

  navigateTo(screen) {
    const current = get();
    if (!selectCanNavigateTo(current, screen)) return;
    if (current.screen !== screen) {
      gameplayInteractionGeneration += 1;
    }
    set({ screen, flavorInspectorIngredientId: null, composeSheetOpen: false });
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
    if (current.screen !== 'restaurant') {
      gameplayInteractionGeneration += 1;
    }
    set({
      pendingPlacementItemKey: itemKey,
      screen: 'restaurant',
      editLayoutMode: true,
    });
  },

  cancelPlacement() {
    set({ pendingPlacementItemKey: null });
  },

  async importSaveCode(code) {
    try {
      const imported = parseSaveCodeSnapshot(code);
      const supersededServiceStart = invalidateServiceStartTransition();
      set({
        ...imported.state,
        screen: 'restaurant',
        editLayoutMode: false,
        activeFloorRoom: imported.state.activeDay?.floor?.playerRoom ?? 'main',
        hydrated: true,
        modifierDismissed: imported.state.activeDay?.serviceStarted ?? false,
        serviceStartPending: false,
        serviceStartError: null,
        ...imported.presentation,
        presentationSavePending: false,
        presentationSaveError: null,
        dayStartRating: recoverDayStartRating(
          imported.state,
          imported.presentation.dayStartRating,
        ),
        flavorInspectorIngredientId: null,
        pendingPlacementItemKey: null,
        floorPlayerGrid: imported.state.activeDay?.floor?.playerPosition ?? null,
        floorToast: null,
        noticeActive: null,
        noticeSticky: null,
        tutorialDismissedStepId: null,
        celebrationQueue: [],
        composeSheetOpen: false,
      });
      clearStoreNotificationTimers();
      syncStoreNotificationTimer();
      await waitForSupersededServiceStart(supersededServiceStart);
      await get().autosave();
      return { ok: true as const };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { ok: false as const, error: message };
    }
  },

  async exportSaveCodeToClipboard() {
    try {
      const code = exportSaveCodeSnapshot(pickGameSaveSnapshot(get()));
      try {
        if (
          typeof navigator !== 'undefined' &&
          navigator.clipboard?.writeText
        ) {
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

  setAudioVolume(volume) {
    const next = Math.min(1, Math.max(0, Number.isFinite(volume) ? volume : 1));
    set({ audioVolume: next });
  },

  setReducedMotion(enabled) {
    set({ reducedMotion: enabled });
    applyAppShellMotionPreference(enabled);
  },

  replayTutorial() {
    lastHudPacingNotice = null;
    const state = get();
    const floor = state.activeDay?.floor;
    const step = floor ? nextTutorialStep(floor, state.day === 1) : null;
    const prompt = tutorialPrompt(step);
    if (prompt && step) {
      const notice = {
        id: `tutorial:replay:${step}:${Date.now()}`,
        source: 'tutorial' as const,
        scope: 'floor' as const,
        body: prompt,
        stepId: step,
      };
      set({
        tutorialDismissedStepId: null,
        noticeActive: notice,
        floorToast: prompt,
      });
      restartNoticeTimer(notice);
    } else {
      set({ tutorialDismissedStepId: null });
    }
    syncStoreNotificationTimer();
  },

  setFloorNavPosition(pos) {
    const current = get();
    const prev = current.floorPlayerGrid;
    const floor = current.activeDay?.floor;
    const persisted = floor?.playerPosition;
    const persistedRoom = floor?.playerRoom ?? 'main';
    if (
      prev?.x === pos.x &&
      prev?.y === pos.y &&
      (!persisted ||
        (persisted.x === pos.x &&
          persisted.y === pos.y &&
          persistedRoom === current.activeFloorRoom))
    ) {
      return;
    }
    const playerPosition = { x: pos.x, y: pos.y };
    const activeDay = current.activeDay?.floor
      ? {
          ...current.activeDay,
          floor: {
            ...current.activeDay.floor,
            playerPosition,
            playerRoom: current.activeFloorRoom,
          },
        }
      : current.activeDay;
    set({ floorPlayerGrid: playerPosition, activeDay });
    const next = get();
    if (next.composeSheetOpen && !selectCanOpenFloorCompose(next)) {
      set({ composeSheetOpen: false });
    }
    if (activeDay?.floor) {
      void get().autosave();
    }
  },

  setFloorSelectedTicket(ticketId) {
    if (!get().activeDay?.floor) return;
    void get()
      .dispatch({ type: 'FLOOR_SELECT_TICKET', ticketId })
      .catch(() => undefined);
    const next = get();
    if (next.composeSheetOpen && !selectCanOpenFloorCompose(next)) {
      set({ composeSheetOpen: false });
    }
  },

  openComposeSheet() {
    const current = get();
    if (!selectCanOpenFloorCompose(current)) return;
    set({ composeSheetOpen: true });
  },

  closeComposeSheet() {
    set({ composeSheetOpen: false });
  },

  setFloorToast(message) {
    const current = get();
    if (!message) {
      set({
        floorToast: null,
        noticeActive:
          current.noticeActive?.source === 'toast'
            ? current.noticeSticky
            : current.noticeActive,
      });
      syncStoreNotificationTimer();
      return;
    }

    const notice =
      current.noticeActive?.source === 'toast' &&
      current.noticeActive.body === message
        ? current.noticeActive
        : {
            id: `toast:${++toastNoticeSequence}`,
            source: 'toast' as const,
            body: message,
          };
    if (
      current.noticeActive &&
      resolveNoticeScope(current.noticeActive) === 'floor'
    ) {
      // A global toast temporarily owns the banner. Allow the HUD to reinstall
      // its contextual pacing notice when the toast completes instead of
      // treating that guidance as already delivered and losing it forever.
      lastHudPacingNotice = null;
    }
    set({ floorToast: message, noticeActive: notice });
    restartNoticeTimer(notice);
    syncStoreNotificationTimer();
  },

  syncFloorNoticesFromHud({ sticky, pacing }) {
    const current = get();
    const pacingChanged = !sameNotice(lastHudPacingNotice, pacing);
    let tutorialDismissedStepId = current.tutorialDismissedStepId;

    if (!sticky?.stepId) {
      tutorialDismissedStepId = null;
    } else if (
      tutorialDismissedStepId &&
      sticky.stepId !== tutorialDismissedStepId
    ) {
      tutorialDismissedStepId = null;
    }

    const allowedSticky =
      sticky?.stepId && sticky.stepId === tutorialDismissedStepId
        ? null
        : sticky;
    const nextSticky = sameNotice(current.noticeSticky, allowedSticky)
      ? current.noticeSticky
      : allowedSticky;
    const activeIsSticky =
      current.noticeActive === null ||
      current.noticeActive === current.noticeSticky;
    const activeIsHudNotice =
      current.noticeActive?.source === 'pacing' ||
      current.noticeActive?.source === 'tutorial';

    if (
      pacing &&
      pacingChanged &&
      (activeIsSticky || activeIsHudNotice) &&
      !sameNotice(current.noticeActive, pacing)
    ) {
      lastHudPacingNotice = pacing;
      set({
        noticeActive: pacing,
        noticeSticky: nextSticky,
        tutorialDismissedStepId,
        floorToast: floorToastFromNotice(pacing),
      });
      restartNoticeTimer(pacing);
    } else {
      // A toast/system message owns the front until its timer completes. Keep
      // a changed HUD notice pending so the next render may introduce it.
      if (!pacing) lastHudPacingNotice = null;
      const nextActive = activeIsSticky ? nextSticky : current.noticeActive;
      set({
        noticeActive: nextActive,
        noticeSticky: nextSticky,
        tutorialDismissedStepId,
        floorToast: floorToastFromNotice(nextActive),
      });
    }
    syncStoreNotificationTimer();
  },

  dismissFrontNotice() {
    const current = get();
    const notice = current.noticeActive;
    if (!notice) {
      syncStoreNotificationTimer();
      return;
    }

    if (notice === current.noticeSticky) {
      set({
        noticeActive: null,
        noticeSticky: null,
        floorToast: null,
        tutorialDismissedStepId:
          notice.source === 'tutorial' ? (notice.stepId ?? null) : null,
      });
    } else {
      const nextNotice = current.noticeSticky;
      set({
        noticeActive: nextNotice,
        floorToast: floorToastFromNotice(nextNotice),
      });
    }
    syncStoreNotificationTimer();
  },

  enqueueCelebration(celebration) {
    set((state) => ({
      celebrationQueue: [...state.celebrationQueue, celebration],
    }));
    syncStoreNotificationTimer();
  },

  dismissCelebration() {
    set((state) => ({
      celebrationQueue: state.celebrationQueue.slice(1),
    }));
    syncStoreNotificationTimer();
  },

  clearCelebrations() {
    set({ celebrationQueue: [] });
    syncStoreNotificationTimer();
  },

  setNotificationSurfaceActive(active) {
    if (get().notificationSurfaceActive === active) return;
    set({ notificationSurfaceActive: active });
    syncStoreNotificationTimer();
  },

  syncNotificationTimer() {
    syncStoreNotificationTimer();
  },

  async dismissModifier() {
    await get().dispatch({ type: 'START_SERVICE' });
  },

  async dismissPendingReview() {
    const review = get().pendingReview;
    if (!review) return;
    await acknowledgePresentationCheckpoint(
      get,
      set,
      { pendingReview: null },
      (state) => state.pendingReview === review,
    );
  },

  async dismissDaySummary() {
    const summary = get().daySummary;
    if (!summary) return;
    await acknowledgePresentationCheckpoint(
      get,
      set,
      { daySummary: null },
      (state) => state.daySummary === summary,
    );
  },

  async dismissCeremony() {
    const ceremony = get().ceremony;
    if (!ceremony) return;
    await acknowledgePresentationCheckpoint(
      get,
      set,
      { ceremony: null, ceremonyPrestige: null },
      (state) => state.ceremony === ceremony,
    );
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
    if (current.activeDay?.floor) return;
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
    const activeDay = current.activeDay?.floor
      ? {
          ...current.activeDay,
          floor: {
            ...current.activeDay.floor,
            playerPosition: { ...spawn },
            playerRoom: nextRoom,
          },
        }
      : current.activeDay;
    set({
      activeFloorRoom: nextRoom,
      floorPlayerGrid: spawn,
      activeDay,
      composeSheetOpen: false,
    });
    if (activeDay?.floor) {
      void get().autosave();
    }
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
    const existing = current
      .activeRoomPlacements()
      .find((item) => item.id === placementId);
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
    const fence = serviceStartFence;
    if (fence) {
      try {
        await fence;
      } catch {
        // The transition performs its rollback save before rejecting.
      }
    }
    while (presentationSaveFence) {
      const acknowledgement = presentationSaveFence;
      try {
        await acknowledgement;
      } catch {
        // The acknowledgement caller receives the failure. Autosave then
        // persists the still-visible checkpoint from current live state.
      }
    }
    await persistGameSnapshot(get());
  },
}));

export function getGameStateSnapshot(): GameState {
  return pickGameState(useGameStore.getState());
}

export function selectCanCloseDayFromStore(): boolean {
  return isDayComplete(pickGameState(useGameStore.getState()));
}
