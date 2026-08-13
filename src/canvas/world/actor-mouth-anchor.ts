import {
  GUEST_DISPLAY_HEIGHT,
  PLAYER_DISPLAY_HEIGHT,
  SEATED_GUEST_DISPLAY_HEIGHT,
} from './actor-metrics.ts';

/**
 * Mouth sits slightly below the top of the authored 128×160 frame once scaled
 * to the runtime display height. Bubble tails aim here in screen space.
 */
export const ACTOR_MOUTH_FROM_TOP_RATIO = 0.14;

export type ActorMouthPose = 'standing' | 'seated';

/** World-space mouth / head anchor from feet-anchored actor roots. */
export function actorMouthWorldFromFeet(
  feet: { x: number; y: number },
  pose: ActorMouthPose = 'standing',
): { x: number; y: number } {
  const displayHeight =
    pose === 'seated' ? SEATED_GUEST_DISPLAY_HEIGHT : GUEST_DISPLAY_HEIGHT;
  const topY = feet.y - displayHeight;
  return {
    x: feet.x,
    y: topY + displayHeight * ACTOR_MOUTH_FROM_TOP_RATIO,
  };
}

/** Same geometry for Val (standing display height). */
export function playerMouthWorldFromFeet(feet: {
  x: number;
  y: number;
}): { x: number; y: number } {
  const topY = feet.y - PLAYER_DISPLAY_HEIGHT;
  return {
    x: feet.x,
    y: topY + PLAYER_DISPLAY_HEIGHT * ACTOR_MOUTH_FROM_TOP_RATIO,
  };
}

/**
 * Prefer content-bounds mouth when available: frame padding above the head
 * would otherwise park the bubble tail in empty air.
 */
export function mouthAnchorFromContentBounds(bounds: {
  left: number;
  top: number;
  right: number;
  bottom: number;
}): { x: number; y: number } {
  const height = Math.max(0, bounds.bottom - bounds.top);
  return {
    x: (bounds.left + bounds.right) / 2,
    y: bounds.top + height * ACTOR_MOUTH_FROM_TOP_RATIO,
  };
}

/**
 * Local offset (from feet-anchored actor root) for the floating status cue.
 * Uses authored content bounds so sit-side padding does not park the mark
 * in empty air above the head, and so a hip-registered profile sit keeps
 * the mark over the diner instead of the canvas midline.
 */
export function guestStageCueLocalOffset(opts: {
  sourceWidth: number;
  sourceHeight: number;
  contentBounds: { x: number; y: number; w: number; h: number };
  scaleX: number;
  scaleY: number;
}): { x: number; y: number } {
  const headX =
    opts.contentBounds.x + opts.contentBounds.w / 2 - opts.sourceWidth / 2;
  const headTopFromBottom = opts.sourceHeight - opts.contentBounds.y;
  return {
    x: headX * opts.scaleX,
    y: -headTopFromBottom * opts.scaleY - 4,
  };
}
