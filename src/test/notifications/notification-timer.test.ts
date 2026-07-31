import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createNewGameState } from '../../domain/state/game-state.ts';
import { useGameStore } from '../../store/game-store.ts';
import '../test-helpers.ts';

describe('notification timer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(performance, 'now').mockReturnValue(0);
    useGameStore.setState({
      noticeActive: null,
      noticeSticky: null,
      tutorialDismissedStepId: null,
      notificationSurfaceActive: true,
      celebrationQueue: [],
      floorToast: null,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('clears transient toast after 2500ms when surface active', () => {
    useGameStore.getState().setFloorToast('Blocked');
    expect(useGameStore.getState().noticeActive?.body).toBe('Blocked');
    vi.advanceTimersByTime(2499);
    expect(useGameStore.getState().noticeActive?.body).toBe('Blocked');
    vi.advanceTimersByTime(1);
    expect(useGameStore.getState().noticeActive).toBeNull();
  });

  it('extends dwell when the same toast body is set again', () => {
    useGameStore.getState().setFloorToast('Blocked');
    vi.advanceTimersByTime(2000);
    useGameStore.getState().setFloorToast('Blocked');
    vi.advanceTimersByTime(2000);
    expect(useGameStore.getState().noticeActive?.body).toBe('Blocked');
    vi.advanceTimersByTime(500);
    expect(useGameStore.getState().noticeActive).toBeNull();
  });

  it('pauses celebration while a notice is front and resumes remainingMs', () => {
    useGameStore.getState().enqueueCelebration({
      kind: 'recipe',
      title: 'Pasta',
      body: 'Unlocked',
    });
    (performance.now as ReturnType<typeof vi.fn>).mockReturnValue(1000);
    // advance 1000ms into celebration
    vi.advanceTimersByTime(1000);
    useGameStore.getState().setFloorToast('Cover');
    (performance.now as ReturnType<typeof vi.fn>).mockReturnValue(5000);
    vi.advanceTimersByTime(2499);
    expect(useGameStore.getState().celebrationQueue).toHaveLength(1);
    // dismiss notice → celebration resumes with ~3000ms left
    useGameStore.getState().dismissFrontNotice();
    vi.advanceTimersByTime(2999);
    expect(useGameStore.getState().celebrationQueue).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(useGameStore.getState().celebrationQueue).toHaveLength(0);
  });

  it('pauses when notificationSurfaceActive becomes false', () => {
    useGameStore.getState().setFloorToast('Hi');
    useGameStore.getState().setNotificationSurfaceActive(false);
    vi.advanceTimersByTime(10_000);
    expect(useGameStore.getState().noticeActive?.body).toBe('Hi');
    useGameStore.getState().setNotificationSurfaceActive(true);
    vi.advanceTimersByTime(2500);
    expect(useGameStore.getState().noticeActive).toBeNull();
  });

  it('resumes remainingMs after pause mid-dwell', () => {
    useGameStore.getState().setFloorToast('Partial');
    (performance.now as ReturnType<typeof vi.fn>).mockReturnValue(1000);
    vi.advanceTimersByTime(1000);

    useGameStore.getState().setNotificationSurfaceActive(false);
    (performance.now as ReturnType<typeof vi.fn>).mockReturnValue(20_000);
    vi.advanceTimersByTime(20_000);
    expect(useGameStore.getState().noticeActive?.body).toBe('Partial');

    useGameStore.getState().setNotificationSurfaceActive(true);
    vi.advanceTimersByTime(1499);
    expect(useGameStore.getState().noticeActive?.body).toBe('Partial');
    vi.advanceTimersByTime(1);
    expect(useGameStore.getState().noticeActive).toBeNull();
  });

  it('restores a sticky notice after a transient ends', () => {
    useGameStore.getState().syncFloorNoticesFromHud({
      sticky: {
        id: 'tutorial:set_tables',
        source: 'tutorial',
        body: 'Set a table',
        stepId: 'set_tables',
      },
      pacing: null,
    });
    useGameStore.getState().setFloorToast('Blocked');
    expect(useGameStore.getState().noticeActive?.source).toBe('toast');

    vi.advanceTimersByTime(2500);

    expect(useGameStore.getState().noticeActive).toBe(
      useGameStore.getState().noticeSticky,
    );
    expect(useGameStore.getState().noticeActive?.stepId).toBe('set_tables');
  });

  it('does not re-show dismissed tutorial until step changes', () => {
    useGameStore.getState().syncFloorNoticesFromHud({
      sticky: {
        id: 't1',
        source: 'tutorial',
        body: 'Set a table',
        stepId: 'set_tables',
      },
      pacing: null,
    });
    useGameStore.getState().dismissFrontNotice();
    expect(useGameStore.getState().noticeSticky).toBeNull();
    useGameStore.getState().syncFloorNoticesFromHud({
      sticky: {
        id: 't1',
        source: 'tutorial',
        body: 'Set a table',
        stepId: 'set_tables',
      },
      pacing: null,
    });
    expect(useGameStore.getState().noticeSticky).toBeNull();
    useGameStore.getState().syncFloorNoticesFromHud({
      sticky: {
        id: 't2',
        source: 'tutorial',
        body: 'Seat a guest',
        stepId: 'wait_seat',
      },
      pacing: null,
    });
    expect(useGameStore.getState().noticeSticky?.stepId).toBe('wait_seat');
  });

  it('clears notices and stale timers when SERVE_DISH soft-resets the day', async () => {
    useGameStore.setState(createNewGameState(424242));
    await useGameStore.getState().dispatch({ type: 'OPEN_DAY' });

    const activeDay = useGameStore.getState().activeDay!;
    activeDay.customers[activeDay.queueIndex]!.preference = {
      primary: { SW: 'high' },
      avoid: {},
      phrases: [],
    };
    useGameStore.setState({ rating: 0.01, activeDay });
    useGameStore.getState().syncFloorNoticesFromHud({
      sticky: {
        id: 'tutorial:serve',
        source: 'tutorial',
        body: 'Serve the guest',
        stepId: 'cook',
      },
      pacing: null,
    });
    useGameStore.getState().setFloorToast('Active before reset');
    useGameStore.getState().enqueueCelebration({
      kind: 'mastery',
      title: 'Stale',
      body: 'From before reset',
    });

    await useGameStore.getState().dispatch({
      type: 'SERVE_DISH',
      ingredientIds: ['butter', 'olive_oil', 'garlic'],
    });

    const state = useGameStore.getState();
    expect(state.activeDay).toBeNull();
    expect(state.floorToast).toBeNull();
    expect(state.noticeActive).toBeNull();
    expect(state.noticeSticky).toBeNull();
    expect(state.tutorialDismissedStepId).toBeNull();
    expect(state.celebrationQueue).toEqual([
      expect.objectContaining({ kind: 'recipe', title: 'Flaky Butter Loaf' }),
      expect.objectContaining({
        kind: 'achievement',
        achievementId: 'recipe-unlocks-1',
      }),
    ]);

    vi.advanceTimersByTime(2_500);
    expect(useGameStore.getState().celebrationQueue).toHaveLength(2);
  });
});
