import type { GuestStage } from '../../domain/floor/types.ts';

export const MIN_GUEST_HIT_TARGET_CSS_PX = 44;
const MIN_VALID_CAMERA_SCALE = 0.01;

export interface GuestWorldBounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface GuestHitPoint {
  x: number;
  y: number;
}

export interface GuestHitTargetCandidate {
  guestId: string;
  bounds: GuestWorldBounds;
  sortY: number;
  paintOrder: number;
}

export interface AnchoredSpriteContentGeometry {
  rootX: number;
  rootY: number;
  spriteX: number;
  spriteY: number;
  sourceWidth: number;
  sourceHeight: number;
  contentBounds: GuestWorldBounds;
  anchorX: number;
  anchorY: number;
  scaleX: number;
  scaleY: number;
}

/** Map source-pixel alpha bounds through a feet-anchored sprite transform. */
export function anchoredSpriteContentWorldBounds(
  geometry: AnchoredSpriteContentGeometry,
): GuestWorldBounds {
  const originX =
    geometry.rootX +
    geometry.spriteX -
    geometry.sourceWidth * geometry.anchorX * geometry.scaleX;
  const originY =
    geometry.rootY +
    geometry.spriteY -
    geometry.sourceHeight * geometry.anchorY * geometry.scaleY;
  const x1 = originX + geometry.contentBounds.left * geometry.scaleX;
  const x2 = originX + geometry.contentBounds.right * geometry.scaleX;
  const y1 = originY + geometry.contentBounds.top * geometry.scaleY;
  const y2 = originY + geometry.contentBounds.bottom * geometry.scaleY;
  return {
    left: Math.min(x1, x2),
    top: Math.min(y1, y2),
    right: Math.max(x1, x2),
    bottom: Math.max(y1, y2),
  };
}

/** Stages whose visible body can receive a direct service command. */
export function isServiceGuestHitEligible(
  stage: GuestStage,
  hasCarriedTicket: boolean,
): boolean {
  switch (stage) {
    case 'seated':
      return true;
    case 'ordered':
    case 'eating':
      return hasCarriedTicket;
    case 'queued':
    case 'entering':
    case 'waiting':
    case 'seating':
    case 'leaving':
    case 'done':
      return false;
  }
}

/** Convert the 44 CSS-pixel accessibility floor into world-space units. */
export function minimumGuestHitWorldSize(cameraScale: number): number {
  const validScale =
    Number.isFinite(cameraScale) && cameraScale > 0
      ? cameraScale
      : MIN_VALID_CAMERA_SCALE;
  return MIN_GUEST_HIT_TARGET_CSS_PX / Math.max(validScale, MIN_VALID_CAMERA_SCALE);
}

/** Symmetrically expand both axes to the minimum target without shrinking. */
export function expandGuestHitBounds(
  bounds: GuestWorldBounds,
  cameraScale: number,
): GuestWorldBounds {
  const minimumSize = minimumGuestHitWorldSize(cameraScale);
  const width = bounds.right - bounds.left;
  const height = bounds.bottom - bounds.top;
  const horizontalExpansion = Math.max(0, minimumSize - width) / 2;
  const verticalExpansion = Math.max(0, minimumSize - height) / 2;
  return {
    left: bounds.left - horizontalExpansion,
    top: bounds.top - verticalExpansion,
    right: bounds.right + horizontalExpansion,
    bottom: bounds.bottom + verticalExpansion,
  };
}

/** Boundary pixels belong to the target so exact-edge taps remain actionable. */
export function guestHitBoundsContainPoint(
  bounds: GuestWorldBounds,
  point: GuestHitPoint,
): boolean {
  return (
    point.x >= bounds.left &&
    point.x <= bounds.right &&
    point.y >= bounds.top &&
    point.y <= bounds.bottom
  );
}

function candidatePaintsAbove(
  candidate: GuestHitTargetCandidate,
  incumbent: GuestHitTargetCandidate,
): boolean {
  if (candidate.sortY !== incumbent.sortY) {
    return candidate.sortY > incumbent.sortY;
  }
  if (candidate.paintOrder !== incumbent.paintOrder) {
    return candidate.paintOrder > incumbent.paintOrder;
  }
  return candidate.guestId > incumbent.guestId;
}

/** Resolve the visually topmost expanded target under a world-space point. */
export function resolveTopmostGuestHit(
  point: GuestHitPoint,
  candidates: readonly GuestHitTargetCandidate[],
  cameraScale: number,
): GuestHitTargetCandidate | null {
  let topmost: GuestHitTargetCandidate | null = null;
  let topmostContainsVisibleContent = false;
  for (const candidate of candidates) {
    const expanded = expandGuestHitBounds(candidate.bounds, cameraScale);
    if (!guestHitBoundsContainPoint(expanded, point)) continue;
    const containsVisibleContent = guestHitBoundsContainPoint(
      candidate.bounds,
      point,
    );
    if (
      !topmost ||
      (containsVisibleContent && !topmostContainsVisibleContent) ||
      (containsVisibleContent === topmostContainsVisibleContent &&
        candidatePaintsAbove(candidate, topmost))
    ) {
      topmost = candidate;
      topmostContainsVisibleContent = containsVisibleContent;
    }
  }
  return topmost;
}
