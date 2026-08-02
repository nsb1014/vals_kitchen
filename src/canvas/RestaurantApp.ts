import { Application, Container } from 'pixi.js';
import type { GameStore } from '../store/game-store.ts';
import { useGameStore } from '../store/game-store.ts';
import {
  findPath,
  findShortestPathToAny,
  type GridPoint,
} from '../domain/floor/pathfinding.ts';
import {
  findCookStationPlacementAtCell,
  isAdjacent,
  isCookStationItemKey,
  playerNearGuestSeat,
  playerNearPlacement,
} from '../domain/floor/interact.ts';
import type { FloorDay } from '../domain/floor/types.ts';
import type { Placement } from '../domain/state/game-state.ts';
import { seatsFromPlacements } from '../domain/floor/seats.ts';
import { CustomerLayer } from './layers/CustomerLayer.ts';
import { FurnitureLayer } from './layers/FurnitureLayer.ts';
import { GridLayer } from './layers/GridLayer.ts';
import { InteractHintLayer } from './layers/InteractHintLayer.ts';
import { PreviewLayer } from './layers/PreviewLayer.ts';
import { Camera, worldTransformFromCamera } from './systems/Camera.ts';
import { DragPlacement } from './systems/DragPlacement.ts';
import { ActorLayer } from './world/ActorLayer.ts';
import { walkBlockedCells } from './world/blocked-cells.ts';
import { GuestMotion } from './world/GuestMotion.ts';
import { NavController } from './world/NavController.ts';
import {
  connectingDoorInterior,
  doorForGrid,
  type FloorRoomId,
} from '../domain/floor/starter-map.ts';
import { isConnectingDoorCell } from '../domain/economy/purchases.ts';
import { selectCanOpenFloorCompose } from '../store/selectors/service-day.ts';
import {
  resumeSafeFloorDeltaMs,
  selectFloorRuntimeRunning,
} from '../store/selectors/floor-runtime.ts';
import { screenToGrid, TILE_PX, worldToScreen } from './coordinates.ts';
import { tableServiceVisualStates } from './table-service-visual.ts';
function integerResolution(): number {
  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
  return Math.max(1, Math.round(dpr));
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

  private pathToAdjacentCell(
    store: GameStore,
    placements: Placement[],
    target: GridPoint,
  ): boolean {
    const blocked = walkBlockedCells(
      placements,
      store.gridSize.w,
      store.gridSize.h,
      this.walkOpts(store),
    );
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
    this.nav.setPath(path);
    return true;
  }

  private onTick = (): void => {
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
    if (!runtimeRunning || !floor || deltaMs === 0) return;

    this.nav.update(deltaMs);
    useGameStore.getState().setFloorNavPosition(this.nav.position);

    // Room transition when the cook steps onto the connecting door.
    if (
      isConnectingDoorCell(
        state,
        state.activeFloorRoom,
        this.nav.position.x,
        this.nav.position.y,
      )
    ) {
      const entered = useGameStore.getState().enterConnectingDoor();
      if (entered) {
        const next = useGameStore.getState();
        const spawn = connectingDoorInterior(
          next.activeFloorRoom,
          next.gridSize.w,
          next.gridSize.h,
        );
        this.nav.snapTo(spawn);
        this.syncFromStore(next);
        return;
      }
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
    this.interactHintLayer.sync(
      state.activeFloorRoom === 'main'
        ? this.computeInteractHints(
            liveFloor,
            roomPlacements,
            this.nav.position,
            liveFloor.tickets.some((ticket) => ticket.status === 'open') &&
              !liveFloor.carriedTicketId,
          )
        : this.computeStationHints(
            roomPlacements,
            liveFloor.tickets.some((ticket) => ticket.status === 'open') &&
              !liveFloor.carriedTicketId,
          ),
    );
  };

  private onTapMove = (event: PointerEvent): void => {
    const store = useGameStore.getState();
    if (
      !selectFloorRuntimeRunning(
        store,
        document.visibilityState === 'visible',
      ) ||
      store.composeSheetOpen
    ) {
      return;
    }
    const floor = store.activeDay?.floor;
    if (!floor) return;

    const rect = this.app.canvas.getBoundingClientRect();
    const sx = event.clientX - rect.left;
    const sy = event.clientY - rect.top;
    const { gx, gy } = screenToGrid(sx, sy, this.camera.state);
    const tapCell = { x: gx, y: gy };
    const roomPlacements = this.roomPlacements(store);
    if (isConnectingDoorCell(store, store.activeFloorRoom, gx, gy)) {
      const blocked = walkBlockedCells(
        roomPlacements,
        store.gridSize.w,
        store.gridSize.h,
        this.walkOpts(store),
      );
      const path = findPath(
        { w: store.gridSize.w, h: store.gridSize.h, blocked },
        this.nav.position,
        tapCell,
      );
      if (path) {
        this.nav.setPath(path);
      } else {
        store.setFloorToast('No clear route');
      }
      return;
    }

    if (store.activeFloorRoom === 'main') {
      const tappedGuest = floor.pool.find(
        (candidate) =>
          candidate.seat?.x === tapCell.x &&
          candidate.seat.y === tapCell.y &&
          candidate.stage !== 'leaving' &&
          candidate.stage !== 'done',
      );
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
            this.pathToAdjacentCell(store, roomPlacements, tapCell);
            return;
          }
          void store.dispatch({ type: 'FLOOR_DELIVER', ticketId: ticket.id });
          return;
        }

        store.setFloorToast('Wrong table — deliver to the matching guest');
        return;
      }

      if (!floor.carriedTicketId && tappedGuest?.stage === 'seated') {
        if (!playerNearGuestSeat(player, tappedGuest)) {
          this.pathToAdjacentCell(store, roomPlacements, tapCell);
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

    const blocked = walkBlockedCells(
      roomPlacements,
      store.gridSize.w,
      store.gridSize.h,
      this.walkOpts(store),
    );
    const path = findPath(
      { w: store.gridSize.w, h: store.gridSize.h, blocked },
      this.nav.position,
      tapCell,
    );
    if (path) {
      this.nav.setPath(path);
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
      return;
    }

    event.preventDefault();
    const targetCell = {
      x: this.nav.position.x + delta.x,
      y: this.nav.position.y + delta.y,
    };
    const roomPlacements = this.roomPlacements(store);
    const blocked = walkBlockedCells(
      roomPlacements,
      store.gridSize.w,
      store.gridSize.h,
      this.walkOpts(store),
    );
    const path = findPath(
      { w: store.gridSize.w, h: store.gridSize.h, blocked },
      this.nav.position,
      targetCell,
    );
    if (path) this.nav.setPath(path);
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
    }
  };

  syncFromStore(state: GameStore): void {
    const width = this.app.screen.width;
    const height = this.app.screen.height;
    const floor = state.activeDay?.floor;
    const mapWpx = state.gridSize.w * TILE_PX;
    const mapHpx = state.gridSize.h * TILE_PX;
    const roomPlacements = this.roomPlacements(state);

    if (floor) {
      const daySeed = state.activeDay?.seed ?? null;
      if (daySeed !== this.lastFloorSeed) {
        this.nav.snapTo(floor.playerPosition);
        this.lastFloorSeed = daySeed;
        this.lastRoom = 'main';
        this.eatingTickAccumulatorMs = 0;
      } else if (this.lastRoom !== state.activeFloorRoom) {
        const spawn = connectingDoorInterior(
          state.activeFloorRoom,
          state.gridSize.w,
          state.gridSize.h,
        );
        this.nav.snapTo(state.floorPlayerGrid ?? spawn);
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
        this.actorLayer.sync(floor, this.nav, this.guestMotion);
      } else {
        this.actorLayer.sync(null, this.nav, null, {
          showPlayerWithoutFloor: true,
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

    if (!floor || state.editLayoutMode) {
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

    if (floor.carriedTicketId) {
      const ticket = floor.tickets.find((t) => t.id === floor.carriedTicketId);
      if (ticket) {
        const guest = floor.pool.find(
          (g) => g.customer.id === ticket.customerId,
        );
        if (guest?.seat && isAdjacent(player, guest.seat)) {
          add(guest.seat.x, guest.seat.y);
        }
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
          (guest.stage === 'seated' || guest.stage === 'ordered') &&
          guest.seat &&
          isAdjacent(player, guest.seat)
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

  destroy(): void {
    if (!this.mounted) return;
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
