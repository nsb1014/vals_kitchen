import { TILE_PX, gridToWorld } from '../coordinates.ts';
import type { SeatSlot } from '../../domain/floor/types.ts';

/**
 * Slight pull toward the table so the diner faces the top-down tabletop edge.
 * Keep this shallow — deep tuck makes full-body sit sprites look glued onto the table.
 */
export const SEAT_SIDE_TUCK_PX = TILE_PX * 0.1;
/** North/south seats (4-tops) tuck similarly along Y. */
export const SEAT_NS_TUCK_PX = TILE_PX * 0.1;
/**
 * Bias side-seat diners toward the camera so natural Y-sort paints them in front
 * of the same-row tabletop instead of inside it.
 */
export const SEAT_CAMERA_BIAS_PX = 8;

/**
 * World feet position for a seated guest / chair.
 * West seats (facing 90) tuck east under the table; east seats (facing 270) tuck west.
 */
export function seatSitWorldPosition(seat: SeatSlot): { x: number; y: number } {
  const { x: gx, y: gy } = gridToWorld(seat.x, seat.y);
  let x = gx + TILE_PX / 2;
  let y = gy + TILE_PX / 2;

  if (seat.facing === 90) {
    x += SEAT_SIDE_TUCK_PX;
    y += SEAT_CAMERA_BIAS_PX;
  } else if (seat.facing === 270) {
    x -= SEAT_SIDE_TUCK_PX;
    y += SEAT_CAMERA_BIAS_PX;
  } else if (seat.facing === 180) {
    y -= SEAT_NS_TUCK_PX;
  } else if (seat.facing === 0) {
    y += SEAT_NS_TUCK_PX;
  }

  return { x, y };
}

/** Map seat facing degrees to NavController / ActorLayer facing: 0 right, 1 down, 2 up, 3 left. */
export function seatFacingToActorFacing(facing: SeatSlot['facing']): 0 | 1 | 2 | 3 {
  if (facing === 180) return 2;
  if (facing === 0) return 1;
  if (facing === 90) return 0;
  return 3;
}
