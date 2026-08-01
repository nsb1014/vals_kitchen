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
 * World Y offset for seated guests relative to the chair feet.
 * Negative pulls the sit pose onto the cushion / toward the chair back.
 * Chair Y-sort always uses the diner’s feet so the chair stays behind them.
 */
export const SEAT_SIT_OFFSET_Y = 0;
export const SEAT_SIDE_HIP_OFFSET_PX = 10;
export const SEAT_NS_HIP_OFFSET_PX = 8;

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
 * Offset onto the cushion relative to the chair feet.
 */
export function seatSitWorldPosition(seat: SeatSlot): { x: number; y: number } {
  const center = seatCellCenter(seat);
  if (seat.facing === 90) return { x: center.x + SEAT_SIDE_HIP_OFFSET_PX, y: center.y };
  if (seat.facing === 270) return { x: center.x - SEAT_SIDE_HIP_OFFSET_PX, y: center.y };
  if (seat.facing === 0) return { x: center.x, y: center.y + SEAT_NS_HIP_OFFSET_PX };
  if (seat.facing === 180) return { x: center.x, y: center.y - SEAT_NS_HIP_OFFSET_PX };
  return {
    x: center.x,
    y: center.y + SEAT_SIT_OFFSET_Y,
  };
}

/** Map seat facing degrees to NavController / ActorLayer facing: 0 right, 1 down, 2 up, 3 left. */
export function seatFacingToActorFacing(facing: SeatSlot['facing']): 0 | 1 | 2 | 3 {
  if (facing === 180) return 2;
  if (facing === 0) return 1;
  if (facing === 90) return 0;
  return 3;
}
