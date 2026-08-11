import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getGameStateSnapshot, useGameStore } from '../../store/game-store.ts';

describe('floor toast', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useGameStore.setState({
      noticeActive: null,
      noticeSticky: null,
      notificationSurfaceActive: true,
      notificationBannerPresented: true,
      floorToast: null,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('is stripped from save snapshots', () => {
    useGameStore
      .getState()
      .setFloorToast('Wrong table — deliver to the matching guest');
    const snapshot = getGameStateSnapshot() as unknown as Record<
      string,
      unknown
    >;
    expect(snapshot.floorToast).toBeUndefined();
    expect(snapshot.noticeActive).toBeUndefined();
    expect(snapshot.noticeSticky).toBeUndefined();
    expect(snapshot.tutorialDismissedStepId).toBeUndefined();
    expect(snapshot.notificationSurfaceActive).toBeUndefined();
  });

  it('auto-clears after 2500ms', () => {
    useGameStore
      .getState()
      .setFloorToast('Wrong table — deliver to the matching guest');
    expect(useGameStore.getState().floorToast).toBe(
      'Wrong table — deliver to the matching guest',
    );

    vi.advanceTimersByTime(2499);
    expect(useGameStore.getState().floorToast).toBe(
      'Wrong table — deliver to the matching guest',
    );

    vi.advanceTimersByTime(1);
    expect(useGameStore.getState().floorToast).toBeNull();
  });

  it('lets gameplay feedback finish; instructional HUD pacing stays off the banner', () => {
    useGameStore.getState().setFloorToast('Wrong table');

    const pacing = {
      id: 'pacing:guest-waiting',
      source: 'pacing' as const,
      body: 'A guest is waiting',
    };
    useGameStore.getState().syncFloorNoticesFromHud({
      sticky: null,
      pacing,
    });

    expect(useGameStore.getState().noticeActive?.source).toBe('toast');
    expect(useGameStore.getState().floorToast).toBe('Wrong table');

    vi.advanceTimersByTime(2500);
    useGameStore.getState().syncFloorNoticesFromHud({
      sticky: null,
      pacing,
    });
    // Quiet policy: pacing/tutorial never reclaim the top banner.
    expect(useGameStore.getState().noticeActive).toBeNull();
    expect(useGameStore.getState().floorToast).toBeNull();
  });
});
