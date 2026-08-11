/**
 * Room fade-out / fade-in phase holds for annex doorway travel.
 *
 * E2E always arms reduced motion, and Chromium may finish no-op WAAPI
 * animations in the same turn they start — so observers polling
 * `data-room-transition=out` can miss the phase entirely. Latch the room
 * that was active when `out` began (`data-room-transition-out-from`) and
 * drive reduced-motion holds with an explicit timer so the state machine
 * cannot skip the out→swap→in sequence.
 */

export type RoomTransitionPhase = 'out' | 'in';

export type RoomTransitionHoldHost = {
  dataset: DOMStringMap;
  animate?: HTMLCanvasElement['animate'];
};

export function latchRoomTransitionOutFrom(
  host: RoomTransitionHoldHost,
  fromRoom: string,
): void {
  host.dataset.roomTransition = 'out';
  host.dataset.roomTransitionOutFrom = fromRoom;
}

export function markRoomTransitionPhase(
  host: RoomTransitionHoldHost,
  phase: RoomTransitionPhase,
): void {
  host.dataset.roomTransition = phase;
}

export function clearRoomTransitionPhase(host: RoomTransitionHoldHost): void {
  delete host.dataset.roomTransition;
}

/** Read the latched "out began while in this room" probe (survives phase clear). */
export function readRoomTransitionOutFrom(
  host: RoomTransitionHoldHost,
): string | null {
  return host.dataset.roomTransitionOutFrom ?? null;
}

export function readRoomTransitionPhase(
  host: RoomTransitionHoldHost,
): RoomTransitionPhase | null {
  const phase = host.dataset.roomTransition;
  return phase === 'out' || phase === 'in' ? phase : null;
}

export type RoomTransitionHoldOptions = {
  reducedMotion: boolean;
  durationMs: number;
  /** Optional WAAPI handle stash for teardown cancel. */
  setAnimation?: (animation: Animation | null) => void;
  delay?: (ms: number) => Promise<void>;
};

function defaultDelay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

/**
 * Hold a transition phase for `durationMs`. Reduced motion and missing
 * `animate` use a timer (WAAPI no-ops can resolve in 0ms under force-reduce).
 */
export async function holdRoomTransitionPhase(
  host: RoomTransitionHoldHost,
  phase: RoomTransitionPhase,
  options: RoomTransitionHoldOptions,
): Promise<void> {
  markRoomTransitionPhase(host, phase);

  const delay = options.delay ?? defaultDelay;
  const canAnimate = typeof host.animate === 'function';

  if (options.reducedMotion || !canAnimate) {
    options.setAnimation?.(null);
    await delay(options.durationMs);
    return;
  }

  const frames =
    phase === 'out'
      ? [{ opacity: 1 }, { opacity: 0 }]
      : [{ opacity: 0 }, { opacity: 1 }];
  const animation = host.animate!(frames, {
    duration: options.durationMs,
    easing: phase === 'out' ? 'ease-in' : 'ease-out',
    fill: 'forwards',
  });
  options.setAnimation?.(animation);
  try {
    await animation.finished;
  } finally {
    animation.cancel();
    options.setAnimation?.(null);
  }
}
