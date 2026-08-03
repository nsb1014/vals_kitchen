import { describe, expect, it, vi } from 'vitest';
import { connectingDoorForMain, doorForGrid } from '../../domain/floor/starter-map.ts';
import type { CameraState } from '../../canvas/coordinates.ts';

vi.mock('../../assets/loader.ts', async () => {
  const { Texture } = await import('pixi.js');
  const textures = {
    door: Texture.EMPTY,
    door_open: Texture.WHITE,
  } as const;
  return {
    getTileTexture: (name: string) =>
      name === 'door' || name === 'door_open' ? textures[name] : Texture.EMPTY,
  };
});

import { GridLayer } from '../../canvas/layers/GridLayer.ts';

const camera: CameraState = {
  x: 0,
  y: 0,
  scale: 1,
  stageOffsetX: 0,
  stageOffsetY: 0,
};

describe('GridLayer guest door state', () => {
  it('opens only the south guest door when the annex connector is present', () => {
    const layer = new GridLayer();
    const gridW = 12;
    const gridH = 10;
    const guestDoor = doorForGrid(gridW, gridH, { room: 'main' });
    const connector = connectingDoorForMain(gridW, gridH);

    layer.sync(gridW, gridH, camera, {
      room: 'main',
      kitchenAnnexOwned: true,
      guestDoorOpen: true,
    });

    expect(layer.getGuestDoorDebug()).toEqual({
      cell: guestDoor,
      requestedOpen: true,
      paintedOpen: true,
      boundTextureKey: 'door_open',
      spriteCount: 1,
    });
    expect(layer.getDoorVisualDebug()).toEqual(
      expect.arrayContaining([
        {
          cell: guestDoor,
          requestedOpen: true,
          paintedOpen: true,
          boundTextureKey: 'door_open',
        },
        {
          cell: connector,
          requestedOpen: false,
          paintedOpen: false,
          boundTextureKey: 'door',
        },
      ]),
    );
  });

  it('preserves per-cell state across repeated syncs and closes only the guest door', () => {
    const layer = new GridLayer();
    const gridW = 12;
    const gridH = 10;
    const guestDoor = doorForGrid(gridW, gridH, { room: 'main' });
    const connector = connectingDoorForMain(gridW, gridH);
    const opts = {
      room: 'main' as const,
      kitchenAnnexOwned: true,
      guestDoorOpen: true,
    };

    layer.sync(gridW, gridH, camera, opts);
    const first = layer.getDoorVisualDebug();
    layer.sync(gridW, gridH, camera, opts);
    expect(layer.getDoorVisualDebug()).toEqual(first);

    layer.sync(gridW, gridH, camera, { ...opts, guestDoorOpen: false });
    expect(layer.getGuestDoorDebug()).toMatchObject({
      requestedOpen: false,
      paintedOpen: false,
      boundTextureKey: 'door',
      spriteCount: 1,
    });
    expect(layer.getDoorVisualDebug()).toEqual(
      expect.arrayContaining([
        {
          cell: guestDoor,
          requestedOpen: false,
          paintedOpen: false,
          boundTextureKey: 'door',
        },
        {
          cell: connector,
          requestedOpen: false,
          paintedOpen: false,
          boundTextureKey: 'door',
        },
      ]),
    );
  });
});
