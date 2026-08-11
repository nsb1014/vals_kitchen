import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearTutorialSkip,
  isTutorialSkipped,
  skipTutorial,
} from '../../domain/floor/tutorial.ts';
import { useGameStore } from '../../store/game-store.ts';
import { NOTICE_DURATION_MS } from '../../store/notification-timer.ts';

describe('notice anti-spam policy', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    clearTutorialSkip();
    useGameStore.setState({
      screen: 'restaurant',
      day: 1,
      noticeActive: null,
      noticeSticky: null,
      tutorialDismissedStepId: null,
      notificationSurfaceActive: true,
      notificationBannerPresented: true,
      celebrationQueue: [],
      floorToast: null,
    });
  });

  afterEach(() => {
    clearTutorialSkip();
    vi.useRealTimers();
  });

  it('does not install routine pacing/tutorial guidance onto the top banner', () => {
    const pacing = {
      id: 'pacing:day:1',
      source: 'pacing' as const,
      scope: 'floor' as const,
      body: 'Day 1 · 3.0★ · P0 — match tastes, grow mastery',
    };
    const tutorial = {
      id: 'tutorial:set_tables',
      source: 'tutorial' as const,
      scope: 'floor' as const,
      body: 'Guest at the door — set every table first, then you can seat them.',
      stepId: 'set_tables' as const,
    };

    useGameStore.getState().syncFloorNoticesFromHud({ sticky: null, pacing });
    expect(useGameStore.getState().noticeActive).toBeNull();

    useGameStore.getState().syncFloorNoticesFromHud({
      sticky: null,
      pacing: tutorial,
    });
    expect(useGameStore.getState().noticeActive).toBeNull();
  });

  it('N rapid identical pacing updates produce at most one banner install attempt (zero under quiet policy)', () => {
    const pacing = {
      id: 'pacing:first-guest-arriving:1',
      source: 'pacing' as const,
      scope: 'floor' as const,
      body: 'The first guest is arriving…',
    };

    for (let i = 0; i < 8; i += 1) {
      useGameStore.getState().syncFloorNoticesFromHud({
        sticky: null,
        pacing: { ...pacing },
      });
    }

    expect(useGameStore.getState().noticeActive).toBeNull();
  });

  it('achievements still surface while instructional pacing is suppressed', () => {
    useGameStore.getState().syncFloorNoticesFromHud({
      sticky: null,
      pacing: {
        id: 'tutorial:cook',
        source: 'tutorial',
        scope: 'floor',
        body: 'Plate a ticket at the kitchen station.',
        stepId: 'cook',
      },
    });
    expect(useGameStore.getState().noticeActive).toBeNull();

    useGameStore.getState().enqueueCelebration({
      kind: 'achievement',
      title: 'Regular',
      body: 'Complete seven service days',
      achievementId: 'days-7',
    });

    expect(useGameStore.getState().celebrationQueue[0]?.kind).toBe(
      'achievement',
    );
    // No covering notice — celebration head is free to run its dwell.
    expect(useGameStore.getState().noticeActive).toBeNull();
  });

  it('identical rapid action toasts coalesce without restarting dwell', () => {
    useGameStore.getState().setFloorToast('No clear route');
    const first = useGameStore.getState().noticeActive;
    expect(first?.body).toBe('No clear route');

    vi.advanceTimersByTime(1_000);
    useGameStore.getState().setFloorToast('No clear route');
    useGameStore.getState().setFloorToast('No clear route');

    expect(useGameStore.getState().noticeActive).toBe(first);
    expect(useGameStore.getState().floorToast).toBe('No clear route');

    vi.advanceTimersByTime(NOTICE_DURATION_MS - 1_000 - 1);
    expect(useGameStore.getState().noticeActive?.body).toBe('No clear route');
    vi.advanceTimersByTime(1);
    expect(useGameStore.getState().noticeActive).toBeNull();
  });

  it('a different actionable toast replaces the previous toast rather than queue-churning', () => {
    useGameStore.getState().setFloorToast('No clear route');
    useGameStore.getState().setFloorToast(
      'Wrong table — deliver to the matching guest',
    );

    expect(useGameStore.getState().noticeActive?.body).toBe(
      'Wrong table — deliver to the matching guest',
    );
    expect(useGameStore.getState().floorToast).toBe(
      'Wrong table — deliver to the matching guest',
    );

    vi.advanceTimersByTime(NOTICE_DURATION_MS);
    expect(useGameStore.getState().noticeActive).toBeNull();
  });
});

describe('skip tutorial clears and never resurrects day-1 guidance', () => {
  beforeEach(() => {
    clearTutorialSkip();
    useGameStore.setState({
      screen: 'restaurant',
      day: 1,
      noticeActive: {
        id: 'tutorial:set_tables',
        source: 'tutorial',
        scope: 'floor',
        body: 'Guest at the door — set every table first, then you can seat them.',
        stepId: 'set_tables',
      },
      noticeSticky: null,
      tutorialDismissedStepId: null,
      notificationSurfaceActive: true,
      notificationBannerPresented: true,
      celebrationQueue: [],
      floorToast: null,
    });
  });

  afterEach(() => {
    clearTutorialSkip();
  });

  it('skipTutorialGuidance clears banner guidance and blocks HUD sync resurrection', () => {
    useGameStore.getState().skipTutorialGuidance();
    expect(isTutorialSkipped()).toBe(true);
    expect(useGameStore.getState().noticeActive).toBeNull();
    expect(useGameStore.getState().noticeSticky).toBeNull();

    // Floor state churn + HUD syncs must not reinstall tutorial or pacing.
    const attempts = [
      {
        id: 'tutorial:set_tables',
        source: 'tutorial' as const,
        scope: 'floor' as const,
        body: 'Guest at the door — set every table first, then you can seat them.',
        stepId: 'set_tables' as const,
      },
      {
        id: 'tutorial:wait_seat:waiting',
        source: 'tutorial' as const,
        scope: 'floor' as const,
        body: 'Seat the waiting guest.',
        stepId: 'wait_seat' as const,
      },
      {
        id: 'pacing:first-guest-arriving:1',
        source: 'pacing' as const,
        scope: 'floor' as const,
        body: 'The first guest is arriving…',
      },
      {
        id: 'pacing:day:1',
        source: 'pacing' as const,
        scope: 'floor' as const,
        body: 'Day 1 · 3.0★ · P0 — match tastes, grow mastery',
      },
    ];

    for (const pacing of attempts) {
      useGameStore.getState().syncFloorNoticesFromHud({ sticky: null, pacing });
      useGameStore.getState().syncFloorNoticesFromHud({
        sticky: pacing.source === 'tutorial' ? pacing : null,
        pacing,
      });
    }

    expect(useGameStore.getState().noticeActive).toBeNull();
    expect(useGameStore.getState().noticeSticky).toBeNull();
  });

  it('clearing pacing from HUD drops a leftover tutorial/pacing banner', () => {
    // Simulate skipTutorial() without a dismiss (stale banner still active).
    skipTutorial();
    useGameStore.getState().syncFloorNoticesFromHud({
      sticky: null,
      pacing: null,
    });
    expect(useGameStore.getState().noticeActive).toBeNull();
  });
});
