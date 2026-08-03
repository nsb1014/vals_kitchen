import { describe, expect, it } from 'vitest';
import { computeChatBubblePlacement } from '../../ui/presentation/chat-bubble-placement.ts';

const mount = { left: 0, top: 100, width: 390, height: 620 };
const bubble = { width: 288, height: 72 };

describe('chat bubble placement', () => {
  it('keeps a left-edge guest bubble inside the mount and points its tail back', () => {
    expect(computeChatBubblePlacement({ x: 70, y: 280 }, mount, bubble)).toEqual({
      left: 156,
      top: 180,
      tailOffsetX: -86,
    });
  });

  it('keeps a right-edge guest bubble inside the mount', () => {
    expect(computeChatBubblePlacement({ x: 370, y: 280 }, mount, bubble)).toEqual({
      left: 234,
      top: 180,
      tailOffsetX: 124,
    });
  });

  it('keeps a centered bubble centered over its guest', () => {
    expect(computeChatBubblePlacement({ x: 195, y: 400 }, mount, bubble)).toEqual({
      left: 195,
      top: 300,
      tailOffsetX: 0,
    });
  });

  it('keeps the bubble top edge inside a short mount', () => {
    expect(
      computeChatBubblePlacement(
        { x: 195, y: 110 },
        { ...mount, height: 140 },
        bubble,
      ).top,
    ).toBe(84);
  });

  it('anchors an oversized bubble at the bottom of an impossibly short mount', () => {
    expect(
      computeChatBubblePlacement(
        { x: 195, y: 150 },
        { ...mount, height: 60 },
        bubble,
      ).top,
    ).toBe(48);
  });
});
