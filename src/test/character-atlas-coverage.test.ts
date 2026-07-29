import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { GUEST_VARIANTS } from "../canvas/world/character-frames.ts";

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const FACINGS = ["left", "down", "up", "right"] as const;

describe("characters atlas coverage", () => {
  const atlas = JSON.parse(
    readFileSync(
      path.join(ROOT, "public/assets/atlases/characters.json"),
      "utf8",
    ),
  ) as { frames: Record<string, unknown> };
  const keys = new Set(Object.keys(atlas.frames));

  it("ships the high-definition Storybook v2 player walk and carry poses", () => {
    for (const facing of FACINGS) {
      for (const frame of [0, 1, 2, 3]) {
        expect(keys.has(`player_${facing}_${frame}`)).toBe(true);
      }
      expect(keys.has(`player_carry_${facing}`)).toBe(true);
    }
    expect(keys.has("player")).toBe(true);
  });

  it("ships walk + sit frames for every guest variant", () => {
    for (const variant of GUEST_VARIANTS) {
      for (const facing of FACINGS) {
        for (const frame of [0, 1, 2]) {
          expect(
            keys.has(`guest_${variant}_${facing}_${frame}`),
            `walk ${variant} ${facing} ${frame}`,
          ).toBe(true);
        }
        expect(
          keys.has(`guest_${variant}_sit_${facing}`),
          `sit ${variant} ${facing}`,
        ).toBe(true);
      }
    }
  });
});
