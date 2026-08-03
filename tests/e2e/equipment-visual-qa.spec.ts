import { expect, test } from '@playwright/test';
import {
  assertCanvasHasRenderedContent,
  assertNoDiagnostics,
  gotoFreshGame,
} from './helpers.ts';

test('keeps late-game stations consistent with the current kitchen art', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const diagnostics = await gotoFreshGame(page);
  await page.evaluate(() => window.__E2E__!.prepareEquipmentVisualFixture());
  await assertCanvasHasRenderedContent(page);

  await expect
    .poll(() =>
      page.evaluate(() =>
        window.__E2E__!
          .getActorSpriteMetrics()
          .filter((metric) => metric.tex === '64x96')
          .map(({ tex, width, height }) => ({ tex, width, height })),
      ),
    )
    .toEqual([
      { tex: '64x96', width: 34, height: 51 },
      { tex: '64x96', width: 34, height: 51 },
    ]);

  await page.screenshot({
    path: 'test-results/equipment-layout-mobile.png',
    animations: 'disabled',
  });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.screenshot({
    path: 'test-results/equipment-layout-desktop.png',
    animations: 'disabled',
  });
  assertNoDiagnostics(diagnostics);
});
