import { expect, test } from '@playwright/test';
import { assertCanvasHasRenderedContent, assertNoDiagnostics, gotoFreshGame } from './helpers.ts';

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
  expect(['pixelated', 'crisp-edges']).toContain(canvasStyle.imageRendering);

  await page.locator('[data-testid="restaurant-canvas"]').screenshot({
    path: 'test-results/floor-seated-qa.png',
    animations: 'disabled',
  });
  await page.screenshot({
    path: 'test-results/floor-seated-full-qa.png',
    animations: 'disabled',
  });

  await page.evaluate(() => {
    const bridge = window.__E2E__!;
    const seatedGuest = bridge
      .getGameState()
      .activeDay!.floor!.pool.find((guest) => guest.stage === 'seated');
    if (!seatedGuest?.seat) throw new Error('expected a seated guest');
    bridge.setFloorNavPosition({
      x: seatedGuest.seat.x,
      y: seatedGuest.seat.y + 1,
    });
  });
  const takeOrdersAction = page.getByTestId('floor-take-orders');
  await expect(takeOrdersAction).toBeEnabled();
  await expect(takeOrdersAction).toHaveClass(/\bprimary\b/);

  await page.evaluate(() => window.__E2E__!.prepareCookUiFixture());

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
