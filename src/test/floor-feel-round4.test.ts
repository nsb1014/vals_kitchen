import { describe, expect, it } from 'vitest';
import {
  QUEUE_LINE_ADVANCE_MS,
  easeQueueLineAdvance,
  queueLineAdvancePosition,
  waitingGuestWorldPosition,
} from '../canvas/world/waiting-line.ts';
import { STARTER_DOOR } from '../domain/floor/starter-map.ts';
import { sfxForFloorFeelBeat } from '../store/service-events.ts';

describe('floor-feel round 4 — punchier seat/order SFX', () => {
  it('maps seat/order/deliver to distinct shipped Kenney stings', () => {
    expect(sfxForFloorFeelBeat('seat')).toBe('placement');
    expect(sfxForFloorFeelBeat('order')).toBe('purchase');
    expect(sfxForFloorFeelBeat('deliver')).toBe('serve');
    expect(sfxForFloorFeelBeat('walk')).toBe('uiClick');
    const ids = [
      sfxForFloorFeelBeat('seat'),
      sfxForFloorFeelBeat('order'),
      sfxForFloorFeelBeat('deliver'),
    ];
    expect(new Set(ids).size).toBe(3);
  });
});

describe('floor-feel round 4 — queue line advance slide', () => {
  it('eases remaining silhouettes from prior slot toward the new head', () => {
    const from = waitingGuestWorldPosition(STARTER_DOOR, 2);
    const to = waitingGuestWorldPosition(STARTER_DOOR, 1);
    expect(from.x).not.toBe(to.x);

    const mid = queueLineAdvancePosition(from, to, QUEUE_LINE_ADVANCE_MS / 2);
    expect(mid.done).toBe(false);
    expect(mid.x).toBeGreaterThan(Math.min(from.x, to.x));
    expect(mid.x).toBeLessThan(Math.max(from.x, to.x));
    expect(mid.y).toBeCloseTo(from.y + (to.y - from.y) * easeQueueLineAdvance(0.5));

    const end = queueLineAdvancePosition(from, to, QUEUE_LINE_ADVANCE_MS);
    expect(end.done).toBe(true);
    expect(end.x).toBe(to.x);
    expect(end.y).toBe(to.y);
  });

  it('uses smoothstep (not linear) mid-curve', () => {
    expect(easeQueueLineAdvance(0)).toBe(0);
    expect(easeQueueLineAdvance(1)).toBe(1);
    expect(easeQueueLineAdvance(0.5)).toBe(0.5);
    expect(easeQueueLineAdvance(0.25)).toBeLessThan(0.25);
    expect(easeQueueLineAdvance(0.75)).toBeGreaterThan(0.75);
  });
});
