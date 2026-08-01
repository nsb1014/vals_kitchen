import { TILE_PX, gridToWorld } from '../coordinates.ts';
import type { SeatSlot } from '../../domain/floor/types.ts';

/**
 * ¾-view seating model (compact tables, separate backless-stool cells):
 *
 * 1. Seats live in adjacent grid cells — never on the table cell.
 * 2. Stool and authored sit-pose feet share one floor baseline. The pose owns
 *    the hip/leg geometry; runtime never tucks or stretches the diner.
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
