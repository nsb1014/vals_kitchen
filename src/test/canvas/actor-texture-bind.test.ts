import { describe, expect, it } from 'vitest';
import { nextBoundFrameKey } from '../../canvas/world/actor-texture-bind.ts';

describe('actor texture bind', () => {
  it('retries the same frame key when the prior bind had no texture', () => {
    expect(
      nextBoundFrameKey({
        frameKey: 'guest_a_sit_down',
        lastFrameKey: 'guest_a_sit_down',
        hadTexture: false,
      }),
    ).toBe(true);
  });

  it('skips rebinding when the frame is unchanged and already textured', () => {
    expect(
      nextBoundFrameKey({
        frameKey: 'player_down_0',
        lastFrameKey: 'player_down_0',
        hadTexture: true,
      }),
    ).toBe(false);
  });

  it('rebinds when the frame key changes', () => {
    expect(
      nextBoundFrameKey({
        frameKey: 'player_left_1',
        lastFrameKey: 'player_down_0',
        hadTexture: true,
      }),
    ).toBe(true);
  });
});
