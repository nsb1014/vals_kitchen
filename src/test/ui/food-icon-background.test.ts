import { describe, expect, it, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  foodIconBackgroundStyle,
  preloadFoodIconManifest,
} from '../../assets/food-icon-manifest.ts';

describe('food icon background style', () => {
  beforeAll(async () => {
    const json = readFileSync(
      resolve(process.cwd(), 'public/assets/atlases/food.json'),
      'utf8',
    );
    globalThis.fetch = async () =>
      new Response(json, { status: 200, headers: { 'Content-Type': 'application/json' } });
    await preloadFoodIconManifest();
  });

  it('keeps background scale matched to the rendered box (no atlas bleed)', () => {
    const style = foodIconBackgroundStyle('icon_egg', 32);
    expect(style).toBeTruthy();
    expect(style).toContain('width:32px');
    expect(style).toContain('height:32px');
    expect(style).toContain('overflow:hidden');
    // 320px atlas at 32/32 scale → background-size 320×320
    expect(style).toContain('background-size:320px 320px');
  });
});
