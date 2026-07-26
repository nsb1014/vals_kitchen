import type { GridPoint } from '../../domain/floor/pathfinding.ts';

/** Waiting line stands on the floor tile north of the door wall/door cell. */
export function waitingGuestGridAnchor(door: GridPoint): GridPoint {
  return { x: door.x, y: Math.max(0, door.y - 1) };
}
