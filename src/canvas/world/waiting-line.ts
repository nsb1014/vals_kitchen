import type { GridPoint } from '../../domain/floor/pathfinding.ts';
import { TILE_PX, gridToWorld } from '../coordinates.ts';

/**
 * Center-to-center spacing along the wait line.
 * Guests draw ~48px wide; ≥1.75 tiles keeps silhouettes from stacking.
 */
export const WAIT_LINE_SPACING_PX = TILE_PX * 1.75;

/** Interior floor tile just north of the door wall/door cell (line head). */
export function waitingGuestGridAnchor(door: GridPoint, waitingIndex = 0): GridPoint {
  const y = Math.max(0, door.y - 1);
  const world = waitingGuestWorldPosition(door, waitingIndex);
  const gx = Math.max(0, Math.round((world.x - TILE_PX / 2) / TILE_PX));
  return { x: gx, y };
}

/**
 * Unique world feet position for waiting-pool index.
 * Index 0 at door-north; later guests alternate west/east so a queue of 4 stays on-map.
 */
export function waitingGuestWorldPosition(
  door: GridPoint,
  waitingIndex: number,
): { x: number; y: number } {
  const y = Math.max(0, door.y - 1);
  const { x: wx, y: wy } = gridToWorld(door.x, y);
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
