/** Texture-key helpers for floor actors (player cook + guest variants). */

export const GUEST_VARIANTS = ['a', 'b', 'c', 'd', 'e'] as const;
export type GuestVariant = (typeof GUEST_VARIANTS)[number];

/**
 * Stable guest look from id. Variants map to distinct Kenney Urban walk cycles
 * (hair style / hair color / skin) — not the red-haired girl cook set.
 */
export function guestVariant(guestId: string): GuestVariant {
  let hash = 0;
  for (let i = 0; i < guestId.length; i += 1) {
    hash = (hash * 31 + guestId.charCodeAt(i)) | 0;
  }
  const idx = Math.abs(hash) % GUEST_VARIANTS.length;
  return GUEST_VARIANTS[idx]!;
}

export function playerFrameKey(facing: string, frame: number): string {
  return `player_${facing}_${frame}`;
}

export function playerCarryFrameKey(facing: string): string {
  return `player_carry_${facing}`;
}

export function playerPoseFrame(
  facing: string,
  walkFrame: number,
  isMoving: boolean,
  carrying: boolean,
): { textureKey: string; usesAuthoredCarryPose: boolean } {
  // The supplied sheet has one held-plate pose per direction, not a carry
  // cycle. Keep it while stopped, then retain the leg cycle while walking;
  // ActorLayer adds its held-dish overlay during motion.
  if (carrying && !isMoving) {
    return {
      textureKey: playerCarryFrameKey(facing),
      usesAuthoredCarryPose: true,
    };
  }
  return {
    textureKey: playerFrameKey(facing, isMoving ? walkFrame : 0),
    usesAuthoredCarryPose: false,
  };
}

export function guestWalkFrameKey(variant: GuestVariant, facing: string, frame: number): string {
  return `guest_${variant}_${facing}_${frame}`;
}

export function guestSitFrameKey(variant: GuestVariant, facing: string): string {
  return `guest_${variant}_sit_${facing}`;
}
