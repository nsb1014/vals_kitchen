import { TILE_PX, gridToWorld } from "../coordinates.ts";
import type { SeatSlot } from "../../domain/floor/types.ts";
import type { GuestVariant } from "./character-frames.ts";

/**
 * ¾-view seating model (compact tables, separate backless-stool cells):
 *
 * 1. Seats live in adjacent grid cells — never on the table cell.
 * 2. The stool tucks toward the table by the same hip shift as the seated
 *    guest, so the sit pose stays centered on the cushion instead of
 *    perching on the stool's table-side edge. The authored sit-pose root
 *    provides the tableward lean; the legs occupy the gap beside the
 *    tabletop.
 * 3. Draw order: table (floor prop) → stool → guest.
 * 4. Guests share one adult template (palette swaps only), so every diner
 *    uses the same sit silhouette, head height, and stool contact.
 *
 * Do not reintroduce SEAT_*_TUCK / SEAT_CAMERA_BIAS into the tabletop.
 */
export const SEAT_SIDE_TUCK_PX = 0;
export const SEAT_NS_TUCK_PX = 0;
export const SEAT_CAMERA_BIAS_PX = 0;
/**
 * Shared world Y offset applied to every seated guest relative to the chair
 * feet. Positive moves the sit pose down the screen onto the cushion.
 * Kept at 0; the shared guest-only sink is {@link SEAT_SIT_GUEST_SINK_Y}.
 */
export const SEAT_SIT_OFFSET_Y = 0;
/**
 * Guest-only sit sink (world px, positive = down onto cushion). Every
 * palette variant uses the same adult template, so one sink plants all hips.
 */
export const SEAT_SIT_GUEST_SINK_Y = 9;
/**
 * Extra sit sink per guest variant. Identical on purpose: outfits/skin/hair
 * change color, not body geometry, so status dots stay at one height.
 */
export const SEAT_SIT_VARIANT_OFFSET_Y: Readonly<Record<GuestVariant, number>> =
  {
    a: SEAT_SIT_GUEST_SINK_Y,
    b: SEAT_SIT_GUEST_SINK_Y,
    c: SEAT_SIT_GUEST_SINK_Y,
    d: SEAT_SIT_GUEST_SINK_Y,
    e: SEAT_SIT_GUEST_SINK_Y,
  };
/**
 * Tableward hip shift for west/east seats. Applied to BOTH the guest anchor
 * and the stool so the two move together (a guest-only shift perched diners
 * on the stool's table-side edge).
 */
export const SEAT_SIDE_HIP_OFFSET_PX = 6;
/**
 * Tableward hip shift for north/south seats. Applied to BOTH the guest
 * anchor and the stool (see SEAT_SIDE_HIP_OFFSET_PX).
 */
export const SEAT_NS_HIP_OFFSET_PX = 4;

function seatCellCenter(seat: SeatSlot): { x: number; y: number } {
  const { x: gx, y: gy } = gridToWorld(seat.x, seat.y);
  return {
    x: gx + TILE_PX / 2,
    y: gy + TILE_PX / 2,
  };
}

/** Tableward shift shared by the stool and the seated guest anchor. */
function seatHipShift(seat: SeatSlot): { dx: number; dy: number } {
  if (seat.facing === 90) return { dx: SEAT_SIDE_HIP_OFFSET_PX, dy: 0 };
  if (seat.facing === 270) return { dx: -SEAT_SIDE_HIP_OFFSET_PX, dy: 0 };
  if (seat.facing === 0) return { dx: 0, dy: SEAT_NS_HIP_OFFSET_PX };
  if (seat.facing === 180) return { dx: 0, dy: -SEAT_NS_HIP_OFFSET_PX };
  return { dx: 0, dy: 0 };
}

/**
 * Chair feet: planted on the seat-cell floor, tucked toward the table by the
 * shared hip shift so the cushion stays under the seated guest.
 */
export function seatChairWorldPosition(seat: SeatSlot): {
  x: number;
  y: number;
} {
  const center = seatCellCenter(seat);
  const { dx, dy } = seatHipShift(seat);
  return { x: center.x + dx, y: center.y + dy };
}

/**
 * World nav-center for a seated guest (feet derived by ActorLayer).
 * Matches the stool's X/tableward tuck; Y adds the shared offset plus the
 * shared guest-only sink so every palette variant plants hips on the cushion.
 */
export function seatSitWorldPosition(
  seat: SeatSlot,
  variant?: GuestVariant,
): { x: number; y: number } {
  const chair = seatChairWorldPosition(seat);
  const variantY = variant ? SEAT_SIT_VARIANT_OFFSET_Y[variant] : 0;
  return { x: chair.x, y: chair.y + SEAT_SIT_OFFSET_Y + variantY };
}

/** Map seat facing degrees to NavController / ActorLayer facing: 0 right, 1 down, 2 up, 3 left. */
export function seatFacingToActorFacing(
  facing: SeatSlot["facing"],
): 0 | 1 | 2 | 3 {
  if (facing === 180) return 2;
  if (facing === 0) return 1;
  if (facing === 90) return 0;
  return 3;
}

/**
 * True when the shared sit/stool anchor keeps the stool inside its own cell
 * (used by regression tests). The stool is 24px wide in a 32px cell, so the
 * tableward tuck must stay well under half a tile to avoid crossing into the
 * table cell.
 */
export function seatSitStaysOnChair(seat: SeatSlot): boolean {
  const center = seatCellCenter(seat);
  const chair = seatChairWorldPosition(seat);
  const sit = seatSitWorldPosition(seat);
  const withinCell =
    Math.abs(chair.x - center.x) <= TILE_PX / 4 &&
    Math.abs(chair.y - center.y) <= TILE_PX / 4;
  // Default (no variant) sit shares the stool anchor; variant sinks are guest-only.
  const aligned = sit.x === chair.x && sit.y === chair.y + SEAT_SIT_OFFSET_Y;
  return withinCell && aligned;
}
