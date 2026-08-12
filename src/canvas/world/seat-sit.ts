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
 * 4. Guests match the chef’s silhouette height (content-based scale).
 * 5. Per-variant sit sinks plant adult hips on the cushion — guest_b (child)
 *    is the authored reference; taller sit frames need more positive Y.
 *
 * Do not reintroduce SEAT_*_TUCK / SEAT_CAMERA_BIAS into the tabletop.
 */
export const SEAT_SIDE_TUCK_PX = 0;
export const SEAT_NS_TUCK_PX = 0;
export const SEAT_CAMERA_BIAS_PX = 0;
/**
 * Shared world Y offset applied to every seated guest relative to the chair
 * feet. Positive moves the sit pose down the screen onto the cushion.
 * Kept at 0 so the child reference pose (guest_b) stays planted; adults use
 * {@link SEAT_SIT_VARIANT_OFFSET_Y} instead of a uniform raise that floated them.
 */
export const SEAT_SIT_OFFSET_Y = 0;
/**
 * Extra sit sink per guest variant (world px, positive = down onto cushion).
 * Tuned so adult/elder sit frames match guest_b's stool contact; the child
 * reference stays at 0.
 */
export const SEAT_SIT_VARIANT_OFFSET_Y: Readonly<Record<GuestVariant, number>> =
  {
    a: 6,
    b: 0,
    c: 7,
    d: 4,
    e: 9,
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
 * Matches the stool's X/tableward tuck; Y adds the shared offset plus an
 * optional per-variant sink so adult hips meet the cushion like guest_b.
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
