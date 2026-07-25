import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getGameStateSnapshot, useGameStore } from '../../store/game-store.ts';

describe('floor toast', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useGameStore.setState({ floorToast: null });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('is stripped from save snapshots', () => {
    useGameStore.getState().setFloorToast('Wrong table — deliver to the matching guest');
    const snapshot = getGameStateSnapshot() as unknown as Record<string, unknown>;
    expect(snapshot.floorToast).toBeUndefined();
  });

  it('auto-clears after two seconds', () => {
    useGameStore.getState().setFloorToast('Wrong table — deliver to the matching guest');
    expect(useGameStore.getState().floorToast).toBe('Wrong table — deliver to the matching guest');

    vi.advanceTimersByTime(1999);
    expect(useGameStore.getState().floorToast).toBe('Wrong table — deliver to the matching guest');

    vi.advanceTimersByTime(1);
    expect(useGameStore.getState().floorToast).toBeNull();
  });
});
