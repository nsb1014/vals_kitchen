import { expect, test } from '@playwright/test';
import {
  assertCanvasHasRenderedContent,
  assertNoDiagnostics,
  gotoFreshGame,
} from './helpers.ts';

/**
 * Capture a seated floor frame for agent visual QA.
 * Stops after seating (before cook/deliver) so diners are still at tables.
 */
test('captures seated floor for visual QA', async ({ page }) => {
  const diagnostics = await gotoFreshGame(page);
  await page.setViewportSize({ width: 390, height: 844 });

  await page.locator('[data-testid="open-day-btn"]').click();
  await page.locator('[data-testid="start-service-btn"]').click();

  await page.evaluate(async () => {
    const e2e = window.__E2E__!;
    const floor = () => e2e.getGameState().activeDay!.floor!;
    for (const table of floor().tables) {
      if (table.state === 'unset') {
        await e2e.dispatch({ type: 'FLOOR_SET_TABLE', placementId: table.placementId });
      }
    }
    if (floor().pool.some((guest) => guest.stage === 'entering')) {
      await e2e.dispatch({ type: 'FLOOR_COMPLETE_ENTERING' });
    }
    // Seat every waiting party once.
    for (let i = 0; i < 4; i += 1) {
      if (!floor().pool.some((guest) => guest.stage === 'waiting')) break;
      await e2e.dispatch({ type: 'FLOOR_SEAT_NEXT' });
    }
  });

  const seated = await page.evaluate(() => {
    const floor = window.__E2E__!.getGameState().activeDay?.floor;
    if (!floor) return 0;
    return floor.pool.filter((guest) => guest.stage === 'seated').length;
  });
  expect(seated).toBeGreaterThan(0);

  // Allow GuestMotion walks to finish (nav speed ~2.4 tiles/s).
  await page.waitForTimeout(3500);
  await assertCanvasHasRenderedContent(page);

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
  assertNoDiagnostics(diagnostics);
});
