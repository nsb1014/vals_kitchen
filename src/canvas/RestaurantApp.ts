import { Application, Container } from 'pixi.js';
import type { GameStore } from '../store/game-store.ts';
import { useGameStore } from '../store/game-store.ts';
import { CustomerLayer } from './layers/CustomerLayer.ts';
import { FurnitureLayer } from './layers/FurnitureLayer.ts';
import { GridLayer } from './layers/GridLayer.ts';
import { PreviewLayer } from './layers/PreviewLayer.ts';
import { Camera } from './systems/Camera.ts';
import { DragPlacement } from './systems/DragPlacement.ts';

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
  readonly customerLayer: CustomerLayer;
  readonly previewLayer: PreviewLayer;
  readonly dragPlacement: DragPlacement;

  private unsubscribe: (() => void) | null = null;
  private mounted = false;

  private constructor(app: Application) {
    this.app = app;
    this.world = new Container();
    this.camera = new Camera();
    this.gridLayer = new GridLayer();
    this.furnitureLayer = new FurnitureLayer();
    this.customerLayer = new CustomerLayer();
    this.previewLayer = new PreviewLayer();

    this.world.addChild(this.gridLayer.view);
    this.world.addChild(this.furnitureLayer.view);
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
      background: '#1a1a2e',
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
    this.unsubscribe = useGameStore.subscribe((state, prev) => {
      if (
        state.placements !== prev.placements ||
        state.gridSize !== prev.gridSize ||
        state.editLayoutMode !== prev.editLayoutMode ||
        state.activeDay !== prev.activeDay ||
        state.activeDay?.queueIndex !== prev.activeDay?.queueIndex
      ) {
        this.syncFromStore(state);
      }
    });
    this.syncFromStore(useGameStore.getState());
    window.addEventListener('resize', this.handleResize);
    this.handleResize();
  }

  private handleResize = (): void => {
    const width = this.app.screen.width;
    const height = this.app.screen.height;
    const state = useGameStore.getState();
    this.camera.centerOnGrid(state.gridSize.w, state.gridSize.h, width, height);
    this.world.position.set(this.camera.state.stageOffsetX, this.camera.state.stageOffsetY);
    this.gridLayer.sync(state.gridSize.w, state.gridSize.h, this.camera.state);
  };

  syncFromStore(state: GameStore): void {
    const width = this.app.screen.width;
    const height = this.app.screen.height;
    this.camera.centerOnGrid(state.gridSize.w, state.gridSize.h, width, height);
    this.world.position.set(this.camera.state.stageOffsetX, this.camera.state.stageOffsetY);
    this.gridLayer.sync(state.gridSize.w, state.gridSize.h, this.camera.state);
    this.furnitureLayer.sync(state.placements, state.editLayoutMode);
    const queueIndex = state.activeDay?.queueIndex ?? -1;
    this.customerLayer.sync(queueIndex, state.placements, Boolean(state.activeDay));
    if (!state.editLayoutMode) {
      this.previewLayer.hide();
    }
  }

  getCustomerScreenAnchor(): { x: number; y: number } | null {
    const world = this.customerLayer.getAnchorWorldPosition();
    if (!world) return null;
    const rect = this.app.canvas.getBoundingClientRect();
    const screenX = world.x - this.camera.state.x + this.camera.state.stageOffsetX;
    const screenY = world.y - this.camera.state.y + this.camera.state.stageOffsetY;
    return {
      x: rect.left + screenX,
      y: rect.top + screenY,
    };
  }

  destroy(): void {
    if (!this.mounted) return;
    window.removeEventListener('resize', this.handleResize);
    this.unsubscribe?.();
    this.dragPlacement.detach();
    this.app.destroy(true, { children: true, texture: true });
    this.mounted = false;
  }
}
