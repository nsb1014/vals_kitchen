import { computeCameraCenter, gridToWorld, worldToScreen } from '../canvas/coordinates.ts';
import { findBestMatchCombo } from '../domain/day/customer-request-generator.ts';
import { isDayComplete } from '../domain/day/serve.ts';
import type { GameAction } from '../domain/reducer.ts';
import { validatePlacement } from '../domain/economy/purchases.ts';
import {
  defaultSaveRepository,
  type SaveRepository,
} from '../persistence/SaveRepository.ts';
import { exportSaveCode as encodeSaveCode } from '../persistence/saveCode.ts';
import {
  getGameStateSnapshot,
  setGameSaveRepositoryForTests,
  useGameStore,
  type Celebration,
} from '../store/game-store.ts';
import { selectComposeDraftIds } from '../store/selectors/service-day.ts';
import { getDomainContext, isRecipesContentReady, isScoringContentReady } from './content-loader.ts';
import type { RestaurantApp } from '../canvas/RestaurantApp.ts';
import {
  playerWalkBlockedCells,
  walkBlockedCells,
} from '../canvas/world/blocked-cells.ts';
import { findPath } from '../domain/floor/pathfinding.ts';
import {
  guestServicePositions,
  isCookStationItemKey,
  waitingGuestServicePositions,
} from '../domain/floor/interact.ts';
import { seatsFromPlacements } from '../domain/floor/seats.ts';
import { tablesFromPlacements } from '../domain/floor/sim.ts';
import type { SeatSlot } from '../domain/floor/types.ts';
import { seatingFromPlacements, type Placement } from '../domain/state/game-state.ts';

const E2E_WAITING_SERVICE_BLOCKER_PREFIX =
  '__e2e_waiting_service_blocker__:';

function reachableMainFloorCellBeside(seat: Pick<SeatSlot, 'x' | 'y'>): {
  x: number;
  y: number;
} {
  const state = useGameStore.getState();
  const floor = state.activeDay?.floor;
  if (!floor) throw new Error('No active floor for guest approach');
  const blocked = walkBlockedCells(state.placements, state.gridSize.w, state.gridSize.h, {
    kitchenAnnexOwned: state.kitchenAnnexOwned,
    room: 'main',
  });
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      const candidate = { x: seat.x + dx, y: seat.y + dy };
      if (
        candidate.x < 0 ||
        candidate.y < 0 ||
        candidate.x >= state.gridSize.w ||
        candidate.y >= state.gridSize.h ||
        blocked.has(`${candidate.x},${candidate.y}`)
      ) {
        continue;
      }
      if (findPath({ w: state.gridSize.w, h: state.gridSize.h, blocked }, floor.playerPosition, candidate)) {
        return candidate;
      }
    }
  }
  throw new Error('No reachable floor cell beside guest seat');
}

function reachableGuestServiceCell(seat: Pick<SeatSlot, 'x' | 'y'>): {
  x: number;
  y: number;
} {
  const state = useGameStore.getState();
  const floor = state.activeDay?.floor;
  if (!floor) throw new Error('No active floor for guest approach');
  const blocked = walkBlockedCells(state.placements, state.gridSize.w, state.gridSize.h, {
    kitchenAnnexOwned: state.kitchenAnnexOwned,
    room: 'main',
  });
  for (const candidate of guestServicePositions(seat)) {
    if (
      candidate.x < 0 ||
      candidate.y < 0 ||
      candidate.x >= state.gridSize.w ||
      candidate.y >= state.gridSize.h ||
      blocked.has(`${candidate.x},${candidate.y}`)
    ) {
      continue;
    }
    if (
      findPath(
        { w: state.gridSize.w, h: state.gridSize.h, blocked },
        floor.playerPosition,
        candidate,
      )
    ) {
      return candidate;
    }
  }
  throw new Error('No reachable service position near guest seat');
}

export interface E2eBridge {
  getPlacements: () => Array<{
    id: string;
    itemKey: string;
    x: number;
    y: number;
  }>;
  getState: () => {
    day: number;
    cash: number;
    rating: number;
    hydrated: boolean;
    modifierDismissed: boolean;
    serviceStartPending: boolean;
    activeDay: { queueIndex: number; customerCount: number } | null;
    composeDraftIngredientIds: string[];
    floorTicketDrafts: Record<string, string[]>;
    selectedTicketId: string | null;
    composeSheetOpen: boolean;
    pendingPlacementItemKey: string | null;
    screen: string;
    activeFloorRoom: string;
    floorPlayerGrid: { x: number; y: number } | null;
  };
  getGameState: () => ReturnType<typeof getGameStateSnapshot>;
  isScoringReady: () => boolean;
  isRecipesReady: () => boolean;
  gridCellToScreen: (gx: number, gy: number) => { x: number; y: number };
  exportSaveCode: () => string;
  /** Drive one step of the floor service loop (for e2e smoke). */
  advanceFloorServiceOnce: () => Promise<'pending_review' | 'day_complete' | 'advanced' | 'idle'>;
  /** Run the full floor day to summary (dismisses reviews, closes day). */
  completeFloorServiceDay: () => Promise<void>;
  dispatch: (action: GameAction) => Promise<void>;
  setFloorNavPosition: (pos: { x: number; y: number }) => void;
  requestSeatNextGuest: () => boolean;
  getPendingSeatingIntentDebug: () => {
    revision: number;
    destination: { x: number; y: number };
  } | null;
  getPendingApproachIntentDebug: () => {
    revision: number;
    kind: 'seat' | 'order' | 'deliver' | 'set' | 'clear' | 'compose';
    destination: { x: number; y: number };
  } | null;
  setWaitingGuestServiceBlockedForTest: (blocked: boolean) => void;
  failNextSaveForTest: () => void;
  dismissPendingReview: () => Promise<void>;
  showCeremonyOverPendingReview: () => void;
  prepareCookUiFixture: () => Promise<void>;
  prepareTicketPanelFixture: (ticketCount: number, carrying?: boolean) => Promise<void>;
  prepareFullTicketRemoteSeatedGuestFixture: () => Promise<{
    guestId: string;
    seat: { x: number; y: number };
    remote: { x: number; y: number };
  }>;
  prepareFourFacingSeatedGuestsFixture: () => Promise<
    Array<{
      guestId: string;
      seat: {
        x: number;
        y: number;
        facing: 0 | 90 | 180 | 270;
        tablePlacementId: string;
        slotIndex: number;
      };
    }>
  >;
  prepareQueuedDepartureVisualFixture: () => Promise<{
    firstGuestId: string;
    heldGuestId: string;
    heldSeat: {
      x: number;
      y: number;
      facing: 0 | 90 | 180 | 270;
      tablePlacementId: string;
      slotIndex: number;
    };
  }>;
  prepareStationCarryFixture: (
    mode: 'valid_carry' | 'stale_with_open' | 'stale_without_open',
  ) => Promise<{
    station: { x: number; y: number };
    remote: { x: number; y: number };
    ticketId: string | null;
  }>;
  prepareCarryInteractionBoundaryFixture: () => Promise<{
    station: { x: number; y: number };
    stationServicePosition: { x: number; y: number };
    ticketId: string;
    matchingGuest: {
      guestId: string;
      seat: { x: number; y: number };
      servicePosition: { x: number; y: number };
    };
    wrongGuest: {
      guestId: string;
      seat: { x: number; y: number };
      servicePosition: { x: number; y: number };
    };
  }>;
  /**
   * Place Val on a deterministic clear five-cell cross without changing the
   * currently carried plated ticket. This fixture intentionally leaves the
   * actual walk to pointer input.
   */
  prepareCarryAnimationCross: () => {
    center: { x: number; y: number };
    targets: {
      right: { x: number; y: number };
      down: { x: number; y: number };
      up: { x: number; y: number };
      left: { x: number; y: number };
    };
    ticketId: string;
  };
  prepareDecorVisualFixture: () => void;
  prepareEquipmentVisualFixture: () => void;
  unlockKitchenAnnexForTest: () => void;
  openComposeSheet: () => void;
  openFlavorInspector: (ingredientId: string) => void;
  /** Debug: live actor sprite sizes after floor sync (Playwright visual QA). */
  getActorSpriteMetrics: () => Array<{
    kind: string;
    tex: string;
    width: number;
    height: number;
    scaleX: number;
    scaleY: number;
    alpha: number;
    x: number;
    y: number;
    zIndex: number;
  }>;
  /** Debug: current rendered anchor for one guest actor. */
  getGuestScreenAnchor: (guestId: string) => { x: number; y: number } | null;
  /** Debug: current rendered feet anchor for Val. */
  getPlayerScreenFeetAnchor: () => { x: number; y: number } | null;
  /** Debug: requested and bound player art for carry-animation assertions. */
  getPlayerVisualDebug: () => {
    requestedTextureKey: string;
    boundTextureKey: string;
    authoredCarry: boolean;
    plateOverlayVisible: boolean;
    spriteVisible: boolean;
    spriteAlpha: number;
    frameWidth: number;
    frameHeight: number;
    feet: { x: number; y: number } | null;
    facing: 'right' | 'down' | 'up' | 'left';
    isMoving: boolean;
  } | null;
  /** Debug: one guest plus the authoritative/painted south-door state. */
  getGuestDoorwayTransitionDebug: (guestId: string) => {
    guestId: string;
    stage:
      | 'queued'
      | 'entering'
      | 'waiting'
      | 'seating'
      | 'seated'
      | 'ordered'
      | 'eating'
      | 'leaving'
      | 'done'
      | null;
    guest: {
      requestedFrameKey: string;
      actualBoundFrameKey: string;
      textureMatchesActualBoundFrame: boolean;
      actualMaskWorldBounds: {
        left: number;
        top: number;
        right: number;
        bottom: number;
      } | null;
      isMoving: boolean;
      facing: 'right' | 'down' | 'up' | 'left';
      visible: boolean;
      alpha: number;
      feet: { x: number; y: number };
      doorwayCrop: {
        progress: number;
        visibleFraction: number;
        apertureWorldY: number;
        visualOffsetY: number;
        maskApplied: boolean;
        contentRenderable: boolean;
        unclippedWorldBounds: {
          left: number;
          top: number;
          right: number;
          bottom: number;
        };
        clippedWorldBounds: {
          left: number;
          top: number;
          right: number;
          bottom: number;
        } | null;
      } | null;
    } | null;
    door: {
      cell: { x: number; y: number } | null;
      requestedOpen: boolean;
      paintedOpen: boolean;
      spriteCount: number;
    };
    authoritativeOpen: boolean;
    exitLingerRemainingMs: number;
    camera: {
      x: number;
      y: number;
      scale: number;
      stageOffsetX: number;
      stageOffsetY: number;
    };
  } | null;
  /** Click the real Start Service control and capture its synchronous revealed frame. */
  startServiceAndCaptureGuestDoorwayFrame: (
    guestId: string,
  ) => Promise<
    NonNullable<ReturnType<E2eBridge['getGuestDoorwayTransitionDebug']>>
  >;
  /** Exercise the ordinary store-to-canvas render path without mutating gameplay. */
  repaintRestaurantFromStoreForTest: () => void;
  /** Debug: combined furniture and seated-actor depth/pose snapshot. */
  getSeatingSceneDebug: () => {
    depthParent: {
      shared: boolean;
      sortable: boolean;
    };
    tables: Array<{
      placementId: string;
      itemKey: string;
      zIndex: number;
      paintOrder: number;
      inDepthParent: boolean;
      x: number;
      y: number;
    }>;
    chairs: Array<{
      tablePlacementId: string;
      slotIndex: number;
      zIndex: number;
      paintOrder: number;
      inDepthParent: boolean;
      x: number;
      y: number;
    }>;
    guests: Array<{
      guestId: string;
      tablePlacementId: string;
      slotIndex: number;
      seatFacing: 0 | 90 | 180 | 270;
      rootZIndex: number;
      paintOrder: number;
      inDepthParent: boolean;
      requestedFrameKey: string;
      actualBoundFrameKey: string;
      isSeated: boolean;
      isMoving: boolean;
      walkFrame: number;
      facing: 'right' | 'down' | 'up' | 'left';
      visible: boolean;
      alpha: number;
      feet: { x: number; y: number };
    }>;
  } | null;
  getOpaqueTableOverlapScreenPoint: (guestId: string) => {
    x: number;
    y: number;
    tablePlacementId: string;
    usesTableOverhang: boolean;
    gridCell: { x: number; y: number };
    occlusionSource: 'texture-alpha';
  } | null;
  /** Debug: current rendered feet anchor for one guest actor. */
  getGuestScreenFeetAnchor: (guestId: string) => { x: number; y: number } | null;
  /** Debug: current unexpanded rendered frame bounds for one guest actor. */
  getGuestScreenRenderedBounds: (guestId: string) => {
    left: number;
    top: number;
    right: number;
    bottom: number;
  } | null;
  /** Debug: whether a world-space tap affordance is currently rendered. */
  getInteractHintVisible: () => boolean;
  /** Debug: exact grid cells currently carrying tap affordances. */
  getInteractHintCells: () => Array<{ x: number; y: number }>;
  /** Debug: whether a ticket currently owns the async delivery boundary. */
  isDeliveryPending: (ticketId: string) => boolean;
  setFloorToast: (message: string | null) => void;
  enqueueCelebration: (celebration: Celebration) => void;
}

declare global {
  interface Window {
    __E2E__?: E2eBridge;
  }
}

/** Hooks for Playwright when `?e2e=1` is present. */
export function installE2eBridge(getRestaurantApp: () => RestaurantApp | null): void {
  if (typeof window === 'undefined') return;
  if (!new URLSearchParams(window.location.search).has('e2e')) return;

  // Deterministic geometry: skip enter/shimmer transitions that shift layout boxes
  // under CI load. Dataset + game-root attribute are what canvas reads via
  // prefersReducedMotion() (matchMedia alone is not enough in Playwright).
  document.documentElement.dataset.vkReducedMotion = 'true';
  document
    .querySelector('#game-root')
    ?.setAttribute('data-vk-reduced-motion', 'true');
  document.documentElement.style.setProperty('scroll-behavior', 'auto');

  window.__E2E__ = {
    getPlacements() {
      return useGameStore.getState().placements.map((p) => ({
        id: p.id,
        itemKey: p.itemKey,
        x: p.x,
        y: p.y,
      }));
    },

    getState() {
      const s = useGameStore.getState();
      const floor = s.activeDay?.floor;
      return {
        day: s.day,
        cash: s.cash,
        rating: s.rating,
        hydrated: s.hydrated,
        modifierDismissed: s.modifierDismissed,
        serviceStartPending: s.serviceStartPending,
        activeDay: s.activeDay
          ? {
              queueIndex: s.activeDay.queueIndex,
              customerCount: s.activeDay.customers.length,
            }
          : null,
        composeDraftIngredientIds: selectComposeDraftIds(s),
        floorTicketDrafts: Object.fromEntries(
          floor?.tickets.map((ticket) => [ticket.id, [...ticket.ingredientIds]]) ?? [],
        ),
        selectedTicketId: floor?.selectedTicketId ?? null,
        composeSheetOpen: s.composeSheetOpen,
        pendingPlacementItemKey: s.pendingPlacementItemKey,
        screen: s.screen,
        activeFloorRoom: s.activeFloorRoom,
        floorPlayerGrid: s.floorPlayerGrid,
      };
    },

    getGameState: () => getGameStateSnapshot(),

    isScoringReady: () => isScoringContentReady(),

    isRecipesReady: () => isRecipesContentReady(),

    gridCellToScreen(gx: number, gy: number) {
      const canvas = document.querySelector('[data-testid="restaurant-canvas"]') as HTMLCanvasElement | null;
      if (!canvas) {
        throw new Error('restaurant canvas not mounted');
      }
      const rect = canvas.getBoundingClientRect();
      const state = useGameStore.getState();
      const camera =
        getRestaurantApp()?.camera.state ??
        computeCameraCenter(state.gridSize.w, state.gridSize.h, canvas.clientWidth, canvas.clientHeight);
      const world = gridToWorld(gx, gy);
      const screen = worldToScreen(world.x + 8, world.y + 8, camera);
      return { x: rect.left + screen.x, y: rect.top + screen.y };
    },

    exportSaveCode: () => encodeSaveCode(getGameStateSnapshot()),

    async dispatch(action) {
      await useGameStore.getState().dispatch(action);
    },

    setFloorNavPosition(pos) {
      getRestaurantApp()?.nav.snapTo(pos);
      useGameStore.getState().setFloorNavPosition(pos);
    },

    requestSeatNextGuest() {
      return getRestaurantApp()?.requestSeatNextGuest() ?? false;
    },

    getPendingSeatingIntentDebug() {
      return getRestaurantApp()?.getPendingSeatingIntentDebug() ?? null;
    },

    getPendingApproachIntentDebug() {
      return getRestaurantApp()?.getPendingApproachIntentDebug() ?? null;
    },

    setWaitingGuestServiceBlockedForTest(blocked) {
      const current = useGameStore.getState();
      const withoutFixtures = current.placements.filter(
        (placement) =>
          !placement.id.startsWith(E2E_WAITING_SERVICE_BLOCKER_PREFIX),
      );
      if (!blocked) {
        useGameStore.setState({ placements: withoutFixtures });
        return;
      }

      const fixtures = waitingGuestServicePositions(
        current.gridSize.w,
        current.gridSize.h,
      ).map((position, index) => ({
        id: `${E2E_WAITING_SERVICE_BLOCKER_PREFIX}${index}`,
        itemKey: 'prep_station',
        x: position.x,
        y: position.y,
        rotation: 0,
      }));
      useGameStore.setState({
        placements: [...withoutFixtures, ...fixtures],
      });
    },

    getActorSpriteMetrics() {
      const app = getRestaurantApp();
      if (!app) return [];
      const out: Array<{
        kind: string;
        tex: string;
        width: number;
        height: number;
        scaleX: number;
        scaleY: number;
        alpha: number;
        x: number;
        y: number;
        zIndex: number;
      }> = [];
      const visit = (node: { children?: Iterable<unknown> }) => {
        for (const child of node.children ?? []) {
          const c = child as {
            texture?: { height?: number; width?: number; uid?: number };
            width?: number;
            height?: number;
            scale?: { x: number; y: number };
            alpha?: number;
            worldTransform?: { tx: number; ty: number; a: number; d: number };
            x?: number;
            y?: number;
            zIndex?: number;
            children?: Iterable<unknown>;
            visible?: boolean;
          };
          const tex = c.texture;
          if (
            tex &&
            c.visible !== false &&
            typeof c.width === 'number' &&
            typeof c.height === 'number' &&
            c.height > 8
          ) {
            out.push({
              kind: 'sprite',
              tex: `${Math.round(tex.width ?? 0)}x${Math.round(tex.height ?? 0)}`,
              width: Math.round(c.width),
              height: Math.round(c.height),
              scaleX: Number((c.scale?.x ?? 1).toFixed(4)),
              scaleY: Number((c.scale?.y ?? 1).toFixed(4)),
              alpha: c.alpha ?? 1,
              x: Math.round(c.worldTransform?.tx ?? c.x ?? 0),
              y: Math.round(c.worldTransform?.ty ?? c.y ?? 0),
              zIndex: c.zIndex ?? 0,
            });
          }
          if (c.children) visit(c);
        }
      };
      visit(app.depthLayer);
      return out.sort((a, b) => a.y - b.y);
    },

    getGuestScreenAnchor(guestId) {
      return getRestaurantApp()?.getGuestScreenAnchor(guestId) ?? null;
    },

    getPlayerScreenFeetAnchor() {
      return getRestaurantApp()?.getPlayerScreenFeetAnchor() ?? null;
    },

    getPlayerVisualDebug() {
      return getRestaurantApp()?.getPlayerVisualDebug() ?? null;
    },

    getGuestDoorwayTransitionDebug(guestId) {
      return getRestaurantApp()?.getGuestDoorwayTransitionDebug(guestId) ?? null;
    },

    startServiceAndCaptureGuestDoorwayFrame(guestId) {
      return new Promise((resolve, reject) => {
        const button = document.querySelector<HTMLButtonElement>(
          '[data-testid="start-service-btn"]',
        );
        if (!button) {
          reject(new Error('Start Service control is missing'));
          return;
        }
        let settled = false;
        const timeout = window.setTimeout(() => {
          if (settled) return;
          settled = true;
          unsubscribe();
          reject(new Error('Start Service did not reveal the live floor'));
        }, 10_000);
        const unsubscribe = useGameStore.subscribe((state) => {
          if (settled || !state.modifierDismissed) return;
          settled = true;
          window.clearTimeout(timeout);
          unsubscribe();
          // Let every listener for the same store mutation finish, while
          // remaining in the current task before the next ticker/rAF advances.
          queueMicrotask(() => {
            const debug = getRestaurantApp()?.getGuestDoorwayTransitionDebug(guestId);
            if (!debug) {
              reject(new Error('restaurant app omitted the revealed doorway frame'));
              return;
            }
            resolve(debug);
          });
        });
        button.click();
      });
    },

    repaintRestaurantFromStoreForTest() {
      getRestaurantApp()?.syncFromStore(useGameStore.getState());
    },

    getSeatingSceneDebug() {
      return getRestaurantApp()?.getSeatingSceneDebug() ?? null;
    },

    getOpaqueTableOverlapScreenPoint(guestId) {
      return getRestaurantApp()?.getOpaqueTableOverlapScreenPoint(guestId) ?? null;
    },

    getGuestScreenFeetAnchor(guestId) {
      return getRestaurantApp()?.getGuestScreenFeetAnchor(guestId) ?? null;
    },

    getGuestScreenRenderedBounds(guestId) {
      return getRestaurantApp()?.getGuestScreenRenderedBounds(guestId) ?? null;
    },

    getInteractHintVisible() {
      return Boolean(getRestaurantApp()?.interactHintLayer.view.visible);
    },

    getInteractHintCells() {
      return getRestaurantApp()?.interactHintLayer.getCells() ?? [];
    },

    isDeliveryPending(ticketId) {
      return getRestaurantApp()?.isDeliveryPending(ticketId) ?? false;
    },

    dismissPendingReview() {
      return useGameStore.getState().dismissPendingReview();
    },

    failNextSaveForTest() {
      const failOnceRepository: SaveRepository = {
        load: () => defaultSaveRepository.load(),
        async save() {
          setGameSaveRepositoryForTests(null);
          throw new Error('Simulated save failure');
        },
        clear: () => defaultSaveRepository.clear(),
        exportSaveCode: (state, presentation) =>
          defaultSaveRepository.exportSaveCode(state, presentation),
        exportSaveCodeSnapshot: (snapshot) =>
          defaultSaveRepository.exportSaveCodeSnapshot(snapshot),
        importSaveCode: (code) => defaultSaveRepository.importSaveCode(code),
        importSaveCodeSnapshot: (code) =>
          defaultSaveRepository.importSaveCodeSnapshot(code),
      };
      setGameSaveRepositoryForTests(failOnceRepository);
    },

    showCeremonyOverPendingReview() {
      const state = useGameStore.getState();
      if (!state.pendingReview) {
        throw new Error('ceremony fixture requires a pending review');
      }
      useGameStore.setState({
        ceremony: 'prestige',
        ceremonyPrestige: Math.max(1, state.prestige),
      });
    },

    async prepareCookUiFixture() {
      if (!useGameStore.getState().activeDay) {
        await useGameStore.getState().dispatch({ type: 'OPEN_DAY' });
      }
      await useGameStore.getState().dismissModifier();

      const floor = useGameStore.getState().activeDay!.floor!;
      for (const table of floor.tables) {
        if (table.state === 'unset') {
          await useGameStore.getState().dispatch({
            type: 'FLOOR_SET_TABLE',
            placementId: table.placementId,
          });
        }
      }
      if (useGameStore.getState().activeDay!.floor!.pool.some((guest) => guest.stage === 'entering')) {
        await useGameStore.getState().dispatch({ type: 'FLOOR_COMPLETE_ENTERING' });
      }
      if (useGameStore.getState().activeDay!.floor!.pool.some((guest) => guest.stage === 'waiting')) {
        const state = useGameStore.getState();
        state.setFloorNavPosition(
          waitingGuestServicePositions(state.gridSize.w, state.gridSize.h)[0]!,
        );
        await useGameStore.getState().dispatch({ type: 'FLOOR_SEAT_NEXT' });
      }
      const seatingGuest = useGameStore.getState().activeDay!.floor!.pool.find((guest) => guest.stage === 'seating');
      if (seatingGuest) {
        await useGameStore.getState().dispatch({
          type: 'FLOOR_COMPLETE_SEATING',
          guestId: seatingGuest.id,
        });
      }
      const customerIds = useGameStore
        .getState()
        .activeDay!.floor!.pool.filter((guest) => guest.stage === 'seated')
        .map((guest) => guest.customer.id);
      if (customerIds.length > 0) {
        const target = useGameStore
          .getState()
          .activeDay!.floor!.pool.find((guest) => guest.customer.id === customerIds[0]);
        if (target?.seat) {
          useGameStore.getState().setFloorNavPosition(reachableGuestServiceCell(target.seat));
        }
        await useGameStore.getState().dispatch({
          type: 'FLOOR_TAKE_ORDERS',
          customerIds: [customerIds[0]!],
        });
      }

      const current = useGameStore.getState();
      const station = current.placements.find((placement) => placement.itemKey === 'prep_station');
      const openTicket = current.activeDay!.floor!.tickets.find((ticket) => ticket.status === 'open');
      if (!station || !openTicket) {
        throw new Error('cook UI fixture could not create a station and open ticket');
      }
      useGameStore.setState({
        unlockedIngredientIds: getDomainContext().ingredients.map((ingredient) => ingredient.id),
      });
      useGameStore.getState().setFloorSelectedTicket(openTicket.id);
      useGameStore.getState().setActiveFloorRoom('main');
      const cookPosition = reachableMainFloorCellBeside(station);
      const restaurantApp = getRestaurantApp();
      restaurantApp?.app.stop();
      restaurantApp?.nav.snapTo(cookPosition);
      useGameStore.getState().setFloorNavPosition(cookPosition);
    },

    async prepareTicketPanelFixture(ticketCount, carrying = false) {
      if (!Number.isInteger(ticketCount) || ticketCount < 0 || ticketCount > 4) {
        throw new Error('ticket panel fixture count must be between 0 and 4');
      }
      if (!useGameStore.getState().activeDay) {
        await useGameStore.getState().dispatch({ type: 'OPEN_DAY' });
      }
      await useGameStore.getState().dismissModifier();

      const activeDay = useGameStore.getState().activeDay!;
      const floor = activeDay.floor!;
      const customers = activeDay.customers.slice(0, ticketCount);
      if (customers.length !== ticketCount) {
        throw new Error('ticket panel fixture does not have enough customers');
      }
      const tickets = customers.map((customer, index) => ({
        id: `ticket_${customer.id}`,
        customerId: customer.id,
        ingredientIds: [],
        status: carrying && index === 0 ? ('plated' as const) : ('open' as const),
      }));
      const carriedTicketId = carrying ? (tickets[0]?.id ?? null) : null;
      useGameStore.setState({
        activeDay: {
          ...activeDay,
          floor: {
            ...floor,
            pool: floor.pool.map((guest) =>
              customers.some((customer) => customer.id === guest.customer.id)
                ? { ...guest, stage: 'ordered' as const }
                : guest,
            ),
            tickets,
            carriedTicketId,
            selectedTicketId: carrying ? null : (tickets.find((ticket) => ticket.status === 'open')?.id ?? null),
          },
        },
      });
    },

    async prepareFullTicketRemoteSeatedGuestFixture() {
      if (!useGameStore.getState().activeDay) {
        await useGameStore.getState().dispatch({ type: 'OPEN_DAY' });
      }
      await useGameStore.getState().dismissModifier();

      const current = useGameStore.getState();
      const activeDay = current.activeDay;
      const floor = activeDay?.floor;
      if (!activeDay || !floor) {
        throw new Error('full ticket fixture requires an active floor day');
      }
      const ticketCustomers = activeDay.customers.slice(0, 4);
      if (ticketCustomers.length !== 4) {
        throw new Error('full ticket fixture requires four ticket customers');
      }

      let fixtureTable: Placement | null = null;
      for (let y = 1; y < current.gridSize.h - 1 && !fixtureTable; y += 1) {
        for (let x = 1; x < current.gridSize.w - 1; x += 1) {
          const candidate: Placement = {
            id: '__e2e_capacity_table__',
            itemKey: 'table_2seat',
            x,
            y,
            rotation: 0,
          };
          if (validatePlacement(current, candidate)) {
            fixtureTable = candidate;
            break;
          }
        }
      }
      if (!fixtureTable) {
        throw new Error('full ticket fixture could not place an extra table');
      }

      const placements = [...current.placements, fixtureTable];
      const seats = seatsFromPlacements(placements);
      const assignedSeats = seats.slice(0, 5);
      if (assignedSeats.length !== 5) {
        throw new Error('full ticket fixture requires five distinct seats');
      }
      const baseCustomer = ticketCustomers[0]!;
      const targetCustomer = {
        ...baseCustomer,
        id: '__e2e_capacity_target_customer__',
      };
      const targetGuest = {
        id: '__e2e_capacity_target_guest__',
        customer: targetCustomer,
        stage: 'seated' as const,
        seat: assignedSeats[4]!,
        eatTicksRemaining: 0,
      };
      const customerSeatById = new Map(
        ticketCustomers.map((customer, index) => [
          customer.id,
          assignedSeats[index]!,
        ] as const),
      );
      const occupiedTableIds = new Set(
        assignedSeats.map((seat) => seat.tablePlacementId),
      );
      const tables = tablesFromPlacements(placements).map((table) => ({
        ...table,
        state: occupiedTableIds.has(table.placementId)
          ? ('occupied' as const)
          : ('ready' as const),
      }));
      const tickets = ticketCustomers.map((customer) => ({
        id: `ticket_${customer.id}`,
        customerId: customer.id,
        ingredientIds: [],
        status: 'open' as const,
      }));

      const blocked = walkBlockedCells(
        placements,
        current.gridSize.w,
        current.gridSize.h,
        { kitchenAnnexOwned: current.kitchenAnnexOwned, room: 'main' },
      );
      const serviceCells = guestServicePositions(targetGuest.seat).filter(
        (cell) => !blocked.has(`${cell.x},${cell.y}`),
      );
      let remote: { x: number; y: number } | null = null;
      for (let y = current.gridSize.h - 2; y >= 1 && !remote; y -= 1) {
        for (let x = current.gridSize.w - 2; x >= 1; x -= 1) {
          const candidate = { x, y };
          if (
            blocked.has(`${x},${y}`) ||
            serviceCells.some((cell) => cell.x === x && cell.y === y)
          ) {
            continue;
          }
          if (
            serviceCells.some((serviceCell) =>
              findPath(
                {
                  w: current.gridSize.w,
                  h: current.gridSize.h,
                  blocked,
                },
                candidate,
                serviceCell,
              ),
            )
          ) {
            remote = candidate;
            break;
          }
        }
      }
      if (!remote) {
        throw new Error('full ticket fixture could not find a remote player cell');
      }

      useGameStore.setState({
        placements,
        seatingCapacity: seatingFromPlacements(placements),
        tableCount: tables.length,
        floorPlayerGrid: remote,
        activeFloorRoom: 'main',
        activeDay: {
          ...activeDay,
          customers: [...ticketCustomers, targetCustomer],
          floor: {
            ...floor,
            pool: [
              ...floor.pool
                .filter((guest) => customerSeatById.has(guest.customer.id))
                .map((guest) => ({
                  ...guest,
                  stage: 'ordered' as const,
                  seat: customerSeatById.get(guest.customer.id)!,
                  motionPosition: undefined,
                })),
              targetGuest,
            ],
            tables,
            seats,
            tickets,
            carriedTicketId: null,
            selectedTicketId: tickets[0]!.id,
            playerPosition: remote,
            playerRoom: 'main',
          },
        },
      });
      getRestaurantApp()?.nav.snapTo(remote);

      return {
        guestId: targetGuest.id,
        seat: { x: targetGuest.seat.x, y: targetGuest.seat.y },
        remote,
      };
    },

    async prepareFourFacingSeatedGuestsFixture() {
      if (!useGameStore.getState().activeDay) {
        await useGameStore.getState().dispatch({ type: 'OPEN_DAY' });
      }
      await useGameStore.getState().dismissModifier();

      const current = useGameStore.getState();
      const activeDay = current.activeDay;
      const floor = activeDay?.floor;
      if (!activeDay || !floor) {
        throw new Error('four-facing fixture requires an active floor day');
      }
      const customers = activeDay.customers.slice(0, 4);
      if (customers.length !== 4) {
        throw new Error('four-facing fixture requires four customers');
      }

      const retainedPlacements = current.placements.filter(
        (placement) => !placement.itemKey.startsWith('table'),
      );
      const fixturePlacementState = {
        ...current,
        placements: retainedPlacements,
      };
      let fixtureTable: Placement | null = null;
      for (let y = 1; y < current.gridSize.h - 1 && !fixtureTable; y += 1) {
        for (let x = 1; x < current.gridSize.w - 1; x += 1) {
          const candidate: Placement = {
            id: '__e2e_four_facing_table__',
            itemKey: 'table_4seat',
            x,
            y,
            rotation: 0,
          };
          if (validatePlacement(fixturePlacementState, candidate)) {
            fixtureTable = candidate;
            break;
          }
        }
      }
      if (!fixtureTable) {
        throw new Error('four-facing fixture could not place its table');
      }

      const fixtureSeats = seatsFromPlacements([fixtureTable]);
      if (fixtureSeats.length !== 4) {
        throw new Error('four-facing fixture requires four seat facings');
      }
      const guests = customers.map((customer, index) => {
        const existing = floor.pool.find(
          (guest) => guest.customer.id === customer.id,
        );
        return {
          ...(existing ?? {
            id: `__e2e_four_facing_guest_${index}__`,
            customer,
            eatTicksRemaining: 0,
          }),
          stage: 'seated' as const,
          seat: fixtureSeats[index]!,
          motionPosition: undefined,
        };
      });
      const placements = [...retainedPlacements, fixtureTable];
      const seats = seatsFromPlacements(placements);
      const tables = tablesFromPlacements(placements).map((table) => ({
        ...table,
        state: table.placementId === fixtureTable.id
          ? ('occupied' as const)
          : ('ready' as const),
      }));
      const remote = { x: 4, y: 5 };

      useGameStore.setState({
        placements,
        seatingCapacity: seatingFromPlacements(placements),
        tableCount: tables.length,
        floorPlayerGrid: remote,
        activeFloorRoom: 'main',
        activeDay: {
          ...activeDay,
          floor: {
            ...floor,
            pool: guests,
            tables,
            seats,
            tickets: [],
            carriedTicketId: null,
            selectedTicketId: null,
            playerPosition: remote,
            playerRoom: 'main',
          },
        },
      });
      getRestaurantApp()?.nav.snapTo(remote);

      return guests.map((guest) => ({
        guestId: guest.id,
        seat: {
          x: guest.seat.x,
          y: guest.seat.y,
          facing: guest.seat.facing,
          tablePlacementId: guest.seat.tablePlacementId,
          slotIndex: guest.seat.slotIndex,
        },
      }));
    },

    async prepareQueuedDepartureVisualFixture() {
      const seated = await window.__E2E__!.prepareFourFacingSeatedGuestsFixture();
      const first = seated[0];
      const held = seated[1];
      if (!first || !held) {
        throw new Error('queued departure fixture requires two seated guests');
      }
      const current = useGameStore.getState();
      const activeDay = current.activeDay;
      const floor = activeDay?.floor;
      if (!activeDay || !floor) {
        throw new Error('queued departure fixture requires an active floor day');
      }
      const leavingGuests = [first, held].map((fixtureGuest) => {
        const guest = floor.pool.find(
          (candidate) => candidate.id === fixtureGuest.guestId,
        );
        if (!guest?.seat) {
          throw new Error('queued departure fixture lost an authored seat');
        }
        return {
          ...guest,
          stage: 'leaving' as const,
          motionPosition: undefined,
        };
      });
      useGameStore.setState({
        activeDay: {
          ...activeDay,
          queueIndex: activeDay.customers.length,
          floor: {
            ...floor,
            pool: leavingGuests,
            tickets: [],
            carriedTicketId: null,
            selectedTicketId: null,
          },
        },
      });
      return {
        firstGuestId: first.guestId,
        heldGuestId: held.guestId,
        heldSeat: { ...held.seat },
      };
    },

    async prepareStationCarryFixture(mode) {
      if (!useGameStore.getState().activeDay) {
        await useGameStore.getState().dispatch({ type: 'OPEN_DAY' });
      }
      await useGameStore.getState().dismissModifier();

      const current = useGameStore.getState();
      const activeDay = current.activeDay;
      const floor = activeDay?.floor;
      if (!activeDay || !floor) {
        throw new Error('station carry fixture requires an active floor day');
      }
      const station = current.placements.find(
        (placement) =>
          isCookStationItemKey(placement.itemKey) &&
          current.purchasedEquipmentIds.includes(placement.itemKey),
      );
      if (!station) {
        throw new Error('station carry fixture requires an owned cook station');
      }

      const blocked = walkBlockedCells(
        current.placements,
        current.gridSize.w,
        current.gridSize.h,
        { kitchenAnnexOwned: current.kitchenAnnexOwned, room: 'main' },
      );
      const stationServiceCell = reachableMainFloorCellBeside(station);
      let remote: { x: number; y: number } | null = null;
      for (let y = current.gridSize.h - 2; y >= 1 && !remote; y -= 1) {
        for (let x = 1; x < current.gridSize.w - 1; x += 1) {
          const candidate = { x, y };
          if (
            blocked.has(`${x},${y}`) ||
            Math.max(Math.abs(x - station.x), Math.abs(y - station.y)) <= 1
          ) {
            continue;
          }
          if (
            findPath(
              {
                w: current.gridSize.w,
                h: current.gridSize.h,
                blocked,
              },
              candidate,
              stationServiceCell,
            )
          ) {
            remote = candidate;
            break;
          }
        }
      }
      if (!remote) {
        throw new Error('station carry fixture could not find a remote player cell');
      }

      const customer = activeDay.customers[0];
      const seat = floor.seats[0];
      if (!customer || !seat) {
        throw new Error('station carry fixture requires a customer and seat');
      }
      const ticket = mode === 'stale_without_open'
        ? null
        : {
            id: `ticket_${customer.id}`,
            customerId: customer.id,
            ingredientIds:
              mode === 'valid_carry'
                ? current.unlockedIngredientIds.slice(0, 3)
                : [],
            status: mode === 'valid_carry'
              ? ('plated' as const)
              : ('open' as const),
          };
      const pool = ticket
        ? floor.pool.map((guest) =>
            guest.customer.id === customer.id
              ? {
                  ...guest,
                  stage: 'ordered' as const,
                  seat,
                  motionPosition: undefined,
                }
              : guest,
          )
        : floor.pool;
      const tables = ticket
        ? floor.tables.map((table) => ({
            ...table,
            state: table.placementId === seat.tablePlacementId
              ? ('occupied' as const)
              : table.state === 'unset'
                ? ('ready' as const)
                : table.state,
          }))
        : floor.tables;
      const carriedTicketId = mode === 'valid_carry'
        ? ticket!.id
        : '__e2e_stale_carried_ticket__';

      useGameStore.setState({
        activeFloorRoom: 'main',
        floorPlayerGrid: remote,
        composeSheetOpen: false,
        activeDay: {
          ...activeDay,
          floor: {
            ...floor,
            pool,
            tables,
            tickets: ticket ? [ticket] : [],
            carriedTicketId,
            selectedTicketId: ticket?.status === 'open' ? ticket.id : null,
            playerPosition: remote,
            playerRoom: 'main',
          },
        },
      });
      getRestaurantApp()?.nav.snapTo(remote);

      return {
        station: { x: station.x, y: station.y },
        remote,
        ticketId: ticket?.id ?? null,
      };
    },

    async prepareCarryInteractionBoundaryFixture() {
      if (!useGameStore.getState().activeDay) {
        await useGameStore.getState().dispatch({ type: 'OPEN_DAY' });
      }
      await useGameStore.getState().dismissModifier();

      const current = useGameStore.getState();
      const activeDay = current.activeDay;
      const floor = activeDay?.floor;
      if (!activeDay || !floor) {
        throw new Error('carry boundary fixture requires an active floor day');
      }
      const station = current.placements.find(
        (placement) =>
          isCookStationItemKey(placement.itemKey) &&
          current.purchasedEquipmentIds.includes(placement.itemKey),
      );
      const matchingCustomer = activeDay.customers[0];
      const wrongCustomer = activeDay.customers[1];
      const matchingGuest = floor.pool.find(
        (guest) => guest.customer.id === matchingCustomer?.id,
      );
      const wrongGuest = floor.pool.find(
        (guest) => guest.customer.id === wrongCustomer?.id,
      );
      const matchingSeat = floor.seats[0];
      const wrongSeat = floor.seats[1];
      const ingredientIds = current.unlockedIngredientIds.slice(0, 3);
      if (
        !station ||
        !matchingCustomer ||
        !wrongCustomer ||
        !matchingGuest ||
        !wrongGuest ||
        !matchingSeat ||
        !wrongSeat ||
        ingredientIds.length !== 3
      ) {
        throw new Error('carry boundary fixture is missing station, guests, seats, or ingredients');
      }

      const blocked = walkBlockedCells(
        current.placements,
        current.gridSize.w,
        current.gridSize.h,
        { kitchenAnnexOwned: current.kitchenAnnexOwned, room: 'main' },
      );
      const servicePositionFor = (seat: Pick<SeatSlot, 'x' | 'y'>) => {
        const position = guestServicePositions(seat).find(
          (candidate) =>
            candidate.x >= 0 &&
            candidate.y >= 0 &&
            candidate.x < current.gridSize.w &&
            candidate.y < current.gridSize.h &&
            !blocked.has(`${candidate.x},${candidate.y}`),
        );
        if (!position) {
          throw new Error('carry boundary fixture guest has no service position');
        }
        return position;
      };
      const stationServicePosition = reachableMainFloorCellBeside(station);
      const matchingServicePosition = servicePositionFor(matchingSeat);
      const wrongServicePosition = servicePositionFor(wrongSeat);
      const ticket = {
        id: `ticket_${matchingCustomer.id}`,
        customerId: matchingCustomer.id,
        ingredientIds,
        status: 'open' as const,
      };
      const occupiedTableIds = new Set([
        matchingSeat.tablePlacementId,
        wrongSeat.tablePlacementId,
      ]);
      const pool = floor.pool.map((guest) => {
        if (guest.customer.id === matchingCustomer.id) {
          return {
            ...guest,
            stage: 'ordered' as const,
            seat: matchingSeat,
            motionPosition: undefined,
          };
        }
        if (guest.customer.id === wrongCustomer.id) {
          return {
            ...guest,
            stage: 'ordered' as const,
            seat: wrongSeat,
            motionPosition: undefined,
          };
        }
        return {
          ...guest,
          stage: 'queued' as const,
          seat: undefined,
          motionPosition: undefined,
        };
      });

      useGameStore.setState({
        activeFloorRoom: 'main',
        floorPlayerGrid: stationServicePosition,
        composeSheetOpen: false,
        activeDay: {
          ...activeDay,
          floor: {
            ...floor,
            pool,
            tables: floor.tables.map((table) => ({
              ...table,
              state: occupiedTableIds.has(table.placementId)
                ? ('occupied' as const)
                : ('ready' as const),
            })),
            tickets: [ticket],
            carriedTicketId: null,
            selectedTicketId: ticket.id,
            playerPosition: stationServicePosition,
            playerRoom: 'main',
          },
        },
      });
      getRestaurantApp()?.nav.snapTo(stationServicePosition);

      return {
        station: { x: station.x, y: station.y },
        stationServicePosition,
        ticketId: ticket.id,
        matchingGuest: {
          guestId: matchingGuest.id,
          seat: { x: matchingSeat.x, y: matchingSeat.y },
          servicePosition: matchingServicePosition,
        },
        wrongGuest: {
          guestId: wrongGuest.id,
          seat: { x: wrongSeat.x, y: wrongSeat.y },
          servicePosition: wrongServicePosition,
        },
      };
    },

    prepareCarryAnimationCross() {
      const current = useGameStore.getState();
      const activeDay = current.activeDay;
      const floor = activeDay?.floor;
      if (!activeDay || !floor) {
        throw new Error('carry animation fixture requires an active floor day');
      }
      if (current.activeFloorRoom !== 'main') {
        throw new Error('carry animation fixture must begin on the main floor');
      }
      const carriedTicket = floor.tickets.find(
        (ticket) =>
          ticket.id === floor.carriedTicketId && ticket.status === 'plated',
      );
      if (!carriedTicket) {
        throw new Error('carry animation fixture requires a valid carried plated ticket');
      }

      const blocked = playerWalkBlockedCells(
        current.placements,
        current.gridSize.w,
        current.gridSize.h,
        {
          kitchenAnnexOwned: current.kitchenAnnexOwned,
          room: 'main',
        },
      );
      const guestCells = new Set<string>();
      for (const guest of floor.pool) {
        if (guest.seat) guestCells.add(`${guest.seat.x},${guest.seat.y}`);
        if (guest.motionPosition) {
          guestCells.add(`${guest.motionPosition.x},${guest.motionPosition.y}`);
        }
      }
      const offsets = [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 0, y: 1 },
        { x: 0, y: -1 },
        { x: -1, y: 0 },
      ] as const;
      const candidates: Array<{ x: number; y: number }> = [];
      for (let y = 1; y < current.gridSize.h - 1; y += 1) {
        for (let x = 1; x < current.gridSize.w - 1; x += 1) {
          if (
            offsets.every((offset) => {
              const key = `${x + offset.x},${y + offset.y}`;
              return !blocked.has(key) && !guestCells.has(key);
            })
          ) {
            candidates.push({ x, y });
          }
        }
      }
      candidates.sort((a, b) => {
        const centerX = (current.gridSize.w - 1) / 2;
        const centerY = (current.gridSize.h - 1) / 2;
        const distanceA = Math.abs(a.x - centerX) + Math.abs(a.y - centerY);
        const distanceB = Math.abs(b.x - centerX) + Math.abs(b.y - centerY);
        return distanceA - distanceB || a.y - b.y || a.x - b.x;
      });
      const center = candidates[0];
      if (!center) {
        throw new Error('carry animation fixture could not find a clear movement cross');
      }

      useGameStore.setState({
        activeFloorRoom: 'main',
        floorPlayerGrid: center,
        activeDay: {
          ...activeDay,
          floor: {
            ...floor,
            playerPosition: center,
            playerRoom: 'main',
          },
        },
      });
      getRestaurantApp()?.nav.snapTo(center);

      return {
        center,
        targets: {
          right: { x: center.x + 1, y: center.y },
          down: { x: center.x, y: center.y + 1 },
          up: { x: center.x, y: center.y - 1 },
          left: { x: center.x - 1, y: center.y },
        },
        ticketId: carriedTicket.id,
      };
    },

    prepareDecorVisualFixture() {
      const current = useGameStore.getState();
      const decor = [
        { id: 'qa_decor_plant', itemKey: 'decor_plant', x: 1, y: 1, rotation: 0 },
        { id: 'qa_decor_flowers', itemKey: 'decor_flowers', x: 3, y: 1, rotation: 0 },
        { id: 'qa_decor_lamp', itemKey: 'decor_lamp', x: 6, y: 1, rotation: 0 },
        { id: 'qa_decor_rug', itemKey: 'decor_rug', x: 4, y: 4, rotation: 0 },
        { id: 'qa_decor_sign', itemKey: 'decor_sign', x: 1, y: 4, rotation: 0 },
      ];
      useGameStore.setState({
        placements: [
          ...current.placements.filter((placement) => !placement.itemKey.startsWith('decor_')),
          ...decor,
        ],
        decorPurchasedCounts: {
          decor_plant: 1,
          decor_flowers: 1,
          decor_rug: 1,
          decor_lamp: 1,
          decor_sign: 1,
        },
        editLayoutMode: true,
      });
    },

    prepareEquipmentVisualFixture() {
      const current = useGameStore.getState();
      const equipment = [
        { id: 'qa_equipment_smoker', itemKey: 'smoker', x: 1, y: 2, rotation: 0 },
        {
          id: 'qa_equipment_spice_rack',
          itemKey: 'spice_rack',
          x: 2,
          y: 2,
          rotation: 0,
        },
      ];
      useGameStore.setState({
        kitchenAnnexOwned: true,
        activeFloorRoom: 'back_kitchen',
        backKitchenPlacements: equipment,
        purchasedEquipmentIds: [
          ...new Set([...current.purchasedEquipmentIds, 'smoker', 'spice_rack']),
        ],
        editLayoutMode: true,
      });
    },

    unlockKitchenAnnexForTest() {
      useGameStore.setState({ kitchenAnnexOwned: true });
    },

    openComposeSheet() {
      useGameStore.getState().openComposeSheet();
    },

    openFlavorInspector(ingredientId) {
      useGameStore.getState().openFlavorInspector(ingredientId);
    },

    setFloorToast(message) {
      useGameStore.getState().setFloorToast(message);
    },

    enqueueCelebration(celebration) {
      useGameStore.getState().enqueueCelebration(celebration);
    },

    async advanceFloorServiceOnce() {
      const store = useGameStore.getState();
      if (store.pendingReview) return 'pending_review';
      if (!store.activeDay?.floor) {
        return isDayComplete(store) ? 'day_complete' : 'idle';
      }
      if (isDayComplete(store)) return 'day_complete';

      const ctx = getDomainContext();
      const dispatch = (action: GameAction) => useGameStore.getState().dispatch(action);

      const floor = () => useGameStore.getState().activeDay!.floor!;

      for (const table of [...floor().tables]) {
        if (table.state === 'unset') {
          await dispatch({
            type: 'FLOOR_SET_TABLE',
            placementId: table.placementId,
          });
        }
      }
      for (const table of [...floor().tables]) {
        if (table.state === 'dirty') {
          await dispatch({
            type: 'FLOOR_CLEAR_TABLE',
            placementId: table.placementId,
          });
        }
      }

      if (floor().pool.some((g) => g.stage === 'entering')) {
        await dispatch({ type: 'FLOOR_COMPLETE_ENTERING' });
      }

      if (floor().pool.some((g) => g.stage === 'waiting')) {
        const state = useGameStore.getState();
        state.setFloorNavPosition(
          waitingGuestServicePositions(state.gridSize.w, state.gridSize.h)[0]!,
        );
        await dispatch({ type: 'FLOOR_SEAT_NEXT' });
      }

      const seatingGuest = floor().pool.find((g) => g.stage === 'seating');
      if (seatingGuest) {
        await dispatch({
          type: 'FLOOR_COMPLETE_SEATING',
          guestId: seatingGuest.id,
        });
      }

      const toOrder = floor()
        .pool.filter((g) => g.stage === 'seated')
        .map((g) => g.customer.id);
      if (toOrder.length > 0) {
        const target = floor().pool.find((guest) => guest.customer.id === toOrder[0]);
        if (target?.seat) {
          useGameStore.getState().setFloorNavPosition(reachableGuestServiceCell(target.seat));
        }
        await dispatch({
          type: 'FLOOR_TAKE_ORDERS',
          customerIds: [toOrder[0]!],
        });
      }

      if (useGameStore.getState().pendingReview) return 'pending_review';

      const open = floor().tickets.find((t) => t.status === 'open');
      if (open && !floor().carriedTicketId) {
        const guest = floor().pool.find((g) => g.customer.id === open.customerId);
        if (guest) {
          const beforeCook = useGameStore.getState();
          const unlocked = beforeCook.unlockedIngredientIds;
          const combo = findBestMatchCombo(
            unlocked,
            guest.customer.preference,
            ctx.ingredientsById,
            ctx.compoundAffinity,
          );
          const station = beforeCook.placements.find(
            (placement) =>
              isCookStationItemKey(placement.itemKey) &&
              beforeCook.purchasedEquipmentIds.includes(placement.itemKey),
          );
          if (!station) throw new Error('floor service fixture has no owned cook station');
          const cookPosition = reachableMainFloorCellBeside(station);
          beforeCook.setActiveFloorRoom('main');
          getRestaurantApp()?.nav.snapTo(cookPosition);
          beforeCook.setFloorNavPosition(cookPosition);
          await dispatch({
            type: 'FLOOR_SET_TICKET_DRAFT',
            ticketId: open.id,
            ingredientIds: combo.ingredientIds,
          });
          getRestaurantApp()?.nav.snapTo(cookPosition);
          useGameStore.getState().setFloorNavPosition(cookPosition);
          await dispatch({
            type: 'FLOOR_PLATE',
            ticketId: open.id,
          });
          if (guest.seat) {
            useGameStore.getState().setFloorNavPosition(reachableGuestServiceCell(guest.seat));
          }
          await dispatch({ type: 'FLOOR_DELIVER', ticketId: open.id });
        }
      }

      if (useGameStore.getState().pendingReview) return 'pending_review';

      if (floor().pool.some((g) => g.stage === 'eating')) {
        await dispatch({ type: 'FLOOR_TICK_EATING' });
      }

      const leavingGuest = floor().pool.find((g) => g.stage === 'leaving');
      if (leavingGuest) {
        await dispatch({
          type: 'FLOOR_COMPLETE_LEAVING',
          guestId: leavingGuest.id,
        });
      }

      if (isDayComplete(useGameStore.getState())) return 'day_complete';
      return 'advanced';
    },

    async completeFloorServiceDay() {
      for (let guard = 0; guard < 500; guard += 1) {
        const state = useGameStore.getState();
        if (state.daySummary) return;

        if (state.pendingReview) {
          if (isDayComplete(state)) {
            await state.dispatch({ type: 'CLOSE_DAY' });
          } else {
            await state.dismissPendingReview();
          }
          continue;
        }

        if (state.activeDay && isDayComplete(state)) {
          await state.dispatch({ type: 'CLOSE_DAY' });
          continue;
        }

        const step = await window.__E2E__!.advanceFloorServiceOnce();
        if (step === 'idle') {
          throw new Error('floor service stalled (idle)');
        }
      }
      throw new Error('floor service day did not complete within guard limit');
    },
  };
}
