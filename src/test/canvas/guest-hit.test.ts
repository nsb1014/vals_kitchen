import { describe, expect, it } from 'vitest';
import type { GuestStage } from '../../domain/floor/types.ts';
import {
  anchoredSpriteContentWorldBounds,
  expandGuestHitBounds,
  guestHitBoundsContainPoint,
  isServiceGuestHitEligible,
  minimumGuestHitWorldSize,
  renderedAlphaMaskContainsWorldPoint,
  renderedNodePaintsAbove,
  resolveTopmostGuestHit,
  type GuestHitTargetCandidate,
  type GuestWorldBounds,
} from '../../canvas/world/guest-hit.ts';

const SMALL_BOUNDS: GuestWorldBounds = {
  left: 10,
  top: 20,
  right: 30,
  bottom: 30,
};

function width(bounds: GuestWorldBounds): number {
  return bounds.right - bounds.left;
}

function height(bounds: GuestWorldBounds): number {
  return bounds.bottom - bounds.top;
}

function candidate(
  guestId: string,
  sortY: number,
  paintOrder: number,
  bounds: GuestWorldBounds = SMALL_BOUNDS,
): GuestHitTargetCandidate {
  return { guestId, sortY, paintOrder, bounds };
}

describe('guest hit geometry', () => {
  it('maps authored alpha bounds through the actor feet anchor', () => {
    expect(
      anchoredSpriteContentWorldBounds({
        rootX: 100,
        rootY: 200,
        spriteX: 0,
        spriteY: 0,
        sourceWidth: 128,
        sourceHeight: 160,
        contentBounds: { left: 25, top: 28, right: 102, bottom: 156 },
        anchorX: 0.5,
        anchorY: 1,
        scaleX: 0.375,
        scaleY: 0.375,
      }),
    ).toEqual({ left: 85.375, top: 150.5, right: 114.25, bottom: 198.5 });
  });

  it('maps displayed sprite pixels to the exact alpha silhouette', () => {
    const geometry = {
      rootX: 64,
      rootY: 64,
      spriteX: -6,
      spriteY: -12,
      displayWidth: 44,
      displayHeight: 44,
      maskWidth: 4,
      maskHeight: 4,
      alpha: new Uint8Array([
        0, 0, 0, 0,
        0, 255, 255, 0,
        0, 255, 255, 0,
        0, 0, 0, 0,
      ]),
    };

    expect(renderedAlphaMaskContainsWorldPoint({ x: 69, y: 57 }, geometry)).toBe(false);
    expect(renderedAlphaMaskContainsWorldPoint({ x: 75, y: 63 }, geometry)).toBe(true);
    expect(renderedAlphaMaskContainsWorldPoint({ x: 101, y: 95 }, geometry)).toBe(false);
  });

  it('compares post-sort paint order only after shared z depth', () => {
    expect(
      renderedNodePaintsAbove(
        { sortY: 96, paintOrder: 4 },
        { sortY: 94, paintOrder: 20 },
      ),
    ).toBe(true);
    expect(
      renderedNodePaintsAbove(
        { sortY: 96, paintOrder: 5 },
        { sortY: 96, paintOrder: 4 },
      ),
    ).toBe(true);
    expect(
      renderedNodePaintsAbove(
        { sortY: 94, paintOrder: 20 },
        { sortY: 96, paintOrder: 4 },
      ),
    ).toBe(false);
  });

  it('normalizes content bounds when a sprite axis is mirrored', () => {
    const bounds = anchoredSpriteContentWorldBounds({
      rootX: 100,
      rootY: 200,
      spriteX: 0,
      spriteY: 0,
      sourceWidth: 128,
      sourceHeight: 160,
      contentBounds: { left: 25, top: 28, right: 102, bottom: 156 },
      anchorX: 0.5,
      anchorY: 1,
      scaleX: -0.375,
      scaleY: 0.375,
    });
    expect(bounds.left).toBeLessThan(bounds.right);
    expect(bounds).toEqual({
      left: 85.75,
      top: 150.5,
      right: 114.625,
      bottom: 198.5,
    });
  });

  it.each([0.5, 1, 2])(
    'keeps both axes at least 44 CSS pixels at camera scale %s',
    (scale) => {
      const expanded = expandGuestHitBounds(SMALL_BOUNDS, scale);
      expect(width(expanded) * scale).toBeGreaterThanOrEqual(44);
      expect(height(expanded) * scale).toBeGreaterThanOrEqual(44);
      expect(minimumGuestHitWorldSize(scale) * scale).toBe(44);

      expect((expanded.left + expanded.right) / 2).toBe(20);
      expect((expanded.top + expanded.bottom) / 2).toBe(25);
    },
  );

  it('never shrinks authored bounds that already exceed the minimum', () => {
    const authored = { left: -40, top: -30, right: 50, bottom: 60 };
    expect(expandGuestHitBounds(authored, 2)).toEqual(authored);
  });

  it('clamps invalid and tiny camera scales to 0.01', () => {
    expect(minimumGuestHitWorldSize(0)).toBe(4_400);
    expect(minimumGuestHitWorldSize(Number.NaN)).toBe(4_400);
    expect(minimumGuestHitWorldSize(Number.POSITIVE_INFINITY)).toBe(4_400);
    expect(minimumGuestHitWorldSize(-2)).toBe(4_400);
    expect(minimumGuestHitWorldSize(0.001)).toBe(4_400);
  });

  it('includes exact edges and excludes points immediately outside them', () => {
    const bounds = expandGuestHitBounds(SMALL_BOUNDS, 1);
    const epsilon = 0.001;
    expect(guestHitBoundsContainPoint(bounds, { x: bounds.left, y: bounds.top })).toBe(true);
    expect(guestHitBoundsContainPoint(bounds, { x: bounds.right, y: bounds.bottom })).toBe(true);
    expect(
      guestHitBoundsContainPoint(bounds, {
        x: bounds.left - epsilon,
        y: bounds.top,
      }),
    ).toBe(false);
    expect(
      guestHitBoundsContainPoint(bounds, {
        x: bounds.right,
        y: bounds.bottom + epsilon,
      }),
    ).toBe(false);
  });
});

describe('service guest hit eligibility', () => {
  const allStages: GuestStage[] = [
    'queued',
    'entering',
    'waiting',
    'seating',
    'seated',
    'ordered',
    'eating',
    'leaving',
    'done',
  ];

  it('allows only seated guests without a carried ticket', () => {
    for (const stage of allStages) {
      expect(isServiceGuestHitEligible(stage, false), stage).toBe(
        stage === 'seated',
      );
    }
  });

  it('allows seated, ordered, and eating guests with a carried ticket', () => {
    const eligible = new Set<GuestStage>(['seated', 'ordered', 'eating']);
    for (const stage of allStages) {
      expect(isServiceGuestHitEligible(stage, true), stage).toBe(
        eligible.has(stage),
      );
    }
  });
});

describe('topmost guest hit resolution', () => {
  const point = { x: 20, y: 25 };

  it('returns null when no expanded target contains the point', () => {
    const farAway = candidate('far', 100, 10, {
      left: 200,
      top: 200,
      right: 240,
      bottom: 240,
    });
    expect(resolveTopmostGuestHit(point, [farAway], 1)).toBeNull();
  });

  it('chooses the greatest actor feet sortY', () => {
    const back = candidate('back', 90, 10);
    const front = candidate('front', 120, 1);
    expect(resolveTopmostGuestHit(point, [front, back], 1)).toBe(front);
    expect(resolveTopmostGuestHit(point, [back, front], 1)).toBe(front);
  });

  it('prefers visible content over another guest\'s expanded touch padding', () => {
    const visible = candidate('visible', 90, 1, {
      left: 15,
      top: 20,
      right: 25,
      bottom: 30,
    });
    const paddedForeground = candidate('padded-foreground', 120, 10, {
      left: 31,
      top: 20,
      right: 41,
      bottom: 30,
    });
    expect(
      guestHitBoundsContainPoint(
        expandGuestHitBounds(paddedForeground.bounds, 1),
        point,
      ),
    ).toBe(true);
    expect(
      guestHitBoundsContainPoint(paddedForeground.bounds, point),
    ).toBe(false);
    expect(resolveTopmostGuestHit(point, [paddedForeground, visible], 1)).toBe(
      visible,
    );
  });

  it('uses greatest paint order when sortY ties', () => {
    const earlier = candidate('earlier', 100, 3);
    const later = candidate('later', 100, 8);
    expect(resolveTopmostGuestHit(point, [later, earlier], 1)).toBe(later);
    expect(resolveTopmostGuestHit(point, [earlier, later], 1)).toBe(later);
  });

  it('uses lexicographically greatest guest id as the deterministic final tie', () => {
    const alpha = candidate('guest_a', 100, 8);
    const beta = candidate('guest_b', 100, 8);
    expect(resolveTopmostGuestHit(point, [beta, alpha], 1)).toBe(beta);
    expect(resolveTopmostGuestHit(point, [alpha, beta], 1)).toBe(beta);
  });
});
