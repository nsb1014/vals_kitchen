import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

describe('coordinated décor atlas', () => {
  const atlas = JSON.parse(
    readFileSync(path.join(ROOT, 'public/assets/atlases/furniture.json'), 'utf8'),
  ) as {
    frames: Record<string, { sourceSize: { w: number; h: number } }>;
  };

  it('ships the five props at their authored proportions instead of legacy pixel boxes', () => {
    expect(atlas.frames.decor_plant?.sourceSize).toEqual({ w: 80, h: 104 });
    expect(atlas.frames.decor_flowers?.sourceSize).toEqual({ w: 64, h: 80 });
    expect(atlas.frames.decor_rug?.sourceSize).toEqual({ w: 104, h: 72 });
    expect(atlas.frames.decor_lamp?.sourceSize).toEqual({ w: 72, h: 108 });
    expect(atlas.frames.decor_sign?.sourceSize).toEqual({ w: 80, h: 104 });
  });
});
