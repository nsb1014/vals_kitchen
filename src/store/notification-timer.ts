import type { TutorialStepId } from '../domain/floor/tutorial.ts';

export type NoticeSource = 'tutorial' | 'pacing' | 'toast' | 'system';

export interface Notice {
  id: string;
  source: NoticeSource;
  title?: string;
  body: string;
  stepId?: TutorialStepId;
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
      desiredTarget = { kind: 'notice', value: transientNotice };
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
