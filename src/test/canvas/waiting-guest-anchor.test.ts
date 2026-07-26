import { describe, expect, it } from 'vitest';
import { STARTER_DOOR } from '../../domain/floor/starter-map.ts';
import { waitingGuestGridAnchor } from '../../canvas/world/waiting-line.ts';

describe('waiting guest anchor', () => {
  it('stands inside the room, north of the door wall tile', () => {
    const anchor = waitingGuestGridAnchor(STARTER_DOOR);
    expect(anchor).toEqual({ x: STARTER_DOOR.x, y: STARTER_DOOR.y - 1 });
  });
});
