import { TILE_PX, gridToWorld } from '../coordinates.ts';
import type { SeatSlot } from '../../domain/floor/types.ts';

/**
 * ¾-view seating model (compact tables, separate backless-stool cells):
 *
 * 1. Seats live in adjacent grid cells — never on the table cell.
 * 2. The stool stays centered in its cell. The authored sit-pose root shifts
 *    toward the table so the hips land on the inner half of the seat while
 *    the legs occupy the intentional gap beside the tabletop.
 * 3. Draw order: table (floor prop) → stool → guest.
 * 4. Guests match the chef’s silhouette height (content-based scale).
 *
 * Do not reintroduce SEAT_*_TUCK / SEAT_CAMERA_BIAS into the tabletop.
 */
export const SEAT_SIDE_TUCK_PX = 0;
export const SEAT_NS_TUCK_PX = 0;
export const SEAT_CAMERA_BIAS_PX = 0;
/**
 * World Y offset applied to every seated guest relative to the chair feet.
 * Positive moves the sit pose down the screen (onto the cushion). Kept at 0
 * because sit-frame content already plants the lap on a 22px stool; facing
 * hip shifts handle tableward composition only.
 */
export const SEAT_SIT_OFFSET_Y = 0;
/**
 * Tableward hip shift for west/east seats. Kept modest so the butt stays on
 * the stool cushion (10px previously slid guests off the seat entirely).
 */
export const SEAT_SIDE_HIP_OFFSET_PX = 6;
/**
 * Tableward hip shift for north/south seats. Modest so down-facing guests do
 * not sink past the cushion and up-facing guests do not lift off it.
 */
export const SEAT_NS_HIP_OFFSET_PX = 4;

function seatCellCenter(seat: SeatSlot): { x: number; y: number } {
  const { x: gx, y: gy } = gridToWorld(seat.x, seat.y);
  return {
    x: gx + TILE_PX / 2,
    y: gy + TILE_PX / 2,
  };
}

/** Chair feet: planted on the seat-cell floor. */
export function seatChairWorldPosition(seat: SeatSlot): { x: number; y: number } {
  return seatCellCenter(seat);
}

/**
 * World nav-center for a seated guest (feet derived by ActorLayer).
 * Offset onto the cushion relative to the chair feet, then shifted tableward.
 */
export function seatSitWorldPosition(seat: SeatSlot): { x: number; y: number } {
  const center = seatCellCenter(seat);
  const y = center.y + SEAT_SIT_OFFSET_Y;
  if (seat.facing === 90) return { x: center.x + SEAT_SIDE_HIP_OFFSET_PX, y };
  if (seat.facing === 270) return { x: center.x - SEAT_SIDE_HIP_OFFSET_PX, y };
  if (seat.facing === 0) return { x: center.x, y: y + SEAT_NS_HIP_OFFSET_PX };
  if (seat.facing === 180) return { x: center.x, y: y - SEAT_NS_HIP_OFFSET_PX };
  return { x: center.x, y };
}

/** Map seat facing degrees to NavController / ActorLayer facing: 0 right, 1 down, 2 up, 3 left. */
export function seatFacingToActorFacing(facing: SeatSlot['facing']): 0 | 1 | 2 | 3 {
  if (facing === 180) return 2;
  if (facing === 0) return 1;
  if (facing === 90) return 0;
  return 3;
}

/**
 * True when a seated guest's sit anchor still overlaps the stool top enough
 * to read as "on the chair" (used by regression tests).
 */
export function seatSitStaysOnChair(seat: SeatSlot): boolean {
  const chair = seatChairWorldPosition(seat);
  const sit = seatSitWorldPosition(seat);
  const dx = Math.abs(sit.x - chair.x);
  const dy = Math.abs(sit.y - chair.y);
  // Side hip shift is purely X; NS shift is purely Y. Either axis must stay
  // inside the drawn stool half-width (~12px) so the lap covers the cushion.
  return dx <= 12 && dy <= 12;
}
