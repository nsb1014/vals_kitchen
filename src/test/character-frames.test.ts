import { describe, expect, it } from 'vitest';
import {
  GUEST_VARIANTS,
  guestSitFrameKey,
  guestVariant,
  guestWalkFrameKey,
  playerCarryFrameKey,
  playerFrameKey,
  playerPoseFrame,
  playerTextureKeyCandidates,
} from '../canvas/world/character-frames.ts';

describe('character-frames', () => {
  it('maps the supplied chef to walk and authored carry texture keys', () => {
    expect(playerFrameKey('down', 0)).toBe('player_down_0');
    expect(playerFrameKey('left', 2)).toBe('player_left_2');
    expect(playerFrameKey('up', 1)).toBe('player_up_1');
    expect(playerCarryFrameKey('right')).toBe('player_carry_right');
    expect(playerCarryFrameKey('right', 2)).toBe('player_carry_right_2');
  });

  it('uses the authored carry family at rest and while moving', () => {
    expect(playerPoseFrame('down', 2, false, true)).toEqual({
      textureKey: 'player_carry_down',
      usesAuthoredCarryPose: true,
    });
    expect(playerPoseFrame('down', 2, true, true)).toEqual({
      textureKey: 'player_carry_down_2',
      usesAuthoredCarryPose: true,
    });
    expect(playerPoseFrame('left', 1, true, false)).toEqual({
      textureKey: 'player_left_1',
      usesAuthoredCarryPose: false,
    });
  });

  it('orders carry fallbacks ahead of ordinary walking art', () => {
    expect(playerTextureKeyCandidates('left', 2, true, true)).toEqual([
      'player_carry_left_2',
      'player_carry_left',
      'player_left_2',
      'player_left_0',
      'player',
      'customer',
    ]);
    expect(playerTextureKeyCandidates('up', 0, false, true)).toEqual([
      'player_carry_up',
      'player_up_0',
      'player',
      'customer',
    ]);
  });

  it('exposes multiple chibi guest variants', () => {
    expect(GUEST_VARIANTS.length).toBeGreaterThanOrEqual(5);
    expect(new Set(GUEST_VARIANTS).size).toBe(GUEST_VARIANTS.length);
  });

  it('hashes guest ids stably across the full variant set', () => {
    const counts = Object.fromEntries(GUEST_VARIANTS.map((v) => [v, 0])) as Record<
      (typeof GUEST_VARIANTS)[number],
      number
    >;
    for (let i = 0; i < 200; i += 1) {
      const v = guestVariant(`guest-${i}`);
      expect(GUEST_VARIANTS).toContain(v);
      counts[v] += 1;
    }
    for (const v of GUEST_VARIANTS) {
      expect(counts[v], `variant ${v} should appear`).toBeGreaterThan(0);
    }
    expect(guestVariant('guest-0')).toBe(guestVariant('guest-0'));
  });

  it('builds walk and sit texture keys per variant', () => {
    for (const variant of GUEST_VARIANTS) {
      expect(guestWalkFrameKey(variant, 'right', 1)).toBe(`guest_${variant}_right_1`);
      expect(guestSitFrameKey(variant, 'down')).toBe(`guest_${variant}_sit_down`);
    }
  });
});
