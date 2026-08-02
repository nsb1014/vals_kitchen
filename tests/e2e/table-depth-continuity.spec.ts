import { expect, test, type Page } from '@playwright/test';
import {
  assertNoDiagnostics,
  gotoFreshGame,
  type PageDiagnostics,
} from './helpers.ts';

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
    expect(table!.zIndex - north.rootZIndex).toBe(26);
    expect(table!.zIndex - west.rootZIndex).toBe(2);
    expect(south.rootZIndex - table!.zIndex).toBe(22);

    await page.screenshot({
      path: `test-results/table-depth-continuity-${viewport.name}.png`,
      fullPage: true,
    });
    assertNoDiagnostics(diagnostics);
  });
}

test('keeps a queued departure in exact sit art until its live route begins', async ({
  page,
}) => {
  const diagnostics = await openRunningFloor(page, VIEWPORTS[1]);
  const fixture = await page.evaluate(() =>
    window.__E2E__!.prepareQueuedDepartureVisualFixture(),
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
          /^guest_[a-e]_sit_(right|down|up|left)$/.test(held.requestedFrameKey) &&
          held.actualBoundFrameKey === held.requestedFrameKey &&
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
          !held.isSeated &&
          /^guest_[a-e]_(right|down|up|left)_[0-2]$/.test(held.requestedFrameKey) &&
          held.actualBoundFrameKey === held.requestedFrameKey,
      );
    }, { message: 'the held departure should bind exact authored walk art after the first exits' })
    .toBe(true);

  assertNoDiagnostics(diagnostics);
});
