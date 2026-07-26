import { TILE_PX, gridToWorld } from '../coordinates.ts';
import type { SeatSlot } from '../../domain/floor/types.ts';

/** Horizontal flank from table center for south/north paired slots (¾ sit). */
export const SEAT_FLANK_PX = TILE_PX * 0.28;
/**
 * Pull toward table in nav-center space (ActorLayer feet = y + TILE_PX/2 - 2).
 * ~0.85 tile yields feet near the table's south lip.
 */
export const SEAT_TUCK_PX = TILE_PX * 0.85;

/**
 * World feet position for a seated guest / chair.
 * South seats (facing 180) tuck north under the table top and flank left/right by slot.
 */
export function seatSitWorldPosition(seat: SeatSlot): { x: number; y: number } {
  const { x: gx, y: gy } = gridToWorld(seat.x, seat.y);
  let x = gx + TILE_PX / 2;
  let y = gy + TILE_PX / 2;

  const flankSign = seat.slotIndex % 2 === 0 ? -1 : 1;
  x += flankSign * SEAT_FLANK_PX;

  if (seat.facing === 180) {
    y -= SEAT_TUCK_PX;
  } else if (seat.facing === 0) {
    y += SEAT_TUCK_PX;
  } else if (seat.facing === 90) {
    x += SEAT_TUCK_PX;
  } else if (seat.facing === 270) {
    x -= SEAT_TUCK_PX;
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
