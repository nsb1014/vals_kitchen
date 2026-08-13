import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { GUEST_VARIANTS } from '../canvas/world/character-frames.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const FACINGS = ['left', 'down', 'up', 'right'] as const;

describe('characters atlas coverage', () => {
  const atlas = JSON.parse(
    readFileSync(path.join(ROOT, 'public/assets/atlases/characters.json'), 'utf8'),
  ) as {
    frames: Record<
      string,
      { frame: { w: number; h: number }; sourceSize: { w: number; h: number } }
    >;
  };
  const keys = new Set(Object.keys(atlas.frames));

  it('ships the exact supplied chef walk and carry cycles under player_*', () => {
    for (const facing of FACINGS) {
      for (const frame of [0, 1, 2]) {
        expect(keys.has(`player_${facing}_${frame}`)).toBe(true);
      }
    }
    for (const facing of FACINGS) {
      expect(keys.has(`player_carry_${facing}`)).toBe(true);
      for (const frame of [1, 2]) {
        expect(keys.has(`player_carry_${facing}_${frame}`)).toBe(true);
      }
    }
    expect(keys.has('player')).toBe(true);
    expect(atlas.frames.player_down_0?.sourceSize).toEqual({ w: 128, h: 160 });
  });

  it('keeps the project-owner supplied chef source byte-for-byte', () => {
    const source = readFileSync(
      path.join(ROOT, 'vendor/generated/chibi-ui/source/chef-sheet.png'),
    );
    expect(createHash('sha256').update(source).digest('hex')).toBe(
      '80d39c529aad6e5d9789f77688cc78cfea5429555ab7320d267a4c60daaa541a',
    );
  });

  it('ships walk + sit frames for every guest variant', () => {
    for (const variant of GUEST_VARIANTS) {
      for (const facing of FACINGS) {
        for (const frame of [0, 1, 2]) {
          expect(keys.has(`guest_${variant}_${facing}_${frame}`), `walk ${variant} ${facing} ${frame}`).toBe(
            true,
          );
        }
        expect(keys.has(`guest_${variant}_sit_${facing}`), `sit ${variant} ${facing}`).toBe(true);
      }
    }
  });

  it('keeps every guest sit pose on the same canvas and head height', () => {
    for (const facing of FACINGS) {
      const tops = new Set<number>();
      for (const variant of GUEST_VARIANTS) {
        const frame = atlas.frames[`guest_${variant}_sit_${facing}`] as
          | { sourceSize: { w: number; h: number }; contentBounds?: { y: number } }
          | undefined;
        expect(frame?.sourceSize).toEqual({ w: 128, h: 160 });
        expect(frame?.contentBounds).toBeTruthy();
        tops.add(frame!.contentBounds!.y);
      }
      expect(tops.size, `sit ${facing} head height drifted`).toBe(1);
    }
  });
});
