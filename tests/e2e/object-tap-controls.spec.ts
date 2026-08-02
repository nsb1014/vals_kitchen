import { expect, test, type Page } from '@playwright/test';
import { dragGridCell, gotoFreshGame } from './helpers.ts';

async function tapGridCell(page: Page, x: number, y: number): Promise<void> {
  await page.evaluate(
    ({ gx, gy }) => {
      const canvas = document.querySelector<HTMLCanvasElement>(
        '[data-testid="restaurant-canvas"]',
      );
      if (!canvas) throw new Error('restaurant canvas is missing');
      const point = window.__E2E__!.gridCellToScreen(gx, gy);
      canvas.dispatchEvent(
        new PointerEvent('pointerdown', {
          bubbles: true,
          cancelable: true,
          clientX: point.x,
          clientY: point.y,
          pointerId: 1,
          pointerType: 'touch',
        }),
      );
    },
    { gx: x, gy: y },
  );
}

async function openRunningFloor(page: Page): Promise<void> {
  await page.setViewportSize({ width: 1280, height: 800 });
  await gotoFreshGame(page);
  await page.getByTestId('open-day-btn').click();
  await page.getByTestId('start-service-btn').click();
  await expect(page.getByTestId('floor-service-panel')).toBeVisible();
}

async function prepareOrderedGuest(
  page: Page,
  plate: boolean,
): Promise<{
  seat: { x: number; y: number };
  station: { x: number; y: number };
  remote: { x: number; y: number };
  ticketId: string;
}> {
  return page.evaluate(async ({ shouldPlate }) => {
    const bridge = window.__E2E__!;
    const floor = () => bridge.getGameState().activeDay!.floor!;

    for (const table of floor().tables) {
      if (table.state === 'unset') {
        await bridge.dispatch({
          type: 'FLOOR_SET_TABLE',
          placementId: table.placementId,
        });
      }
    }
    if (floor().pool.some((guest) => guest.stage === 'entering')) {
      await bridge.dispatch({ type: 'FLOOR_COMPLETE_ENTERING' });
    }
    if (floor().pool.some((guest) => guest.stage === 'waiting')) {
      await bridge.dispatch({ type: 'FLOOR_SEAT_NEXT' });
    }
    const seating = floor().pool.find((guest) => guest.stage === 'seating');
    if (!seating?.seat) throw new Error('expected a guest assigned to a seat');
    await bridge.dispatch({
      type: 'FLOOR_COMPLETE_SEATING',
      guestId: seating.id,
    });

    const state = bridge.getGameState();
    const tablePlacement = state.placements.find(
      (placement) => placement.id === seating.seat!.tablePlacementId,
    );
    if (!tablePlacement) throw new Error('guest table placement is missing');
    bridge.setFloorNavPosition({
      x: tablePlacement.x,
      y: tablePlacement.y + 1,
    });
    await bridge.dispatch({
      type: 'FLOOR_TAKE_ORDERS',
      customerIds: [seating.customer.id],
    });

    const ticket = floor().tickets.find(
      (candidate) => candidate.customerId === seating.customer.id,
    );
    const station = state.placements.find(
      (placement) => placement.itemKey === 'prep_station',
    );
    if (!ticket || !station) throw new Error('order fixture is incomplete');

    if (shouldPlate) {
      bridge.setFloorNavPosition({ x: station.x - 1, y: station.y + 1 });
      await bridge.dispatch({
        type: 'FLOOR_SET_TICKET_DRAFT',
        ticketId: ticket.id,
        ingredientIds: state.unlockedIngredientIds.slice(0, 3),
      });
      await bridge.dispatch({ type: 'FLOOR_PLATE', ticketId: ticket.id });
    }

    const remote = { x: 4, y: 5 };
    bridge.setFloorNavPosition(remote);
    return {
      seat: { x: seating.seat.x, y: seating.seat.y },
      station: { x: station.x, y: station.y },
      remote,
      ticketId: ticket.id,
    };
  }, { shouldPlate: plate });
}

test.describe('object tap controls', () => {
  test('uses the same room transition when editing or transferring a station', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await gotoFreshGame(page);
    const fixture = await page.evaluate(() => {
      const bridge = window.__E2E__!;
      bridge.unlockKitchenAnnexForTest();
      const state = bridge.getGameState();
      const station = state.placements.find(
        (placement) => placement.itemKey === 'prep_station',
      );
      if (!station) throw new Error('expected prep station');
      return {
        door: { x: state.gridSize.w - 1, y: Math.floor(state.gridSize.h / 2) },
        station: { id: station.id, x: station.x, y: station.y },
      };
    });
    await page.getByTestId('edit-restaurant-btn').click();
    await page.getByRole('button', { name: 'Close restaurant shop' }).click();

    await tapGridCell(page, fixture.door.x, fixture.door.y);
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            document.querySelector<HTMLCanvasElement>(
              '[data-testid="restaurant-canvas"]',
            )?.dataset.roomTransition ?? null,
        ),
      )
      .toBe('out');
    expect(await page.evaluate(() => window.__E2E__!.getState().activeFloorRoom)).toBe(
      'main',
    );
    await expect
      .poll(() => page.evaluate(() => window.__E2E__!.getState().activeFloorRoom))
      .toBe('back_kitchen');
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            document.querySelector<HTMLCanvasElement>(
              '[data-testid="restaurant-canvas"]',
            )?.dataset.roomTransition ?? null,
        ),
      )
      .toBeNull();

    await tapGridCell(page, 0, fixture.door.y);
    await expect
      .poll(() => page.evaluate(() => window.__E2E__!.getState().activeFloorRoom))
      .toBe('main');
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            document.querySelector<HTMLCanvasElement>(
              '[data-testid="restaurant-canvas"]',
            )?.dataset.roomTransition ?? null,
        ),
      )
      .toBeNull();

    await dragGridCell(
      page,
      fixture.station.x,
      fixture.station.y,
      fixture.door.x,
      fixture.door.y,
    );
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            document.querySelector<HTMLCanvasElement>(
              '[data-testid="restaurant-canvas"]',
            )?.dataset.roomTransition ?? null,
        ),
      )
      .toBe('out');
    expect(await page.evaluate(() => window.__E2E__!.getState().activeFloorRoom)).toBe(
      'main',
    );
    await expect
      .poll(() => page.evaluate(() => window.__E2E__!.getState().activeFloorRoom))
      .toBe('back_kitchen');
    expect(
      await page.evaluate(
        (id) =>
          window.__E2E__!.getGameState().backKitchenPlacements.some(
            (placement) => placement.id === id,
          ),
        fixture.station.id,
      ),
    ).toBe(true);
  });

  test('uses the same approach-then-act rhythm for tables and seated guests', async ({
    page,
  }) => {
    await openRunningFloor(page);
    const table = await page.evaluate(() => {
      const state = window.__E2E__!.getGameState();
      const floorTable = state.activeDay!.floor!.tables.find(
        (candidate) => candidate.state === 'unset',
      );
      const placement = state.placements.find(
        (candidate) => candidate.id === floorTable?.placementId,
      );
      if (!floorTable || !placement) throw new Error('expected an unset table');
      return { id: floorTable.placementId, x: placement.x, y: placement.y };
    });

    await tapGridCell(page, table.x, table.y);
    await expect
      .poll(() =>
        page.evaluate(({ x, y }) => {
          const player = window.__E2E__!.getState().floorPlayerGrid;
          return Boolean(
            player &&
              Math.max(Math.abs(player.x - x), Math.abs(player.y - y)) <= 1,
          );
        }, table),
      )
      .toBe(true);
    expect(
      await page.evaluate(
        (id) =>
          window.__E2E__!.getGameState().activeDay!.floor!.tables.find(
            (candidate) => candidate.placementId === id,
          )?.state,
        table.id,
      ),
    ).toBe('unset');

    await tapGridCell(page, table.x, table.y);
    await expect
      .poll(() =>
        page.evaluate(
          (id) =>
            window.__E2E__!.getGameState().activeDay!.floor!.tables.find(
              (candidate) => candidate.placementId === id,
            )?.state,
          table.id,
        ),
      )
      .toBe('ready');

    const guest = await page.evaluate(async () => {
      const bridge = window.__E2E__!;
      const floor = () => bridge.getGameState().activeDay!.floor!;
      for (const remaining of floor().tables) {
        if (remaining.state === 'unset') {
          await bridge.dispatch({
            type: 'FLOOR_SET_TABLE',
            placementId: remaining.placementId,
          });
        }
      }
      if (floor().pool.some((candidate) => candidate.stage === 'entering')) {
        await bridge.dispatch({ type: 'FLOOR_COMPLETE_ENTERING' });
      }
      if (floor().pool.some((candidate) => candidate.stage === 'waiting')) {
        await bridge.dispatch({ type: 'FLOOR_SEAT_NEXT' });
      }
      const seating = floor().pool.find((candidate) => candidate.stage === 'seating');
      if (seating) {
        await bridge.dispatch({
          type: 'FLOOR_COMPLETE_SEATING',
          guestId: seating.id,
        });
      }
      const seated = floor().pool.find((candidate) => candidate.stage === 'seated');
      if (!seated?.seat) throw new Error('expected a seated guest');
      bridge.setFloorNavPosition({ x: 4, y: 5 });
      return {
        id: seated.id,
        customerId: seated.customer.id,
        x: seated.seat.x,
        y: seated.seat.y,
      };
    });

    await tapGridCell(page, guest.x, guest.y);
    await expect
      .poll(() =>
        page.evaluate(({ x, y }) => {
          const player = window.__E2E__!.getState().floorPlayerGrid;
          return Boolean(
            player &&
              Math.max(Math.abs(player.x - x), Math.abs(player.y - y)) <= 1,
          );
        }, guest),
      )
      .toBe(true);
    expect(
      await page.evaluate(
        (id) =>
          window.__E2E__!.getGameState().activeDay!.floor!.pool.find(
            (candidate) => candidate.id === id,
          )?.stage,
        guest.id,
      ),
    ).toBe('seated');

    await tapGridCell(page, guest.x, guest.y);
    await expect
      .poll(() =>
        page.evaluate(
          (id) =>
            window.__E2E__!.getGameState().activeDay!.floor!.pool.find(
              (candidate) => candidate.customer.id === id,
            )?.stage,
          guest.customerId,
        ),
      )
      .toBe('ordered');
  });

  test('approaches a remote station before opening its cooking workspace', async ({
    page,
  }) => {
    await openRunningFloor(page);
    const { station } = await prepareOrderedGuest(page, false);

    await tapGridCell(page, station.x, station.y);
    expect(await page.evaluate(() => window.__E2E__!.getState().composeSheetOpen)).toBe(false);

    await expect
      .poll(() =>
        page.evaluate(({ x, y }) => {
          const player = window.__E2E__!.getState().floorPlayerGrid;
          return Boolean(
            player &&
              Math.max(Math.abs(player.x - x), Math.abs(player.y - y)) <= 1,
          );
        }, station),
      )
      .toBe(true);
    expect(await page.evaluate(() => window.__E2E__!.getState().composeSheetOpen)).toBe(false);

    await tapGridCell(page, station.x, station.y);
    await expect
      .poll(() => page.evaluate(() => window.__E2E__!.getState().composeSheetOpen))
      .toBe(true);
  });

  test('keeps delivery explicit and leaves adjacent floor cells available for movement', async ({
    page,
  }) => {
    await openRunningFloor(page);
    const { seat, remote, ticketId } = await prepareOrderedGuest(page, true);

    await tapGridCell(page, seat.x, seat.y);
    await expect
      .poll(() =>
        page.evaluate(({ x, y }) => {
          const player = window.__E2E__!.getState().floorPlayerGrid;
          return Boolean(
            player &&
              Math.max(Math.abs(player.x - x), Math.abs(player.y - y)) <= 1,
          );
        }, seat),
      )
      .toBe(true);
    expect(
      await page.evaluate(
        (id) => window.__E2E__!.getGameState().activeDay!.floor!.carriedTicketId === id,
        ticketId,
      ),
    ).toBe(true);

    await page.evaluate((position) => window.__E2E__!.setFloorNavPosition(position), remote);
    const adjacentFloor = { x: seat.x, y: seat.y + 1 };
    await tapGridCell(page, adjacentFloor.x, adjacentFloor.y);
    await expect
      .poll(() =>
        page.evaluate(
          ({ x, y }) => {
            const player = window.__E2E__!.getState().floorPlayerGrid;
            return player?.x === x && player.y === y;
          },
          adjacentFloor,
        ),
      )
      .toBe(true);
    expect(
      await page.evaluate(
        (id) => window.__E2E__!.getGameState().activeDay!.floor!.carriedTicketId === id,
        ticketId,
      ),
    ).toBe(true);

    await tapGridCell(page, seat.x, seat.y);
    await expect
      .poll(() =>
        page.evaluate(() =>
          window.__E2E__!.getGameState().activeDay!.floor!.carriedTicketId,
        ),
      )
      .toBeNull();
  });

  test('walks to the annex door instead of teleporting on a remote tap', async ({
    page,
  }) => {
    await openRunningFloor(page);
    const door = await page.evaluate(() => {
      const bridge = window.__E2E__!;
      bridge.unlockKitchenAnnexForTest();
      const state = bridge.getGameState();
      return { x: state.gridSize.w - 1, y: Math.floor(state.gridSize.h / 2) };
    });

    await tapGridCell(page, door.x, door.y);
    expect(await page.evaluate(() => window.__E2E__!.getState().activeFloorRoom)).toBe('main');

    await expect
      .poll(
        () =>
          page.evaluate(
            () =>
              document.querySelector<HTMLCanvasElement>(
                '[data-testid="restaurant-canvas"]',
              )?.dataset.roomTransition ?? null,
          ),
        { timeout: 10_000, intervals: [20, 20, 20, 50] },
      )
      .toBe('out');
    expect(await page.evaluate(() => window.__E2E__!.getState().activeFloorRoom)).toBe('main');

    await expect
      .poll(() => page.evaluate(() => window.__E2E__!.getState().activeFloorRoom), {
        timeout: 10_000,
      })
      .toBe('back_kitchen');
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            document.querySelector<HTMLCanvasElement>(
              '[data-testid="restaurant-canvas"]',
            )?.dataset.roomTransition ?? null,
        ),
      )
      .toBeNull();
  });

  test('honors reduced motion while keeping annex travel functional', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openRunningFloor(page);
    const door = await page.evaluate(() => {
      const bridge = window.__E2E__!;
      bridge.unlockKitchenAnnexForTest();
      const state = bridge.getGameState();
      return { x: state.gridSize.w - 1, y: Math.floor(state.gridSize.h / 2) };
    });

    await tapGridCell(page, door.x, door.y);
    await expect
      .poll(() => page.evaluate(() => window.__E2E__!.getState().activeFloorRoom), {
        timeout: 10_000,
      })
      .toBe('back_kitchen');
    expect(
      await page.evaluate(
        () =>
          document.querySelector<HTMLCanvasElement>(
            '[data-testid="restaurant-canvas"]',
          )?.dataset.roomTransition ?? null,
      ),
    ).toBeNull();
  });
});
