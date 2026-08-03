import type { GridPoint } from '../../domain/floor/pathfinding.ts';
import {
  guestDoorwayLane,
  guestWaitingAlcove,
} from '../../domain/floor/starter-map.ts';
import { TILE_PX, gridToWorld } from '../coordinates.ts';

/**
 * Center-to-center spacing along the wait line.
 * Guests draw ~48px wide; ≥1.75 tiles keeps silhouettes from stacking.
 * Kept for legacy multi-index helpers; entry gating uses a single wait slot.
 */
export const WAIT_LINE_SPACING_PX = TILE_PX * 1.75;

/** Clear center lane used by arrivals and departures immediately inside the door. */
export function doorwayLaneGridAnchor(door: GridPoint): GridPoint {
  return guestDoorwayLane(door);
}

/**
 * Single waiting alcove beside the entrance. Prefer the west side so the
 * queue stays out of the cook's central kitchen route; very narrow layouts
 * fall back east rather than placing the guest on a perimeter wall.
 */
export function waitingAreaGridAnchor(door: GridPoint): GridPoint {
  return guestWaitingAlcove(door);
}

/** Interior waiting-alcove tile beside the door lane (line head). */
export function waitingGuestGridAnchor(door: GridPoint, waitingIndex = 0): GridPoint {
  const waiting = waitingAreaGridAnchor(door);
  const world = waitingGuestWorldPosition(door, waitingIndex);
  const gx = Math.max(0, Math.round((world.x - TILE_PX / 2) / TILE_PX));
  return { x: gx, y: waiting.y };
}

/**
 * Unique world feet position for waiting-pool index.
 * Index 0 is the sole ready-to-seat spot beside the clear doorway lane.
 * Later indices alternate west/east (legacy spacing helpers / tests).
 */
export function waitingGuestWorldPosition(
  door: GridPoint,
  waitingIndex: number,
): { x: number; y: number } {
  const waiting = waitingAreaGridAnchor(door);
  const { x: wx, y: wy } = gridToWorld(waiting.x, waiting.y);
  const baseX = wx + TILE_PX / 2;
  const baseY = wy + TILE_PX / 2;
  if (waitingIndex <= 0) return { x: baseX, y: baseY };
  const rank = Math.ceil(waitingIndex / 2);
  const lane = waitingIndex % 2 === 1 ? -1 : 1;
  return {
    x: baseX + lane * rank * WAIT_LINE_SPACING_PX,
    y: baseY,
  };
}

/** Minimum expected distance between consecutive wait-line indices (for tests). */
export function waitingLineGuestSpacingPx(): number {
  return WAIT_LINE_SPACING_PX;
}
