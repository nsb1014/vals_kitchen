import { Container, type Sprite } from 'pixi.js';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../assets/loader.ts', async () => {
  const { Texture } = await import('pixi.js');
  const texture = Texture.EMPTY;
  return {
    getCharacterTexture: () => texture,
    getCharacterContentBounds: () => ({ x: 0, y: 0, w: 1, h: 1 }),
  };
});

import { getCharacterTexture } from '../../assets/loader.ts';
import type { Customer } from '../../domain/day/types.ts';
import type { FloorDay, FloorGuest } from '../../domain/floor/types.ts';
import type { GuestMotion, GuestPose } from '../../canvas/world/GuestMotion.ts';
import {
  ActorLayer,
  doorwayGuestCropFraction,
  guestDoorwayCropGeometry,
  topClippedGuestWorldBoundsAtAperture,
} from '../../canvas/world/ActorLayer.ts';

const door = { x: 4, y: 9 };
const doorCenterY = door.y * 32 + 16;
const laneCenterY = doorCenterY - 32;
const apertureWorldY = door.y * 32 - 2;

const customer: Customer = {
  id: 'door-guest',
  archetypeId: 'comfort_seeker',
  preference: { primary: { UM: 'mid' }, avoid: {}, phrases: ['savory'] },
};

function floorGuest(stage: FloorGuest['stage']): FloorGuest {
  return {
    id: 'door-guest',
    customer,
    stage,
    eatTicksRemaining: 0,
  };
}

function floorWith(guest: FloorGuest): FloorDay {
  return {
    pool: [guest],
    tables: [],
    seats: [],
    tickets: [],
    carriedTicketId: null,
    selectedTicketId: null,
    tutorialStep: null,
    playerPosition: { x: 1, y: 1 },
  };
}

const nav = {
  worldX: 48,
  worldY: 48,
  facing: 1 as const,
  isMoving: false,
  walkFrame: () => 0,
  destination: null,
};

function motionAt(pose: GuestPose): GuestMotion {
  return { pose: () => pose } as unknown as GuestMotion;
}

describe('ActorLayer doorway crop geometry', () => {
  it('derives expanded-door progress from the authoritative door', () => {
    expect(
      doorwayGuestCropFraction(
        'entering',
        { worldY: doorCenterY, isMoving: true },
        door,
      ),
    ).toBe(0);
    expect(
      doorwayGuestCropFraction(
        'entering',
        { worldY: doorCenterY - 16, isMoving: true },
        door,
      ),
    ).toBe(0.5);
    expect(
      doorwayGuestCropFraction(
        'leaving',
        { worldY: laneCenterY, isMoving: false },
        door,
      ),
    ).toBe(1);
  });

  it('keeps partial translated content attached to one fixed aperture', () => {
    const bounds = { left: 10, top: 250, right: 42, bottom: 310 };
    const crop = guestDoorwayCropGeometry(
      bounds,
      'entering',
      { worldY: doorCenterY - 16, isMoving: true },
      door,
    );
    expect(crop).not.toBeNull();
    expect(crop).toMatchObject({
      progress: 0.5,
      apertureWorldY,
      maskApplied: true,
      contentRenderable: true,
    });
    expect(crop!.visualOffsetY).toBe((apertureWorldY - bounds.top) * 0.5);
    expect(crop!.clippedWorldBounds!.top).toBe(
      bounds.top + crop!.visualOffsetY,
    );
    expect(crop!.clippedWorldBounds!.bottom).toBe(apertureWorldY);
    expect(crop!.visibleFraction).toBeCloseTo(
      (apertureWorldY - crop!.unclippedWorldBounds.top) /
        (bounds.bottom - bounds.top),
    );
  });

  it('places the translated top at the aperture at zero and removes the offset at full', () => {
    const zeroBounds = {
      left: 10,
      top: apertureWorldY - 28,
      right: 42,
      bottom: apertureWorldY + 32,
    };
    const zero = guestDoorwayCropGeometry(
      zeroBounds,
      'entering',
      { worldY: doorCenterY, isMoving: false },
      door,
    );
    expect(zero).toMatchObject({
      progress: 0,
      visibleFraction: 0,
      apertureWorldY,
      visualOffsetY: 28,
      maskApplied: true,
      contentRenderable: false,
      clippedWorldBounds: null,
    });
    expect(zero!.unclippedWorldBounds.top).toBe(apertureWorldY);

    const fullBounds = {
      left: 10,
      top: apertureWorldY - 60,
      right: 42,
      bottom: apertureWorldY,
    };
    expect(
      guestDoorwayCropGeometry(
        fullBounds,
        'entering',
        { worldY: laneCenterY, isMoving: false },
        door,
      ),
    ).toBeNull();
  });

  it('clips only the translated bottom and leaves non-door stages uncropped', () => {
    expect(
      topClippedGuestWorldBoundsAtAperture(
        { left: 10, top: 20, right: 42, bottom: 80 },
        50,
      ),
    ).toEqual({ left: 10, top: 20, right: 42, bottom: 50 });
    expect(
      topClippedGuestWorldBoundsAtAperture(
        { left: 10, top: 50, right: 42, bottom: 80 },
        50,
      ),
    ).toBeNull();
    expect(
      guestDoorwayCropGeometry(
        { left: 10, top: 20, right: 42, bottom: 80 },
        'waiting',
        { worldY: doorCenterY, isMoving: true },
        door,
      ),
    ).toBeNull();
  });
});

describe('ActorLayer doorway crop integration', () => {
  it('applies an attached mask at an expanded door and resets content afterward', () => {
    const depth = new Container();
    const layer = new ActorLayer(depth);
    const guest = floorGuest('entering');
    const partialPose: GuestPose = {
      worldX: door.x * 32 + 16,
      worldY: doorCenterY - 31.68,
      facing: 2,
      isMoving: true,
      walkFrame: 1,
    };

    layer.sync(floorWith(guest), nav, motionAt(partialPose), {
      guestDoor: door,
    });
    const partial = layer.getGuestVisualDebug(guest.id);
    expect(partial?.doorwayCrop).toMatchObject({
      apertureWorldY,
      maskApplied: true,
      contentRenderable: true,
    });
    expect(partial!.doorwayCrop!.progress).toBeCloseTo(0.99);
    expect(partial!.doorwayCrop!.clippedWorldBounds!.bottom).toBe(
      apertureWorldY,
    );
    expect(partial!.actualMaskWorldBounds).not.toBeNull();
    expect(partial!.actualMaskWorldBounds!.right).toBeGreaterThan(
      partial!.actualMaskWorldBounds!.left,
    );
    expect(partial!.actualMaskWorldBounds!.left).toBeCloseTo(
      partial!.doorwayCrop!.clippedWorldBounds!.left,
    );
    expect(partial!.actualMaskWorldBounds!.top).toBeCloseTo(
      partial!.doorwayCrop!.clippedWorldBounds!.top,
    );
    expect(partial!.actualMaskWorldBounds!.right).toBeCloseTo(
      partial!.doorwayCrop!.clippedWorldBounds!.right,
    );
    expect(partial!.actualMaskWorldBounds!.bottom).toBe(apertureWorldY);
    expect(partial!.textureMatchesActualBoundFrame).toBe(true);

    const root = depth.children.at(-1) as Container;
    const content = root.children[0] as Container;
    const cropMask = root.children[1];
    const sprite = content.children[0] as Sprite;
    expect(content.y).toBe(partial!.doorwayCrop!.visualOffsetY);
    expect(content.mask).toBe(cropMask);
    expect(content.renderable).toBe(true);
    expect(sprite.texture).toBe(
      getCharacterTexture(partial!.actualBoundFrameKey),
    );

    const fullPose: GuestPose = {
      ...partialPose,
      worldY: laneCenterY,
      facing: 1,
      isMoving: false,
    };
    layer.sync(floorWith(guest), nav, motionAt(fullPose), {
      guestDoor: door,
    });
    expect(layer.getGuestVisualDebug(guest.id)?.doorwayCrop).toBeNull();
    expect(layer.getGuestVisualDebug(guest.id)?.actualMaskWorldBounds).toBeNull();
    expect(content.y).toBe(0);
    expect(content.mask ?? null).toBeNull();
    expect(content.renderable).toBe(true);
  });

  it('makes the exact door endpoint non-renderable without changing sprite alpha', () => {
    const depth = new Container();
    const layer = new ActorLayer(depth);
    const guest = floorGuest('leaving');
    const pose: GuestPose = {
      worldX: door.x * 32 + 16,
      worldY: doorCenterY,
      facing: 1,
      isMoving: false,
      walkFrame: 0,
    };
    layer.sync(floorWith(guest), nav, motionAt(pose), { guestDoor: door });
    const debug = layer.getGuestVisualDebug(guest.id)!;
    expect(debug.alpha).toBe(1);
    expect(debug.doorwayCrop).toMatchObject({
      progress: 0,
      visibleFraction: 0,
      maskApplied: true,
      contentRenderable: false,
      clippedWorldBounds: null,
    });
    expect(debug.actualMaskWorldBounds).toBeNull();
    expect(debug.textureMatchesActualBoundFrame).toBe(true);
    const root = depth.children.at(-1) as Container;
    const content = root.children[0] as Container;
    expect(content.renderable).toBe(false);
    expect(content.mask).toBe(root.children[1]);
  });
});
