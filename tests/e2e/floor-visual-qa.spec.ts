import { expect, test, type Page } from '@playwright/test';
import { assertCanvasHasRenderedContent, assertNoDiagnostics, gotoFreshGame } from './helpers.ts';
import { waitingGuestServicePositions } from '../../src/domain/floor/interact.ts';

async function movePlayerToWaitingGuest(page: Page): Promise<void> {
  const gridSize = await page.evaluate(
    () => window.__E2E__!.getGameState().gridSize,
  );
  const position = waitingGuestServicePositions(gridSize.w, gridSize.h)[0]!;
  await page.evaluate(
    (next) => window.__E2E__!.setFloorNavPosition(next),
    position,
  );
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

/**
 * Capture the same table before and after delivery for agent visual QA.
 */
test('captures pre- and post-delivery floor states for visual QA', async ({ page }) => {
  const diagnostics = await gotoFreshGame(page);
  await page.setViewportSize({ width: 390, height: 844 });

  await page.locator('[data-testid="open-day-btn"]').click();
  await page.locator('[data-testid="start-service-btn"]').click();

  await page.evaluate(async () => {
    const e2e = window.__E2E__!;
    const floor = () => e2e.getGameState().activeDay!.floor!;
    for (const table of floor().tables) {
      if (table.state === 'unset') {
        await e2e.dispatch({
          type: 'FLOOR_SET_TABLE',
          placementId: table.placementId,
        });
      }
    }
    if (floor().pool.some((guest) => guest.stage === 'entering')) {
      await e2e.dispatch({ type: 'FLOOR_COMPLETE_ENTERING' });
    }
  });
  await movePlayerToWaitingGuest(page);
  await page.evaluate(async () => {
    const e2e = window.__E2E__!;
    const floor = () => e2e.getGameState().activeDay!.floor!;
    // Seat every waiting party once.
    for (let i = 0; i < 4; i += 1) {
      if (!floor().pool.some((guest) => guest.stage === 'waiting')) break;
      await e2e.dispatch({ type: 'FLOOR_SEAT_NEXT' });
      const seating = floor().pool.find((guest) => guest.stage === 'seating');
      if (!seating) throw new Error('expected seating guest');
      await e2e.dispatch({
        type: 'FLOOR_COMPLETE_SEATING',
        guestId: seating.id,
      });
    }
  });

  const seated = await page.evaluate(() => {
    const floor = window.__E2E__!.getGameState().activeDay?.floor;
    if (!floor) return 0;
    return floor.pool.filter((guest) => guest.stage === 'seated').length;
  });
  expect(seated).toBeGreaterThan(0);
  const seatGuestAction = page.getByTestId('floor-seat-next');
  await expect(seatGuestAction).toBeEnabled();
  await expect(seatGuestAction).not.toHaveClass(/\bprimary\b/);
  await expect(page.getByTestId('notice-banner')).toContainText('Take orders');

  // The state cue appears once, then the world/action affordances stand alone.
  // This also allows GuestMotion walks to finish (nav speed ~2.4 tiles/s).
  await expect(page.getByTestId('notice-banner')).toHaveCount(0, {
    timeout: 5000,
  });
  await assertCanvasHasRenderedContent(page);

  const metrics = await page.evaluate(() => window.__E2E__!.getActorSpriteMetrics());
  const authoredActors = metrics.filter((m) => m.tex === '128x160' && m.height === 60);
  const player = authoredActors[0];
  const seatedSprite = authoredActors.find(
    (candidate) => candidate !== player && Math.hypot(candidate.x - player!.x, candidate.y - player!.y) > 24,
  );
  expect(player, 'player sprite').toBeTruthy();
  expect(seatedSprite, 'seated guest sprite').toBeTruthy();
  expect(player!.height).toBeGreaterThanOrEqual(56);
  expect(seatedSprite!.height).toBe(player!.height);
  expect(player!.alpha).toBe(1);
  expect(seatedSprite!.alpha).toBe(1);
  // Cook must not stand on the same seat cell as a diner (ghost stack).
  expect(Math.hypot(player!.x - seatedSprite!.x, player!.y - seatedSprite!.y)).toBeGreaterThan(24);

  const canvasStyle = await page.evaluate(() => {
    const canvas = document.querySelector('[data-testid="restaurant-canvas"]') as HTMLCanvasElement;
    const style = getComputedStyle(canvas);
    return { imageRendering: style.imageRendering, opacity: style.opacity };
  });
  expect(canvasStyle.opacity).toBe('1');
  // Visual round 2 restored crisp pixel art (Tech-Stack integer scaling).
  expect(canvasStyle.imageRendering).toBe('crisp-edges');

  await page.locator('[data-testid="restaurant-canvas"]').screenshot({
    path: 'test-results/floor-seated-qa.png',
    animations: 'disabled',
  });
  await page.screenshot({
    path: 'test-results/floor-seated-full-qa.png',
    animations: 'disabled',
  });

  const serviceGuest = await page.evaluate(() => {
    const bridge = window.__E2E__!;
    const seatedGuest = bridge
      .getGameState()
      .activeDay!.floor!.pool.find((guest) => guest.stage === 'seated');
    if (!seatedGuest?.seat) throw new Error('expected a seated guest');
    // Place Val on a legal service cell without arming approach-and-complete,
    // so the Take orders CTA can still be asserted before the order tap.
    bridge.setFloorNavPosition({
      x: seatedGuest.seat.x,
      y: seatedGuest.seat.y + 2,
    });
    return {
      id: seatedGuest.id,
      seat: { x: seatedGuest.seat.x, y: seatedGuest.seat.y },
    };
  });

  await expect
    .poll(() =>
      page.evaluate(({ x, y }) => {
        const player = window.__E2E__!.getState().floorPlayerGrid;
        if (!player) return false;
        const dx = Math.abs(player.x - x);
        const dy = Math.abs(player.y - y);
        return (dx === 1 && dy === 0) || (dx === 0 && dy === 2);
      }, serviceGuest.seat),
    )
    .toBe(true);
  const takeOrdersAction = page.getByTestId('floor-take-orders');
  await expect(takeOrdersAction).toBeEnabled();
  await expect(takeOrdersAction).toHaveClass(/\bprimary\b/);

  // Adjacent guest tap auto-completes the order (round-3 approach-and-complete).
  await tapGridCell(page, serviceGuest.seat.x, serviceGuest.seat.y);
  await expect
    .poll(() =>
      page.evaluate(
        (guestId) =>
          window.__E2E__!.getGameState().activeDay!.floor!.pool.find(
            (guest) => guest.id === guestId,
          )?.stage,
        serviceGuest.id,
      ),
    )
    .toBe('ordered');

  await page.evaluate(() => window.__E2E__!.prepareCookUiFixture());

  const serviceSpacing = await page.evaluate((guestId) => {
    const bridge = window.__E2E__!;
    const player = bridge.getPlayerScreenFeetAnchor();
    const guestAnchor = bridge.getGuestScreenFeetAnchor(guestId);
    if (!player || !guestAnchor) throw new Error('expected rendered service actors');
    return Math.hypot(player.x - guestAnchor.x, player.y - guestAnchor.y);
  }, serviceGuest.id);
  expect(serviceSpacing).toBeGreaterThanOrEqual(56);

  const orderBubble = page.getByTestId('chat-bubble');
  await expect(orderBubble).toBeVisible();
  const orderBubbleBox = await orderBubble.boundingBox();
  expect(orderBubbleBox).not.toBeNull();
  expect(orderBubbleBox!.x).toBeGreaterThanOrEqual(8);
  expect(orderBubbleBox!.x + orderBubbleBox!.width).toBeLessThanOrEqual(382);
  await page.locator('[data-testid="restaurant-canvas"]').screenshot({
    path: 'test-results/floor-order-bubble-qa.png',
    animations: 'disabled',
  });
  await page.screenshot({
    path: 'test-results/floor-order-bubble-full-qa.png',
    animations: 'disabled',
  });

  expect(
    await page.evaluate(() => window.__E2E__!.advanceFloorServiceOnce()),
  ).toBe('pending_review');
  await expect(page.getByTestId('review-sheet')).toBeVisible();
  await expect(page.getByTestId('chat-bubble')).toBeHidden();
  await page.evaluate(() => window.dispatchEvent(new Event('resize')));
  await expect(page.getByTestId('chat-bubble')).toBeHidden();
  await page.screenshot({
    path: 'test-results/floor-review-full-qa.png',
    animations: 'disabled',
  });
  await page.waitForTimeout(2_500);
  await page.evaluate(() => window.__E2E__!.dismissPendingReview());
  await expect
    .poll(
      () =>
        page.evaluate(() =>
          window.__E2E__!.getGameState().activeDay!.floor!.pool.some(
            (guest) => guest.stage === 'eating',
          ),
        ),
      { timeout: 2_000 },
    )
    .toBe(true);
  await page.waitForTimeout(100);
  await page.locator('[data-testid="restaurant-canvas"]').screenshot({
    path: 'test-results/floor-served-qa.png',
    animations: 'disabled',
  });
  await page.screenshot({
    path: 'test-results/floor-served-full-qa.png',
    animations: 'disabled',
  });
  assertNoDiagnostics(diagnostics);
});
