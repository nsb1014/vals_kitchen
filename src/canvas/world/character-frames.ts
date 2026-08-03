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

export function playerCarryFrameKey(facing: string, frame = 0): string {
  return frame === 0 ? `player_carry_${facing}` : `player_carry_${facing}_${frame}`;
}

export function playerPoseFrame(
  facing: string,
  walkFrame: number,
  isMoving: boolean,
  carrying: boolean,
): { textureKey: string; usesAuthoredCarryPose: boolean } {
  if (carrying) {
    return {
      textureKey: playerCarryFrameKey(facing, isMoving ? walkFrame : 0),
      usesAuthoredCarryPose: true,
    };
  }
  return {
    textureKey: playerFrameKey(facing, isMoving ? walkFrame : 0),
    usesAuthoredCarryPose: false,
  };
}

/**
 * Ordered texture fallbacks for a requested player pose. Carry art remains
 * preferred even while its stride frames are still arriving from a lazy atlas.
 */
export function playerTextureKeyCandidates(
  facing: string,
  walkFrame: number,
  isMoving: boolean,
  carrying: boolean,
): string[] {
  const requested = playerPoseFrame(facing, walkFrame, isMoving, carrying).textureKey;
  const regularCurrent = playerFrameKey(facing, isMoving ? walkFrame : 0);
  const regularNeutral = playerFrameKey(facing, 0);
  const candidates = carrying
    ? [requested, playerCarryFrameKey(facing), regularCurrent, regularNeutral, 'player', 'customer']
    : [requested, regularNeutral, 'player', 'customer'];
  return candidates.filter((key, index) => candidates.indexOf(key) === index);
}

export function guestWalkFrameKey(variant: GuestVariant, facing: string, frame: number): string {
  return `guest_${variant}_${facing}_${frame}`;
}

export function guestSitFrameKey(variant: GuestVariant, facing: string): string {
  return `guest_${variant}_sit_${facing}`;
}
