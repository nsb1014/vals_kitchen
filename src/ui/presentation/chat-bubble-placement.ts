export interface BubbleRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface ChatBubblePlacement {
  left: number;
  top: number;
  tailOffsetX: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** Place an above-actor bubble inside its mount while keeping the tail aimed at the actor. */
export function computeChatBubblePlacement(
  anchor: { x: number; y: number },
  mount: BubbleRect,
  bubble: { width: number; height: number },
  margin = 12,
): ChatBubblePlacement {
  const desiredLeft = anchor.x - mount.left;
  const desiredTop = anchor.y - mount.top;
  const halfWidth = bubble.width / 2;
  const minLeft = margin + halfWidth;
  const maxLeft = mount.width - margin - halfWidth;
  const left =
    minLeft <= maxLeft
      ? clamp(desiredLeft, minLeft, maxLeft)
      : mount.width / 2;
  const minTop = bubble.height + margin;
  const maxTop = mount.height - margin;
  const top =
    minTop <= maxTop
      ? clamp(desiredTop, minTop, maxTop)
      : Math.max(0, maxTop);
  const tailInset = Math.min(20, Math.max(7, halfWidth - 1));
  const tailOffsetX = clamp(
    desiredLeft - left,
    -halfWidth + tailInset,
    halfWidth - tailInset,
  );

  return { left, top, tailOffsetX };
}
