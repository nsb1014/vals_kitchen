import { Application, Container } from 'pixi.js';
import type { GameStore } from '../store/game-store.ts';
import {
  getGameplayInteractionGeneration,
  useGameStore,
} from '../store/game-store.ts';
import {
  findPath,
  findShortestPathToAny,
  type GridPoint,
} from '../domain/floor/pathfinding.ts';
import {
  findCookStationPlacementAtCell,
  guestServicePositions,
  playerNearGuestSeat,
  playerNearPlacement,
  waitingGuestServicePositions,
} from '../domain/floor/interact.ts';
import type { FloorDay, FloorGuest } from '../domain/floor/types.ts';
import type { Placement } from '../domain/state/game-state.ts';
import { seatsFromPlacements } from '../domain/floor/seats.ts';
import {
  canEnqueue,
  formatTicketCapacityFullMessage,
} from '../domain/floor/tickets.ts';
import { CustomerLayer } from './layers/CustomerLayer.ts';
import { FurnitureLayer } from './layers/FurnitureLayer.ts';
import { GridLayer } from './layers/GridLayer.ts';
import { InteractHintLayer } from './layers/InteractHintLayer.ts';
import { PreviewLayer } from './layers/PreviewLayer.ts';
import { EffectsLayer } from './layers/EffectsLayer.ts';
import { AtmosphereLayer } from './layers/AtmosphereLayer.ts';
import { CarryPlateLayer } from './layers/CarryPlateLayer.ts';
import { Camera, worldTransformFromCamera } from './systems/Camera.ts';
import { DragPlacement } from './systems/DragPlacement.ts';
import { ActorLayer } from './world/ActorLayer.ts';
import {
  playerWalkBlockedCells,
  walkBlockedCells,
} from './world/blocked-cells.ts';
import {
  cameraLeadOffset,
  computeFloorInteractHints,
  computeStationInteractHints,
  type FloorInteractHint,
} from './world/floor-feel-hints.ts';
import {
  approachActionsMatch,
  approachInFlightLabel,
  approachIntentReadyToComplete,
  approachIntentStillArmed,
  type ApproachAction,
  type PendingApproachIntent,
} from './world/approach-intent.ts';
import { GuestMotion } from './world/GuestMotion.ts';
import {
  actorMouthWorldFromFeet,
  mouthAnchorFromContentBounds,
} from './world/actor-mouth-anchor.ts';
import { NavController } from './world/NavController.ts';
import { PerKeyAsyncGuard } from './world/per-key-async-guard.ts';
import {
  sfxForFloorFeelBeat,
  type FloorFeelBeat,
} from '../store/service-events.ts';
import { playSfx } from '../assets/audio.ts';
import { subscribeVisualJuice } from '../assets/visual-juice.ts';
import {
  connectingDoorInterior,
  doorForGrid,
  type FloorRoomId,
} from '../domain/floor/starter-map.ts';
import { isConnectingDoorCell } from '../domain/economy/purchases.ts';
import {
  selectCanOpenFloorCompose,
  selectCanRequestSeatFloorGuest,
  selectCanSeatFloorGuest,
  selectShowFloorInteractionCues,
} from '../store/selectors/service-day.ts';
import {
  resumeSafeFloorDeltaMs,
  selectFloorRuntimeRunning,
} from '../store/selectors/floor-runtime.ts';
import { prefersReducedMotion } from '../ui/presentation/motion-preference.ts';
import {
  clearRoomTransitionPhase,
  holdRoomTransitionPhase,
  latchRoomTransitionOutFrom,
  readRoomTransitionOutFrom,
  readRoomTransitionPhase,
} from './room-transition.ts';
import {
  cameraPunchMultiplier,
  clampCameraPunchScale,
  gridToWorld,
  screenToGrid,
  screenToWorld,
  TILE_PX,
  worldToScreen,
} from './coordinates.ts';
import {
  expandGuestHitBounds,
  guestHitBoundsContainPoint,
  isServiceGuestHitEligible,
  resolveNearestGuestHit,
  resolveTopmostGuestHit,
} from './world/guest-hit.ts';
import {
  eatingTablePlacementIds,
  tableServiceVisualStates,
} from './table-service-visual.ts';
function integerResolution(): number {
  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
  return Math.max(1, Math.round(dpr));
}

const ROOM_FADE_OUT_MS = 100;
const ROOM_FADE_IN_MS = 140;
const DELIVERY_RETRY_TOAST =
  'Could not deliver that dish — tap the guest to retry';
/** Brief stop hold before auto-seat fires (visual anticipation only). */
const STOP_ANTICIPATION_MS = 100;
/** Longer wind-up when already in range so seat doesn't feel like an instant snap. */
const IN_PLACE_SEAT_ANTICIPATION_MS = 200;
/** Service-cell approach flash duration after a remote guest tap. */
const APPROACH_PREVIEW_MS = 420;
const GUEST_DOOR_EXIT_LINGER_MS = 280;
const SERVE_CAMERA_PUNCH_MS = 120;
const SERVE_CAMERA_PUNCH_PEAK = 1.015;
const EATING_STEAM_INTERVAL_MS = 900;

interface DoorwayCropDebug {
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
}

export class RestaurantApp {
  readonly app: Application;
  readonly world: Container;
  readonly depthLayer: Container;
  readonly camera: Camera;
  readonly gridLayer: GridLayer;
  readonly furnitureLayer: FurnitureLayer;
  readonly actorLayer: ActorLayer;
  readonly customerLayer: CustomerLayer;
  readonly previewLayer: PreviewLayer;
  readonly interactHintLayer: InteractHintLayer;
  readonly effectsLayer: EffectsLayer;
  readonly atmosphereLayer: AtmosphereLayer;
  readonly carryPlateLayer: CarryPlateLayer;
  readonly dragPlacement: DragPlacement;
  readonly nav: NavController;
  readonly guestMotion: GuestMotion;

  private unsubscribe: (() => void) | null = null;
  private unsubscribeJuice: (() => void) | null = null;
  private mounted = false;
  private lastFloorSeed: number | null = null;
  private lastRoom: FloorRoomId | null = null;
  private eatingTickAccumulatorMs = 0;
  private eatingSteamAccumulatorMs = 0;
  private floorRuntimeWasRunning = false;
  private floorResumeSettleFramesRemaining = 0;
  private guestDoorExitLingerUntilMs = 0;
  private resizeObserver: ResizeObserver | null = null;
  private resizeFrame: number | null = null;
  private roomTransitionInFlight = false;
  private roomTransitionAnimation: Animation | null = null;
  private roomTransitionTimer: number | null = null;
  private cameraPunchElapsedMs = -1;
  private lastGuestDoorOpen: boolean | null = null;
  /** Unified one-tap→walk→auto-complete intent (seat/order/deliver/set/clear/compose). */
  private pendingApproachIntent: PendingApproachIntent | null = null;
  private nextPendingApproachRevision = 1;
  private readonly deliveryAttempts = new PerKeyAsyncGuard();
  /** Accumulates while arrived at approach destination before dispatch. */
  private approachArrivalHoldMs = 0;
  /** Presentation-only hold target; longer when acting in-place. */
  private approachArrivalHoldTargetMs = STOP_ANTICIPATION_MS;
  private approachPreview: { cell: GridPoint; untilMs: number } | null = null;

  private static readonly EATING_TICK_INTERVAL_MS = 1000;

  private constructor(
    app: Application,
    private readonly mount: HTMLElement,
  ) {
    this.app = app;
    this.world = new Container();
    this.depthLayer = new Container();
    this.depthLayer.sortableChildren = true;
    this.camera = new Camera();
    this.gridLayer = new GridLayer();
    this.atmosphereLayer = new AtmosphereLayer();
    this.furnitureLayer = new FurnitureLayer(this.depthLayer);
    this.actorLayer = new ActorLayer(this.depthLayer);
    this.carryPlateLayer = new CarryPlateLayer();
    this.depthLayer.addChild(this.carryPlateLayer.view);
    this.customerLayer = new CustomerLayer();
    this.previewLayer = new PreviewLayer();
    this.interactHintLayer = new InteractHintLayer();
    this.effectsLayer = new EffectsLayer();
    this.nav = new NavController({ x: 3, y: 5 });
    this.guestMotion = new GuestMotion();

    this.world.addChild(this.gridLayer.view);
    this.world.addChild(this.atmosphereLayer.view);
    this.world.addChild(this.actorLayer.view);
    this.world.addChild(this.interactHintLayer.view);
    this.world.addChild(this.depthLayer);
    this.world.addChild(this.customerLayer.view);
    this.world.addChild(this.previewLayer.view);
    this.world.addChild(this.effectsLayer.view);
    this.app.stage.addChild(this.world);

    this.dragPlacement = new DragPlacement(
      () => useGameStore.getState(),
      this.camera,
      this.furnitureLayer,
      this.previewLayer,
      this.app.canvas,
      (changeRoom) => this.beginRoomTransition(changeRoom),
    );
  }

  static async create(mount: HTMLElement): Promise<RestaurantApp> {
    const app = new Application();
    await app.init({
      background: '#2a211c',
      antialias: false,
      autoDensity: true,
      resolution: integerResolution(),
      resizeTo: mount,
      roundPixels: true,
    });

    mount.appendChild(app.canvas);
    app.canvas.classList.add('restaurant-canvas');
    app.canvas.dataset.testid = 'restaurant-canvas';
    // Focusable playfield so keyboard users can move with WASD/arrows (toolbar
    // arrow keys remain on the floor action strip when that strip is focused).
    app.canvas.tabIndex = 0;
    app.canvas.setAttribute(
      'aria-label',
      "Restaurant floor. Use WASD or arrow keys to move Val.",
    );
    app.canvas.setAttribute('role', 'application');
    app.canvas.style.touchAction = 'none';
    app.canvas.style.outline = 'none';

    const instance = new RestaurantApp(app, mount);
    instance.mounted = true;
    return instance;
  }

  start(): void {
    this.dragPlacement.attach();
    this.app.canvas.addEventListener('pointerdown', this.onTapMove);
    this.app.canvas.addEventListener('focus', this.onCanvasFocusChange);
    this.app.canvas.addEventListener('blur', this.onCanvasFocusChange);
    window.addEventListener('keydown', this.onKeyboardMove);
    document.addEventListener('visibilitychange', this.onVisibilityChange);
    this.app.ticker.add(this.onTick);
    this.unsubscribeJuice = subscribeVisualJuice((kind) => {
      this.onVisualJuice(kind);
    });
    this.unsubscribe = useGameStore.subscribe((state, prev) => {
      if (
        state.placements !== prev.placements ||
        state.backKitchenPlacements !== prev.backKitchenPlacements ||
        state.gridSize !== prev.gridSize ||
        state.kitchenAnnexOwned !== prev.kitchenAnnexOwned ||
        state.activeFloorRoom !== prev.activeFloorRoom ||
        state.editLayoutMode !== prev.editLayoutMode ||
        state.screen !== prev.screen ||
        state.modifierDismissed !== prev.modifierDismissed ||
        state.pendingReview !== prev.pendingReview ||
        state.daySummary !== prev.daySummary ||
        state.ceremony !== prev.ceremony ||
        state.composeSheetOpen !== prev.composeSheetOpen ||
        state.activeDay !== prev.activeDay ||
        state.activeDay?.queueIndex !== prev.activeDay?.queueIndex ||
        state.activeDay?.floor !== prev.activeDay?.floor
      ) {
        this.syncFromStore(state);
      }
    });
    this.syncFromStore(useGameStore.getState());
    window.addEventListener('resize', this.handleResize);
    this.resizeObserver = new ResizeObserver(() => {
      if (this.resizeFrame !== null) cancelAnimationFrame(this.resizeFrame);
      this.resizeFrame = requestAnimationFrame(() => {
        this.resizeFrame = null;
        const width = Math.max(1, Math.round(this.mount.clientWidth));
        const height = Math.max(1, Math.round(this.mount.clientHeight));
        if (this.app.screen.width !== width || this.app.screen.height !== height) {
          this.app.renderer.resize(width, height);
        }
        this.handleResize();
        // Resizing clears the WebGL surface. Render immediately so paused
        // states (including a stationary compose workspace) never expose a
        // black restaurant while waiting for the next ticker frame.
        this.app.render();
      });
    });
    this.resizeObserver.observe(this.mount);
    this.handleResize();
  }

  private applyCamera(): void {
    const transform = worldTransformFromCamera(this.camera.state);
    const punch =
      this.cameraPunchElapsedMs >= 0
        ? cameraPunchMultiplier(
            this.cameraPunchElapsedMs,
            SERVE_CAMERA_PUNCH_MS,
            SERVE_CAMERA_PUNCH_PEAK,
          )
        : 1;
    const scale = clampCameraPunchScale(transform.scale, punch);
    this.world.position.set(transform.x, transform.y);
    this.world.scale.set(scale);
  }

  private onVisualJuice(kind: 'serve' | 'review' | 'placement'): void {
    if (!this.mounted) return;
    const feet = this.actorLayer.getPlayerFeetWorldPosition();
    if (kind === 'serve') {
      const placeAt = this.serveJuiceWorldPosition() ?? feet;
      this.effectsLayer.burstServePlace(placeAt.x, placeAt.y);
      // Tiny settle punch — avoid the old zoom that read as an impact burst.
      this.cameraPunchElapsedMs = 0;
      this.flashCanvasMount('serve');
    } else if (kind === 'review') {
      this.effectsLayer.burstReview(feet.x, feet.y);
      this.flashCanvasMount('review');
    } else {
      this.effectsLayer.burstPlacement(feet.x, feet.y);
      this.flashCanvasMount('placement');
    }
  }

  /** Prefer the guest/table plate spot for serve juice over Val's feet. */
  private serveJuiceWorldPosition(): { x: number; y: number } | null {
    const floor = useGameStore.getState().activeDay?.floor;
    if (!floor) return null;
    const carried = floor.carriedTicketId
      ? floor.tickets.find((ticket) => ticket.id === floor.carriedTicketId)
      : null;
    const delivered = floor.pool.find((guest) => {
      if (!guest.seat) return false;
      if (carried && guest.customer.id === carried.customerId) return true;
      return guest.stage === 'eating';
    });
    if (delivered) {
      const guestFeet = this.actorLayer.getGuestFeetWorldPosition(delivered.id);
      if (guestFeet) {
        return { x: guestFeet.x, y: guestFeet.y - TILE_PX * 0.35 };
      }
      if (delivered.seat) {
        const { x, y } = gridToWorld(delivered.seat.x, delivered.seat.y);
        return { x: x + TILE_PX / 2, y: y + TILE_PX / 2 - 8 };
      }
    }
    return null;
  }

  private flashCanvasMount(kind: 'serve' | 'review' | 'placement'): void {
    if (prefersReducedMotion()) return;
    this.mount.classList.remove(
      'vk-sfx-flash-serve',
      'vk-sfx-flash-review',
      'vk-sfx-flash-placement',
    );
    // Force restart if the same class is re-applied in the same frame.
    void this.mount.offsetWidth;
    this.mount.classList.add(`vk-sfx-flash-${kind}`);
    window.setTimeout(() => {
      this.mount.classList.remove(`vk-sfx-flash-${kind}`);
    }, 140);
  }

  private roomPlacements(state: GameStore): Placement[] {
    return state.activeFloorRoom === 'back_kitchen'
      ? state.backKitchenPlacements
      : state.placements;
  }

  private walkOpts(state: GameStore): {
    kitchenAnnexOwned: boolean;
    room: FloorRoomId;
  } {
    return {
      kitchenAnnexOwned: state.kitchenAnnexOwned,
      room: state.activeFloorRoom,
    };
  }

  private playerBlockedCells(
    store: GameStore,
    placements: Placement[],
  ): Set<string> {
    const blocked = playerWalkBlockedCells(
      placements,
      store.gridSize.w,
      store.gridSize.h,
      this.walkOpts(store),
      this.nav.position,
    );
    if (store.activeFloorRoom === 'main' && store.activeDay?.floor) {
      for (const cell of this.guestMotion.playerBlockedGridCells(store.activeDay.floor)) {
        blocked.add(`${cell.x},${cell.y}`);
      }
      // A resumed player already sharing a formerly legal cell must be able
      // to step out instead of becoming trapped by the new live reservation.
      blocked.delete(`${this.nav.position.x},${this.nav.position.y}`);
    }
    return blocked;
  }

  private pathToGuestServiceCell(
    store: GameStore,
    placements: Placement[],
    seat: GridPoint,
    opts: { preserveApproachIntent?: boolean } = {},
  ): GridPoint | null {
    const blocked = this.playerBlockedCells(store, placements);
    const path = findShortestPathToAny(
      { w: store.gridSize.w, h: store.gridSize.h, blocked },
      this.nav.position,
      guestServicePositions(seat),
    );
    if (!path) {
      store.setFloorToast('No clear route');
      return null;
    }
    const destination = path[path.length - 1];
    if (!destination) {
      store.setFloorToast('No clear route');
      return null;
    }
    this.armApproachPreview(destination);
    this.setNavigationPath(path, {
      preserveApproachIntent: opts.preserveApproachIntent,
    });
    return { ...destination };
  }

  private pathToWaitingGuestServiceCell(
    store: GameStore,
    placements: Placement[],
  ): GridPoint | null {
    const blocked = this.playerBlockedCells(store, placements);
    const destinations = waitingGuestServicePositions(
      store.gridSize.w,
      store.gridSize.h,
    ).filter(
      (position) =>
        !this.nav.isMoving ||
        position.x !== this.nav.position.x ||
        position.y !== this.nav.position.y,
    );
    const path = findShortestPathToAny(
      { w: store.gridSize.w, h: store.gridSize.h, blocked },
      this.nav.position,
      destinations,
    );
    const destination = path?.[path.length - 1];
    if (!path || !destination) {
      store.setFloorToast('No clear route');
      return null;
    }
    this.armApproachPreview(destination);
    this.setNavigationPath(path, { preserveApproachIntent: true });
    return { ...destination };
  }

  private pathToAdjacentCell(
    store: GameStore,
    placements: Placement[],
    target: GridPoint,
    opts: { preserveApproachIntent?: boolean } = {},
  ): GridPoint | null {
    const blocked = this.playerBlockedCells(store, placements);
    const destinations: GridPoint[] = [];
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        if (dx === 0 && dy === 0) continue;
        destinations.push({ x: target.x + dx, y: target.y + dy });
      }
    }
    const path = findShortestPathToAny(
      { w: store.gridSize.w, h: store.gridSize.h, blocked },
      this.nav.position,
      destinations,
    );
    if (!path) {
      store.setFloorToast('No clear route');
      return null;
    }
    const destination = path[path.length - 1];
    if (!destination) {
      store.setFloorToast('No clear route');
      return null;
    }
    this.armApproachPreview(destination);
    this.setNavigationPath(path, {
      preserveApproachIntent: opts.preserveApproachIntent,
    });
    return { ...destination };
  }

  private setNavigationPath(
    path: GridPoint[],
    opts: {
      preserveApproachIntent?: boolean;
      feelBeat?: FloorFeelBeat;
      /** Mid-walk taps queue the goal and start after the current path ends. */
      bufferWhileMoving?: boolean;
    } = {},
  ): void {
    if (!opts.preserveApproachIntent) this.cancelPendingApproachIntent();
    const goal = path[path.length - 1];
    if (opts.bufferWhileMoving && this.nav.isMoving && goal) {
      this.nav.bufferGoal(goal);
      this.syncFloorActionInFlightDataset();
      return;
    }
    this.nav.clearBufferedGoal();
    const wasMoving = this.nav.isMoving;
    this.nav.setPath(path);
    if (
      path.length > 1 &&
      !wasMoving &&
      (opts.feelBeat === 'walk' || opts.feelBeat === undefined)
    ) {
      playSfx(sfxForFloorFeelBeat('walk'), 0.45);
    }
  }

  /** After a walk ends, start any mid-walk buffered destination from here. */
  private flushBufferedNavigationGoal(store: GameStore): void {
    if (this.nav.isMoving) return;
    const goal = this.nav.consumeBufferedGoal();
    if (!goal) return;
    if (
      goal.x === this.nav.position.x &&
      goal.y === this.nav.position.y
    ) {
      return;
    }
    const roomPlacements = this.roomPlacements(store);
    const blocked = this.playerBlockedCells(store, roomPlacements);
    const path = findPath(
      { w: store.gridSize.w, h: store.gridSize.h, blocked },
      this.nav.position,
      goal,
    );
    if (path) {
      this.setNavigationPath(path);
    } else {
      store.setFloorToast('No clear route');
    }
  }

  private armApproachPreview(cell: GridPoint): void {
    this.approachPreview = {
      cell: { ...cell },
      untilMs: performance.now() + APPROACH_PREVIEW_MS,
    };
  }

  private activeApproachPreview(): GridPoint | null {
    if (!this.approachPreview) return null;
    if (performance.now() > this.approachPreview.untilMs) {
      this.approachPreview = null;
      return null;
    }
    return this.approachPreview.cell;
  }

  private syncFloorActionInFlightDataset(): void {
    let label: string | null = null;
    if (this.pendingApproachIntent) {
      label = approachInFlightLabel(this.pendingApproachIntent.action);
    } else if (this.nav.isMoving || this.nav.bufferedDestination) {
      label = 'walk';
    }
    if (label) {
      this.app.canvas.dataset.inFlight = label;
    } else {
      delete this.app.canvas.dataset.inFlight;
    }
  }

  private snapNavigationTo(cell: GridPoint): void {
    this.cancelPendingApproachIntent();
    this.nav.snapTo(cell);
  }

  private cancelPendingApproachIntent(): void {
    this.pendingApproachIntent = null;
    this.approachArrivalHoldMs = 0;
    this.approachArrivalHoldTargetMs = STOP_ANTICIPATION_MS;
  }

  /** @deprecated Prefer cancelPendingApproachIntent — kept as seating alias. */
  private cancelPendingSeatingIntent(): void {
    this.cancelPendingApproachIntent();
  }

  private approachValidityContext(store: GameStore): {
    daySeed: number;
    interactionGeneration: number;
    floor: FloorDay;
    player: GridPoint;
    placements: Placement[];
    canSeatNow: boolean;
    canRequestSeat: boolean;
    canOpenCompose: boolean;
    isMoving: boolean;
    navDestination: GridPoint | null;
    arrivedAtDestination: boolean;
  } | null {
    const floor = store.activeDay?.floor;
    const intent = this.pendingApproachIntent;
    if (!floor || !intent || store.activeDay?.seed == null) return null;
    return {
      daySeed: store.activeDay.seed,
      interactionGeneration: getGameplayInteractionGeneration(),
      floor,
      player: this.nav.position,
      placements: this.roomPlacements(store),
      canSeatNow: selectCanSeatFloorGuest(store),
      canRequestSeat: selectCanRequestSeatFloorGuest(store),
      canOpenCompose: selectCanOpenFloorCompose(store),
      isMoving: this.nav.isMoving,
      navDestination: this.nav.destination,
      arrivedAtDestination: this.navMatchesApproachDestination(
        intent.destination,
      ),
    };
  }

  private pendingApproachIntentIsValid(store: GameStore): boolean {
    const intent = this.pendingApproachIntent;
    const ctx = this.approachValidityContext(store);
    if (!intent || !ctx) return false;
    return approachIntentStillArmed(intent, ctx);
  }

  private navMatchesApproachDestination(destination: GridPoint): boolean {
    if (this.nav.isMoving) {
      const activeDestination = this.nav.destination;
      return Boolean(
        activeDestination &&
          activeDestination.x === destination.x &&
          activeDestination.y === destination.y,
      );
    }
    const centerX = destination.x * TILE_PX + TILE_PX / 2;
    const centerY = destination.y * TILE_PX + TILE_PX / 2;
    return (
      this.nav.position.x === destination.x &&
      this.nav.position.y === destination.y &&
      Math.abs(this.nav.worldX - centerX) <= 0.5 &&
      Math.abs(this.nav.worldY - centerY) <= 0.5
    );
  }

  private armApproachIntent(
    store: GameStore,
    action: ApproachAction,
    destination: GridPoint,
    holdMs: number,
  ): void {
    this.pendingApproachIntent = {
      revision: this.nextPendingApproachRevision++,
      daySeed: store.activeDay!.seed,
      interactionGeneration: getGameplayInteractionGeneration(),
      destination: { ...destination },
      action,
    };
    this.approachArrivalHoldMs = 0;
    // Reduced-motion / e2e dataset: settle on the next idle tick instead of a
    // multi-frame anticipation hold that races Playwright polls under hitchy CI.
    this.approachArrivalHoldTargetMs = prefersReducedMotion() ? 0 : holdMs;
    this.syncFloorActionInFlightDataset();
  }

  private tryRetainMatchingApproach(action: ApproachAction): boolean {
    const store = useGameStore.getState();
    const active = this.pendingApproachIntent;
    if (
      active &&
      approachActionsMatch(active.action, action) &&
      this.pendingApproachIntentIsValid(store)
    ) {
      return true;
    }
    return false;
  }

  private completePendingApproachIntent(): void {
    if (!this.pendingApproachIntent || this.nav.isMoving) return;
    const store = useGameStore.getState();
    const intent = this.pendingApproachIntent;
    const ctx = this.approachValidityContext(store);
    if (!ctx || !approachIntentReadyToComplete(intent, ctx)) {
      // A completed route that did not reach a canonical service position must
      // not leave a latent action that could fire after unrelated movement.
      this.cancelPendingApproachIntent();
      return;
    }

    // Clear before dispatch: synchronous subscribers and repeated ticks can
    // never apply this request twice.
    const action = intent.action;
    this.cancelPendingApproachIntent();

    switch (action.kind) {
      case 'seat':
        playSfx(sfxForFloorFeelBeat('seat'), 0.9);
        void store.dispatch({ type: 'FLOOR_SEAT_NEXT' });
        break;
      case 'order':
        playSfx(sfxForFloorFeelBeat('order'), 0.9);
        void store.dispatch({
          type: 'FLOOR_TAKE_ORDERS',
          customerIds: [action.customerId],
        });
        break;
      case 'deliver': {
        const deliveryGeneration = getGameplayInteractionGeneration();
        this.deliveryAttempts.start(
          action.ticketId,
          async () => {
            await store.dispatch({
              type: 'FLOOR_DELIVER',
              ticketId: action.ticketId,
            });
            playSfx(sfxForFloorFeelBeat('deliver'));
            const current = useGameStore.getState();
            if (
              this.mounted &&
              getGameplayInteractionGeneration() === deliveryGeneration &&
              current.floorToast === DELIVERY_RETRY_TOAST
            ) {
              current.setFloorToast(null);
            }
          },
          () => {
            const current = useGameStore.getState();
            if (
              this.mounted &&
              getGameplayInteractionGeneration() === deliveryGeneration &&
              current.screen === 'restaurant'
            ) {
              current.setFloorToast(DELIVERY_RETRY_TOAST);
            }
          },
        );
        break;
      }
      case 'set':
        void store.dispatch({
          type: 'FLOOR_SET_TABLE',
          placementId: action.placementId,
        });
        break;
      case 'clear':
        void store.dispatch({
          type: 'FLOOR_CLEAR_TABLE',
          placementId: action.placementId,
        });
        break;
      case 'compose':
        store.openComposeSheet();
        break;
    }
  }

  private tickPendingApproachIntent(deltaMs: number): void {
    if (!this.pendingApproachIntent || this.nav.isMoving) {
      this.approachArrivalHoldMs = 0;
      return;
    }
    this.approachArrivalHoldMs += deltaMs;
    if (this.approachArrivalHoldMs < this.approachArrivalHoldTargetMs) return;
    this.completePendingApproachIntent();
  }

  /**
   * Route Val to the waiting guest, then seat exactly once on physical arrival.
   * The floor HUD and direct actor tap intentionally share this entry point.
   */
  requestSeatNextGuest(): boolean {
    const store = useGameStore.getState();
    const floor = store.activeDay?.floor;
    const waiting = floor?.pool.find((guest) => guest.stage === 'waiting');
    if (
      !floor ||
      !waiting ||
      !selectCanRequestSeatFloorGuest(store) ||
      !selectFloorRuntimeRunning(
        store,
        document.visibilityState === 'visible',
      )
    ) {
      return false;
    }

    const action: ApproachAction = { kind: 'seat', guestId: waiting.id };
    if (this.tryRetainMatchingApproach(action)) {
      // Repeated taps on the same waiting guest/CTA retain the in-flight route.
      return true;
    }
    this.cancelPendingApproachIntent();

    if (!this.nav.isMoving && selectCanSeatFloorGuest(store)) {
      // Already in range: brief anticipation beat before the seat dispatch so
      // the action reads intentional (presentation only — domain timing unchanged).
      this.armApproachIntent(
        store,
        action,
        { ...this.nav.position },
        IN_PLACE_SEAT_ANTICIPATION_MS,
      );
      return true;
    }

    const destination = this.pathToWaitingGuestServiceCell(
      store,
      this.roomPlacements(store),
    );
    if (!destination) return false;
    this.armApproachIntent(store, action, destination, STOP_ANTICIPATION_MS);
    return true;
  }

  /**
   * Arm walk-to-service + auto-complete for order/deliver/set/clear/compose.
   * Returns true when the action completed in-place, an approach was armed, or
   * an identical in-flight approach was retained.
   */
  private beginApproachOrAct(
    store: GameStore,
    action: ApproachAction,
    pathToDestination: () => GridPoint | null,
    canActNow: () => boolean,
    actNow: () => void,
  ): boolean {
    if (this.tryRetainMatchingApproach(action)) return true;
    this.cancelPendingApproachIntent();

    if (!this.nav.isMoving && canActNow()) {
      actNow();
      return true;
    }

    const destination = pathToDestination();
    if (!destination) return false;
    this.armApproachIntent(store, action, destination, STOP_ANTICIPATION_MS);
    return true;
  }

  /** Read-only test/debug view of the currently armed seating interaction. */
  getPendingSeatingIntentDebug(): Readonly<{
    revision: number;
    destination: Readonly<GridPoint>;
  }> | null {
    const intent = this.pendingApproachIntent;
    if (!intent || intent.action.kind !== 'seat') return null;
    return {
      revision: intent.revision,
      destination: { ...intent.destination },
    };
  }

  /** Read-only view of any armed approach-and-complete intent. */
  getPendingApproachIntentDebug(): Readonly<{
    revision: number;
    kind: ApproachAction['kind'];
    destination: Readonly<GridPoint>;
  }> | null {
    const intent = this.pendingApproachIntent;
    if (!intent) return null;
    return {
      revision: intent.revision,
      kind: intent.action.kind,
      destination: { ...intent.destination },
    };
  }

  /** Read-only snapshot of the player sprite selected for visual checks. */
  getPlayerVisualDebug(): Readonly<{
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
  }> {
    const visual = this.actorLayer.getPlayerVisualDebug();
    const facing = (['right', 'down', 'up', 'left'] as const)[this.nav.facing];
    return {
      requestedTextureKey: visual.requestedTextureKey,
      boundTextureKey: visual.boundTextureKey,
      authoredCarry: visual.authoredCarry,
      plateOverlayVisible: visual.plateOverlayVisible,
      spriteVisible: visual.spriteVisible,
      spriteAlpha: visual.spriteAlpha,
      frameWidth: visual.frameWidth,
      frameHeight: visual.frameHeight,
      feet: visual.feet,
      facing,
      isMoving: this.nav.isMoving,
    };
  }

  /** Read-only seating scene snapshot for depth/pose continuity checks. */
  getSeatingSceneDebug(): Readonly<{
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
  }> {
    this.depthLayer.sortChildren();
    const furniture = this.furnitureLayer.getSeatingDepthDebug();
    const furniturePaint = this.furnitureLayer.getSeatingPaintDebug();
    const floor = useGameStore.getState().activeDay?.floor;
    const guests = (floor?.pool ?? []).flatMap((guest) => {
      if (!guest.seat) return [];
      const visual = this.actorLayer.getGuestVisualDebug(guest.id);
      if (!visual) return [];
      const motionPose = this.guestMotion.pose(guest.id);
      return [{
        ...visual,
        walkFrame: motionPose?.walkFrame ?? 0,
        tablePlacementId: guest.seat.tablePlacementId,
        slotIndex: guest.seat.slotIndex,
        seatFacing: guest.seat.facing,
      }];
    });
    return {
      depthParent: {
        shared:
          this.furnitureLayer.view === this.depthLayer &&
          this.actorLayer.usesDepthParent(this.depthLayer),
        sortable: this.depthLayer.sortableChildren,
      },
      tables: furniture.tables.map((table) => ({
        ...table,
        ...furniturePaint.tables.find(
          (paint) => paint.placementId === table.placementId,
        )!,
      })),
      chairs: furniture.chairs.map((chair) => ({
        ...chair,
        ...furniturePaint.chairs.find(
          (paint) =>
            paint.tablePlacementId === chair.tablePlacementId &&
            paint.slotIndex === chair.slotIndex,
        )!,
      })),
      guests,
    };
  }

  /** E2E probe for one genuinely painted tabletop pixel above a rendered guest. */
  getOpaqueTableOverlapScreenPoint(guestId: string): Readonly<{
    x: number;
    y: number;
    tablePlacementId: string;
    usesTableOverhang: boolean;
    gridCell: { x: number; y: number };
    occlusionSource: 'texture-alpha';
  }> | null {
    const target = this.actorLayer
      .getGuestWorldHitTargets()
      .find((candidate) => candidate.guestId === guestId);
    if (!target) return null;
    const seat = useGameStore
      .getState()
      .activeDay?.floor?.pool.find((guest) => guest.id === guestId)?.seat;
    if (!seat) return null;
    const seatBounds = {
      left: seat.x * TILE_PX,
      top: seat.y * TILE_PX,
      right: (seat.x + 1) * TILE_PX - 1,
      bottom: (seat.y + 1) * TILE_PX - 1,
    };
    const overlap = this.furnitureLayer.findOpaqueTableOcclusionPoint(
      {
        left: Math.max(target.bounds.left, seatBounds.left),
        top: Math.max(target.bounds.top, seatBounds.top),
        right: Math.min(target.bounds.right, seatBounds.right),
        bottom: Math.min(target.bounds.bottom, seatBounds.bottom),
      },
      { sortY: target.sortY, paintOrder: target.paintOrder },
    );
    if (!overlap) return null;
    const rect = this.app.canvas.getBoundingClientRect();
    const screen = worldToScreen(overlap.x, overlap.y, this.camera.state);
    return {
      x: rect.left + screen.x,
      y: rect.top + screen.y,
      tablePlacementId: overlap.placementId,
      usesTableOverhang: overlap.usesTableOverhang,
      occlusionSource: overlap.source,
      gridCell: {
        x: Math.floor(overlap.x / TILE_PX),
        y: Math.floor(overlap.y / TILE_PX),
      },
    };
  }

  /** Read-only frame snapshot for guest threshold and door-state continuity. */
  getGuestDoorwayTransitionDebug(guestId: string): Readonly<{
    guestId: string;
    stage: FloorGuest['stage'] | null;
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
      doorwayCrop: DoorwayCropDebug | null;
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
  }> {
    const state = useGameStore.getState();
    const floor = state.activeDay?.floor;
    const guest = floor?.pool.find((candidate) => candidate.id === guestId);
    const visual = this.actorLayer.getGuestVisualDebug(guestId);
    const door = this.gridLayer.getGuestDoorDebug();
    return {
      guestId,
      stage: guest?.stage ?? null,
      guest: visual
        ? {
            requestedFrameKey: visual.requestedFrameKey,
            actualBoundFrameKey: visual.actualBoundFrameKey,
            textureMatchesActualBoundFrame:
              visual.textureMatchesActualBoundFrame,
            actualMaskWorldBounds: visual.actualMaskWorldBounds,
            isMoving: visual.isMoving,
            facing: visual.facing,
            visible: visual.visible,
            alpha: visual.alpha,
            feet: visual.feet,
            doorwayCrop: visual.doorwayCrop,
          }
        : null,
      door,
      authoritativeOpen: this.guestDoorOpen(state, floor),
      exitLingerRemainingMs: Math.max(
        0,
        this.guestDoorExitLingerUntilMs - performance.now(),
      ),
      camera: { ...this.camera.state },
    };
  }

  private waitingGuestHitAtWorldPoint(
    floor: FloorDay,
    world: { x: number; y: number },
  ): boolean {
    const waiting = floor.pool.find((guest) => guest.stage === 'waiting');
    if (!waiting) return false;
    const target = this.actorLayer
      .getGuestWorldHitTargets()
      .find((candidate) => candidate.guestId === waiting.id);
    if (!target) return false;
    return guestHitBoundsContainPoint(
      expandGuestHitBounds(target.bounds, this.camera.state.scale),
      world,
    );
  }

  private serviceGuestHitAtWorldPoint(
    floor: FloorDay,
    world: { x: number; y: number },
    tapCell: GridPoint,
  ): FloorGuest | null {
    const hasCarriedTicket = floor.carriedTicketId != null;
    const eligibleById = new Map(
      floor.pool
        .filter(
          (guest) =>
            guest.seat &&
            isServiceGuestHitEligible(guest.stage, hasCarriedTicket),
        )
        .map((guest) => [guest.id, guest]),
    );

    const renderedTargets = this.actorLayer.getGuestWorldHitTargets();
    const tableOccludesTarget = (
      candidate: (typeof renderedTargets)[number],
    ): boolean => Boolean(
      this.furnitureLayer.getOpaqueTableOccluderAtWorld(
        world.x,
        world.y,
        { sortY: candidate.sortY, paintOrder: candidate.paintOrder },
      ),
    );
    const bodyHit = resolveTopmostGuestHit(
      world,
      renderedTargets.filter(
        (candidate) =>
          eligibleById.has(candidate.guestId) &&
          !tableOccludesTarget(candidate),
      ),
      this.camera.state.scale,
    );
    const hit =
      bodyHit ??
      resolveNearestGuestHit(
        world,
        renderedTargets.filter(
          (candidate) =>
            eligibleById.has(candidate.guestId) &&
            !tableOccludesTarget(candidate),
        ),
        this.camera.state.scale,
      );
    if (hit) {
      // Actor rendering trails state updates by at most one frame. Re-read the
      // live floor snapshot before turning a painted body into a command.
      const liveGuest = floor.pool.find(
        (guest) => guest.id === hit.guestId,
      );
      if (
        liveGuest?.seat &&
        isServiceGuestHitEligible(liveGuest.stage, hasCarriedTicket)
      ) {
        return liveGuest;
      }
    }

    // Preserve the established seat-cell affordance for keyboard/debug flows,
    // but subject it to the same lifecycle rules as direct body taps.
    const seatGuest = floor.pool.find(
      (guest) =>
        guest.seat?.x === tapCell.x &&
        guest.seat.y === tapCell.y &&
        isServiceGuestHitEligible(guest.stage, hasCarriedTicket),
    );
    if (!seatGuest) return null;
    const renderedSeatTarget = renderedTargets.find(
      (candidate) => candidate.guestId === seatGuest.id,
    );
    return renderedSeatTarget && tableOccludesTarget(renderedSeatTarget)
      ? null
      : seatGuest;
  }

  private onTick = (): void => {
    if (this.roomTransitionInFlight) return;
    const state = useGameStore.getState();
    const floor = state.activeDay?.floor;
    const runtimeRunning = selectFloorRuntimeRunning(
      state,
      document.visibilityState === 'visible',
    );
    const resumed = resumeSafeFloorDeltaMs(
      runtimeRunning,
      this.floorRuntimeWasRunning,
      this.app.ticker.deltaMS,
      this.floorResumeSettleFramesRemaining,
    );
    const deltaMs = resumed.deltaMs;
    this.floorResumeSettleFramesRemaining =
      resumed.resumeSettleFramesRemaining;
    this.floorRuntimeWasRunning = runtimeRunning;
    if (!runtimeRunning || !floor) {
      this.cancelPendingSeatingIntent();
      this.reconcileGuestDoorPaint(state, floor);
      return;
    }
    if (deltaMs === 0) {
      // The resume-safe frame advances no gameplay, but it must still repaint
      // wall art so an elapsed post-exit linger cannot leave the door stale.
      // Also keep actor crop geometry snapped to the current pose so the first
      // post-resume motion frame does not inherit a stale visual jump.
      this.repaintGuestDoor(state, floor);
      if (state.activeFloorRoom === 'main') {
        const door = doorForGrid(state.gridSize.w, state.gridSize.h, {
          room: 'main',
        });
        this.actorLayer.sync(floor, this.nav, this.guestMotion, {
          guestDoor: door,
        });
      }
      this.effectsLayer.update(0);
      this.atmosphereLayer.update(0);
      this.syncCarryPlateOverlay(floor);
      return;
    }

    this.nav.update(deltaMs);
    useGameStore.getState().setFloorNavPosition(this.nav.position);
    this.flushBufferedNavigationGoal(useGameStore.getState());
    this.tickPendingApproachIntent(deltaMs);
    this.syncFloorActionInFlightDataset();

    // Room transition when the cook steps onto the connecting door.
    if (
      isConnectingDoorCell(
        state,
        state.activeFloorRoom,
        this.nav.position.x,
        this.nav.position.y,
      )
    ) {
      this.beginRoomTransition();
      return;
    }

    const roomPlacements = this.roomPlacements(state);
    // Guests always path on the main floor.
    const mainBlocked = walkBlockedCells(
      state.placements,
      state.gridSize.w,
      state.gridSize.h,
      { kitchenAnnexOwned: state.kitchenAnnexOwned, room: 'main' },
    );
    const door = doorForGrid(state.gridSize.w, state.gridSize.h, {
      room: 'main',
    });
    const motionResult = this.guestMotion.sync(floor, {
      door,
      grid: { w: state.gridSize.w, h: state.gridSize.h, blocked: mainBlocked },
      dtMs: deltaMs,
    });
    // Persist cell arrivals before lifecycle completions. Completion actions
    // clear the anchor, and the motion update's stage guard also makes a stale
    // update harmless if dispatch ordering ever changes.
    for (const update of motionResult.motionPositionUpdates) {
      void useGameStore.getState().dispatch({
        type: 'FLOOR_UPDATE_GUEST_MOTION_POSITION',
        guestId: update.guestId,
        position: update.position,
      });
    }
    if (motionResult.enteredGuestIds.length > 0) {
      void useGameStore
        .getState()
        .dispatch({ type: 'FLOOR_COMPLETE_ENTERING' });
    }
    for (const guestId of motionResult.seatedGuestIds) {
      void useGameStore
        .getState()
        .dispatch({ type: 'FLOOR_COMPLETE_SEATING', guestId });
    }
    for (const guestId of motionResult.exitedGuestIds) {
      // Keep the opened door painted briefly after the logical threshold is
      // crossed. Arm before the synchronous reducer dispatch removes the
      // leaving lifecycle that otherwise owns the open state.
      this.guestDoorExitLingerUntilMs = Math.max(
        this.guestDoorExitLingerUntilMs,
        performance.now() + GUEST_DOOR_EXIT_LINGER_MS,
      );
      void useGameStore
        .getState()
        .dispatch({ type: 'FLOOR_COMPLETE_LEAVING', guestId });
    }

    // Completion dispatches update the store synchronously. Render and tick
    // the resulting lifecycle state so an exited guest cannot be recreated
    // for one frame from the pre-dispatch snapshot.
    const liveFloor = useGameStore.getState().activeDay?.floor;
    if (!liveFloor) return;

    if (state.activeFloorRoom === 'main') {
      this.actorLayer.sync(liveFloor, this.nav, this.guestMotion, {
        guestDoor: door,
      });
    } else {
      this.actorLayer.sync(null, this.nav, null, {
        showPlayerWithoutFloor: true,
        playerCarrying: liveFloor.carriedTicketId != null,
        guestDoor: door,
      });
    }

    if (liveFloor.pool.some((g) => g.stage === 'eating')) {
      this.eatingTickAccumulatorMs += deltaMs;
      while (
        this.eatingTickAccumulatorMs >= RestaurantApp.EATING_TICK_INTERVAL_MS
      ) {
        this.eatingTickAccumulatorMs -= RestaurantApp.EATING_TICK_INTERVAL_MS;
        void useGameStore.getState().dispatch({ type: 'FLOOR_TICK_EATING' });
      }
    } else {
      this.eatingTickAccumulatorMs = 0;
    }

    const width = this.app.screen.width;
    const height = this.app.screen.height;
    const mapWpx = state.gridSize.w * TILE_PX;
    const mapHpx = state.gridSize.h * TILE_PX;
    const player = this.actorLayer.getPlayerWorldPosition();
    const lead = cameraLeadOffset(
      this.nav.facing,
      this.nav.isMoving,
      0.75,
      TILE_PX,
    );
    this.camera.followWorldPointSmooth(
      player.x + lead.x,
      player.y + lead.y,
      width,
      height,
      mapWpx,
      mapHpx,
    );
    this.applyCamera();
    const liveState = useGameStore.getState();
    const guestDoorOpen = this.guestDoorOpen(liveState, liveFloor);
    this.gridLayer.sync(state.gridSize.w, state.gridSize.h, this.camera.state, {
      guestDoorOpen,
      kitchenAnnexOwned: state.kitchenAnnexOwned,
      room: state.activeFloorRoom,
      showGrid: state.editLayoutMode,
    });
    const hasValidCarriedTicket = liveFloor.tickets.some(
      (ticket) =>
        ticket.id === liveFloor.carriedTicketId && ticket.status === 'plated',
    );
    const stationNeedsAttention =
      liveFloor.tickets.some((ticket) => ticket.status === 'open') &&
      !hasValidCarriedTicket;
    const blocked = this.playerBlockedCells(liveState, roomPlacements);
    const hintGrid = {
      w: state.gridSize.w,
      h: state.gridSize.h,
      blocked,
    };
    const interactionHints: FloorInteractHint[] =
      !selectShowFloorInteractionCues(state)
        ? []
        : state.activeFloorRoom === 'main'
          ? computeFloorInteractHints({
              floor: liveFloor,
              placements: roomPlacements,
              player: this.nav.position,
              grid: hintGrid,
              stationNeedsAttention,
              approachPreview: this.activeApproachPreview(),
              pendingApproach: this.pendingApproachIntent?.destination ?? null,
              canRequestSeat: selectCanRequestSeatFloorGuest(liveState),
            })
          : computeStationInteractHints(
              roomPlacements,
              this.nav.position,
              hintGrid,
              stationNeedsAttention,
            );
    this.interactHintLayer.sync(interactionHints);

    this.syncCarryPlateOverlay(liveFloor);
    this.effectsLayer.update(deltaMs);
    this.atmosphereLayer.update(deltaMs);
    this.gridLayer.update(deltaMs);
    if (this.cameraPunchElapsedMs >= 0) {
      this.cameraPunchElapsedMs += deltaMs;
      if (this.cameraPunchElapsedMs >= SERVE_CAMERA_PUNCH_MS) {
        this.cameraPunchElapsedMs = -1;
      }
      this.applyCamera();
    }

    if (guestDoorOpen !== this.lastGuestDoorOpen) {
      if (this.lastGuestDoorOpen !== null && guestDoorOpen) {
        const doorCell = doorForGrid(state.gridSize.w, state.gridSize.h, {
          room: 'main',
        });
        this.effectsLayer.burstDoorDust(doorCell.x, doorCell.y);
      }
      this.lastGuestDoorOpen = guestDoorOpen;
    }

    this.tickEatingSteam(liveFloor, roomPlacements, deltaMs);
  };

  private syncCarryPlateOverlay(
    floor: FloorDay | null | undefined,
  ): void {
    const debug = this.actorLayer.getPlayerVisualDebug();
    const carried =
      floor?.tickets.find(
        (ticket) =>
          ticket.id === floor.carriedTicketId && ticket.status === 'plated',
      ) ?? null;
    this.carryPlateLayer.sync({
      show: debug.plateOverlayVisible,
      feet: debug.feet,
      facing: this.nav.facing,
      ingredientId: carried?.ingredientIds[0] ?? null,
    });
  }

  private tickEatingSteam(
    floor: FloorDay,
    placements: Placement[],
    deltaMs: number,
  ): void {
    const eatingTables = eatingTablePlacementIds(floor);
    if (eatingTables.length === 0) {
      this.eatingSteamAccumulatorMs = 0;
      return;
    }
    this.eatingSteamAccumulatorMs += deltaMs;
    if (this.eatingSteamAccumulatorMs < EATING_STEAM_INTERVAL_MS) return;
    this.eatingSteamAccumulatorMs = 0;
    for (const placementId of eatingTables) {
      const root = this.furnitureLayer.getSpriteRoot(placementId);
      if (root) {
        this.effectsLayer.burstSteam(root.x + TILE_PX / 2, root.y);
        continue;
      }
      const placement = placements.find((p) => p.id === placementId);
      if (placement) {
        this.effectsLayer.burstSteam(
          placement.x * TILE_PX + TILE_PX / 2,
          placement.y * TILE_PX,
        );
      }
    }
  }

  private enterConnectingRoomNow(): boolean {
    const entered = useGameStore.getState().enterConnectingDoor();
    if (!entered) return false;
    const next = useGameStore.getState();
    const spawn = connectingDoorInterior(
      next.activeFloorRoom,
      next.gridSize.w,
      next.gridSize.h,
    );
    this.snapNavigationTo(spawn);
    this.syncFromStore(next);
    return true;
  }

  private beginRoomTransition(
    changeRoom: () => boolean = () => this.enterConnectingRoomNow(),
  ): void {
    if (this.roomTransitionInFlight) return;
    this.cancelPendingSeatingIntent();
    const canvas = this.app.canvas;
    this.roomTransitionInFlight = true;
    canvas.style.pointerEvents = 'none';
    // Reduced-motion uses an explicit timer hold (not a no-op WAAPI) so the
    // out→swap→in markers stay ordered; `data-room-transition-out-from`
    // latches the source room for observers that miss the brief `out` attr.
    void this.runRoomTransition(changeRoom, prefersReducedMotion());
  }

  private async runRoomTransition(
    changeRoom: () => boolean,
    reducedMotion = false,
  ): Promise<void> {
    const canvas = this.app.canvas;
    let roomChanged = false;
    const delayWithTimer = (ms: number) =>
      new Promise<void>((resolve) => {
        this.roomTransitionTimer = window.setTimeout(() => {
          this.roomTransitionTimer = null;
          resolve();
        }, ms);
      });
    const hold = async (phase: 'out' | 'in', duration: number) => {
      if (phase === 'out') {
        latchRoomTransitionOutFrom(
          canvas,
          useGameStore.getState().activeFloorRoom,
        );
      }
      await holdRoomTransitionPhase(canvas, phase, {
        reducedMotion,
        durationMs: duration,
        setAnimation: (animation) => {
          this.roomTransitionAnimation = animation;
        },
        delay: delayWithTimer,
      });
    };
    try {
      await hold('out', ROOM_FADE_OUT_MS);

      if (!this.mounted) return;
      roomChanged = changeRoom();
      if (!roomChanged) return;

      await hold('in', ROOM_FADE_IN_MS);
    } catch {
      // Cancellation during teardown is expected. If animation support fails
      // while still mounted, preserve the doorway action without the effect.
      if (this.mounted && !roomChanged) changeRoom();
    } finally {
      if (this.roomTransitionTimer !== null) {
        window.clearTimeout(this.roomTransitionTimer);
        this.roomTransitionTimer = null;
      }
      this.roomTransitionAnimation = null;
      this.roomTransitionInFlight = false;
      clearRoomTransitionPhase(canvas);
      canvas.style.removeProperty('opacity');
      canvas.style.removeProperty('pointer-events');
    }
  }

  /** E2E probe: live phase + latched source room for annex travel. */
  getRoomTransitionProbe(): {
    phase: 'out' | 'in' | null;
    outFromRoom: string | null;
    inFlight: boolean;
  } {
    const canvas = this.app.canvas;
    return {
      phase: readRoomTransitionPhase(canvas),
      outFromRoom: readRoomTransitionOutFrom(canvas),
      inFlight: this.roomTransitionInFlight,
    };
  }

  private onTapMove = (event: PointerEvent): void => {
    const store = useGameStore.getState();
    if (
      !selectFloorRuntimeRunning(
        store,
        document.visibilityState === 'visible',
      ) ||
      store.composeSheetOpen
    ) {
      this.cancelPendingSeatingIntent();
      return;
    }
    // Hand focus to the playfield so subsequent WASD/arrows move Val even when
    // the floor action toolbar previously owned keyboard focus.
    if (this.app.canvas.tabIndex >= 0) {
      this.app.canvas.focus({ preventScroll: true });
    }
    const floor = store.activeDay?.floor;
    if (!floor) {
      this.cancelPendingSeatingIntent();
      return;
    }

    const rect = this.app.canvas.getBoundingClientRect();
    const sx = event.clientX - rect.left;
    const sy = event.clientY - rect.top;
    const world = screenToWorld(sx, sy, this.camera.state);
    const { gx, gy } = screenToGrid(sx, sy, this.camera.state);
    const tapCell = { x: gx, y: gy };
    const roomPlacements = this.roomPlacements(store);
    // Waiting guest owns seat approach (retain/cancel handled inside).
    if (
      store.activeFloorRoom === 'main' &&
      this.waitingGuestHitAtWorldPoint(floor, world)
    ) {
      this.requestSeatNextGuest();
      return;
    }

    if (isConnectingDoorCell(store, store.activeFloorRoom, gx, gy)) {
      // Door travel replaces any pending approach.
      this.cancelPendingApproachIntent();
      const blocked = this.playerBlockedCells(store, roomPlacements);
      const path = findPath(
        { w: store.gridSize.w, h: store.gridSize.h, blocked },
        this.nav.position,
        tapCell,
      );
      if (path) {
        this.setNavigationPath(path);
      } else {
        store.setFloorToast('No clear route');
      }
      return;
    }

    if (store.activeFloorRoom === 'main') {
      // Guest hit ownership follows the same shared depth stack and exact table
      // alpha that painted this point; transparent tabletop padding leaves the
      // authored guest target live.
      const tappedGuest = this.serviceGuestHitAtWorldPoint(floor, world, tapCell);
      const player = store.floorPlayerGrid ?? this.nav.position;

      if (floor.carriedTicketId && tappedGuest) {
        const ticket = floor.tickets.find(
          (candidate) => candidate.id === floor.carriedTicketId,
        );
        if (
          ticket &&
          tappedGuest.customer.id === ticket.customerId &&
          tappedGuest.stage === 'ordered' &&
          tappedGuest.seat
        ) {
          const seat = tappedGuest.seat;
          this.beginApproachOrAct(
            store,
            {
              kind: 'deliver',
              guestId: tappedGuest.id,
              customerId: tappedGuest.customer.id,
              ticketId: ticket.id,
            },
            () =>
              this.pathToGuestServiceCell(store, roomPlacements, seat, {
                preserveApproachIntent: true,
              }),
            () => playerNearGuestSeat(player, tappedGuest),
            () => {
              const deliveryGeneration = getGameplayInteractionGeneration();
              this.deliveryAttempts.start(
                ticket.id,
                async () => {
                  await store.dispatch({
                    type: 'FLOOR_DELIVER',
                    ticketId: ticket.id,
                  });
                  playSfx(sfxForFloorFeelBeat('deliver'));
                  const current = useGameStore.getState();
                  if (
                    this.mounted &&
                    getGameplayInteractionGeneration() === deliveryGeneration &&
                    current.floorToast === DELIVERY_RETRY_TOAST
                  ) {
                    current.setFloorToast(null);
                  }
                },
                () => {
                  const current = useGameStore.getState();
                  if (
                    this.mounted &&
                    getGameplayInteractionGeneration() === deliveryGeneration &&
                    current.screen === 'restaurant'
                  ) {
                    current.setFloorToast(DELIVERY_RETRY_TOAST);
                  }
                },
              );
            },
          );
          return;
        }

        this.cancelPendingApproachIntent();
        store.setFloorToast('Wrong table — deliver to the matching guest');
        return;
      }

      if (!floor.carriedTicketId && tappedGuest?.stage === 'seated' && tappedGuest.seat) {
        if (!canEnqueue(floor.tickets, 1)) {
          this.cancelPendingApproachIntent();
          store.setFloorToast(formatTicketCapacityFullMessage(floor.tickets));
          return;
        }
        const seat = tappedGuest.seat;
        this.beginApproachOrAct(
          store,
          {
            kind: 'order',
            guestId: tappedGuest.id,
            customerId: tappedGuest.customer.id,
          },
          () =>
            this.pathToGuestServiceCell(store, roomPlacements, seat, {
              preserveApproachIntent: true,
            }),
          () => playerNearGuestSeat(player, tappedGuest),
          () => {
            void store.dispatch({
              type: 'FLOOR_TAKE_ORDERS',
              customerIds: [tappedGuest.customer.id],
            });
            playSfx(sfxForFloorFeelBeat('order'), 0.9);
          },
        );
        return;
      }
    }

    const station = findCookStationPlacementAtCell(roomPlacements, tapCell);
    if (station) {
      const validCarriedTicket = floor.tickets.find(
        (ticket) =>
          ticket.id === floor.carriedTicketId && ticket.status === 'plated',
      );
      if (validCarriedTicket) {
        this.cancelPendingApproachIntent();
        store.setFloorToast('Deliver the carried dish first');
        return;
      }
      if (!floor.tickets.some((ticket) => ticket.status === 'open')) {
        this.cancelPendingApproachIntent();
        store.setFloorToast('No open ticket to cook');
        return;
      }
      const player = store.floorPlayerGrid ?? floor.playerPosition;
      this.beginApproachOrAct(
        store,
        { kind: 'compose', placementId: station.id },
        () =>
          this.pathToAdjacentCell(store, roomPlacements, tapCell, {
            preserveApproachIntent: true,
          }),
        () =>
          playerNearPlacement(player, station) &&
          selectCanOpenFloorCompose(store),
        () => {
          if (selectCanOpenFloorCompose(store)) {
            store.openComposeSheet();
            return;
          }
          store.setFloorToast('No open ticket to cook');
        },
      );
      return;
    }

    if (store.activeFloorRoom === 'main') {
      const tappedPlacement = roomPlacements.find(
        (placement) => placement.x === tapCell.x && placement.y === tapCell.y,
      );
      const table = tappedPlacement
        ? floor.tables.find(
            (candidate) => candidate.placementId === tappedPlacement.id,
          )
        : undefined;
      if (tappedPlacement && table) {
        const player = store.floorPlayerGrid ?? this.nav.position;
        if (table.state === 'unset' || table.state === 'dirty') {
          const kind = table.state === 'unset' ? 'set' : 'clear';
          this.beginApproachOrAct(
            store,
            { kind, placementId: table.placementId },
            () =>
              this.pathToAdjacentCell(store, roomPlacements, tapCell, {
                preserveApproachIntent: true,
              }),
            () => playerNearPlacement(player, tappedPlacement),
            () => {
              void store.dispatch({
                type:
                  table.state === 'unset'
                    ? 'FLOOR_SET_TABLE'
                    : 'FLOOR_CLEAR_TABLE',
                placementId: table.placementId,
              });
            },
          );
          return;
        }
        return;
      }
    }

    // Any other direct world command replaces a queued approach.
    this.cancelPendingApproachIntent();

    if (store.composeSheetOpen) {
      store.closeComposeSheet();
    }

    // Mid-walk taps queue the cell itself — findPath from the in-progress cell
    // can fail on transient guest blocks that will clear by arrival.
    if (this.nav.isMoving) {
      this.nav.bufferGoal(tapCell);
      this.syncFloorActionInFlightDataset();
      return;
    }

    const blocked = this.playerBlockedCells(store, roomPlacements);
    const path = findPath(
      { w: store.gridSize.w, h: store.gridSize.h, blocked },
      this.nav.position,
      tapCell,
    );
    if (path) {
      this.setNavigationPath(path);
    }
  };

  private onCanvasFocusChange = (): void => {
    const canvas = this.app.canvas;
    if (document.activeElement === canvas) {
      canvas.style.outline = '3px solid #e0b44f';
      canvas.style.outlineOffset = '2px';
    } else {
      canvas.style.outline = 'none';
      canvas.style.outlineOffset = '';
    }
  };

  private onKeyboardMove = (event: KeyboardEvent): void => {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const target = event.target;
    if (
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      target instanceof HTMLSelectElement ||
      (target instanceof HTMLElement && target.isContentEditable)
    ) {
      return;
    }

    // Escape cancels an armed approach-and-complete (and aborts its walk).
    if (event.key === 'Escape') {
      if (!this.pendingApproachIntent) return;
      event.preventDefault();
      const stopAt = { ...this.nav.position };
      this.cancelPendingApproachIntent();
      this.nav.clearBufferedGoal();
      if (this.nav.isMoving) this.nav.snapTo(stopAt);
      this.syncFloorActionInFlightDataset();
      return;
    }

    const deltaByKey: Record<string, { x: number; y: number }> = {
      ArrowUp: { x: 0, y: -1 },
      w: { x: 0, y: -1 },
      W: { x: 0, y: -1 },
      ArrowDown: { x: 0, y: 1 },
      s: { x: 0, y: 1 },
      S: { x: 0, y: 1 },
      ArrowLeft: { x: -1, y: 0 },
      a: { x: -1, y: 0 },
      A: { x: -1, y: 0 },
      ArrowRight: { x: 1, y: 0 },
      d: { x: 1, y: 0 },
      D: { x: 1, y: 0 },
    };
    const delta = deltaByKey[event.key];
    if (!delta) return;

    const canvas = this.app.canvas;
    const canvasFocused = document.activeElement === canvas;
    const isWasd = event.key.length === 1 && 'wasdWASD'.includes(event.key);
    // Floor action toolbar preventDefaults arrow keys for its own roving tab.
    // WASD still moves Val; arrows move Val when the canvas owns focus.
    if (event.defaultPrevented && !canvasFocused && !isWasd) return;

    const store = useGameStore.getState();
    if (
      !selectFloorRuntimeRunning(
        store,
        document.visibilityState === 'visible',
      ) ||
      store.composeSheetOpen
    ) {
      this.cancelPendingSeatingIntent();
      return;
    }

    event.preventDefault();
    this.cancelPendingSeatingIntent();
    this.nav.clearBufferedGoal();
    const targetCell = {
      x: this.nav.position.x + delta.x,
      y: this.nav.position.y + delta.y,
    };
    const roomPlacements = this.roomPlacements(store);
    const blocked = this.playerBlockedCells(store, roomPlacements);
    const path = findPath(
      { w: store.gridSize.w, h: store.gridSize.h, blocked },
      this.nav.position,
      targetCell,
    );
    if (path) this.setNavigationPath(path);
  };

  /** One authoritative guest-door state shared by ticks, store syncs, and resize paints. */
  private guestDoorOpen(
    state: GameStore,
    floor: FloorDay | null | undefined,
  ): boolean {
    if (
      state.activeFloorRoom !== 'main' ||
      !floor ||
      state.activeDay?.serviceStarted !== true ||
      !state.modifierDismissed
    ) {
      return false;
    }
    const door = doorForGrid(state.gridSize.w, state.gridSize.h, {
      room: 'main',
    });
    return (
      this.guestMotion.isDoorBusy(floor, door) ||
      performance.now() < this.guestDoorExitLingerUntilMs
    );
  }

  private repaintGuestDoor(
    state: GameStore,
    floor: FloorDay | null | undefined,
  ): void {
    this.gridLayer.sync(state.gridSize.w, state.gridSize.h, this.camera.state, {
      guestDoorOpen: this.guestDoorOpen(state, floor),
      kitchenAnnexOwned: state.kitchenAnnexOwned,
      room: state.activeFloorRoom,
      showGrid: state.editLayoutMode,
    });
  }

  /**
   * Time-based exit linger can expire while simulation is paused. Keep that
   * visual-only state current without rebuilding the grid on every paused
   * ticker frame or advancing any gameplay system.
   */
  private reconcileGuestDoorPaint(
    state: GameStore,
    floor: FloorDay | null | undefined,
  ): void {
    const expectedOpen = this.guestDoorOpen(state, floor);
    const painted = this.gridLayer.getGuestDoorDebug();
    if (
      painted.requestedOpen === expectedOpen &&
      painted.paintedOpen === expectedOpen
    ) {
      return;
    }
    this.repaintGuestDoor(state, floor);
  }

  private handleResize = (): void => {
    const width = this.app.screen.width;
    const height = this.app.screen.height;
    const state = useGameStore.getState();
    if (state.activeDay?.floor && !state.editLayoutMode) {
      const mapWpx = state.gridSize.w * TILE_PX;
      const mapHpx = state.gridSize.h * TILE_PX;
      const player = this.actorLayer.getPlayerWorldPosition();
      this.camera.followWorldPoint(
        player.x,
        player.y,
        width,
        height,
        mapWpx,
        mapHpx,
      );
    } else {
      this.camera.centerOnGrid(
        state.gridSize.w,
        state.gridSize.h,
        width,
        height,
      );
    }
    this.applyCamera();
    this.gridLayer.sync(state.gridSize.w, state.gridSize.h, this.camera.state, {
      guestDoorOpen: this.guestDoorOpen(state, state.activeDay?.floor),
      kitchenAnnexOwned: state.kitchenAnnexOwned,
      room: state.activeFloorRoom,
      showGrid: state.editLayoutMode,
    });
  };

  private onVisibilityChange = (): void => {
    if (document.visibilityState !== 'visible') {
      this.floorRuntimeWasRunning = false;
      this.floorResumeSettleFramesRemaining = 0;
      this.cancelPendingSeatingIntent();
    }
  };

  syncFromStore(state: GameStore): void {
    if (
      this.pendingApproachIntent &&
      !this.pendingApproachIntentIsValid(state)
    ) {
      this.cancelPendingApproachIntent();
    }
    const width = this.app.screen.width;
    const height = this.app.screen.height;
    const floor = state.activeDay?.floor;
    const guestDoor = doorForGrid(state.gridSize.w, state.gridSize.h, {
      room: 'main',
    });
    const mapWpx = state.gridSize.w * TILE_PX;
    const mapHpx = state.gridSize.h * TILE_PX;
    const roomPlacements = this.roomPlacements(state);

    if (floor) {
      const daySeed = state.activeDay?.seed ?? null;
      if (daySeed !== this.lastFloorSeed) {
        this.snapNavigationTo(floor.playerPosition);
        this.lastFloorSeed = daySeed;
        this.lastRoom = 'main';
        this.eatingTickAccumulatorMs = 0;
      } else if (this.lastRoom !== state.activeFloorRoom) {
        const spawn = connectingDoorInterior(
          state.activeFloorRoom,
          state.gridSize.w,
          state.gridSize.h,
        );
        this.snapNavigationTo(state.floorPlayerGrid ?? spawn);
        this.lastRoom = state.activeFloorRoom;
      }

      const mainBlocked = walkBlockedCells(
        state.placements,
        state.gridSize.w,
        state.gridSize.h,
        {
          kitchenAnnexOwned: state.kitchenAnnexOwned,
          room: 'main',
        },
      );
      this.guestMotion.sync(floor, {
        door: guestDoor,
        grid: {
          w: state.gridSize.w,
          h: state.gridSize.h,
          blocked: mainBlocked,
        },
        dtMs: 0,
      });
      if (state.activeFloorRoom === 'main') {
        this.actorLayer.sync(floor, this.nav, this.guestMotion, {
          // OPEN_DAY creates the first arrival in domain state so service can
          // begin immediately, but the modifier sheet is still the closed
          // restaurant threshold. Keep that arrival offstage until the player
          // explicitly starts service; the existing door-to-wait walk begins
          // on the first live tick afterward.
          showGuests: state.modifierDismissed,
          guestDoor,
        });
      } else {
        this.actorLayer.sync(null, this.nav, null, {
          showPlayerWithoutFloor: true,
          playerCarrying: floor.carriedTicketId != null,
          guestDoor,
        });
      }
      if (!state.editLayoutMode) {
        const player = this.actorLayer.getPlayerWorldPosition();
        this.camera.followWorldPoint(
          player.x,
          player.y,
          width,
          height,
          mapWpx,
          mapHpx,
        );
      } else {
        this.camera.centerOnGrid(
          state.gridSize.w,
          state.gridSize.h,
          width,
          height,
        );
      }
    } else {
      this.lastFloorSeed = null;
      this.lastRoom = state.activeFloorRoom;
      this.actorLayer.sync(null, this.nav, null, { guestDoor });
      this.camera.centerOnGrid(
        state.gridSize.w,
        state.gridSize.h,
        width,
        height,
      );
    }

    this.applyCamera();
    this.gridLayer.sync(state.gridSize.w, state.gridSize.h, this.camera.state, {
      guestDoorOpen: this.guestDoorOpen(state, floor),
      kitchenAnnexOwned: state.kitchenAnnexOwned,
      room: state.activeFloorRoom,
      showGrid: state.editLayoutMode,
    });
    this.atmosphereLayer.sync(state.gridSize.w, state.gridSize.h, {
      room: state.activeFloorRoom,
      kitchenAnnexOwned: state.kitchenAnnexOwned,
    });
    const tableStates = tableServiceVisualStates(state.activeDay?.floor);
    this.furnitureLayer.sync(
      roomPlacements,
      state.editLayoutMode,
      state.activeFloorRoom === 'main'
        ? (state.activeDay?.floor?.seats ??
            seatsFromPlacements(state.placements))
        : [],
      state.activeFloorRoom === 'main' ? tableStates : new Map(),
    );
    this.syncCarryPlateOverlay(floor);

    if (floor || state.activeFloorRoom === 'back_kitchen') {
      this.customerLayer.sync(-1, roomPlacements, false);
    } else {
      const queueIndex = state.activeDay?.queueIndex ?? -1;
      this.customerLayer.sync(
        queueIndex,
        state.placements,
        Boolean(state.activeDay),
      );
    }

    if (!state.editLayoutMode) {
      this.previewLayer.hide();
    }

    if (!selectShowFloorInteractionCues(state)) {
      this.interactHintLayer.clear();
    }
  }

  getCustomerScreenAnchor(): { x: number; y: number } | null {
    const world = this.customerLayer.getAnchorWorldPosition();
    if (!world) return null;
    // Legacy customer sprite is already top-anchored; nudge to mouth level.
    const mouth = {
      x: world.x,
      y: world.y + 32 * 0.14,
    };
    return this.worldPointToScreen(mouth);
  }

  getPlayerScreenFeetAnchor(): { x: number; y: number } {
    const world = this.actorLayer.getPlayerFeetWorldPosition();
    return this.worldPointToScreen(world);
  }

  getGuestScreenFeetAnchor(guestId: string): { x: number; y: number } | null {
    const world = this.actorLayer.getGuestFeetWorldPosition(guestId);
    if (!world) return null;
    return this.worldPointToScreen(world);
  }

  getGuestScreenAnchor(guestId: string): { x: number; y: number } | null {
    // Prefer content bounds so transparent frame padding above the head does
    // not park the bubble tail in empty air; fall back to feet + draw scale.
    const target = this.actorLayer
      .getGuestWorldHitTargets()
      .find((candidate) => candidate.guestId === guestId);
    if (target) {
      const mouth = mouthAnchorFromContentBounds(target.bounds);
      return this.worldPointToScreen(mouth);
    }
    const feet = this.actorLayer.getGuestFeetWorldPosition(guestId);
    if (!feet) return null;
    const visual = this.actorLayer.getGuestVisualDebug(guestId);
    const pose = visual?.isSeated ? 'seated' : 'standing';
    return this.worldPointToScreen(actorMouthWorldFromFeet(feet, pose));
  }

  private worldPointToScreen(world: { x: number; y: number }): {
    x: number;
    y: number;
  } {
    const rect = this.app.canvas.getBoundingClientRect();
    const screen = worldToScreen(world.x, world.y, this.camera.state);
    return {
      x: rect.left + screen.x,
      y: rect.top + screen.y,
    };
  }

  getGuestScreenRenderedBounds(guestId: string): {
    left: number;
    top: number;
    right: number;
    bottom: number;
  } | null {
    const target = this.actorLayer
      .getGuestWorldHitTargets()
      .find((candidate) => candidate.guestId === guestId);
    if (!target) return null;
    const bounds = target.bounds;
    const rect = this.app.canvas.getBoundingClientRect();
    const topLeft = worldToScreen(
      bounds.left,
      bounds.top,
      this.camera.state,
    );
    const bottomRight = worldToScreen(
      bounds.right,
      bounds.bottom,
      this.camera.state,
    );
    return {
      left: rect.left + topLeft.x,
      top: rect.top + topLeft.y,
      right: rect.left + bottomRight.x,
      bottom: rect.top + bottomRight.y,
    };
  }

  /** Test/debug visibility into the keyed async interaction boundary. */
  isDeliveryPending(ticketId: string): boolean {
    return this.deliveryAttempts.isPending(ticketId);
  }

  destroy(): void {
    if (!this.mounted) return;
    this.cancelPendingSeatingIntent();
    this.roomTransitionAnimation?.cancel();
    this.roomTransitionAnimation = null;
    if (this.roomTransitionTimer !== null) {
      window.clearTimeout(this.roomTransitionTimer);
      this.roomTransitionTimer = null;
    }
    this.roomTransitionInFlight = false;
    clearRoomTransitionPhase(this.app.canvas);
    delete this.app.canvas.dataset.roomTransitionOutFrom;
    this.app.canvas.style.removeProperty('opacity');
    this.app.canvas.style.removeProperty('pointer-events');
    window.removeEventListener('resize', this.handleResize);
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    if (this.resizeFrame !== null) {
      cancelAnimationFrame(this.resizeFrame);
      this.resizeFrame = null;
    }
    window.removeEventListener('keydown', this.onKeyboardMove);
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    this.app.canvas.removeEventListener('pointerdown', this.onTapMove);
    this.app.canvas.removeEventListener('focus', this.onCanvasFocusChange);
    this.app.canvas.removeEventListener('blur', this.onCanvasFocusChange);
    this.app.ticker.remove(this.onTick);
    this.unsubscribe?.();
    this.unsubscribeJuice?.();
    this.unsubscribeJuice = null;
    this.effectsLayer.clear();
    this.mount.classList.remove(
      'vk-sfx-flash-serve',
      'vk-sfx-flash-review',
      'vk-sfx-flash-placement',
    );
    this.dragPlacement.detach();
    this.app.destroy(true, { children: true, texture: true });
    this.mounted = false;
  }
}
