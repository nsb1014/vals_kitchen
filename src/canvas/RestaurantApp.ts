import { Application, Container } from 'pixi.js';
import type { GameStore } from '../store/game-store.ts';
import { useGameStore } from '../store/game-store.ts';
import { findPath } from '../domain/floor/pathfinding.ts';
import {
  isAdjacent,
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
import { blockedCellsFromPlacements } from './world/blocked-cells.ts';
import { GuestMotion } from './world/GuestMotion.ts';
import { NavController } from './world/NavController.ts';
import { STARTER_DOOR } from '../domain/floor/starter-map.ts';
import { screenToGrid, TILE_PX, worldToScreen } from './coordinates.ts';
function integerResolution(): number {
  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
  return Math.max(1, Math.round(dpr));
}

export class RestaurantApp {
  readonly app: Application;
  readonly world: Container;
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
  private eatingTickAccumulatorMs = 0;

  private static readonly EATING_TICK_INTERVAL_MS = 1000;

  private constructor(app: Application) {
    this.app = app;
    this.world = new Container();
    this.camera = new Camera();
    this.gridLayer = new GridLayer();
    this.furnitureLayer = new FurnitureLayer();
    this.actorLayer = new ActorLayer();
    this.customerLayer = new CustomerLayer();
    this.previewLayer = new PreviewLayer();
    this.interactHintLayer = new InteractHintLayer();
    this.nav = new NavController({ x: 1, y: 1 });
    this.guestMotion = new GuestMotion();

    this.world.addChild(this.gridLayer.view);
    this.world.addChild(this.furnitureLayer.view);
    this.world.addChild(this.interactHintLayer.view);
    this.world.addChild(this.actorLayer.view);
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
    app.canvas.style.touchAction = 'none';

    const instance = new RestaurantApp(app);
    instance.mounted = true;
    return instance;
  }

  start(): void {
    this.dragPlacement.attach();
    this.app.canvas.addEventListener('pointerdown', this.onTapMove);
    this.app.ticker.add(this.onTick);
    this.unsubscribe = useGameStore.subscribe((state, prev) => {
      if (
        state.placements !== prev.placements ||
        state.gridSize !== prev.gridSize ||
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
    this.handleResize();
  }

  private applyCamera(): void {
    const transform = worldTransformFromCamera(this.camera.state);
    this.world.position.set(transform.x, transform.y);
    this.world.scale.set(transform.scale);
  }

  private onTick = (): void => {
    const state = useGameStore.getState();
    const floor = state.activeDay?.floor;
    if (!floor || state.editLayoutMode) return;

    this.nav.update(this.app.ticker.deltaMS);
    useGameStore.getState().setFloorNavPosition(this.nav.position);
    const blocked = blockedCellsFromPlacements(state.placements);
    this.guestMotion.sync(floor, {
      door: STARTER_DOOR,
      grid: { w: state.gridSize.w, h: state.gridSize.h, blocked },
      dtMs: this.app.ticker.deltaMS,
    });
    this.actorLayer.sync(floor, this.nav, this.guestMotion);

    if (floor.pool.some((g) => g.stage === 'eating' || g.stage === 'leaving')) {
      this.eatingTickAccumulatorMs += this.app.ticker.deltaMS;
      while (this.eatingTickAccumulatorMs >= RestaurantApp.EATING_TICK_INTERVAL_MS) {
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
    this.camera.followWorldPointSmooth(player.x, player.y, width, height, mapWpx, mapHpx);
    this.applyCamera();
    this.gridLayer.sync(state.gridSize.w, state.gridSize.h, this.camera.state);
    this.interactHintLayer.sync(
      this.computeInteractHints(floor, state.placements, this.nav.position),
    );
  };

  private onTapMove = (event: PointerEvent): void => {
    const store = useGameStore.getState();
    if (store.editLayoutMode || !store.activeDay?.floor) return;

    const rect = this.app.canvas.getBoundingClientRect();
    const sx = event.clientX - rect.left;
    const sy = event.clientY - rect.top;
    const { gx, gy } = screenToGrid(sx, sy, this.camera.state);
    const tapCell = { x: gx, y: gy };
    const floor = store.activeDay.floor;

    if (floor.carriedTicketId) {
      const ticket = floor.tickets.find((t) => t.id === floor.carriedTicketId);
      if (ticket) {
        const guest = floor.pool.find((g) => g.customer.id === ticket.customerId);
        if (guest?.seat && isAdjacent(tapCell, guest.seat)) {
          void store.dispatch({ type: 'FLOOR_DELIVER', ticketId: ticket.id });
          return;
        }
        const wrongSeat = floor.pool.some(
          (g) =>
            g.customer.id !== ticket.customerId &&
            g.stage === 'ordered' &&
            playerNearGuestSeat(tapCell, g),
        );
        if (wrongSeat) {
          store.setFloorToast('Wrong table — deliver to the matching guest');
          return;
        }
      }
    }

    const blocked = blockedCellsFromPlacements(store.placements);
    const path = findPath(
      { w: store.gridSize.w, h: store.gridSize.h, blocked },
      this.nav.position,
      tapCell,
    );
    if (path) {
      this.nav.setPath(path);
    }
  };

  private handleResize = (): void => {
    const width = this.app.screen.width;
    const height = this.app.screen.height;
    const state = useGameStore.getState();
    if (state.activeDay?.floor && !state.editLayoutMode) {
      const mapWpx = state.gridSize.w * TILE_PX;
      const mapHpx = state.gridSize.h * TILE_PX;
      const player = this.actorLayer.getPlayerWorldPosition();
      this.camera.followWorldPoint(player.x, player.y, width, height, mapWpx, mapHpx);
    } else {
      this.camera.centerOnGrid(state.gridSize.w, state.gridSize.h, width, height);
    }
    this.applyCamera();
    this.gridLayer.sync(state.gridSize.w, state.gridSize.h, this.camera.state);
  };

  syncFromStore(state: GameStore): void {
    const width = this.app.screen.width;
    const height = this.app.screen.height;
    const floor = state.activeDay?.floor;
    const mapWpx = state.gridSize.w * TILE_PX;
    const mapHpx = state.gridSize.h * TILE_PX;

    if (floor) {
      // Only reseat the player when a new service day starts — floor object
      // identity changes on every reducer action and must not cancel walks.
      const daySeed = state.activeDay?.seed ?? null;
      if (daySeed !== this.lastFloorSeed) {
        this.nav.snapTo(floor.playerPosition);
        this.lastFloorSeed = daySeed;
        this.eatingTickAccumulatorMs = 0;
      }
      this.guestMotion.sync(floor, {
        door: STARTER_DOOR,
        grid: {
          w: state.gridSize.w,
          h: state.gridSize.h,
          blocked: blockedCellsFromPlacements(state.placements),
        },
        dtMs: 0,
      });
      this.actorLayer.sync(floor, this.nav, this.guestMotion);
      if (!state.editLayoutMode) {
        const player = this.actorLayer.getPlayerWorldPosition();
        this.camera.followWorldPoint(player.x, player.y, width, height, mapWpx, mapHpx);
      } else {
        this.camera.centerOnGrid(state.gridSize.w, state.gridSize.h, width, height);
      }
    } else {
      this.lastFloorSeed = null;
      this.actorLayer.sync(null, this.nav);
      this.camera.centerOnGrid(state.gridSize.w, state.gridSize.h, width, height);
    }

    this.applyCamera();
    this.gridLayer.sync(state.gridSize.w, state.gridSize.h, this.camera.state);
    this.furnitureLayer.sync(
      state.placements,
      state.editLayoutMode,
      state.activeDay?.floor?.seats ?? seatsFromPlacements(state.placements),
    );

    if (floor) {
      this.customerLayer.sync(-1, state.placements, false);
    } else {
      const queueIndex = state.activeDay?.queueIndex ?? -1;
      this.customerLayer.sync(queueIndex, state.placements, Boolean(state.activeDay));
    }

    if (!state.editLayoutMode) {
      this.previewLayer.hide();
    }

    if (!floor || state.editLayoutMode) {
      this.interactHintLayer.clear();
    }
  }

  private computeInteractHints(
    floor: FloorDay,
    placements: Placement[],
    player: { x: number; y: number },
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
        const guest = floor.pool.find((g) => g.customer.id === ticket.customerId);
        if (guest?.seat && isAdjacent(player, guest.seat)) {
          add(guest.seat.x, guest.seat.y);
        }
      }
    } else {
      if (floor.selectedTicketId) {
        for (const placement of placements) {
          if (
            placement.itemKey.startsWith('table') ||
            placement.itemKey.startsWith('chair') ||
            placement.itemKey.startsWith('decor')
          ) {
            continue;
          }
          if (playerNearPlacement(player, placement)) {
            add(placement.x, placement.y);
          }
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

  destroy(): void {
    if (!this.mounted) return;
    window.removeEventListener('resize', this.handleResize);
    this.app.canvas.removeEventListener('pointerdown', this.onTapMove);
    this.app.ticker.remove(this.onTick);
    this.unsubscribe?.();
    this.dragPlacement.detach();
    this.app.destroy(true, { children: true, texture: true });
    this.mounted = false;
  }
}
