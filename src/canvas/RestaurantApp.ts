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
  isAdjacent,
  isCookStationItemKey,
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
import { Camera, worldTransformFromCamera } from './systems/Camera.ts';
import { DragPlacement } from './systems/DragPlacement.ts';
import { ActorLayer } from './world/ActorLayer.ts';
import {
  playerWalkBlockedCells,
  walkBlockedCells,
} from './world/blocked-cells.ts';
import { guestHintAction } from './world/guest-interaction-hint.ts';
import { GuestMotion } from './world/GuestMotion.ts';
import { NavController } from './world/NavController.ts';
import { PerKeyAsyncGuard } from './world/per-key-async-guard.ts';
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
import {
  screenToGrid,
  screenToWorld,
  TILE_PX,
  worldToScreen,
} from './coordinates.ts';
import {
  expandGuestHitBounds,
  guestHitBoundsContainPoint,
  isServiceGuestHitEligible,
  resolveTopmostGuestHit,
} from './world/guest-hit.ts';
import { tableServiceVisualStates } from './table-service-visual.ts';
function integerResolution(): number {
  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
  return Math.max(1, Math.round(dpr));
}

const ROOM_FADE_OUT_MS = 100;
const ROOM_FADE_IN_MS = 140;
const DELIVERY_RETRY_TOAST =
  'Could not deliver that dish — tap the guest to retry';

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
  readonly dragPlacement: DragPlacement;
  readonly nav: NavController;
  readonly guestMotion: GuestMotion;

  private unsubscribe: (() => void) | null = null;
  private mounted = false;
  private lastFloorSeed: number | null = null;
  private lastRoom: FloorRoomId | null = null;
  private eatingTickAccumulatorMs = 0;
  private floorRuntimeWasRunning = false;
  private resizeObserver: ResizeObserver | null = null;
  private resizeFrame: number | null = null;
  private roomTransitionInFlight = false;
  private roomTransitionAnimation: Animation | null = null;
  private pendingSeatingIntent: {
    revision: number;
    daySeed: number;
    guestId: string;
    interactionGeneration: number;
    destination: GridPoint;
  } | null = null;
  private nextPendingSeatingIntentRevision = 1;
  private readonly deliveryAttempts = new PerKeyAsyncGuard();

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
    this.furnitureLayer = new FurnitureLayer(this.depthLayer);
    this.actorLayer = new ActorLayer(this.depthLayer);
    this.customerLayer = new CustomerLayer();
    this.previewLayer = new PreviewLayer();
    this.interactHintLayer = new InteractHintLayer();
    this.nav = new NavController({ x: 3, y: 5 });
    this.guestMotion = new GuestMotion();

    this.world.addChild(this.gridLayer.view);
    this.world.addChild(this.actorLayer.view);
    this.world.addChild(this.interactHintLayer.view);
    this.world.addChild(this.depthLayer);
    this.world.addChild(this.customerLayer.view);
    this.world.addChild(this.previewLayer.view);
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
    app.canvas.tabIndex = -1;
    app.canvas.style.touchAction = 'none';

    const instance = new RestaurantApp(app, mount);
    instance.mounted = true;
    return instance;
  }

  start(): void {
    this.dragPlacement.attach();
    this.app.canvas.addEventListener('pointerdown', this.onTapMove);
    window.addEventListener('keydown', this.onKeyboardMove);
    document.addEventListener('visibilitychange', this.onVisibilityChange);
    this.app.ticker.add(this.onTick);
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
    this.world.position.set(transform.x, transform.y);
    this.world.scale.set(transform.scale);
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

  private pathToAdjacentCell(
    store: GameStore,
    placements: Placement[],
    target: GridPoint,
  ): boolean {
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
      return false;
    }
    this.setNavigationPath(path);
    return true;
  }

  private pathToGuestServiceCell(
    store: GameStore,
    placements: Placement[],
    seat: GridPoint,
  ): boolean {
    const blocked = this.playerBlockedCells(store, placements);
    const path = findShortestPathToAny(
      { w: store.gridSize.w, h: store.gridSize.h, blocked },
      this.nav.position,
      guestServicePositions(seat),
    );
    if (!path) {
      store.setFloorToast('No clear route');
      return false;
    }
    this.setNavigationPath(path);
    return true;
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
    this.setNavigationPath(path, { preserveSeatingIntent: true });
    return { ...destination };
  }

  private setNavigationPath(
    path: GridPoint[],
    opts: { preserveSeatingIntent?: boolean } = {},
  ): void {
    if (!opts.preserveSeatingIntent) this.cancelPendingSeatingIntent();
    this.nav.setPath(path);
  }

  private snapNavigationTo(cell: GridPoint): void {
    this.cancelPendingSeatingIntent();
    this.nav.snapTo(cell);
  }

  private cancelPendingSeatingIntent(): void {
    this.pendingSeatingIntent = null;
  }

  private pendingSeatingIntentIsValid(store: GameStore): boolean {
    const intent = this.pendingSeatingIntent;
    const floor = store.activeDay?.floor;
    return Boolean(
      intent &&
        store.activeDay?.seed === intent.daySeed &&
        getGameplayInteractionGeneration() === intent.interactionGeneration &&
        floor?.pool.some(
          (guest) => guest.id === intent.guestId && guest.stage === 'waiting',
        ) &&
        this.navMatchesSeatingDestination(intent.destination) &&
        selectCanRequestSeatFloorGuest(store) &&
        selectFloorRuntimeRunning(
          store,
          document.visibilityState === 'visible',
        ),
    );
  }

  private navMatchesSeatingDestination(destination: GridPoint): boolean {
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

  private completePendingSeatingIntent(): void {
    if (!this.pendingSeatingIntent || this.nav.isMoving) return;
    const store = useGameStore.getState();
    if (!this.pendingSeatingIntentIsValid(store)) {
      this.cancelPendingSeatingIntent();
      return;
    }
    if (!selectCanSeatFloorGuest(store)) {
      // A completed route that did not reach a canonical service position must
      // not leave a latent action that could fire after unrelated movement.
      this.cancelPendingSeatingIntent();
      return;
    }

    // Clear before dispatch: synchronous subscribers and repeated ticks can
    // never apply this request twice.
    this.cancelPendingSeatingIntent();
    void store.dispatch({ type: 'FLOOR_SEAT_NEXT' });
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

    const activeIntent = this.pendingSeatingIntent;
    if (
      activeIntent &&
      activeIntent.daySeed === store.activeDay!.seed &&
      activeIntent.guestId === waiting.id &&
      activeIntent.interactionGeneration === getGameplayInteractionGeneration() &&
      this.pendingSeatingIntentIsValid(store)
    ) {
      // Repeated taps on the same waiting guest/CTA retain the in-flight route.
      // They neither restart movement nor enqueue a second reducer action.
      return true;
    }
    this.cancelPendingSeatingIntent();

    if (!this.nav.isMoving && selectCanSeatFloorGuest(store)) {
      void store.dispatch({ type: 'FLOOR_SEAT_NEXT' });
      return true;
    }

    const destination = this.pathToWaitingGuestServiceCell(
      store,
      this.roomPlacements(store),
    );
    if (!destination) return false;
    this.pendingSeatingIntent = {
      revision: this.nextPendingSeatingIntentRevision++,
      daySeed: store.activeDay!.seed,
      guestId: waiting.id,
      interactionGeneration: getGameplayInteractionGeneration(),
      destination,
    };
    return true;
  }

  /** Read-only test/debug view of the currently armed seating interaction. */
  getPendingSeatingIntentDebug(): Readonly<{
    revision: number;
    destination: Readonly<GridPoint>;
  }> | null {
    const intent = this.pendingSeatingIntent;
    if (!intent) return null;
    return {
      revision: intent.revision,
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
      return [{
        ...visual,
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
  }> | null {
    const target = this.actorLayer
      .getGuestWorldHitTargets()
      .find((candidate) => candidate.guestId === guestId);
    if (!target) return null;
    const overlap = this.furnitureLayer.findOpaqueTableOcclusionPoint(
      target.bounds,
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
    if (bodyHit) {
      // Actor rendering trails state updates by at most one frame. Re-read the
      // live floor snapshot before turning a painted body into a command.
      const liveGuest = floor.pool.find(
        (guest) => guest.id === bodyHit.guestId,
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
    const deltaMs = resumeSafeFloorDeltaMs(
      runtimeRunning,
      this.floorRuntimeWasRunning,
      this.app.ticker.deltaMS,
    );
    this.floorRuntimeWasRunning = runtimeRunning;
    if (!runtimeRunning || !floor) {
      this.cancelPendingSeatingIntent();
      return;
    }
    if (deltaMs === 0) return;

    this.nav.update(deltaMs);
    useGameStore.getState().setFloorNavPosition(this.nav.position);
    this.completePendingSeatingIntent();

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
      this.actorLayer.sync(liveFloor, this.nav, this.guestMotion);
    } else {
      this.actorLayer.sync(null, this.nav, null, {
        showPlayerWithoutFloor: true,
        playerCarrying: liveFloor.carriedTicketId != null,
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
    this.camera.followWorldPointSmooth(
      player.x,
      player.y,
      width,
      height,
      mapWpx,
      mapHpx,
    );
    this.applyCamera();
    const doorOpen =
      state.activeFloorRoom === 'main' &&
      this.guestMotion.isDoorBusy(liveFloor, door);
    this.gridLayer.sync(state.gridSize.w, state.gridSize.h, this.camera.state, {
      doorOpen,
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
    const interactionHints = !selectShowFloorInteractionCues(state)
      ? []
      : state.activeFloorRoom === 'main'
        ? this.computeInteractHints(
            liveFloor,
            roomPlacements,
            this.nav.position,
            stationNeedsAttention,
          )
        : this.computeStationHints(roomPlacements, stationNeedsAttention);
    this.interactHintLayer.sync(interactionHints);
  };

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
    if (
      typeof canvas.animate !== 'function' ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      changeRoom();
      return;
    }

    this.roomTransitionInFlight = true;
    canvas.style.pointerEvents = 'none';
    void this.runRoomTransition(changeRoom);
  }

  private async runRoomTransition(changeRoom: () => boolean): Promise<void> {
    const canvas = this.app.canvas;
    let roomChanged = false;
    try {
      canvas.dataset.roomTransition = 'out';
      const fadeOut = canvas.animate(
        [{ opacity: 1 }, { opacity: 0 }],
        {
          duration: ROOM_FADE_OUT_MS,
          easing: 'ease-in',
          fill: 'forwards',
        },
      );
      this.roomTransitionAnimation = fadeOut;
      await fadeOut.finished;
      fadeOut.cancel();

      if (!this.mounted) return;
      roomChanged = changeRoom();
      if (!roomChanged) return;

      canvas.dataset.roomTransition = 'in';
      const fadeIn = canvas.animate(
        [{ opacity: 0 }, { opacity: 1 }],
        {
          duration: ROOM_FADE_IN_MS,
          easing: 'ease-out',
          fill: 'forwards',
        },
      );
      this.roomTransitionAnimation = fadeIn;
      await fadeIn.finished;
      fadeIn.cancel();
    } catch {
      // Cancellation during teardown is expected. If animation support fails
      // while still mounted, preserve the doorway action without the effect.
      if (this.mounted && !roomChanged) changeRoom();
    } finally {
      this.roomTransitionAnimation = null;
      this.roomTransitionInFlight = false;
      delete canvas.dataset.roomTransition;
      canvas.style.removeProperty('opacity');
      canvas.style.removeProperty('pointer-events');
    }
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
    if (
      store.activeFloorRoom === 'main' &&
      this.waitingGuestHitAtWorldPoint(floor, world)
    ) {
      this.requestSeatNextGuest();
      return;
    }

    // Any other direct world command replaces a queued seating request. Check
    // the waiting actor first so repeated taps preserve the active request.
    this.cancelPendingSeatingIntent();

    if (isConnectingDoorCell(store, store.activeFloorRoom, gx, gy)) {
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
          tappedGuest.stage === 'ordered'
        ) {
          if (!playerNearGuestSeat(player, tappedGuest)) {
            this.pathToGuestServiceCell(store, roomPlacements, tappedGuest.seat!);
            return;
          }
          const deliveryGeneration = getGameplayInteractionGeneration();
          this.deliveryAttempts.start(
            ticket.id,
            async () => {
              await store.dispatch({
                type: 'FLOOR_DELIVER',
                ticketId: ticket.id,
              });
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
          return;
        }

        store.setFloorToast('Wrong table — deliver to the matching guest');
        return;
      }

      if (!floor.carriedTicketId && tappedGuest?.stage === 'seated') {
        if (!canEnqueue(floor.tickets, 1)) {
          store.setFloorToast(formatTicketCapacityFullMessage(floor.tickets));
          return;
        }
        if (!playerNearGuestSeat(player, tappedGuest)) {
          this.pathToGuestServiceCell(store, roomPlacements, tappedGuest.seat!);
          return;
        }
        void store.dispatch({
          type: 'FLOOR_TAKE_ORDERS',
          customerIds: [tappedGuest.customer.id],
        });
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
        store.setFloorToast('Deliver the carried dish first');
        return;
      }
      if (!floor.tickets.some((ticket) => ticket.status === 'open')) {
        store.setFloorToast('No open ticket to cook');
        return;
      }
      const player = store.floorPlayerGrid ?? floor.playerPosition;
      if (!playerNearPlacement(player, station)) {
        this.pathToAdjacentCell(store, roomPlacements, tapCell);
        return;
      }
      if (selectCanOpenFloorCompose(store)) {
        store.openComposeSheet();
        return;
      }
      store.setFloorToast('No open ticket to cook');
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
          if (!playerNearPlacement(player, tappedPlacement)) {
            this.pathToAdjacentCell(store, roomPlacements, tapCell);
            return;
          }
          void store.dispatch({
            type:
              table.state === 'unset'
                ? 'FLOOR_SET_TABLE'
                : 'FLOOR_CLEAR_TABLE',
            placementId: table.placementId,
          });
          return;
        }
        return;
      }
    }

    if (store.composeSheetOpen) {
      store.closeComposeSheet();
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

  private onKeyboardMove = (event: KeyboardEvent): void => {
    if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
    const target = event.target;
    if (
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      target instanceof HTMLSelectElement ||
      (target instanceof HTMLElement && target.isContentEditable)
    ) {
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
      kitchenAnnexOwned: state.kitchenAnnexOwned,
      room: state.activeFloorRoom,
      showGrid: state.editLayoutMode,
    });
  };

  private onVisibilityChange = (): void => {
    if (document.visibilityState !== 'visible') {
      this.floorRuntimeWasRunning = false;
      this.cancelPendingSeatingIntent();
    }
  };

  syncFromStore(state: GameStore): void {
    if (
      this.pendingSeatingIntent &&
      !this.pendingSeatingIntentIsValid(state)
    ) {
      this.cancelPendingSeatingIntent();
    }
    const width = this.app.screen.width;
    const height = this.app.screen.height;
    const floor = state.activeDay?.floor;
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
        door: doorForGrid(state.gridSize.w, state.gridSize.h, { room: 'main' }),
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
        });
      } else {
        this.actorLayer.sync(null, this.nav, null, {
          showPlayerWithoutFloor: true,
          playerCarrying: floor.carriedTicketId != null,
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
      this.actorLayer.sync(null, this.nav);
      this.camera.centerOnGrid(
        state.gridSize.w,
        state.gridSize.h,
        width,
        height,
      );
    }

    this.applyCamera();
    this.gridLayer.sync(state.gridSize.w, state.gridSize.h, this.camera.state, {
      kitchenAnnexOwned: state.kitchenAnnexOwned,
      room: state.activeFloorRoom,
      showGrid: state.editLayoutMode,
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

  private computeStationHints(
    placements: Placement[],
    stationNeedsAttention: boolean,
  ): { x: number; y: number }[] {
    if (!stationNeedsAttention) return [];
    const hints: { x: number; y: number }[] = [];
    for (const placement of placements) {
      if (!isCookStationItemKey(placement.itemKey)) continue;
      hints.push({ x: placement.x, y: placement.y });
    }
    return hints;
  }

  private computeInteractHints(
    floor: FloorDay,
    placements: Placement[],
    player: { x: number; y: number },
    stationNeedsAttention: boolean,
  ): { x: number; y: number }[] {
    const hints: { x: number; y: number }[] = [];
    const seen = new Set<string>();
    const orderAvailable = canEnqueue(floor.tickets, 1);
    const add = (x: number, y: number): void => {
      const key = `${x},${y}`;
      if (seen.has(key)) return;
      seen.add(key);
      hints.push({ x, y });
    };

    const placementById = new Map(placements.map((p) => [p.id, p]));

    for (const table of floor.tables) {
      if (table.state !== 'unset' && table.state !== 'dirty') continue;
      const placement = placementById.get(table.placementId);
      if (!placement) continue;

      const tableAdjacent =
        playerNearPlacement(player, placement) ||
        floor.seats
          .filter((seat) => seat.tablePlacementId === table.placementId)
          .some((seat) => isAdjacent(player, seat));

      if (tableAdjacent) {
        add(placement.x, placement.y);
      }
    }

    const carriedTicket = floor.tickets.find(
      (ticket) =>
        ticket.id === floor.carriedTicketId && ticket.status === 'plated',
    );
    if (carriedTicket) {
      const guest = floor.pool.find(
        (candidate) => candidate.customer.id === carriedTicket.customerId,
      );
      if (
        guest?.seat &&
        guestHintAction(
          guest.stage,
          playerNearGuestSeat(player, guest),
          'matching',
          orderAvailable,
        ) === 'deliver'
      ) {
        add(guest.seat.x, guest.seat.y);
      }
    } else {
      if (stationNeedsAttention) {
        for (const placement of placements) {
          if (!isCookStationItemKey(placement.itemKey)) continue;
          add(placement.x, placement.y);
        }
      }

      for (const guest of floor.pool) {
        if (
          guest.seat &&
          guestHintAction(
            guest.stage,
            playerNearGuestSeat(player, guest),
            'none',
            orderAvailable,
          ) === 'order'
        ) {
          add(guest.seat.x, guest.seat.y);
        }
      }
    }

    return hints;
  }

  getCustomerScreenAnchor(): { x: number; y: number } | null {
    const world = this.customerLayer.getAnchorWorldPosition();
    if (!world) return null;
    const rect = this.app.canvas.getBoundingClientRect();
    const screen = worldToScreen(world.x, world.y, this.camera.state);
    return {
      x: rect.left + screen.x,
      y: rect.top + screen.y,
    };
  }

  getPlayerScreenFeetAnchor(): { x: number; y: number } {
    const world = this.actorLayer.getPlayerFeetWorldPosition();
    const rect = this.app.canvas.getBoundingClientRect();
    const screen = worldToScreen(world.x, world.y, this.camera.state);
    return {
      x: rect.left + screen.x,
      y: rect.top + screen.y,
    };
  }

  getGuestScreenFeetAnchor(guestId: string): { x: number; y: number } | null {
    const world = this.actorLayer.getGuestFeetWorldPosition(guestId);
    if (!world) return null;
    const rect = this.app.canvas.getBoundingClientRect();
    const screen = worldToScreen(world.x, world.y, this.camera.state);
    return {
      x: rect.left + screen.x,
      y: rect.top + screen.y,
    };
  }

  getGuestScreenAnchor(guestId: string): { x: number; y: number } | null {
    const world = this.actorLayer.getGuestWorldPosition(guestId);
    if (!world) return null;
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
    this.roomTransitionInFlight = false;
    delete this.app.canvas.dataset.roomTransition;
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
    this.app.ticker.remove(this.onTick);
    this.unsubscribe?.();
    this.dragPlacement.detach();
    this.app.destroy(true, { children: true, texture: true });
    this.mounted = false;
  }
}
