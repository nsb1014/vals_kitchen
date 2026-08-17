import { expect, test, type Page } from '@playwright/test';
import {
  assertNoDiagnostics,
  gotoFreshGame,
  type PageDiagnostics,
} from './helpers.ts';
import { TILE_PX } from '../../src/canvas/coordinates.ts';
import {
  guestSitFrameKey,
  guestVariant,
  guestWalkFrameKey,
} from '../../src/canvas/world/character-frames.ts';
import {
  SEAT_NS_HIP_OFFSET_PX,
  SEAT_SIT_OFFSET_Y,
} from '../../src/canvas/world/seat-sit.ts';

const SEATED_FEET_FROM_NAV_Y = TILE_PX / 2 - 2;
const NORTH_BEHIND_TABLE =
  TILE_PX * 2 -
  (TILE_PX / 2 + SEAT_NS_HIP_OFFSET_PX + SEATED_FEET_FROM_NAV_Y) -
  SEAT_SIT_OFFSET_Y;
const WEST_BEHIND_TABLE =
  TILE_PX - (TILE_PX / 2 + SEATED_FEET_FROM_NAV_Y) - SEAT_SIT_OFFSET_Y;
const SOUTH_IN_FRONT_OF_TABLE =
  TILE_PX / 2 - SEAT_NS_HIP_OFFSET_PX + SEATED_FEET_FROM_NAV_Y + SEAT_SIT_OFFSET_Y;

const VIEWPORTS = [
  { name: 'mobile', width: 390, height: 844 },
  { name: 'desktop', width: 1280, height: 800 },
] as const;

const ACTOR_FACING_BY_SEAT = {
  0: 'down',
  90: 'right',
  180: 'up',
  270: 'left',
} as const;

async function openRunningFloor(
  page: Page,
  viewport: { width: number; height: number },
): Promise<PageDiagnostics> {
  await page.setViewportSize(viewport);
  const diagnostics = await gotoFreshGame(page);
  await page.getByTestId('open-day-btn').click();
  await page.getByTestId('start-service-btn').click();
  await expect(page.getByTestId('floor-service-panel')).toBeVisible();
  return diagnostics;
}

async function seatingViewportSnapshot(
  page: Page,
  guestIds: string[],
) {
  return page.evaluate((ids) => {
    const bridge = window.__E2E__!;
    const scene = bridge.getSeatingSceneDebug();
    const canvas = document.querySelector<HTMLCanvasElement>(
      '[data-testid="restaurant-canvas"]',
    );
    if (!scene || !canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const guests = ids.map((guestId) => ({
      guestId,
      anchor: bridge.getGuestScreenAnchor(guestId),
      feet: bridge.getGuestScreenFeetAnchor(guestId),
      bounds: bridge.getGuestScreenRenderedBounds(guestId),
    }));
    const pointInside = (point: { x: number; y: number } | null) =>
      Boolean(
        point &&
          point.x >= rect.left &&
          point.x <= rect.right &&
          point.y >= rect.top &&
          point.y <= rect.bottom,
      );
    const boundsInside = (
      bounds: { left: number; top: number; right: number; bottom: number } | null,
    ) =>
      Boolean(
        bounds &&
          bounds.left >= rect.left &&
          bounds.right <= rect.right &&
          bounds.top >= rect.top &&
          bounds.bottom <= rect.bottom,
      );
    return {
      canvas: { width: rect.width, height: rect.height },
      allVisible: guests.every(
        (guest) =>
          pointInside(guest.anchor) &&
          pointInside(guest.feet) &&
          boundsInside(guest.bounds),
      ),
      scene: {
        tables: scene.tables
          .map(({ placementId, itemKey, zIndex, paintOrder }) => ({
            placementId,
            itemKey,
            zIndex,
            paintOrder,
          }))
          .sort((a, b) => a.placementId.localeCompare(b.placementId)),
        chairs: scene.chairs
          .map(({ tablePlacementId, slotIndex, zIndex, paintOrder }) => ({
            tablePlacementId,
            slotIndex,
            zIndex,
            paintOrder,
          }))
          .sort(
            (a, b) =>
              a.tablePlacementId.localeCompare(b.tablePlacementId) ||
              a.slotIndex - b.slotIndex,
          ),
        guests: scene.guests
          .map(
            ({
              guestId,
              tablePlacementId,
              slotIndex,
              rootZIndex,
              paintOrder,
              requestedFrameKey,
              actualBoundFrameKey,
            }) => ({
              guestId,
              tablePlacementId,
              slotIndex,
              rootZIndex,
              paintOrder,
              requestedFrameKey,
              actualBoundFrameKey,
            }),
          )
          .sort((a, b) => a.guestId.localeCompare(b.guestId)),
      },
    };
  }, guestIds);
}

for (const viewport of VIEWPORTS) {
  test(`keeps the four authored sit poses in one stable table depth stack at ${viewport.name}`, async ({
    page,
  }) => {
    const diagnostics = await openRunningFloor(page, viewport);
    const fixture = await page.evaluate(() =>
      window.__E2E__!.prepareFourFacingSeatedGuestsFixture(),
    );
    expect(new Set(fixture.map((guest) => guest.seat.tablePlacementId)).size).toBe(1);

    await expect
      .poll(async () => {
        const scene = await page.evaluate(() =>
          window.__E2E__!.getSeatingSceneDebug(),
        );
        if (!scene || scene.guests.length !== fixture.length) return false;
        return fixture.every((expected) => {
          const guest = scene.guests.find(
            (candidate) => candidate.guestId === expected.guestId,
          );
          const facing = ACTOR_FACING_BY_SEAT[expected.seat.facing];
          const expectedKey = new RegExp(`^guest_[a-e]_sit_${facing}$`);
          return Boolean(
            guest &&
              guest.tablePlacementId === expected.seat.tablePlacementId &&
              guest.slotIndex === expected.seat.slotIndex &&
              guest.seatFacing === expected.seat.facing &&
              guest.isSeated &&
              !guest.isMoving &&
              guest.facing === facing &&
              expectedKey.test(guest.requestedFrameKey) &&
              guest.actualBoundFrameKey === guest.requestedFrameKey &&
              guest.visible &&
              guest.alpha === 1,
          );
        });
      }, { message: 'all four guests should settle into their authored facing-specific sit art' })
      .toBe(true);

    const scene = await page.evaluate(() =>
      window.__E2E__!.getSeatingSceneDebug(),
    );
    expect(scene).not.toBeNull();
    expect(scene!.depthParent).toEqual({ shared: true, sortable: true });
    expect(scene!.tables.every((entry) => entry.inDepthParent)).toBe(true);
    expect(scene!.chairs.every((entry) => entry.inDepthParent)).toBe(true);
    expect(scene!.guests.every((entry) => entry.inDepthParent)).toBe(true);
    const tablePlacementId = fixture[0]!.seat.tablePlacementId;
    const table = scene!.tables.find(
      (candidate) => candidate.placementId === tablePlacementId,
    );
    expect(table?.itemKey).toBe('table_4seat');

    for (const expected of fixture) {
      const guest = scene!.guests.find(
        (candidate) => candidate.guestId === expected.guestId,
      );
      const chair = scene!.chairs.find(
        (candidate) =>
          candidate.tablePlacementId === expected.seat.tablePlacementId &&
          candidate.slotIndex === expected.seat.slotIndex,
      );
      expect(guest, `guest ${expected.guestId} should be rendered`).toBeDefined();
      expect(chair, `stool ${expected.seat.slotIndex} should be rendered`).toBeDefined();
      expect(chair!.zIndex).toBe(guest!.rootZIndex - 1);
      expect(chair!.paintOrder).toBeLessThan(guest!.paintOrder);
    }

    const guestForFacing = (facing: 0 | 90 | 180 | 270) => {
      const expected = fixture.find((guest) => guest.seat.facing === facing)!;
      return scene!.guests.find((guest) => guest.guestId === expected.guestId)!;
    };
    const north = guestForFacing(0);
    const west = guestForFacing(90);
    const east = guestForFacing(270);
    const south = guestForFacing(180);

    // The tabletop cuts a strict 3/4-view sandwich: north and side diners
    // paint behind it, while the south diner paints in front. Paired side
    // seats share one floor-depth band.
    expect(north.rootZIndex).toBeLessThan(west.rootZIndex);
    expect(west.rootZIndex).toBe(east.rootZIndex);
    expect(east.rootZIndex).toBeLessThan(table!.zIndex);
    expect(table!.zIndex).toBeLessThan(south.rootZIndex);
    expect(north.paintOrder).toBeLessThan(table!.paintOrder);
    expect(west.paintOrder).toBeLessThan(table!.paintOrder);
    expect(east.paintOrder).toBeLessThan(table!.paintOrder);
    expect(table!.paintOrder).toBeLessThan(south.paintOrder);
    // Exact deltas follow the seating model: NS hip tuck plus the shared
    // cushion lift (negative SEAT_SIT_OFFSET_Y). Feet-aligned sit was 30/2/26;
    // lifting diners onto the ellipse widens the north/west gaps and narrows
    // the south gap by the same lift.
    expect(table!.zIndex - north.rootZIndex).toBe(NORTH_BEHIND_TABLE);
    expect(table!.zIndex - west.rootZIndex).toBe(WEST_BEHIND_TABLE);
    expect(south.rootZIndex - table!.zIndex).toBe(SOUTH_IN_FRONT_OF_TABLE);

    await page.screenshot({
      path: `test-results/table-depth-continuity-${viewport.name}.png`,
      fullPage: true,
    });
    assertNoDiagnostics(diagnostics);
  });
}

test('keeps one live seating stack stable through a mobile-to-desktop resize', async ({
  page,
}) => {
  const diagnostics = await openRunningFloor(page, VIEWPORTS[0]);
  const fixture = await page.evaluate(() =>
    window.__E2E__!.prepareFourFacingSeatedGuestsFixture(),
  );
  const guestIds = fixture.map((guest) => guest.guestId);
  const expectedSitKeys = new Map(
    fixture.map((guest) => [
      guest.guestId,
      guestSitFrameKey(
        guestVariant(guest.guestId),
        ACTOR_FACING_BY_SEAT[guest.seat.facing],
      ),
    ]),
  );

  await expect
    .poll(async () => {
      const snapshot = await seatingViewportSnapshot(page, guestIds);
      return Boolean(
        snapshot?.allVisible &&
          snapshot.scene.guests.length === fixture.length &&
          snapshot.scene.guests.every((guest) => {
            const expectedKey = expectedSitKeys.get(guest.guestId);
            return (
              guest.requestedFrameKey === expectedKey &&
              guest.actualBoundFrameKey === expectedKey
            );
          }),
      );
    }, { message: 'the authored seating stack should be visible in the mobile canvas' })
    .toBe(true);
  const mobile = await seatingViewportSnapshot(page, guestIds);
  expect(mobile).not.toBeNull();
  for (const expected of fixture) {
    const guest = mobile!.scene.guests.find(
      (candidate) => candidate.guestId === expected.guestId,
    );
    const expectedKey = expectedSitKeys.get(expected.guestId);
    expect(guest?.requestedFrameKey).toBe(expectedKey);
    expect(guest?.actualBoundFrameKey).toBe(expectedKey);
  }

  await page.setViewportSize(VIEWPORTS[1]);
  await expect
    .poll(async () => {
      const snapshot = await seatingViewportSnapshot(page, guestIds);
      return Boolean(
        snapshot?.allVisible &&
          (snapshot.canvas.width !== mobile!.canvas.width ||
            snapshot.canvas.height !== mobile!.canvas.height),
      );
    }, { message: 'the same seating stack should remain visible after desktop resize' })
    .toBe(true);
  const desktop = await seatingViewportSnapshot(page, guestIds);
  expect(desktop).not.toBeNull();
  expect(desktop!.scene).toEqual(mobile!.scene);
  assertNoDiagnostics(diagnostics);
});

test('keeps a queued departure in exact sit art until its live route begins', async ({
  page,
}) => {
  const diagnostics = await openRunningFloor(page, VIEWPORTS[1]);
  const fixture = await page.evaluate(() =>
    window.__E2E__!.prepareQueuedDepartureVisualFixture(),
  );
  const heldSitKey = guestSitFrameKey(
    guestVariant(fixture.heldGuestId),
    ACTOR_FACING_BY_SEAT[fixture.heldSeat.facing],
  );

  await expect
    .poll(async () => {
      const scene = await page.evaluate(() => window.__E2E__!.getSeatingSceneDebug());
      const first = scene?.guests.find((guest) => guest.guestId === fixture.firstGuestId);
      const held = scene?.guests.find((guest) => guest.guestId === fixture.heldGuestId);
      return Boolean(
        first?.isMoving &&
          !first.isSeated &&
          /^guest_[a-e]_(right|down|up|left)_[0-2]$/.test(first.requestedFrameKey) &&
          first.actualBoundFrameKey === first.requestedFrameKey &&
          held?.isSeated &&
          !held.isMoving &&
          held.requestedFrameKey === heldSitKey &&
          held.actualBoundFrameKey === heldSitKey &&
          held.inDepthParent,
      );
    }, { message: 'the second departure should remain in exact authored sit art while held' })
    .toBe(true);

  await expect
    .poll(async () => {
      const state = await page.evaluate(() => window.__E2E__!.getGameState());
      const first = state.activeDay!.floor!.pool.find(
        (guest) => guest.id === fixture.firstGuestId,
      );
      const scene = await page.evaluate(() => window.__E2E__!.getSeatingSceneDebug());
      const held = scene?.guests.find((guest) => guest.guestId === fixture.heldGuestId);
      return Boolean(
        first?.stage === 'done' &&
          held?.isMoving &&
          !held.isSeated,
      );
    }, { message: 'the held departure should begin walking only after the first exits' })
    .toBe(true);

  const movingSample = await page.evaluate(async (heldGuestId) => {
    const bridge = window.__E2E__!;
    let previous = bridge
      .getSeatingSceneDebug()
      ?.guests.find((guest) => guest.guestId === heldGuestId);
    if (!previous) throw new Error('held departure is not rendered');
    const deadline = performance.now() + 10_000;

    return new Promise<{
      dx: number;
      dy: number;
      walkFrame: number;
      requestedFrameKey: string;
      actualBoundFrameKey: string;
    }>((resolve, reject) => {
      const sample = () => {
        const current = bridge
          .getSeatingSceneDebug()
          ?.guests.find((guest) => guest.guestId === heldGuestId);
        if (!current) {
          reject(new Error('held departure disappeared before a movement sample'));
          return;
        }
        const dx = current.feet.x - previous.feet.x;
        const dy = current.feet.y - previous.feet.y;
        const movedOnOneAxis =
          (Math.abs(dx) > 0 && Math.abs(dy) === 0) ||
          (Math.abs(dy) > 0 && Math.abs(dx) === 0);
        if (current.isMoving && movedOnOneAxis) {
          resolve({
            dx,
            dy,
            walkFrame: current.walkFrame,
            requestedFrameKey: current.requestedFrameKey,
            actualBoundFrameKey: current.actualBoundFrameKey,
          });
          return;
        }
        if (performance.now() >= deadline) {
          reject(new Error('held departure did not produce an axial feet delta'));
          return;
        }
        previous = current;
        requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    });
  }, fixture.heldGuestId);
  const walkedFacing =
    Math.abs(movingSample.dx) > Math.abs(movingSample.dy)
      ? movingSample.dx > 0
        ? 'right'
        : 'left'
      : movingSample.dy > 0
        ? 'down'
        : 'up';
  const expectedWalkKey = guestWalkFrameKey(
    guestVariant(fixture.heldGuestId),
    walkedFacing,
    movingSample.walkFrame,
  );
  expect(movingSample.requestedFrameKey).toBe(expectedWalkKey);
  expect(movingSample.actualBoundFrameKey).toBe(expectedWalkKey);

  assertNoDiagnostics(diagnostics);
});
