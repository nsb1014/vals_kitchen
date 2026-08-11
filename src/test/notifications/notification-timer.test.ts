import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createNewGameState } from '../../domain/state/game-state.ts';
import { useGameStore } from '../../store/game-store.ts';
import {
  resolveNoticeScope,
  TUTORIAL_NOTICE_DURATION_MS,
} from '../../store/notification-timer.ts';
import {
  noticeIsVisibleOnScreen,
  notificationSurfaceShouldRun,
} from '../../ui/components/CelebrationBanner.ts';
import '../test-helpers.ts';

describe('notification timer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(performance, 'now').mockReturnValue(0);
    useGameStore.setState({
      screen: 'restaurant',
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

  it('pauses floor-notice dwell on navigateTo(settings) even if surface stays active', () => {
    const tip = {
      id: 'tutorial:paced-set-tables',
      source: 'tutorial' as const,
      scope: 'floor' as const,
      body: 'Set every table',
      stepId: 'set_tables' as const,
    };
    useGameStore.setState({
      screen: 'restaurant',
      noticeActive: tip,
      noticeSticky: null,
      notificationSurfaceActive: true,
      celebrationQueue: [],
      floorToast: tip.body,
    });
    useGameStore.getState().syncNotificationTimer();

    (performance.now as ReturnType<typeof vi.fn>).mockReturnValue(1_200);
    vi.advanceTimersByTime(1_200);

    // Missed banner surface sync: leave notificationSurfaceActive true while
    // leaving the floor — screen gating alone must pause remainingMs.
    useGameStore.getState().navigateTo('settings');
    expect(useGameStore.getState().screen).toBe('settings');
    expect(useGameStore.getState().notificationSurfaceActive).toBe(true);
    expect(useGameStore.getState().noticeActive?.body).toBe('Set every table');

    (performance.now as ReturnType<typeof vi.fn>).mockReturnValue(20_000);
    vi.advanceTimersByTime(20_000);
    expect(useGameStore.getState().noticeActive?.body).toBe('Set every table');

    useGameStore.getState().navigateTo('restaurant');
    (performance.now as ReturnType<typeof vi.fn>).mockReturnValue(20_000);
    vi.advanceTimersByTime(TUTORIAL_NOTICE_DURATION_MS - 1_200 - 1);
    expect(useGameStore.getState().noticeActive?.body).toBe('Set every table');
    vi.advanceTimersByTime(1);
    expect(useGameStore.getState().noticeActive).toBeNull();
  });

  it('keeps a parked floor tip through Settings and resumes remaining dwell on return', () => {
    const tip = {
      id: 'tutorial:paced-set-tables',
      source: 'tutorial' as const,
      scope: 'floor' as const,
      body: 'Guest at the door — set every table first, then you can seat them.',
      stepId: 'set_tables' as const,
    };
    useGameStore.setState({
      screen: 'restaurant',
      noticeActive: tip,
      noticeSticky: null,
      notificationSurfaceActive: true,
      celebrationQueue: [],
      floorToast: tip.body,
    });
    useGameStore.getState().syncNotificationTimer();

    (performance.now as ReturnType<typeof vi.fn>).mockReturnValue(1_200);
    vi.advanceTimersByTime(1_200);

    // Banner host parks the tip (not visible on Settings) and clears the surface.
    useGameStore.getState().navigateTo('settings');
    useGameStore.getState().setNotificationSurfaceActive(
      notificationSurfaceShouldRun(
        true,
        false,
        noticeIsVisibleOnScreen(tip, 'settings'),
      ),
    );
    expect(useGameStore.getState().notificationSurfaceActive).toBe(false);
    expect(noticeIsVisibleOnScreen(tip, 'settings')).toBe(false);
    expect(useGameStore.getState().noticeActive).toBe(tip);

    // Full tutorial budget elapses while parked — tip must remain for remount.
    (performance.now as ReturnType<typeof vi.fn>).mockReturnValue(30_000);
    vi.advanceTimersByTime(TUTORIAL_NOTICE_DURATION_MS + 1_000);
    expect(useGameStore.getState().noticeActive).toBe(tip);

    // Stale timer dismiss attempts must not drop a parked floor tip.
    useGameStore.getState().syncNotificationTimer();
    expect(useGameStore.getState().noticeActive).toBe(tip);

    useGameStore.getState().navigateTo('restaurant');
    expect(noticeIsVisibleOnScreen(tip, 'restaurant')).toBe(true);
    useGameStore.getState().setNotificationSurfaceActive(
      notificationSurfaceShouldRun(
        true,
        false,
        noticeIsVisibleOnScreen(tip, 'restaurant'),
      ),
    );
    expect(useGameStore.getState().notificationSurfaceActive).toBe(true);
    expect(useGameStore.getState().noticeActive?.body).toBe(tip.body);

    (performance.now as ReturnType<typeof vi.fn>).mockReturnValue(30_000);
    const remaining = TUTORIAL_NOTICE_DURATION_MS - 1_200;
    vi.advanceTimersByTime(remaining - 1);
    expect(useGameStore.getState().noticeActive?.body).toBe(tip.body);
    vi.advanceTimersByTime(1);
    expect(useGameStore.getState().noticeActive).toBeNull();
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

  it('scopes floor guidance while keeping toast and system notices global', () => {
    const floorNotice = {
      id: 'tutorial:seat',
      source: 'tutorial' as const,
      scope: 'floor' as const,
      body: 'Seat the guest',
    };
    const toast = {
      id: 'toast:blocked',
      source: 'toast' as const,
      body: 'That destination is locked',
    };
    const system = {
      id: 'system:saved',
      source: 'system' as const,
      scope: 'global' as const,
      body: 'Save imported',
    };

    expect(resolveNoticeScope(floorNotice)).toBe('floor');
    expect(noticeIsVisibleOnScreen(floorNotice, 'restaurant')).toBe(true);
    expect(noticeIsVisibleOnScreen(floorNotice, 'settings')).toBe(false);
    expect(resolveNoticeScope(toast)).toBe('global');
    expect(noticeIsVisibleOnScreen(toast, 'settings')).toBe(true);
    expect(noticeIsVisibleOnScreen(system, 'recipes')).toBe(true);
  });

  it('pauses a hidden floor notice surface without pausing visible global content', () => {
    expect(notificationSurfaceShouldRun(true, false, false)).toBe(false);
    expect(notificationSurfaceShouldRun(true, false, true)).toBe(true);
    expect(notificationSurfaceShouldRun(true, true, true)).toBe(false);
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

  it('does not let a page lifecycle resume bypass a blocking service sheet', () => {
    let pageLifecycleActive = true;
    let uiBlocked = false;
    const syncSurface = () => {
      useGameStore
        .getState()
        .setNotificationSurfaceActive(
          notificationSurfaceShouldRun(pageLifecycleActive, uiBlocked),
        );
    };

    useGameStore.getState().setFloorToast('Wait behind the sheet');
    (performance.now as ReturnType<typeof vi.fn>).mockReturnValue(900);
    vi.advanceTimersByTime(900);

    uiBlocked = true;
    syncSurface();
    (performance.now as ReturnType<typeof vi.fn>).mockReturnValue(20_000);
    vi.advanceTimersByTime(19_100);

    pageLifecycleActive = false;
    syncSurface();
    pageLifecycleActive = true;
    syncSurface();
    vi.advanceTimersByTime(10_000);
    expect(useGameStore.getState().noticeActive?.body).toBe(
      'Wait behind the sheet',
    );

    (performance.now as ReturnType<typeof vi.fn>).mockReturnValue(30_000);
    uiBlocked = false;
    syncSurface();
    vi.advanceTimersByTime(1599);
    expect(useGameStore.getState().noticeActive?.body).toBe(
      'Wait behind the sheet',
    );
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

  it('reinstalls paced floor guidance after a global toast displaces it', () => {
    const pacing = {
      id: 'tutorial:paced-seat',
      source: 'tutorial' as const,
      scope: 'floor' as const,
      body: 'Seat the waiting guest.',
      stepId: 'wait_seat' as const,
    };
    useGameStore.getState().syncFloorNoticesFromHud({
      sticky: null,
      pacing,
    });
    useGameStore.getState().setFloorToast('Recipe Book is locked.');
    expect(useGameStore.getState().noticeActive?.source).toBe('toast');

    vi.advanceTimersByTime(2500);
    expect(useGameStore.getState().noticeActive).toBeNull();
    useGameStore.getState().syncFloorNoticesFromHud({
      sticky: null,
      pacing,
    });

    expect(useGameStore.getState().noticeActive).toBe(pacing);
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

  it('shows paced tutorial guidance once per step and then clears it', () => {
    const setTables = {
      id: 'tutorial:paced-set-tables',
      source: 'tutorial' as const,
      body: 'Set every table',
      stepId: 'set_tables' as const,
    };

    useGameStore.getState().syncFloorNoticesFromHud({
      sticky: null,
      pacing: setTables,
    });
    expect(useGameStore.getState().noticeActive).toBe(setTables);
    expect(useGameStore.getState().noticeSticky).toBeNull();

    vi.advanceTimersByTime(TUTORIAL_NOTICE_DURATION_MS);
    expect(useGameStore.getState().noticeActive).toBeNull();

    useGameStore.getState().syncFloorNoticesFromHud({
      sticky: null,
      pacing: setTables,
    });
    expect(useGameStore.getState().noticeActive).toBeNull();

    useGameStore.getState().syncFloorNoticesFromHud({
      sticky: null,
      pacing: {
        id: 'tutorial:paced-seat-guest',
        source: 'tutorial',
        body: 'Seat the next guest',
        stepId: 'wait_seat',
      },
    });
    expect(useGameStore.getState().noticeActive?.stepId).toBe('wait_seat');
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
