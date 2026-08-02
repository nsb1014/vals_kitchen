import { expect, test, type Page } from '@playwright/test';
import {
  assertCanvasHasRenderedContent,
  assertNoDiagnostics,
  gotoFreshGame,
} from './helpers.ts';

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

test('keeps the coordinated décor distinct and proportional in the room', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const diagnostics = await gotoFreshGame(page);
  await page.evaluate(() => window.__E2E__!.prepareDecorVisualFixture());

  await expect
    .poll(() =>
      page.evaluate(
        () =>
          window.__E2E__!
            .getPlacements()
            .filter((placement) => placement.itemKey.startsWith('decor_')).length,
      ),
    )
    .toBe(5);
  await assertCanvasHasRenderedContent(page);

  const decorMetrics = await page.evaluate(() =>
    window.__E2E__!
      .getActorSpriteMetrics()
      .filter((metric) =>
        ['80x104', '64x80', '104x72', '72x108'].includes(metric.tex),
      )
      .map(({ tex, width, height }) => ({ tex, width, height })),
  );
  expect(decorMetrics).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ tex: '80x104', width: 30 }),
      expect.objectContaining({ tex: '64x80', width: 20 }),
      expect.objectContaining({ tex: '104x72', width: 46 }),
      expect.objectContaining({ tex: '72x108', width: 32 }),
      expect.objectContaining({ tex: '80x104', width: 32 }),
    ]),
  );
  expect(decorMetrics).toHaveLength(5);

  await page.screenshot({
    path: 'test-results/decor-layout-mobile.png',
    animations: 'disabled',
  });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.screenshot({
    path: 'test-results/decor-layout-desktop.png',
    animations: 'disabled',
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByTestId('toggle-edit-layout').click();
  await page.getByTestId('open-day-btn').click();
  await page.getByTestId('start-service-btn').click();

  await page.evaluate(() => window.__E2E__!.setFloorNavPosition({ x: 2, y: 1 }));
  await tapGridCell(page, 1, 1);
  // An adjacent one-cell route would complete in ~420ms at the canonical
  // movement speed. Remaining in place after that window proves the raised
  // plant is physical even while a higher-priority tutorial notice is shown.
  await page.waitForTimeout(700);
  expect(await page.evaluate(() => window.__E2E__!.getState().floorPlayerGrid)).toEqual({
    x: 2,
    y: 1,
  });

  await page.evaluate(() => window.__E2E__!.setFloorNavPosition({ x: 4, y: 5 }));
  await tapGridCell(page, 4, 4);
  await expect
    .poll(() => page.evaluate(() => window.__E2E__!.getState().floorPlayerGrid))
    .toEqual({ x: 4, y: 4 });
  await page.screenshot({
    path: 'test-results/decor-service-mobile.png',
    animations: 'disabled',
  });
  assertNoDiagnostics(diagnostics);
});
