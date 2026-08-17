import { readFileSync } from 'node:fs';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  actorEatingPulse,
  actorIdleBreathe,
  DRAW_QUEUED_GUEST_SILHOUETTE,
  walkStepSquash,
  WALK_SQUASH_AMPLITUDE,
  WALK_SQUASH_MS,
} from '../canvas/world/ActorLayer.ts';
import { DOOR_BOUNCE_MS } from '../canvas/layers/GridLayer.ts';
import { ATMOSPHERE_ENABLED } from '../canvas/layers/AtmosphereLayer.ts';

describe('walk squash helpers', () => {
  it('disables walk squash so stride frames never bounce the sprite', () => {
    expect(WALK_SQUASH_AMPLITUDE).toBe(0);
    expect(walkStepSquash(0)).toEqual({ x: 1, y: 1 });
    expect(walkStepSquash(0.5)).toEqual({ x: 1, y: 1 });
    expect(walkStepSquash(1)).toEqual({ x: 1, y: 1 });
    expect(WALK_SQUASH_MS).toBeGreaterThanOrEqual(60);
    expect(WALK_SQUASH_MS).toBeLessThanOrEqual(90);
  });

  it('clamps out-of-range t', () => {
    expect(walkStepSquash(-1)).toEqual({ x: 1, y: 1 });
    expect(walkStepSquash(2)).toEqual({ x: 1, y: 1 });
  });
});

describe('idle / eating canvas loops', () => {
  it('disables idle breathe entirely (no scale pulse)', () => {
    expect(actorIdleBreathe(0)).toEqual({ scaleX: 1, scaleY: 1 });
    expect(actorIdleBreathe(520, 2)).toEqual({ scaleX: 1, scaleY: 1 });
  });

  it('disables eating chew pulse entirely', () => {
    expect(actorEatingPulse(90, 1)).toEqual({ scaleX: 1, scaleY: 1 });
    expect(actorEatingPulse(0, 0)).toEqual({ scaleX: 1, scaleY: 1 });
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

describe('disabled floor juice', () => {
  it('does not draw queued door-line silhouettes or squash the door', () => {
    expect(DRAW_QUEUED_GUEST_SILHOUETTE).toBe(false);
    expect(DOOR_BOUNCE_MS).toBe(0);
    expect(ATMOSPHERE_ENABLED).toBe(false);
  });
});

describe('review overlay CSS', () => {
  it('dims the live floor behind a pending review sheet', () => {
    const css = readFileSync(
      new URL('../ui/styles/service-day.css', import.meta.url),
      'utf8',
    );
    expect(css).toMatch(
      /\.service-overlay:has\(\.review-service-panel\)\s*\{[^}]*background:\s*rgba\(\s*8,\s*4,\s*2,\s*0\.(6|7|8)/s,
    );
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

  it('spawns no floor particles even when fx textures are present', async () => {
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
    layer.burstDoorDust(1, 2);
    layer.burstSteam(10, 20);
    layer.burstReview(0, 0);
    layer.burstPlacement(8, 12);
    expect(layer.getActiveCount()).toBe(0);
    layer.update(50);
    expect(layer.getActiveCount()).toBe(0);
  });
});
