/** Pure layout for atlas carry-plate overlay (feet-anchored). No Pixi imports. */

export type CarryPlateFacing = 'right' | 'down' | 'up' | 'left';

export type CarryPlateSpriteLayout =
  | { visible: false }
  | {
      visible: true;
      plate: { x: number; y: number; sortY: number };
      food: { x: number; y: number };
    };

/**
 * Held-plate sprite anchors by facing. Mirrors world/carry-plate geometry so the
 * atlas overlay covers the Graphics ellipse fallback without editing ActorLayer.
 */
export function carryPlateSpriteLayout(
  feet: { x: number; y: number },
  facing: CarryPlateFacing,
): CarryPlateSpriteLayout {
  const handY = feet.y - (facing === 'up' ? 15 : 14);
  let x = feet.x;
  if (facing === 'right') x = feet.x + 9;
  else if (facing === 'left') x = feet.x - 9;
  else if (facing === 'up') x = feet.x + 10;

  return {
    visible: true,
    plate: {
      x,
      y: handY,
      sortY: facing === 'up' ? feet.y - 1 : feet.y + 1,
    },
    food: { x, y: handY - 2 },
  };
}

export function facingNameFromIndex(
  facing: 0 | 1 | 2 | 3,
): CarryPlateFacing {
  return (['right', 'down', 'up', 'left'] as const)[facing]!;
}
