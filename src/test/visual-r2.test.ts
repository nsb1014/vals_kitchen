import { readFileSync } from 'node:fs';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  actorEatingPulse,
  actorIdleBreathe,
  walkStepSquash,
  WALK_SQUASH_AMPLITUDE,
  WALK_SQUASH_MS,
} from '../canvas/world/ActorLayer.ts';

describe('walk squash helpers', () => {
  it('keeps identity at step endpoints and peaks mid-step within ±6%', () => {
    expect(walkStepSquash(0)).toEqual({ x: 1, y: 1 });
    expect(walkStepSquash(1)).toEqual({ x: 1, y: 1 });
    const mid = walkStepSquash(0.5);
    expect(mid.x).toBeCloseTo(1 + WALK_SQUASH_AMPLITUDE, 5);
    expect(mid.y).toBeCloseTo(1 - WALK_SQUASH_AMPLITUDE, 5);
    expect(Math.abs(mid.x - 1)).toBeLessThanOrEqual(0.06);
    expect(Math.abs(mid.y - 1)).toBeLessThanOrEqual(0.06);
    expect(WALK_SQUASH_MS).toBeGreaterThanOrEqual(60);
    expect(WALK_SQUASH_MS).toBeLessThanOrEqual(90);
  });

  it('clamps out-of-range t', () => {
    expect(walkStepSquash(-1)).toEqual({ x: 1, y: 1 });
    expect(walkStepSquash(2)).toEqual({ x: 1, y: 1 });
  });
});

describe('idle / eating canvas loops', () => {
  it('keeps idle motion vertical-free: breathe scale only, feet planted', () => {
    // The rhythmic vertical idle bob was removed — actors must not translate
    // up/down while standing, waiting, or seated (it read as bouncing).
    const breathe = actorIdleBreathe(0);
    expect(Math.abs(breathe.scaleX - 1)).toBeLessThanOrEqual(0.02);
    expect(Math.abs(breathe.scaleY - 1)).toBeLessThanOrEqual(0.02);
    expect('offsetY' in breathe).toBe(false);
  });

  it('eating pulse uses scale only within subtle bounds', () => {
    const pulse = actorEatingPulse(90, 1);
    expect(Math.abs(pulse.scaleX - 1)).toBeLessThanOrEqual(0.04);
    expect(Math.abs(pulse.scaleY - 1)).toBeLessThanOrEqual(0.04);
    expect('offsetY' in pulse).toBe(false);
  });
});

describe('pixelated canvas CSS cascade', () => {
  it('keeps .restaurant-canvas on pixelated / crisp-edges (no trailing auto override)', () => {
    const css = readFileSync(
      new URL('../ui/styles/global.css', import.meta.url),
      'utf8',
    );
    const blocks = [...css.matchAll(/\.restaurant-canvas\s*\{([^}]+)\}/g)].map(
      (m) => m[1]!,
    );
    expect(blocks.length).toBeGreaterThanOrEqual(1);
    for (const block of blocks) {
      expect(block).not.toMatch(/image-rendering:\s*auto\b/);
      expect(block).toMatch(/image-rendering:\s*pixelated/);
    }
  });
});

describe('celebration vs notice stacking CSS', () => {
  it('stacks banners in a column instead of a shared grid cell', () => {
    const css = readFileSync(
      new URL('../ui/styles/global.css', import.meta.url),
      'utf8',
    );
    expect(css).toMatch(
      /\.celebration-banner-host\s*\{[^}]*flex-direction:\s*column-reverse/s,
    );
    expect(css).not.toMatch(
      /\.celebration-banner,\s*\.notice-banner\s*\{[^}]*grid-area:\s*1\s*\/\s*1/s,
    );
  });
});

describe('EffectsLayer amplitude (round 2)', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('spawns denser pooled bursts and updates without growing active past clear', async () => {
    const textures = new Map<string, object>();
    vi.doMock('../assets/loader.ts', () => ({
      getTileTexture: (name: string) => {
        if (!textures.has(name)) textures.set(name, { label: name });
        return textures.get(name);
      },
    }));
    const { EffectsLayer } = await import('../canvas/layers/EffectsLayer.ts');
    const layer = new EffectsLayer();
    layer.burstServe(40, 80);
    // Serve is a gentle place-down (steam + sparkles), not a star/coin shower.
    expect(layer.getActiveCount()).toBeGreaterThanOrEqual(3);
    expect(layer.getActiveCount()).toBeLessThanOrEqual(5);
    const afterServe = layer.getActiveCount();
    layer.burstDoorDust(1, 2);
    expect(layer.getActiveCount()).toBeGreaterThan(afterServe);
    layer.burstSteam(10, 20);
    expect(layer.getActiveCount()).toBeGreaterThan(afterServe + 1);

    for (let i = 0; i < 40; i += 1) layer.update(50);
    expect(layer.getActiveCount()).toBe(0);

    layer.burstReview(0, 0);
    const n = layer.getActiveCount();
    layer.clear();
    expect(layer.getActiveCount()).toBe(0);
    expect(n).toBeGreaterThanOrEqual(9);
  });
});
