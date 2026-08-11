import { describe, expect, it } from 'vitest';
import {
  ACTOR_MOUTH_FROM_TOP_RATIO,
  actorMouthWorldFromFeet,
  mouthAnchorFromContentBounds,
  playerMouthWorldFromFeet,
} from '../canvas/world/actor-mouth-anchor.ts';
import {
  GUEST_DISPLAY_HEIGHT,
  PLAYER_DISPLAY_HEIGHT,
  SEATED_GUEST_DISPLAY_HEIGHT,
} from '../canvas/world/actor-metrics.ts';
import { easePathDistance, easeSegmentProgress } from '../canvas/world/NavController.ts';
import { tutorialPrompt } from '../domain/floor/tutorial.ts';
import { worldToScreen, type CameraState } from '../canvas/coordinates.ts';

describe('floor-feel round 2 — mouth anchors', () => {
  it('places mouth near the top of the scaled 128×160 frame', () => {
    const feet = { x: 100, y: 200 };
    const standing = actorMouthWorldFromFeet(feet, 'standing');
    expect(standing.x).toBe(100);
    expect(standing.y).toBeCloseTo(
      feet.y -
        GUEST_DISPLAY_HEIGHT +
        GUEST_DISPLAY_HEIGHT * ACTOR_MOUTH_FROM_TOP_RATIO,
    );

    const seated = actorMouthWorldFromFeet(feet, 'seated');
    expect(seated.y).toBeCloseTo(
      feet.y -
        SEATED_GUEST_DISPLAY_HEIGHT +
        SEATED_GUEST_DISPLAY_HEIGHT * ACTOR_MOUTH_FROM_TOP_RATIO,
    );

    const player = playerMouthWorldFromFeet(feet);
    expect(player.y).toBeCloseTo(
      feet.y -
        PLAYER_DISPLAY_HEIGHT +
        PLAYER_DISPLAY_HEIGHT * ACTOR_MOUTH_FROM_TOP_RATIO,
    );
  });

  it('uses content-bounds mouth so frame padding does not float the tail', () => {
    const bounds = { left: 10, top: 40, right: 50, bottom: 100 };
    const mouth = mouthAnchorFromContentBounds(bounds);
    expect(mouth.x).toBe(30);
    expect(mouth.y).toBeCloseTo(40 + 60 * ACTOR_MOUTH_FROM_TOP_RATIO);
  });

  it('maps mouth world points through camera follow/zoom to screen space', () => {
    const camera: CameraState = {
      x: 20,
      y: 10,
      scale: 2,
      stageOffsetX: 40,
      stageOffsetY: 80,
    };
    const mouth = actorMouthWorldFromFeet({ x: 100, y: 200 }, 'standing');
    const screen = worldToScreen(mouth.x, mouth.y, camera);
    expect(screen.x).toBeCloseTo((mouth.x - 20) * 2 + 40);
    expect(screen.y).toBeCloseTo((mouth.y - 10) * 2 + 80);

    const desktopish: CameraState = {
      x: 0,
      y: 0,
      scale: 1,
      stageOffsetX: 0,
      stageOffsetY: 0,
    };
    const mobileish: CameraState = {
      x: 64,
      y: 96,
      scale: 1.25,
      stageOffsetX: 12,
      stageOffsetY: 24,
    };
    const a = worldToScreen(mouth.x, mouth.y, desktopish);
    const b = worldToScreen(mouth.x, mouth.y, mobileish);
    expect(a.x).not.toBeCloseTo(b.x);
    expect(a.y).not.toBeCloseTo(b.y);
  });
});

describe('floor-feel round 2 — corner forgiveness', () => {
  it('does not ease mid path distance to a stop', () => {
    expect(easeSegmentProgress(0, 'mid')).toBe(0);
    expect(easeSegmentProgress(0.5, 'mid')).toBe(0.5);
    expect(easeSegmentProgress(1, 'mid')).toBe(1);
    expect(easeSegmentProgress(0.25, 'first')).toBeLessThan(0.25);
    expect(easeSegmentProgress(0.75, 'last')).toBeGreaterThan(0.75);
    // Path-global easing keeps unit slope into/out of the linear mid band.
    expect(easePathDistance(1.2, 3)).toBeCloseTo(1.2);
    expect(easePathDistance(0.2, 3)).toBeLessThan(0.2);
  });
});

describe('floor-feel round 2 — morning-gate copy', () => {
  it('tells the player to set tables before seating the visible door guest', () => {
    const prompt = tutorialPrompt('set_tables');
    expect(prompt).toMatch(/set every table/i);
    expect(prompt).toMatch(/guest/i);
    expect(prompt).toMatch(/seat/i);
  });
});
