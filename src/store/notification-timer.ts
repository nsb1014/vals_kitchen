import type { TutorialStepId } from '../domain/floor/tutorial.ts';

export type NoticeSource = 'tutorial' | 'pacing' | 'toast' | 'system';
export type NoticeScope = 'floor' | 'global';

export interface Notice {
  id: string;
  source: NoticeSource;
  /** Where the notice may be presented. Older saved/runtime notices fall back by source. */
  scope?: NoticeScope;
  title?: string;
  body: string;
  stepId?: TutorialStepId;
}

export function resolveNoticeScope(notice: Notice): NoticeScope {
  if (notice.scope) return notice.scope;
  return notice.source === 'tutorial' || notice.source === 'pacing'
    ? 'floor'
    : 'global';
}

/**
 * Floor-scoped guidance only belongs on the restaurant surface. Global toasts
 * and system notices may run on any screen. Used by the timer controller so
 * dwell pauses when the player leaves the floor even if the banner host has
 * not yet cleared notificationSurfaceActive.
 */
export function noticeRunsOnScreen(
  notice: Notice,
  screen: string,
): boolean {
  return resolveNoticeScope(notice) === 'global' || screen === 'restaurant';
}

export const NOTICE_DURATION_MS = 2500;
export const TUTORIAL_NOTICE_DURATION_MS = 4000;
export const CELEBRATION_DURATION_MS = 4000;

type TimerFields = {
  durationMs: number;
  remainingMs: number;
  runningSinceMs: number | null;
};

interface NotificationTimerState<Celebration extends object> {
  noticeActive: Notice | null;
  noticeSticky: Notice | null;
  notificationSurfaceActive: boolean;
  /** Current app screen — gates floor-scoped notice dwell independently of the UI surface flag. */
  screen: string;
  celebrationHead: Celebration | null;
}

interface NotificationTimerHandlers<Celebration extends object> {
  dismissNotice: (notice: Notice) => void;
  dismissCelebration: (celebration: Celebration) => void;
}

type RunningTarget =
  { kind: 'notice'; value: Notice } | { kind: 'celebration'; value: object };

let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
let runningTarget: RunningTarget | null = null;
let runningTimerFields: TimerFields | null = null;
let timedNotice: Notice | null = null;
let noticeTimer: TimerFields | null = null;
let timedCelebration: object | null = null;
let celebrationTimer: TimerFields | null = null;

function timerNow(): number {
  return performance.now();
}

function fieldsFor(target: RunningTarget): TimerFields | null {
  return target.kind === 'notice' ? noticeTimer : celebrationTimer;
}

function noticeDurationMs(notice: Notice): number {
  return notice.source === 'tutorial'
    ? TUTORIAL_NOTICE_DURATION_MS
    : NOTICE_DURATION_MS;
}

function pauseRunningTimer(): void {
  if (!runningTarget) return;
  const fields = runningTimerFields;
  if (fields?.runningSinceMs !== null && fields?.runningSinceMs !== undefined) {
    fields.remainingMs = Math.max(
      0,
      fields.remainingMs - Math.max(0, timerNow() - fields.runningSinceMs),
    );
    fields.runningSinceMs = null;
  }
  if (timeoutHandle) clearTimeout(timeoutHandle);
  timeoutHandle = null;
  runningTarget = null;
  runningTimerFields = null;
}

function sameTarget(
  left: RunningTarget | null,
  right: RunningTarget | null,
): boolean {
  return left?.kind === right?.kind && left?.value === right?.value;
}

/**
 * Restarts a transient notice's full dwell. Call before synchronizing after a
 * new or duplicate transient is installed in the store.
 */
export function restartNoticeTimer(notice: Notice): void {
  pauseRunningTimer();
  const durationMs = noticeDurationMs(notice);
  timedNotice = notice;
  noticeTimer = {
    durationMs,
    remainingMs: durationMs,
    runningSinceMs: null,
  };
}

/** Clears all controller bookkeeping during store lifecycle resets. */
export function clearNotificationTimers(): void {
  pauseRunningTimer();
  timedNotice = null;
  noticeTimer = null;
  timedCelebration = null;
  celebrationTimer = null;
}

/**
 * Remaining dwell for the timed transient notice, accounting for an in-flight
 * run. Returns null when no notice timer is armed (sticky / idle).
 */
export function peekNoticeRemainingMs(nowMs: number = timerNow()): number | null {
  if (!noticeTimer || !timedNotice) return null;
  if (
    runningTarget?.kind === 'notice' &&
    runningTimerFields === noticeTimer &&
    noticeTimer.runningSinceMs !== null
  ) {
    return Math.max(
      0,
      noticeTimer.remainingMs - Math.max(0, nowMs - noticeTimer.runningSinceMs),
    );
  }
  return noticeTimer.remainingMs;
}

/**
 * Runs only the logical front timer. Sticky notices have no dwell timer and
 * cover (pause) the celebration head until dismissed or replaced.
 */
export function syncNotificationTimer<Celebration extends object>(
  state: NotificationTimerState<Celebration>,
  handlers: NotificationTimerHandlers<Celebration>,
): void {
  const transientNotice =
    state.noticeActive && state.noticeActive !== state.noticeSticky
      ? state.noticeActive
      : null;

  if (transientNotice !== timedNotice) {
    const durationMs = transientNotice
      ? noticeDurationMs(transientNotice)
      : NOTICE_DURATION_MS;
    timedNotice = transientNotice;
    noticeTimer = transientNotice
      ? {
          durationMs,
          remainingMs: durationMs,
          runningSinceMs: null,
        }
      : null;
  }

  if (state.celebrationHead !== timedCelebration) {
    timedCelebration = state.celebrationHead;
    celebrationTimer = state.celebrationHead
      ? {
          durationMs: CELEBRATION_DURATION_MS,
          remainingMs: CELEBRATION_DURATION_MS,
          runningSinceMs: null,
        }
      : null;
  }

  let desiredTarget: RunningTarget | null = null;
  if (state.notificationSurfaceActive) {
    if (transientNotice) {
      // Keep celebrations covered while a floor notice is parked off-screen;
      // only run the notice timer when that notice is actually presentable.
      if (noticeRunsOnScreen(transientNotice, state.screen)) {
        desiredTarget = { kind: 'notice', value: transientNotice };
      }
    } else if (!state.noticeActive && state.celebrationHead) {
      desiredTarget = {
        kind: 'celebration',
        value: state.celebrationHead,
      };
    }
  }

  if (sameTarget(runningTarget, desiredTarget) && timeoutHandle) return;
  pauseRunningTimer();
  if (!desiredTarget) return;

  const fields = fieldsFor(desiredTarget);
  if (!fields) return;
  fields.runningSinceMs = timerNow();
  runningTarget = desiredTarget;
  runningTimerFields = fields;

  timeoutHandle = setTimeout(() => {
    const elapsedTarget = runningTarget;
    timeoutHandle = null;
    runningTarget = null;
    runningTimerFields = null;
    fields.remainingMs = 0;
    fields.runningSinceMs = null;

    if (!elapsedTarget || !sameTarget(elapsedTarget, desiredTarget)) return;
    if (elapsedTarget.kind === 'notice') {
      handlers.dismissNotice(elapsedTarget.value);
    } else {
      handlers.dismissCelebration(elapsedTarget.value as Celebration);
    }
  }, fields.remainingMs);
}
