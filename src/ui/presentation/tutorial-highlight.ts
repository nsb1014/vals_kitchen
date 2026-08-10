import {
  tutorialHighlightTarget,
  type TutorialHighlightTarget,
  type TutorialStepId,
} from '../../domain/floor/tutorial.ts';
import { doorForGrid } from '../../domain/floor/starter-map.ts';
import type { FloorDay } from '../../domain/floor/types.ts';
import type { Placement } from '../../domain/state/game-state.ts';
import {
  computeCameraCenter,
  gridToWorld,
  worldToScreen,
  type CameraState,
} from '../../canvas/coordinates.ts';

export interface TutorialHighlightPoint {
  target: TutorialHighlightTarget;
  label: string;
  gx: number;
  gy: number;
}

const LABELS: Record<Exclude<TutorialHighlightTarget, null>, string> = {
  unset_table: 'Unset table',
  door: 'Guest door',
  seated_guest: 'Seated guest',
  kitchen: 'Kitchen station',
  dirty_table: 'Dirty table',
  close: 'Floor clear — close day',
};

export function tutorialHighlightLabel(
  target: TutorialHighlightTarget,
): string | null {
  return target ? LABELS[target] : null;
}

/** Resolve a grid cell for the current tutorial spatial cue. */
export function resolveTutorialHighlightPoint(
  step: TutorialStepId | null,
  floor: FloorDay,
  placements: Placement[],
  gridSize: { w: number; h: number },
): TutorialHighlightPoint | null {
  const target = tutorialHighlightTarget(step);
  if (!target) return null;

  if (target === 'unset_table') {
    const unset = floor.tables.find((table) => table.state === 'unset');
    const placement = unset
      ? placements.find((row) => row.id === unset.placementId)
      : placements.find((row) => row.itemKey.startsWith('table'));
    if (!placement) return null;
    return {
      target,
      label: LABELS[target],
      gx: placement.x,
      gy: placement.y,
    };
  }

  if (target === 'dirty_table') {
    const dirty = floor.tables.find((table) => table.state === 'dirty');
    const placement = dirty
      ? placements.find((row) => row.id === dirty.placementId)
      : null;
    if (!placement) return null;
    return {
      target,
      label: LABELS[target],
      gx: placement.x,
      gy: placement.y,
    };
  }

  if (target === 'door') {
    const door = doorForGrid(gridSize.w, gridSize.h);
    return { target, label: LABELS[target], gx: door.x, gy: door.y };
  }

  if (target === 'seated_guest') {
    const seated = floor.pool.find((guest) => guest.stage === 'seated');
    if (seated?.seat) {
      return {
        target,
        label: LABELS[target],
        gx: seated.seat.x,
        gy: seated.seat.y,
      };
    }
    return null;
  }

  if (target === 'kitchen') {
    const station = placements.find(
      (row) =>
        row.itemKey.includes('station') || row.itemKey.includes('prep'),
    );
    if (!station) return null;
    return {
      target,
      label: LABELS[target],
      gx: station.x,
      gy: station.y,
    };
  }

  if (target === 'close') {
    return {
      target,
      label: LABELS[target],
      gx: floor.playerPosition.x,
      gy: floor.playerPosition.y,
    };
  }

  return null;
}

export function highlightPointToOverlayStyle(
  point: TutorialHighlightPoint,
  canvas: HTMLElement,
  camera?: CameraState | null,
): { left: string; top: string; width: string; height: string } {
  const viewW = canvas.clientWidth || 1;
  const viewH = canvas.clientHeight || 1;
  const cam =
    camera ??
    computeCameraCenter(
      Math.max(1, Math.ceil(viewW / 32)),
      Math.max(1, Math.ceil(viewH / 32)),
      viewW,
      viewH,
    );
  // Prefer a camera that matches the live canvas when grid size is known via cam.
  const world = gridToWorld(point.gx, point.gy);
  const screen = worldToScreen(world.x + 16, world.y + 16, cam);
  const size = Math.max(36, 32 * cam.scale);
  return {
    left: `${Math.round(screen.x - size / 2)}px`,
    top: `${Math.round(screen.y - size / 2)}px`,
    width: `${Math.round(size)}px`,
    height: `${Math.round(size)}px`,
  };
}

export function buildTutorialHighlightCamera(
  gridW: number,
  gridH: number,
  canvas: HTMLElement,
  liveCamera?: CameraState | null,
): CameraState {
  if (liveCamera) return liveCamera;
  return computeCameraCenter(gridW, gridH, canvas.clientWidth, canvas.clientHeight);
}
