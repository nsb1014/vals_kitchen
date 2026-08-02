import { expect, test, type Page } from '@playwright/test';
import { gotoFreshGame } from './helpers.ts';

async function floorSnapshot(page: Page) {
  return page.evaluate(() => {
    const state = window.__E2E__!.getGameState();
    const floor = state.activeDay?.floor;
    const guest = floor?.pool.find((candidate) => candidate.stage !== 'queued');
    return {
      guestStage: guest?.stage ?? null,
      eatTicksRemaining: guest?.eatTicksRemaining ?? null,
      playerPosition: floor?.playerPosition ?? null,
    };
  });
}

async function attemptBlockedFloorInput(page: Page): Promise<void> {
  await page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>('[data-testid="restaurant-canvas"]');
    if (!canvas) throw new Error('restaurant canvas is missing');
    const rect = canvas.getBoundingClientRect();
    canvas.dispatchEvent(
      new PointerEvent('pointerdown', {
        bubbles: true,
        clientX: rect.left + rect.width * 0.75,
        clientY: rect.top + rect.height * 0.5,
      }),
    );
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' }));
  });
}

async function seatGuestThroughVisualArrival(page: Page): Promise<string> {
  await expect
    .poll(
      () =>
        page.evaluate(() =>
          window.__E2E__!.getGameState().activeDay?.floor?.pool.some((guest) => guest.stage === 'waiting'),
        ),
      { timeout: 10_000 },
    )
    .toBe(true);

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
    await bridge.dispatch({ type: 'FLOOR_SEAT_NEXT' });
    const seating = floor().pool.find((guest) => guest.stage === 'seating');
    if (!seating?.seat) throw new Error('expected a guest walking to a seat');
    // Keep order eligibility dependent on guest stage, not player proximity.
    bridge.setFloorNavPosition(seating.seat);
    return seating.id;
  });

  await expect(page.getByTestId('floor-take-orders')).toBeDisabled();
  const duringWalk = await page.evaluate((id) => {
    const bridge = window.__E2E__!;
    const guest = bridge.getGameState().activeDay!.floor!.pool.find((candidate) => candidate.id === id)!;
    return {
      stage: guest.stage,
      seat: guest.seat ?? null,
      actorAnchor: bridge.getGuestScreenAnchor(id),
    };
  }, guestId);
  expect(duringWalk.stage).toBe('seating');
  expect(duringWalk.seat).not.toBeNull();
  expect(duringWalk.actorAnchor).not.toBeNull();

  await expect
    .poll(
      () =>
        page.evaluate(
          (id) => window.__E2E__!.getGameState().activeDay!.floor!.pool.find((guest) => guest.id === id)?.stage,
          guestId,
        ),
      { timeout: 12_000 },
    )
    .toBe('seated');
  await expect(page.getByTestId('floor-take-orders')).toBeEnabled();
  return guestId;
}

test.describe('canonical gameplay boundaries', () => {
  test('does not start floor motion behind the day modifier', async ({ page }) => {
    await gotoFreshGame(page);
    await page.getByTestId('open-day-btn').click();
    await expect(page.getByTestId('modifier-sheet')).toBeVisible();

    const before = await floorSnapshot(page);
    expect(before.guestStage).toBe('entering');
    await attemptBlockedFloorInput(page);
    await page.waitForTimeout(2_500);
    expect(await floorSnapshot(page)).toEqual(before);

    await page.getByTestId('start-service-btn').click();
    await expect
      .poll(async () => (await floorSnapshot(page)).guestStage, {
        timeout: 10_000,
      })
      .toBe('waiting');
  });

  test('pauses eating and movement while the customer review is open', async ({ page }) => {
    test.setTimeout(45_000);
    await gotoFreshGame(page);
    await page.getByTestId('open-day-btn').click();
    await page.getByTestId('start-service-btn').click();

    await page.evaluate(async () => {
      for (let guard = 0; guard < 80; guard += 1) {
        const step = await window.__E2E__!.advanceFloorServiceOnce();
        if (step === 'pending_review') return;
        if (step === 'day_complete' || step === 'idle') {
          throw new Error(`service reached ${step} before review`);
        }
      }
      throw new Error('service did not reach review');
    });
    await expect(page.getByTestId('review-sheet')).toBeVisible();

    const before = await floorSnapshot(page);
    expect(before.guestStage).toBe('eating');
    expect(before.eatTicksRemaining).toBe(3);
    await attemptBlockedFloorInput(page);
    await page.waitForTimeout(4_200);
    expect(await floorSnapshot(page)).toEqual(before);

    await page.getByTestId('continue-service-btn').click();
    await expect(page.getByTestId('review-sheet')).toHaveCount(0);
    await expect
      .poll(async () => (await floorSnapshot(page)).eatTicksRemaining, {
        timeout: 2_500,
      })
      .toBeLessThan(3);
  });

  test('enables orders only after the guest visually reaches their seat', async ({ page }) => {
    test.setTimeout(30_000);
    await gotoFreshGame(page);
    await page.getByTestId('open-day-btn').click();
    await page.getByTestId('start-service-btn').click();

    await seatGuestThroughVisualArrival(page);
  });

  test('keeps a leaving guest and table occupied until the door is reached', async ({ page }) => {
    test.setTimeout(40_000);
    await gotoFreshGame(page);
    await page.getByTestId('open-day-btn').click();
    await page.getByTestId('start-service-btn').click();
    const guestId = await seatGuestThroughVisualArrival(page);

    const tableId = await page.evaluate(async (id) => {
      const bridge = window.__E2E__!;
      const floor = () => bridge.getGameState().activeDay!.floor!;
      const guest = floor().pool.find((candidate) => candidate.id === id);
      if (!guest?.seat) throw new Error('seated guest is missing their seat');
      const customerId = guest.customer.id;
      const placementId = guest.seat.tablePlacementId;
      await bridge.dispatch({
        type: 'FLOOR_TAKE_ORDERS',
        customerIds: [customerId],
      });
      const ticket = floor().tickets.find((candidate) => candidate.customerId === customerId);
      if (!ticket) throw new Error('expected an order ticket');
      await bridge.dispatch({
        type: 'FLOOR_PLATE',
        ticketId: ticket.id,
        ingredientIds: bridge.getGameState().unlockedIngredientIds.slice(0, 3),
      });
      await bridge.dispatch({ type: 'FLOOR_DELIVER', ticketId: ticket.id });
      return placementId;
    }, guestId);
    await expect(page.getByTestId('review-sheet')).toBeVisible();

    await page.evaluate(async () => {
      const bridge = window.__E2E__!;
      bridge.dismissPendingReview();
      await bridge.dispatch({ type: 'FLOOR_TICK_EATING' });
      await bridge.dispatch({ type: 'FLOOR_TICK_EATING' });
      await bridge.dispatch({ type: 'FLOOR_TICK_EATING' });
    });

    const whileLeaving = await page.evaluate(
      ({ id, placementId }) => {
        const bridge = window.__E2E__!;
        const floor = bridge.getGameState().activeDay!.floor!;
        const guest = floor.pool.find((candidate) => candidate.id === id)!;
        return {
          stage: guest.stage,
          seat: guest.seat ?? null,
          tableState: floor.tables.find((table) => table.placementId === placementId)?.state,
          actorAnchor: bridge.getGuestScreenAnchor(id),
        };
      },
      { id: guestId, placementId: tableId },
    );
    expect(whileLeaving.stage).toBe('leaving');
    expect(whileLeaving.seat).not.toBeNull();
    expect(whileLeaving.tableState).toBe('occupied');
    expect(whileLeaving.actorAnchor).not.toBeNull();

    await expect
      .poll(
        () =>
          page.evaluate(
            (id) => window.__E2E__!.getGameState().activeDay!.floor!.pool.find((guest) => guest.id === id)?.stage,
            guestId,
          ),
        { timeout: 12_000 },
      )
      .toBe('done');

    const afterArrival = await page.evaluate(
      ({ id, placementId }) => {
        const bridge = window.__E2E__!;
        const floor = bridge.getGameState().activeDay!.floor!;
        const guest = floor.pool.find((candidate) => candidate.id === id)!;
        return {
          seat: guest.seat ?? null,
          tableState: floor.tables.find((table) => table.placementId === placementId)?.state,
          actorAnchor: bridge.getGuestScreenAnchor(id),
        };
      },
      { id: guestId, placementId: tableId },
    );
    expect(afterArrival.seat).toBeNull();
    expect(afterArrival.tableState).toBe('dirty');
    expect(afterArrival.actorAnchor).toBeNull();
  });
});
