import { TILE_PX, gridToWorld } from '../coordinates.ts';
import type { SeatSlot } from '../../domain/floor/types.ts';

/**
 * Top-down seating model (flat tabletops, separate chair cells):
 *
 * 1. Seats live in adjacent grid cells — never on the table cell.
 * 2. Sit anchor = seat-cell center. No tuck/camera bias into the tabletop;
 *    those dials made full-body sit sprites look glued onto the wood.
 * 3. Draw order in the shared depth layer: table (floor prop) → chair → guest.
 *    Flat tables sort under actors; chairs sort just behind the seated guest.
 * 4. Seated guest display height matches the chair so hips read as in the seat.
 *
 * Do not reintroduce SEAT_*_TUCK / SEAT_CAMERA_BIAS as visual "fixes".
 */
export const SEAT_SIDE_TUCK_PX = 0;
export const SEAT_NS_TUCK_PX = 0;
export const SEAT_CAMERA_BIAS_PX = 0;

/**
 * World nav-center for a seated guest / chair (feet derived by ActorLayer).
 */
export function seatSitWorldPosition(seat: SeatSlot): { x: number; y: number } {
  const { x: gx, y: gy } = gridToWorld(seat.x, seat.y);
  return {
    x: gx + TILE_PX / 2,
    y: gy + TILE_PX / 2,
  };
}

/** Map seat facing degrees to NavController / ActorLayer facing: 0 right, 1 down, 2 up, 3 left. */
export function seatFacingToActorFacing(facing: SeatSlot['facing']): 0 | 1 | 2 | 3 {
  if (facing === 180) return 2;
  if (facing === 0) return 1;
  if (facing === 90) return 0;
  return 3;
}
