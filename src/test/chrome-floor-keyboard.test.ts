import { describe, expect, it } from 'vitest';
import {
  isFloorActionAvailable,
  nextFloorActionIndex,
  pickInitialFloorActionIndex,
} from '../ui/presentation/floor-action-keyboard.ts';

describe('chrome floor keyboard toolbar', () => {
  it('prefers the emphasized available action as the initial target', () => {
    const buttons = [
      { id: 'a', disabled: true, className: 'service-btn' },
      { id: 'b', className: 'service-btn primary' },
      { id: 'c', className: 'service-btn' },
    ];
    expect(pickInitialFloorActionIndex(buttons)).toBe(1);
    expect(isFloorActionAvailable(buttons[0]!)).toBe(false);
    expect(isFloorActionAvailable(buttons[1]!)).toBe(true);
  });

  it('falls back to the first available action when none are primary', () => {
    const buttons = [
      { id: 'a', disabled: true, className: 'service-btn' },
      { id: 'b', disabled: true, className: 'service-btn primary' },
      { id: 'c', className: 'service-btn' },
    ];
    expect(pickInitialFloorActionIndex(buttons)).toBe(2);
  });

  it('wraps arrow navigation across the strip', () => {
    const buttons = [
      { id: 'floor-set-table', className: 'service-btn primary' },
      { id: 'floor-seat-next', className: 'service-btn' },
      { id: 'floor-take-orders', className: 'service-btn' },
    ];
    expect(nextFloorActionIndex(buttons, 0, 1)).toBe(1);
    expect(nextFloorActionIndex(buttons, 2, 1)).toBe(0);
    expect(nextFloorActionIndex(buttons, 0, -1)).toBe(2);
  });
});
