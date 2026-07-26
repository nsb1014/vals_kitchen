/** Pure geometry for the carry-plate overlay (feet-anchored). No Pixi imports. */

const PLATE_COLOR = 0xf5e6c8;
const FOOD_ACCENT_COLOR = 0xc45c26;
/** World Y offset from feet for carried plate (above head). */
const PLATE_FEET_OFFSET_Y = -32;

export function carryPlateGeometry(feet: { x: number; y: number }): {
  plate: { x: number; y: number; rx: number; ry: number; color: number };
  food: { x: number; y: number; r: number; color: number };
} {
  const y = feet.y + PLATE_FEET_OFFSET_Y;
  return {
    plate: { x: feet.x, y, rx: 7, ry: 4, color: PLATE_COLOR },
    food: { x: feet.x, y: y - 1, r: 3, color: FOOD_ACCENT_COLOR },
  };
}
