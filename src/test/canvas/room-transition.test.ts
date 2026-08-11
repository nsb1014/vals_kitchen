import { describe, expect, it, vi } from 'vitest';
import {
  clearRoomTransitionPhase,
  holdRoomTransitionPhase,
  latchRoomTransitionOutFrom,
  readRoomTransitionOutFrom,
  readRoomTransitionPhase,
} from '../../canvas/room-transition.ts';

function fakeHost() {
  const dataset: Record<string, string | undefined> = {};
  return {
    dataset: dataset as unknown as DOMStringMap,
    animate: vi.fn(),
  };
}

describe('room transition phase holds', () => {
  it('latches the source room when out begins and keeps it after phase clear', () => {
    const host = fakeHost();
    latchRoomTransitionOutFrom(host, 'main');
    expect(readRoomTransitionPhase(host)).toBe('out');
    expect(readRoomTransitionOutFrom(host)).toBe('main');
    clearRoomTransitionPhase(host);
    expect(readRoomTransitionPhase(host)).toBeNull();
    expect(readRoomTransitionOutFrom(host)).toBe('main');
  });

  it('uses the timer path under reduced motion instead of WAAPI', async () => {
    const host = fakeHost();
    const delays: number[] = [];
    latchRoomTransitionOutFrom(host, 'main');
    await holdRoomTransitionPhase(host, 'out', {
      reducedMotion: true,
      durationMs: 100,
      delay: async (ms: number) => {
        delays.push(ms);
      },
    });
    expect(delays).toEqual([100]);
    expect(host.animate).not.toHaveBeenCalled();
    expect(readRoomTransitionPhase(host)).toBe('out');
  });

  it('uses WAAPI when motion is allowed', async () => {
    const host = fakeHost();
    const finished = Promise.resolve();
    const animation = {
      finished,
      cancel: vi.fn(),
    };
    host.animate.mockReturnValue(animation);
    await holdRoomTransitionPhase(host, 'in', {
      reducedMotion: false,
      durationMs: 140,
    });
    expect(host.animate).toHaveBeenCalledOnce();
    expect(animation.cancel).toHaveBeenCalledOnce();
    expect(readRoomTransitionPhase(host)).toBe('in');
  });
});
