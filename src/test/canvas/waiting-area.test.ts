import { describe, expect, it } from 'vitest';
import { STARTER_DOOR } from '../../domain/floor/starter-map.ts';
import {
  waitingAreaGridAnchor,
  waitingGuestGridAnchor,
  waitingGuestWorldPosition,
} from '../../canvas/world/waiting-line.ts';

describe('entrance waiting area', () => {
  it('anchors the single ready-to-seat guest just inside the door (not on the door tile)', () => {
    const area = waitingAreaGridAnchor(STARTER_DOOR);
    expect(area).toEqual({ x: STARTER_DOOR.x, y: STARTER_DOOR.y - 1 });
    expect(area.y).toBeLessThan(STARTER_DOOR.y);

    // Index 0 (the only occupied wait slot) matches the waiting-area anchor.
    expect(waitingGuestGridAnchor(STARTER_DOOR, 0)).toEqual(area);
    const world = waitingGuestWorldPosition(STARTER_DOOR, 0);
    expect(world.x).toBeGreaterThan(0);
    expect(world.y).toBeGreaterThan(0);
  });
});
