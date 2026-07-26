import { describe, expect, it } from 'vitest';
import { lerpFollowPosition } from '../../canvas/systems/Camera.ts';

describe('camera follow lerp', () => {
  it('moves halfway toward the target when lerp is 0.5', () => {
    const next = lerpFollowPosition(0, 0, 100, 0, 0.5);
    expect(next.x).toBe(50);
    expect(next.y).toBe(0);
  });
});
