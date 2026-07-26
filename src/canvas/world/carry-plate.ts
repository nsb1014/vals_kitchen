/** Pure geometry for the carry-plate overlay (feet-anchored). No Pixi imports. */

const PLATE_COLOR = 0xf5e6c8;
const FOOD_ACCENT_COLOR = 0xc45c26;

export type CarryFacing = 'right' | 'down' | 'up' | 'left';

export type CarryPlateGeometry =
  | { visible: false }
  | {
      visible: true;
      plate: { x: number; y: number; rx: number; ry: number; color: number };
      food: { x: number; y: number; r: number; color: number };
      /** Display sort key — must be > feet.y so the plate draws in front of the body. */
      sortY: number;
    };

/**
 * Held-plate pose by facing. Up is hidden (plate behind the cook from camera).
 * Down / left / right place the plate at hand height with side offsets.
 */
export function carryPlateGeometry(
  feet: { x: number; y: number },
  facing: CarryFacing,
): CarryPlateGeometry {
  if (facing === 'up') {
    return { visible: false };
  }

  // ~hand height on 1.3× 32px actors (feet anchor).
  const handY = feet.y - 14;
  let x = feet.x;
  if (facing === 'right') x = feet.x + 9;
  else if (facing === 'left') x = feet.x - 9;

  return {
    visible: true,
    plate: { x, y: handY, rx: 7, ry: 4, color: PLATE_COLOR },
    food: { x, y: handY - 1, r: 3, color: FOOD_ACCENT_COLOR },
    sortY: feet.y + 1,
  };
}
