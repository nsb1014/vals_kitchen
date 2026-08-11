import { describe, expect, it, vi } from 'vitest';
import { scheduleOpenerFocusRestore } from '../ui/presentation/focus-restore.ts';

type FakeEl = HTMLElement & { id: string; isConnected: boolean };

function fakeEl(id: string): FakeEl {
  return {
    id,
    isConnected: true,
    focus: vi.fn(),
  } as unknown as FakeEl;
}

describe('scheduleOpenerFocusRestore', () => {
  it('double-rAF then refocuses a replaced opener until budget ends', () => {
    const frames: Array<(time: number) => void> = [];
    let nowMs = 0;
    let active: FakeEl | null = fakeEl('nav');
    let live = fakeEl('gear-v1');
    const focusCalls: string[] = [];

    const cancel = scheduleOpenerFocusRestore({
      budgetMs: 40,
      now: () => nowMs,
      requestAnimationFrame: (cb) => {
        frames.push(cb);
        return frames.length;
      },
      cancelAnimationFrame: () => undefined,
      getActiveElement: () => active,
      isUsable: (el): el is HTMLElement =>
        Boolean(el && (el as FakeEl).isConnected),
      shouldDeferToActive: () => false,
      resolveTarget: () => live,
      focusElement: (el) => {
        focusCalls.push((el as FakeEl).id);
        active = el as FakeEl;
      },
    });

    // Priming double-rAF
    expect(frames).toHaveLength(1);
    frames.shift()!(0);
    expect(frames).toHaveLength(1);
    frames.shift()!(0);

    // First tick: nav has focus → focus gear-v1
    expect(focusCalls).toEqual(['gear-v1']);
    expect(active?.id).toBe('gear-v1');

    // HUD rebuild replaces the node and steals focus before the next frame
    live = fakeEl('gear-v2');
    active = fakeEl('body');
    nowMs = 10;
    expect(frames).toHaveLength(1);
    frames.shift()!(0);
    expect(focusCalls).toEqual(['gear-v1', 'gear-v2']);
    expect(active?.id).toBe('gear-v2');

    // Already focused: no redundant focus call
    nowMs = 20;
    frames.shift()!(0);
    expect(focusCalls).toEqual(['gear-v1', 'gear-v2']);

    // Budget exhausted
    nowMs = 40;
    frames.shift()!(0);
    expect(frames).toHaveLength(0);

    cancel();
  });

  it('defers to a destination control when shouldDeferToActive says so', () => {
    const frames: Array<(time: number) => void> = [];
    const recipes = fakeEl('nav-recipes');
    const gear = fakeEl('hud-settings');
    let active: FakeEl | null = recipes;
    const focusElement = vi.fn((el: HTMLElement) => {
      active = el as FakeEl;
    });

    scheduleOpenerFocusRestore({
      budgetMs: 100,
      now: () => 0,
      requestAnimationFrame: (cb) => {
        frames.push(cb);
        return frames.length;
      },
      cancelAnimationFrame: () => undefined,
      getActiveElement: () => active,
      isUsable: (el): el is HTMLElement => Boolean(el),
      shouldDeferToActive: (el) => (el as FakeEl).id === 'nav-recipes',
      resolveTarget: () => gear,
      focusElement,
    });

    frames.shift()!(0);
    frames.shift()!(0);
    expect(focusElement).not.toHaveBeenCalled();
    expect(frames).toHaveLength(0);
    expect(active?.id).toBe('nav-recipes');
  });
});
