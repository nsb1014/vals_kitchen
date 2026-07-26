import { nextPlacementId } from '../../domain/state/game-state.ts';
import type { Placement } from '../../domain/state/game-state.ts';
import { isConnectingDoorCell } from '../../domain/economy/purchases.ts';
import type { GameStore } from '../../store/game-store.ts';
import {
  computeGrabOffset,
  screenToDragGrid,
  screenToGrid,
  screenToWorld,
  type Point,
} from '../coordinates.ts';
import type { Camera } from './Camera.ts';
import type { FurnitureLayer } from '../layers/FurnitureLayer.ts';
import type { PreviewLayer } from '../layers/PreviewLayer.ts';

interface DragState {
  placementId: string;
  itemKey: string;
  pointerId: number;
  grabOffset: Point;
}

export class DragPlacement {
  private drag: DragState | null = null;

  constructor(
    private readonly getStore: () => GameStore,
    private readonly camera: Camera,
    private readonly furnitureLayer: FurnitureLayer,
    private readonly previewLayer: PreviewLayer,
    private readonly canvas: HTMLCanvasElement,
  ) {}

  attach(): void {
    this.canvas.addEventListener('pointerdown', this.onPointerDown);
    this.canvas.addEventListener('pointermove', this.onPointerMove);
    this.canvas.addEventListener('pointerup', this.onPointerUp);
    this.canvas.addEventListener('pointercancel', this.onPointerUp);
  }

  detach(): void {
    this.canvas.removeEventListener('pointerdown', this.onPointerDown);
    this.canvas.removeEventListener('pointermove', this.onPointerMove);
    this.canvas.removeEventListener('pointerup', this.onPointerUp);
    this.canvas.removeEventListener('pointercancel', this.onPointerUp);
    this.drag = null;
    this.previewLayer.hide();
  }

  private onPointerDown = (event: PointerEvent): void => {
    const store = this.getStore();
    if (!store.editLayoutMode) return;

    const rect = this.canvas.getBoundingClientRect();
    const sx = event.clientX - rect.left;
    const sy = event.clientY - rect.top;
    const world = screenToWorld(sx, sy, this.camera.state);
    const { gx, gy } = screenToGrid(sx, sy, this.camera.state);

    if (store.pendingPlacementItemKey) {
      const candidate: Placement = {
        id: nextPlacementId(),
        itemKey: store.pendingPlacementItemKey,
        x: gx,
        y: gy,
        rotation: 0,
      };
      if (store.canPlaceAt(candidate)) {
        void store.dispatch({
          type: 'PLACE_ITEM',
          placement: candidate,
          room: store.activeFloorRoom,
        });
        store.cancelPlacement();
      }
      return;
    }

    // Tap connecting door (without a drag) to switch rooms while editing.
    if (isConnectingDoorCell(store, store.activeFloorRoom, gx, gy)) {
      store.enterConnectingDoor();
      return;
    }

    const placementId = this.furnitureLayer.findPlacementAtWorld(world.x, world.y);
    if (!placementId) return;

    const placement = store.activeRoomPlacements().find((item) => item.id === placementId);
    if (!placement) return;

    this.drag = {
      placementId,
      itemKey: placement.itemKey,
      pointerId: event.pointerId,
      grabOffset: computeGrabOffset(world.x, world.y, placement.x, placement.y),
    };
    this.canvas.setPointerCapture(event.pointerId);
    this.updatePreview(sx, sy);
  };

  private onPointerMove = (event: PointerEvent): void => {
    if (!this.drag || event.pointerId !== this.drag.pointerId) return;
    const rect = this.canvas.getBoundingClientRect();
    this.updatePreview(event.clientX - rect.left, event.clientY - rect.top);
  };

  private onPointerUp = (event: PointerEvent): void => {
    if (!this.drag || event.pointerId !== this.drag.pointerId) return;

    const rect = this.canvas.getBoundingClientRect();
    const sx = event.clientX - rect.left;
    const sy = event.clientY - rect.top;
    const { gx, gy } = screenToDragGrid(sx, sy, this.camera.state, this.drag.grabOffset);
    const store = this.getStore();
    const existing = store.activeRoomPlacements().find((item) => item.id === this.drag!.placementId);
    if (existing) {
      if (isConnectingDoorCell(store, store.activeFloorRoom, gx, gy)) {
        store.transferPlacementViaDoor(this.drag.placementId);
      } else if (existing.x !== gx || existing.y !== gy) {
        const candidate: Placement = {
          id: this.drag.placementId,
          itemKey: this.drag.itemKey,
          x: gx,
          y: gy,
          rotation: existing.rotation,
        };
        if (store.canPlaceAt(candidate, this.drag.placementId)) {
          store.movePlacement(this.drag.placementId, gx, gy);
        }
      }
    }

    if (this.canvas.hasPointerCapture(event.pointerId)) {
      this.canvas.releasePointerCapture(event.pointerId);
    }
    this.drag = null;
    this.previewLayer.hide();
  };

  private updatePreview(sx: number, sy: number): void {
    if (!this.drag) return;
    const store = this.getStore();
    const { gx, gy } = screenToDragGrid(sx, sy, this.camera.state, this.drag.grabOffset);
    const overDoor = isConnectingDoorCell(store, store.activeFloorRoom, gx, gy);
    const candidate: Placement = {
      id: this.drag.placementId,
      itemKey: this.drag.itemKey,
      x: gx,
      y: gy,
      rotation: 0,
    };
    const valid =
      overDoor && !this.drag.itemKey.startsWith('table')
        ? store.kitchenAnnexOwned
        : store.canPlaceAt(candidate, this.drag.placementId);
    this.previewLayer.show(gx, gy, this.drag.itemKey, valid);
  };
}
