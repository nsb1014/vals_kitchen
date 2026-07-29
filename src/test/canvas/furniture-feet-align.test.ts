import { describe, expect, it } from "vitest";
import {
  furnitureDrawOffset,
  furnitureDrawSize,
} from "../../canvas/furniture-fit.ts";

describe("furniture feet align", () => {
  it("places 32x48 art with feet on tile bottom", () => {
    const { w, h } = furnitureDrawSize({ width: 32, height: 48 });
    expect(w).toBe(32);
    expect(h).toBe(48);
    const o = furnitureDrawOffset(w, h);
    expect(o.x).toBe(0);
    expect(o.y).toBe(-16); // TILE_PX 32 - 48
  });

  it("keeps the same logical size for high-definition 128x192 art", () => {
    const { w, h } = furnitureDrawSize({ width: 128, height: 192 });
    expect(w).toBe(32);
    expect(h).toBe(48);
    expect(furnitureDrawOffset(w, h)).toEqual({ x: 0, y: -16 });
  });
});
