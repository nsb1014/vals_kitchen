import { expect, test, type Page } from '@playwright/test';
import { dragGridCell, gotoFreshGame, navigateToScreen } from './helpers.ts';
import { waitingGuestServicePositions } from '../../src/domain/floor/interact.ts';

async function waitingGuestServicePosition(
  page: Page,
): Promise<{ x: number; y: number }> {
  const gridSize = await page.evaluate(
    () => window.__E2E__!.getGameState().gridSize,
  );
  return waitingGuestServicePositions(gridSize.w, gridSize.h)[0]!;
}

async function expectPlayerAtWaitingServicePosition(page: Page): Promise<void> {
  const snapshot = await page.evaluate(() => ({
    gridSize: window.__E2E__!.getGameState().gridSize,
    player: window.__E2E__!.getState().floorPlayerGrid,
  }));
  expect(snapshot.player).not.toBeNull();
  expect(
    waitingGuestServicePositions(snapshot.gridSize.w, snapshot.gridSize.h),
  ).toContainEqual(snapshot.player);
}

async function waitingGuestHitPoint(
  page: Page,
  guestId: string,
): Promise<{ x: number; y: number }> {
  await expect
    .poll(() =>
      page.evaluate((id) => {
        const bridge = window.__E2E__!;
        return Boolean(
          bridge.getGuestScreenAnchor(id) &&
            bridge.getGuestScreenFeetAnchor(id),
        );
      }, guestId),
    )
    .toBe(true);
  return page.evaluate((id) => {
    const bridge = window.__E2E__!;
    const top = bridge.getGuestScreenAnchor(id)!;
    const feet = bridge.getGuestScreenFeetAnchor(id)!;
    return { x: (top.x + feet.x) / 2, y: (top.y + feet.y) / 2 };
  }, guestId);
}

async function tapScreenPoint(
  page: Page,
  point: { x: number; y: number },
): Promise<void> {
  await page.evaluate(({ x, y }) => {
    const canvas = document.querySelector<HTMLCanvasElement>(
      '[data-testid="restaurant-canvas"]',
    )!;
    canvas.dispatchEvent(
      new PointerEvent('pointerdown', {
        bubbles: true,
        cancelable: true,
        clientX: x,
        clientY: y,
        pointerId: 1,
        pointerType: 'touch',
      }),
    );
  }, point);
}

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

async function prepareWaitingGuest(page: Page): Promise<string> {
  await openRunningFloor(page);
  return page.evaluate(async () => {
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
    const waiting = floor().pool.find((guest) => guest.stage === 'waiting');
    if (!waiting) throw new Error('expected a guest in the waiting alcove');
    bridge.setFloorNavPosition({ x: 7, y: 5 });
    return waiting.id;
  });
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
  const waitingPosition = await waitingGuestServicePosition(page);
  return page.evaluate(async ({ shouldPlate, waitingPosition: nearWaiting }) => {
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
      bridge.setFloorNavPosition(nearWaiting);
      await bridge.dispatch({ type: 'FLOOR_SEAT_NEXT' });
    }
    const seating = floor().pool.find((guest) => guest.stage === 'seating');
    if (!seating?.seat) throw new Error('expected a guest assigned to a seat');
    await bridge.dispatch({
      type: 'FLOOR_COMPLETE_SEATING',
      guestId: seating.id,
    });

    const state = bridge.getGameState();
    bridge.setFloorNavPosition({
      x: seating.seat.x,
      y: seating.seat.y + 2,
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
  }, { shouldPlate: plate, waitingPosition });
}

test.describe('object tap controls', () => {
  test('retires a still-actionable order bubble behind compose and releases its notice block', async ({
    page,
  }) => {
    await openRunningFloor(page);
    await page.evaluate(() => window.__E2E__!.prepareCookUiFixture());

    const bubble = page.getByTestId('chat-bubble');
    await expect(bubble).toBeVisible();
    const visibleAt = Date.now();
    const ownershipBefore = await page.evaluate(() => {
      const floor = window.__E2E__!.getGameState().activeDay!.floor!;
      const ticket = floor.tickets.find((candidate) => candidate.status === 'open');
      if (!ticket) throw new Error('expected an open ticket');
      return {
        ticket: {
          id: ticket.id,
          customerId: ticket.customerId,
          status: ticket.status,
        },
        guestStage: floor.pool.find(
          (guest) => guest.customer.id === ticket.customerId,
        )?.stage,
      };
    });
    expect(ownershipBefore.guestStage).toBe('ordered');

    await page.evaluate(() => window.__E2E__!.openComposeSheet());
    await expect(page.getByTestId('compose-sheet')).toBeVisible();
    await expect(bubble).toBeHidden();

    const queuedNotice = page
      .getByTestId('notice-banner')
      .filter({ hasText: 'Order bubble released its notice block' });
    await page.evaluate(() =>
      window.__E2E__!.setFloorToast(
        'Order bubble released its notice block',
      ),
    );
    await expect(queuedNotice).toBeHidden();

    await page.getByTestId('compose-close').click();
    await expect(page.getByTestId('compose-sheet')).toHaveCount(0);
    const closedAt = Date.now();
    expect(closedAt - visibleAt).toBeLessThan(2_400);
    const ownershipAfterClose = await page.evaluate((customerId) => {
      const floor = window.__E2E__!.getGameState().activeDay!.floor!;
      const ticket = floor.tickets.find(
        (candidate) => candidate.customerId === customerId,
      );
      return {
        ticket: ticket
          ? {
              id: ticket.id,
              customerId: ticket.customerId,
              status: ticket.status,
            }
          : null,
        guestStage: floor.pool.find(
          (guest) => guest.customer.id === customerId,
        )?.stage,
      };
    }, ownershipBefore.ticket.customerId);
    expect(ownershipAfterClose).toEqual(ownershipBefore);
    await expect(bubble).toBeHidden();
    await expect(queuedNotice).toBeVisible();

    await page.waitForTimeout(Math.max(0, 2_450 - (Date.now() - visibleAt)));
    await expect(bubble).toBeHidden();
    await expect(queuedNotice).toBeVisible();
    const ownershipAfterTimer = await page.evaluate((customerId) => {
      const floor = window.__E2E__!.getGameState().activeDay!.floor!;
      const ticket = floor.tickets.find(
        (candidate) => candidate.customerId === customerId,
      );
      return {
        ticket: ticket
          ? {
              id: ticket.id,
              customerId: ticket.customerId,
              status: ticket.status,
            }
          : null,
        guestStage: floor.pool.find(
          (guest) => guest.customer.id === customerId,
        )?.stage,
      };
    }, ownershipBefore.ticket.customerId);
    expect(ownershipAfterTimer).toEqual(ownershipBefore);
  });

  test('rejects a remote seated-guest tap at 4/4 without starting a path', async ({
    page,
  }) => {
    await openRunningFloor(page);
    const fixture = await page.evaluate(() =>
      window.__E2E__!.prepareFullTicketRemoteSeatedGuestFixture(),
    );
    const before = await page.evaluate((guestId) => {
      const bridge = window.__E2E__!;
      const floor = bridge.getGameState().activeDay!.floor!;
      return {
        player: bridge.getState().floorPlayerGrid,
        guestStage: floor.pool.find((guest) => guest.id === guestId)?.stage,
        tickets: floor.tickets.map((ticket) => ({
          id: ticket.id,
          customerId: ticket.customerId,
          status: ticket.status,
        })),
      };
    }, fixture.guestId);
    expect(before.player).toEqual(fixture.remote);
    expect(before.guestStage).toBe('seated');
    expect(before.tickets).toHaveLength(4);
    expect(before.tickets.map((ticket) => ticket.status)).toEqual([
      'open',
      'open',
      'open',
      'open',
    ]);
    expect(new Set(before.tickets.map((ticket) => ticket.id)).size).toBe(4);
    expect(new Set(before.tickets.map((ticket) => ticket.customerId)).size).toBe(4);

    await tapScreenPoint(
      page,
      await waitingGuestHitPoint(page, fixture.guestId),
    );

    await expect(page.locator('.notice-banner-body')).toHaveText(
      'Tickets full (4/4) — cook or deliver first.',
    );
    await page.waitForTimeout(500);
    const after = await page.evaluate((guestId) => {
      const bridge = window.__E2E__!;
      const floor = bridge.getGameState().activeDay!.floor!;
      return {
        player: bridge.getState().floorPlayerGrid,
        guestStage: floor.pool.find((guest) => guest.id === guestId)?.stage,
        tickets: floor.tickets.map((ticket) => ({
          id: ticket.id,
          customerId: ticket.customerId,
          status: ticket.status,
        })),
      };
    }, fixture.guestId);
    expect(after).toEqual(before);
  });

  test('rejects a remote station tap while carrying a valid plated dish', async ({
    page,
  }) => {
    await openRunningFloor(page);
    const fixture = await page.evaluate(() =>
      window.__E2E__!.prepareStationCarryFixture('valid_carry'),
    );
    const before = await page.evaluate(() => {
      const bridge = window.__E2E__!;
      const floor = bridge.getGameState().activeDay!.floor!;
      return {
        player: bridge.getState().floorPlayerGrid,
        carriedTicketId: floor.carriedTicketId,
        tickets: floor.tickets.map((ticket) => ({
          id: ticket.id,
          status: ticket.status,
        })),
      };
    });
    expect(before).toEqual({
      player: fixture.remote,
      carriedTicketId: fixture.ticketId,
      tickets: [{ id: fixture.ticketId, status: 'plated' }],
    });

    await tapGridCell(page, fixture.station.x, fixture.station.y);
    await expect(page.locator('.notice-banner-body')).toHaveText(
      'Deliver the carried dish first',
    );
    await page.waitForTimeout(500);

    const after = await page.evaluate(() => {
      const bridge = window.__E2E__!;
      const floor = bridge.getGameState().activeDay!.floor!;
      return {
        player: bridge.getState().floorPlayerGrid,
        carriedTicketId: floor.carriedTicketId,
        tickets: floor.tickets.map((ticket) => ({
          id: ticket.id,
          status: ticket.status,
        })),
        composeSheetOpen: bridge.getState().composeSheetOpen,
      };
    });
    expect(after).toEqual({ ...before, composeSheetOpen: false });
  });

  test('ignores a stale carried id and reaches a real open ticket', async ({
    page,
  }) => {
    await openRunningFloor(page);
    const fixture = await page.evaluate(() =>
      window.__E2E__!.prepareStationCarryFixture('stale_with_open'),
    );
    const floorBefore = await page.evaluate(
      () => window.__E2E__!.getGameState().activeDay!.floor!,
    );
    expect(floorBefore.carriedTicketId).not.toBeNull();
    expect(
      floorBefore.tickets.some(
        (ticket) =>
          ticket.id === floorBefore.carriedTicketId && ticket.status === 'plated',
      ),
    ).toBe(false);
    expect(floorBefore.tickets).toEqual([
      expect.objectContaining({ id: fixture.ticketId, status: 'open' }),
    ]);

    await tapGridCell(page, fixture.station.x, fixture.station.y);
    await expect
      .poll(() =>
        page.evaluate(({ x, y }) => {
          const player = window.__E2E__!.getState().floorPlayerGrid;
          return Boolean(
            player &&
              Math.max(Math.abs(player.x - x), Math.abs(player.y - y)) <= 1,
          );
        }, fixture.station),
      )
      .toBe(true);
    expect(
      await page.evaluate(() => window.__E2E__!.getState().composeSheetOpen),
    ).toBe(false);

    await tapGridCell(page, fixture.station.x, fixture.station.y);
    await expect(page.getByTestId('compose-sheet')).toBeVisible();
    expect(
      await page.evaluate(() => window.__E2E__!.getState().composeSheetOpen),
    ).toBe(true);
  });

  test('rejects a remote station tap when a stale carried id has no open ticket', async ({
    page,
  }) => {
    await openRunningFloor(page);
    const fixture = await page.evaluate(() =>
      window.__E2E__!.prepareStationCarryFixture('stale_without_open'),
    );
    const before = await page.evaluate(() => {
      const bridge = window.__E2E__!;
      const floor = bridge.getGameState().activeDay!.floor!;
      return {
        player: bridge.getState().floorPlayerGrid,
        carriedTicketId: floor.carriedTicketId,
        tickets: floor.tickets,
      };
    });
    expect(before.player).toEqual(fixture.remote);
    expect(before.carriedTicketId).not.toBeNull();
    expect(before.tickets).toEqual([]);

    await tapGridCell(page, fixture.station.x, fixture.station.y);
    await expect(page.locator('.notice-banner-body')).toHaveText(
      'No open ticket to cook',
    );
    await page.waitForTimeout(500);

    const after = await page.evaluate(() => {
      const bridge = window.__E2E__!;
      const floor = bridge.getGameState().activeDay!.floor!;
      return {
        player: bridge.getState().floorPlayerGrid,
        carriedTicketId: floor.carriedTicketId,
        tickets: floor.tickets,
        composeSheetOpen: bridge.getState().composeSheetOpen,
      };
    });
    expect(after).toEqual({ ...before, composeSheetOpen: false });
  });

  test('turns duplicate HUD seating requests into one physical seating action', async ({
    page,
  }) => {
    const guestId = await prepareWaitingGuest(page);
    const seatGuest = page.getByTestId('floor-seat-next');
    await expect(seatGuest).toBeEnabled();

    await seatGuest.click();
    await seatGuest.click();
    expect(
      await page.evaluate(
        (id) =>
          window.__E2E__!.getGameState().activeDay!.floor!.pool.find(
            (guest) => guest.id === id,
          )?.stage,
        guestId,
      ),
    ).toBe('waiting');

    await expect
      .poll(() =>
        page.evaluate(
          (id) =>
            window.__E2E__!.getGameState().activeDay!.floor!.pool.find(
              (guest) => guest.id === id,
            )?.stage,
          guestId,
        ),
      )
      .toBe('seating');
    const result = await page.evaluate((id) => {
      const floor = window.__E2E__!.getGameState().activeDay!.floor!;
      const guest = floor.pool.find((candidate) => candidate.id === id);
      return {
        seatingCount: floor.pool.filter((candidate) => candidate.stage === 'seating')
          .length,
        seat: guest?.seat ?? null,
      };
    }, guestId);
    expect(result.seatingCount).toBe(1);
    expect(result.seat).not.toBeNull();
    await expectPlayerAtWaitingServicePosition(page);
  });

  test('taps the visible waiting guest once and seats only after Val arrives', async ({
    page,
  }) => {
    const guestId = await prepareWaitingGuest(page);
    await tapScreenPoint(page, await waitingGuestHitPoint(page, guestId));

    expect(
      await page.evaluate(
        (id) =>
          window.__E2E__!.getGameState().activeDay!.floor!.pool.find(
            (guest) => guest.id === id,
          )?.stage,
        guestId,
      ),
    ).toBe('waiting');
    await expect
      .poll(() =>
        page.evaluate(
          (id) =>
            window.__E2E__!.getGameState().activeDay!.floor!.pool.find(
              (guest) => guest.id === id,
            )?.stage,
          guestId,
        ),
      )
      .toBe('seating');
    await expectPlayerAtWaitingServicePosition(page);
  });

  test('rejects seating without leaving a latent action when every service endpoint is blocked', async ({
    page,
  }) => {
    const guestId = await prepareWaitingGuest(page);
    await page.evaluate(() =>
      window.__E2E__!.setWaitingGuestServiceBlockedForTest(true),
    );

    try {
      const request = await page.evaluate(() => {
        const bridge = window.__E2E__!;
        return {
          accepted: bridge.requestSeatNextGuest(),
          pendingIntent: bridge.getPendingSeatingIntentDebug(),
        };
      });
      expect(request).toEqual({ accepted: false, pendingIntent: null });
      await expect(page.locator('.notice-banner-body')).toHaveText(
        'No clear route',
      );
      expect(
        await page.evaluate(
          (id) =>
            window.__E2E__!.getGameState().activeDay!.floor!.pool.find(
              (guest) => guest.id === id,
            )?.stage,
          guestId,
        ),
      ).toBe('waiting');

      await page.waitForTimeout(300);
      const settled = await page.evaluate((id) => ({
        stage: window.__E2E__!.getGameState().activeDay!.floor!.pool.find(
          (guest) => guest.id === id,
        )?.stage,
        pendingIntent: window.__E2E__!.getPendingSeatingIntentDebug(),
      }), guestId);
      expect(settled).toEqual({ stage: 'waiting', pendingIntent: null });
    } finally {
      await page.evaluate(() =>
        window.__E2E__!.setWaitingGuestServiceBlockedForTest(false),
      );
    }
  });

  test('keeps visible-guest autoroute progress when the same guest is tapped twice', async ({
    page,
  }) => {
    const guestId = await prepareWaitingGuest(page);
    const point = await waitingGuestHitPoint(page, guestId);
    await tapScreenPoint(page, point);

    await expect
      .poll(() =>
        page.evaluate(() =>
          window.__E2E__!.getPendingSeatingIntentDebug(),
        ),
      )
      .not.toBeNull();
    const initialIntent = await page.evaluate(() =>
      window.__E2E__!.getPendingSeatingIntentDebug(),
    );

    await expect
      .poll(() =>
        page.evaluate(() => window.__E2E__!.getState().floorPlayerGrid),
      )
      .not.toEqual({ x: 7, y: 5 });
    const progressed = await page.evaluate(
      () => window.__E2E__!.getState().floorPlayerGrid!,
    );
    expect(
      await page.evaluate(
        (id) =>
          window.__E2E__!.getGameState().activeDay!.floor!.pool.find(
            (guest) => guest.id === id,
          )?.stage,
        guestId,
      ),
    ).toBe('waiting');

    await tapScreenPoint(page, await waitingGuestHitPoint(page, guestId));
    expect(
      await page.evaluate(() =>
        window.__E2E__!.getPendingSeatingIntentDebug(),
      ),
    ).toEqual(initialIntent);
    const afterDuplicate = await page.evaluate(
      () => window.__E2E__!.getState().floorPlayerGrid!,
    );
    expect(afterDuplicate).not.toEqual({ x: 7, y: 5 });
    expect(
      Math.max(
        Math.abs(afterDuplicate.x - progressed.x),
        Math.abs(afterDuplicate.y - progressed.y),
      ),
    ).toBeLessThanOrEqual(1);

    await expect
      .poll(() =>
        page.evaluate(
          (id) =>
            window.__E2E__!.getGameState().activeDay!.floor!.pool.find(
              (guest) => guest.id === id,
            )?.stage,
          guestId,
        ),
      )
      .toBe('seating');
    const seatingCount = await page.evaluate(
      () =>
        window.__E2E__!.getGameState().activeDay!.floor!.pool.filter(
          (guest) => guest.stage === 'seating',
        ).length,
    );
    expect(seatingCount).toBe(1);
    await expectPlayerAtWaitingServicePosition(page);
  });

  test('cancels a queued seating action when a conflicting world move arrives', async ({
    page,
  }) => {
    const guestId = await prepareWaitingGuest(page);
    await page.getByTestId('floor-seat-next').click();
    await tapGridCell(page, 5, 4);

    await expect
      .poll(() =>
        page.evaluate(() => window.__E2E__!.getState().floorPlayerGrid),
      )
      .toEqual({ x: 5, y: 4 });
    await page.waitForTimeout(250);
    expect(
      await page.evaluate(
        (id) =>
          window.__E2E__!.getGameState().activeDay!.floor!.pool.find(
            (guest) => guest.id === id,
          )?.stage,
        guestId,
      ),
    ).toBe('waiting');
    await expect(page.getByTestId('floor-seat-next')).toBeEnabled();
  });

  test('cancels pending seating on visibility pause without replacing gameplay state', async ({
    page,
  }) => {
    const guestId = await prepareWaitingGuest(page);
    expect(
      await page.evaluate(() => window.__E2E__!.requestSeatNextGuest()),
    ).toBe(true);
    const originalIntent = await page.evaluate(() =>
      window.__E2E__!.getPendingSeatingIntentDebug(),
    );
    expect(originalIntent).not.toBeNull();
    if (!originalIntent) throw new Error('expected a pending seating intent');
    const before = await page.evaluate((id) => {
      const state = window.__E2E__!.getGameState();
      return {
        seed: state.activeDay!.seed,
        screen: window.__E2E__!.getState().screen,
        guestIds: state.activeDay!.floor!.pool.map((guest) => guest.id),
        guestStage: state.activeDay!.floor!.pool.find(
          (guest) => guest.id === id,
        )?.stage,
      };
    }, guestId);

    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        value: 'hidden',
      });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(
      await page.evaluate(() =>
        window.__E2E__!.getPendingSeatingIntentDebug(),
      ),
    ).toBeNull();

    expect(
      await page.evaluate((id) => {
        const state = window.__E2E__!.getGameState();
        return {
          seed: state.activeDay!.seed,
          screen: window.__E2E__!.getState().screen,
          guestIds: state.activeDay!.floor!.pool.map((guest) => guest.id),
          guestStage: state.activeDay!.floor!.pool.find(
            (guest) => guest.id === id,
          )?.stage,
        };
      }, guestId),
    ).toEqual(before);

    const resumedVisibility = await page.evaluate(() => {
      delete (document as unknown as Record<string, unknown>).visibilityState;
      document.dispatchEvent(new Event('visibilitychange'));
      return document.visibilityState;
    });
    expect(resumedVisibility).toBe('visible');
    await expect
      .poll(() =>
        page.evaluate(() => window.__E2E__!.getState().floorPlayerGrid),
      )
      .toEqual(originalIntent.destination);
    await page.waitForTimeout(250);
    const afterResume = await page.evaluate((id) => {
      const state = window.__E2E__!.getGameState();
      return {
        seed: state.activeDay!.seed,
        screen: window.__E2E__!.getState().screen,
        guestIds: state.activeDay!.floor!.pool.map((guest) => guest.id),
        guestStage: state.activeDay!.floor!.pool.find(
          (guest) => guest.id === id,
        )?.stage,
        pendingIntent: window.__E2E__!.getPendingSeatingIntentDebug(),
      };
    }, guestId);
    expect(afterResume).toEqual({ ...before, pendingIntent: null });
    await expect(page.getByTestId('floor-seat-next')).toBeEnabled();
  });

  test('cancels pending seating when a save restore replaces the gameplay generation', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await gotoFreshGame(page);
    const replacement = await page.evaluate(() => {
      const bridge = window.__E2E__!;
      const state = bridge.getGameState();
      return {
        code: bridge.exportSaveCode(),
        snapshot: {
          cash: state.cash,
          day: state.day,
          prestige: state.prestige,
          rating: state.rating,
        },
      };
    });

    // Stage the restore before the interaction so navigating to Settings is
    // not what cancels the pending seating route.
    await navigateToScreen(page, 'settings');
    await page.getByTestId('import-save-input').fill(replacement.code);
    await navigateToScreen(page, 'restaurant');
    await page.getByTestId('open-day-btn').click();
    await page.getByTestId('start-service-btn').click();
    await expect(page.getByTestId('floor-service-panel')).toBeVisible();

    const guestId = await page.evaluate(async () => {
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
      const waiting = floor().pool.find((guest) => guest.stage === 'waiting');
      if (!waiting) throw new Error('expected a guest in the waiting alcove');
      bridge.setFloorNavPosition({ x: 7, y: 5 });
      return waiting.id;
    });

    await page.getByTestId('floor-seat-next').click();
    expect(
      await page.evaluate(
        (id) =>
          window.__E2E__!.getGameState().activeDay!.floor!.pool.find(
            (guest) => guest.id === id,
          )?.stage,
        guestId,
      ),
    ).toBe('waiting');

    const restoredWhileRestaurantStayedActive = await page.evaluate(() => {
      const settings = document.querySelector<HTMLElement>(
        '[data-testid="settings-screen"]',
      );
      const restore = document.querySelector<HTMLButtonElement>(
        '[data-testid="import-save-btn"]',
      );
      if (!settings?.hidden || !restore) return false;
      restore.click();
      return true;
    });
    expect(restoredWhileRestaurantStayedActive).toBe(true);
    await expect(page.locator('#game-root')).toHaveAttribute(
      'data-screen',
      'restaurant',
    );
    await expect
      .poll(() => page.evaluate(() => window.__E2E__!.getGameState().activeDay))
      .toBeNull();

    const restoredSnapshot = await page.evaluate((originalGuestId) => {
      const state = window.__E2E__!.getGameState();
      return {
        cash: state.cash,
        day: state.day,
        prestige: state.prestige,
        rating: state.rating,
        activeDay: state.activeDay,
        originalGuestStillExists:
          state.activeDay?.floor?.pool.some(
            (guest) => guest.id === originalGuestId,
          ) ?? false,
      };
    }, guestId);
    expect(restoredSnapshot).toEqual({
      ...replacement.snapshot,
      activeDay: null,
      originalGuestStillExists: false,
    });

    await page.waitForTimeout(300);
    expect(
      await page.evaluate(() => {
        const state = window.__E2E__!.getGameState();
        return {
          cash: state.cash,
          day: state.day,
          prestige: state.prestige,
          rating: state.rating,
          activeDay: state.activeDay,
        };
      }),
    ).toEqual({ ...replacement.snapshot, activeDay: null });
  });

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

    const waitingPosition = await waitingGuestServicePosition(page);
    const guest = await page.evaluate(async (nearWaiting) => {
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
        bridge.setFloorNavPosition(nearWaiting);
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
    }, waitingPosition);

    await tapGridCell(page, guest.x, guest.y);
    await expect
      .poll(() =>
        page.evaluate(({ x, y }) => {
          const player = window.__E2E__!.getState().floorPlayerGrid;
          const dx = player ? Math.abs(player.x - x) : Number.POSITIVE_INFINITY;
          const dy = player ? Math.abs(player.y - y) : Number.POSITIVE_INFINITY;
          return Boolean(
            player &&
              ((dx === 1 && dy === 0) || (dx === 0 && dy === 2)),
          );
        }, guest),
      )
      .toBe(true);
    await expect
      .poll(() => page.evaluate(() => window.__E2E__!.getInteractHintVisible()))
      .toBe(true);
    await page.locator('[data-testid="restaurant-canvas"]').screenshot({
      path: 'test-results/interaction-order-ready.png',
      animations: 'disabled',
    });
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
    await expect
      .poll(() =>
        page.evaluate(
          ({ x, y }) =>
            window.__E2E__!
              .getInteractHintCells()
              .some((cell) => cell.x === x && cell.y === y),
          { x: guest.x, y: guest.y },
        ),
      )
      .toBe(false);
    await expect(page.getByTestId('chat-bubble')).toBeVisible();
    await expect(page.getByTestId('notice-banner')).toBeHidden();
    await page.locator('[data-testid="restaurant-canvas"]').screenshot({
      path: 'test-results/interaction-order-complete.png',
      animations: 'disabled',
    });
    await expect(page.getByTestId('chat-bubble')).toBeHidden({ timeout: 3_000 });
    await expect(page.getByTestId('notice-banner')).toBeVisible();
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
    await expect
      .poll(() => page.evaluate(() => window.__E2E__!.getInteractHintCells().length))
      .toBe(0);
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
          const dx = player ? Math.abs(player.x - x) : Number.POSITIVE_INFINITY;
          const dy = player ? Math.abs(player.y - y) : Number.POSITIVE_INFINITY;
          return Boolean(
            player &&
              ((dx === 1 && dy === 0) || (dx === 0 && dy === 2)),
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
        page.evaluate(({ x, y }) => {
          const player = window.__E2E__!.getState().floorPlayerGrid;
          const dx = player ? Math.abs(player.x - x) : Number.POSITIVE_INFINITY;
          const dy = player ? Math.abs(player.y - y) : Number.POSITIVE_INFINITY;
          return Boolean(
            player &&
              ((dx === 1 && dy === 0) || (dx === 0 && dy === 2)),
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
