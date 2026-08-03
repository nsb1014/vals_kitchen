import { describe, expect, it } from 'vitest';
import { STARTER_DOOR } from '../../domain/floor/starter-map.ts';
import {
  WAIT_LINE_SPACING_PX,
  doorwayLaneGridAnchor,
  waitingGuestGridAnchor,
  waitingGuestWorldPosition,
  waitingLineGuestSpacingPx,
} from '../../canvas/world/waiting-line.ts';

describe('waiting guest anchor', () => {
  it('stands inside the room beside the clear doorway lane', () => {
    const lane = doorwayLaneGridAnchor(STARTER_DOOR);
    const anchor = waitingGuestGridAnchor(STARTER_DOOR);
    expect(lane).toEqual({ x: STARTER_DOOR.x, y: STARTER_DOOR.y - 1 });
    expect(anchor).toEqual({ x: STARTER_DOOR.x - 1, y: STARTER_DOOR.y - 1 });
    expect(anchor).not.toEqual(lane);
  });

  it('spreads wait-line guests so four customers do not share one world point', () => {
    const positions = [0, 1, 2, 3].map((i) => waitingGuestWorldPosition(STARTER_DOOR, i));
    const keys = new Set(positions.map((p) => `${p.x},${p.y}`));
    expect(keys.size).toBe(4);

    // Every pair is at least one spacing apart (no pile-up).
    for (let i = 0; i < positions.length; i++) {
      for (let j = i + 1; j < positions.length; j++) {
        const dist = Math.hypot(
          positions[i]!.x - positions[j]!.x,
          positions[i]!.y - positions[j]!.y,
        );
        expect(dist).toBeGreaterThanOrEqual(waitingLineGuestSpacingPx() - 0.01);
      }
    }

    // Alternating west/east from door keeps the line on the dining row.
    expect(positions[1]!.x).toBe(positions[0]!.x - WAIT_LINE_SPACING_PX);
    expect(positions[2]!.x).toBe(positions[0]!.x + WAIT_LINE_SPACING_PX);
    expect(positions.every((p) => p.y === positions[0]!.y)).toBe(true);
  });

  it('maps wait indices onto distinct grid cells around the door', () => {
    const cells = [0, 1, 2, 3].map((i) => waitingGuestGridAnchor(STARTER_DOOR, i));
    const keys = new Set(cells.map((c) => `${c.x},${c.y}`));
    expect(keys.size).toBeGreaterThanOrEqual(3);
    expect(cells.every((c) => c.y === STARTER_DOOR.y - 1)).toBe(true);
  });
});
