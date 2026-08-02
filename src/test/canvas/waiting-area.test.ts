import { describe, expect, it } from 'vitest';
import { STARTER_DOOR } from '../../domain/floor/starter-map.ts';
import {
  doorwayLaneGridAnchor,
  waitingAreaGridAnchor,
  waitingGuestGridAnchor,
  waitingGuestWorldPosition,
} from '../../canvas/world/waiting-line.ts';

describe('entrance waiting area', () => {
  it('anchors the single waiting guest beside a clear center doorway lane', () => {
    const lane = doorwayLaneGridAnchor(STARTER_DOOR);
    const area = waitingAreaGridAnchor(STARTER_DOOR);
    expect(lane).toEqual({ x: STARTER_DOOR.x, y: STARTER_DOOR.y - 1 });
    expect(area).toEqual({ x: STARTER_DOOR.x - 1, y: STARTER_DOOR.y - 1 });
    expect(area.y).toBeLessThan(STARTER_DOOR.y);
    expect(area).not.toEqual(lane);

    // Index 0 (the only occupied wait slot) matches the waiting-area anchor.
    expect(waitingGuestGridAnchor(STARTER_DOOR, 0)).toEqual(area);
    const world = waitingGuestWorldPosition(STARTER_DOOR, 0);
    expect(world.x).toBeGreaterThan(0);
    expect(world.y).toBeGreaterThan(0);
  });
});
