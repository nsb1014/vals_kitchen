import { expect, test, type Locator, type Page } from '@playwright/test';
import {
  completeServiceDay,
  gotoFreshGame,
  navigateToScreen,
  serveCurrentCustomer,
} from './helpers.ts';

async function openCookFixture(page: Page): Promise<void> {
  await gotoFreshGame(page);
  await page.evaluate(async () => {
    await window.__E2E__!.prepareCookUiFixture();
    window.__E2E__!.openComposeSheet();
  });
  await expect(page.getByTestId('compose-sheet')).toBeVisible();
}

async function visibleRect(locator: Locator): Promise<{
  x: number;
  y: number;
  width: number;
  height: number;
}> {
  await expect(locator).toBeVisible();
  return locator.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
  });
}

async function expectFooterInsideSheet(
  page: Page,
  sheetTestId = 'compose-sheet',
  footerSelector = '.compose-sheet-footer',
  actionTestId = 'plate-btn',
): Promise<void> {
  const sheet = await visibleRect(page.getByTestId(sheetTestId));
  const footer = await visibleRect(page.locator(footerSelector));
  const plate = await visibleRect(page.getByTestId(actionTestId));
  expect(footer.y + footer.height).toBeLessThanOrEqual(
    sheet.y + sheet.height + 1,
  );
  expect(plate.y + plate.height).toBeLessThanOrEqual(
    sheet.y + sheet.height + 1,
  );
}

test.describe('cook sheet responsive chrome', () => {
  for (const width of [320, 360, 390]) {
    test(`holds fixed regions with the full pantry at ${width}px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 720 });
      await openCookFixture(page);
      await expect(page.getByTestId('ingredient-chip')).toHaveCount(100);
      await expect(page.getByTestId('compose-order-panel')).toBeVisible();
      await expect(page.getByTestId('compose-request-axis')).not.toHaveCount(0);
      await expect(
        page.getByTestId('compose-sheet').getByTestId('guest-portrait'),
      ).toBeVisible();
      await expect(page.getByTestId('compose-search')).toHaveCount(0);
      await expect(page.locator('.compose-filters')).toHaveCount(0);
      await expectFooterInsideSheet(page);
      const pantry = await page.getByTestId('compose-pantry').boundingBox();
      expect(pantry).not.toBeNull();
      expect(pantry!.height).toBeGreaterThan(150);
      await page.screenshot({
        path: `test-results/cook-sheet-${width}.png`,
        animations: 'disabled',
      });
    });
  }

  test('shows the whole pantry without search or multi-select filters', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 360, height: 720 });
    await openCookFixture(page);
    await expect(page.getByTestId('ingredient-chip')).toHaveCount(100);
    await expect(page.getByTestId('compose-search')).toHaveCount(0);
    await expect(page.locator('.compose-filters')).toHaveCount(0);
  });

  test('keeps full flavor detail visible above the mobile Plate action', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 720 });
    await openCookFixture(page);
    await expect(page.locator('.compose-flavor-mini')).toHaveCount(15);
    await expect(page.locator('.compose-flavor-mini-value')).toHaveCount(15);
    await expect(page.locator('.compose-flavor-mini').first()).toBeVisible();
    const flavorToggle = page.getByTestId('compose-flavor-toggle');
    await expect(flavorToggle).toBeHidden();
    const flavorStrip = await page.locator('.compose-flavor-strip').boundingBox();
    const plate = await page.getByTestId('plate-btn').boundingBox();
    expect(flavorStrip).not.toBeNull();
    expect(plate).not.toBeNull();
    expect(flavorStrip!.y + flavorStrip!.height).toBeLessThanOrEqual(plate!.y + 1);
  });

  test('keeps Plate in view in a short landscape viewport', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 720, height: 390 });
    await openCookFixture(page);
    await expectFooterInsideSheet(page);
    await page.screenshot({
      path: 'test-results/cook-sheet-short-landscape.png',
      animations: 'disabled',
    });
  });

  test('uses a dedicated desktop workspace beside the restaurant', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await openCookFixture(page);
    const sheet = await visibleRect(page.getByTestId('compose-sheet'));
    const canvas = await visibleRect(page.getByTestId('restaurant-canvas'));
    expect(sheet.width).toBeLessThanOrEqual(600);
    expect(sheet.x).toBeGreaterThanOrEqual(1280 - sheet.width - 24);
    expect(canvas.x + canvas.width).toBeLessThanOrEqual(sheet.x + 1);
    const canvasDataLength = await page
      .getByTestId('restaurant-canvas')
      .evaluate((element) => (element as HTMLCanvasElement).toDataURL().length);
    expect(canvasDataLength).toBeGreaterThan(10_000);
    await page.screenshot({
      path: 'test-results/cook-sheet-desktop-workspace.png',
      animations: 'disabled',
    });
  });

  test('keeps the complete restaurant beside the desktop modifier sheet', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 2048, height: 1152 });
    await gotoFreshGame(page);
    await page.getByTestId('open-day-btn').click();
    const sheet = await visibleRect(page.getByTestId('modifier-sheet'));
    const canvas = await visibleRect(page.getByTestId('restaurant-canvas'));
    expect(canvas.x + canvas.width).toBeLessThanOrEqual(sheet.x + 1);
    await page.screenshot({
      path: 'test-results/modifier-desktop-full-restaurant.png',
      animations: 'disabled',
    });
  });

  test('supports desktop WASD movement through existing pathfinding', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await gotoFreshGame(page);
    await page.getByTestId('open-day-btn').click();
    await page.getByTestId('start-service-btn').click();
    await page.evaluate(() => {
      window.__E2E__!.setFloorNavPosition({ x: 4, y: 5 });
    });
    await page.keyboard.press('d');
    await page.waitForFunction(() => {
      const position = window.__E2E__!.getState().floorPlayerGrid;
      return position?.x === 5 && position.y === 5;
    });
  });
});

test.describe('service sheet tiers', () => {
  test('keeps open-for-service compact', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 720 });
    await gotoFreshGame(page);
    const sheet = await page.getByTestId('open-service-sheet').boundingBox();
    const card = await page
      .getByTestId('open-service-sheet')
      .locator('.service-card')
      .boundingBox();
    const canvas = await page.getByTestId('restaurant-canvas').boundingBox();
    expect(sheet).not.toBeNull();
    expect(card).not.toBeNull();
    expect(canvas).not.toBeNull();
    // The panel should hug its content, not reserve a fixed empty sheet that
    // makes the lower half of the restaurant appear missing.
    expect(sheet!.height).toBeLessThanOrEqual(card!.height + 26);
    // Overlay sits in the lower half of the viewport (same basis as other sheet-tier tests).
    expect(sheet!.y / 720).toBeGreaterThan(0.5);
    expect(sheet!.y + sheet!.height).toBeGreaterThanOrEqual(
      canvas!.y + canvas!.height - 2,
    );
    await page.screenshot({
      path: 'test-results/open-service-compact.png',
      animations: 'disabled',
    });
  });

  test('uses a bounded mid sheet for customer review', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 720 });
    await gotoFreshGame(page);
    await page.getByTestId('open-day-btn').click();
    await page.getByTestId('start-service-btn').click();
    await serveCurrentCustomer(page);
    const sheet = await page.getByTestId('review-sheet').boundingBox();
    expect(sheet).not.toBeNull();
    expect(sheet!.height / 720).toBeGreaterThan(0.48);
    expect(sheet!.height / 720).toBeLessThan(0.56);
    await page.screenshot({
      path: 'test-results/customer-review-mid.png',
      animations: 'disabled',
    });
  });

  test('pins day-summary actions in a near-full sheet', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 720 });
    await gotoFreshGame(page);
    await completeServiceDay(page, false);
    await expectFooterInsideSheet(
      page,
      'day-summary-sheet',
      '[data-testid="day-summary-sheet"] .sheet-footer',
      'summary-edit-restaurant',
    );
    await page.screenshot({
      path: 'test-results/day-summary-near-full.png',
      animations: 'disabled',
    });
  });
});

test.describe('consolidated mobile navigation', () => {
  test('keeps the restaurant canvas stable while edit controls open', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 720 });
    await gotoFreshGame(page);
    const before = await visibleRect(page.getByTestId('restaurant-canvas'));

    await page.getByTestId('edit-restaurant-btn').click();
    const after = await visibleRect(page.getByTestId('restaurant-canvas'));
    expect(after.width).toBe(before.width);
    expect(after.height).toBe(before.height);

    await page.getByTestId('open-layout-catalog').click();
    const catalog = page.getByTestId('layout-catalog-sheet');
    await expect(catalog.getByRole('tab', { name: 'Ingredients' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(
      catalog.getByRole('tab', { name: 'Kitchen Equipment' }),
    ).toBeVisible();
    await expect(catalog.getByRole('tab', { name: 'Layout' })).toBeVisible();
  });

  test('opens status details as buttons and settings from the top-right gear', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 720 });
    await gotoFreshGame(page);

    await page.getByRole('button', { name: 'Cash details' }).click();
    await expect(page.getByTestId('hud-detail-menu')).toContainText(
      'Total cash gained since day 1',
    );
    await page.getByTestId('hud-settings').click();
    await expect(page.getByTestId('settings-screen')).toBeVisible();
  });

  test('opens the recipe book on Flavors', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 720 });
    await gotoFreshGame(page);
    await navigateToScreen(page, 'recipes');

    await expect(
      page.getByRole('tab', { name: 'Flavors' }),
    ).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByTestId('recipe-flavor-detail')).toBeVisible();
  });
});

test.describe('meta-full screen chrome', () => {
  for (const [screen, testId] of [
    ['recipes', 'recipes-screen'],
    ['settings', 'settings-screen'],
  ] as const) {
    test(`${screen} uses the shared meta shell`, async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 720 });
      await gotoFreshGame(page);
      await navigateToScreen(page, screen);
      const panel = page.getByTestId(testId);
      await expect(panel).toHaveClass(/sheet-tier-meta-full/);
      const panelBox = await panel.boundingBox();
      const navBox = await page.locator('.bottom-nav').boundingBox();
      expect(panelBox).not.toBeNull();
      expect(navBox).not.toBeNull();
      expect(panelBox!.y + panelBox!.height).toBeLessThanOrEqual(navBox!.y + 1);
      await page.screenshot({
        path: `test-results/meta-${screen}.png`,
        animations: 'disabled',
      });
    });
  }
});
