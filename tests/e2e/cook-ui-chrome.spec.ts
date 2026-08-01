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

async function expectExpandedFlavorFitsLandscape(page: Page): Promise<void> {
  await page.getByTestId('compose-flavor-toggle').click();
  const strip = page.locator('.compose-flavor-strip');
  await expect(strip).toBeVisible();
  const verticalFit = await strip.evaluate((element) => ({
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight,
  }));
  expect(verticalFit.scrollHeight).toBeLessThanOrEqual(
    verticalFit.clientHeight + 1,
  );
  const pantry = await page.getByTestId('compose-pantry').boundingBox();
  const ingredient = await page.getByTestId('ingredient-chip').first().boundingBox();
  expect(pantry).not.toBeNull();
  expect(ingredient).not.toBeNull();
  expect(ingredient!.height).toBeLessThanOrEqual(pantry!.height + 1);
  await expectFooterInsideSheet(page);
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
      await expect(page.locator('.compose-filters')).toBeVisible();
      await expect(page.locator('.compose-order-mobile-legend')).toBeVisible();
      await expect(page.locator('.compose-request-bar[role="meter"]')).not.toHaveCount(0);
      await expectFooterInsideSheet(page);
      const pantry = await page.getByTestId('compose-pantry').boundingBox();
      const orderPanel = await page.getByTestId('compose-order-panel').boundingBox();
      const close = await page.getByTestId('compose-close').boundingBox();
      expect(pantry).not.toBeNull();
      expect(orderPanel).not.toBeNull();
      expect(close).not.toBeNull();
      expect(pantry!.height).toBeGreaterThan(150);
      expect(orderPanel!.y + orderPanel!.height).toBeLessThanOrEqual(pantry!.y + 1);
      expect(close!.width).toBeGreaterThanOrEqual(44);
      expect(close!.height).toBeGreaterThanOrEqual(44);
      const filterBounds = await page.locator('.compose-axis-row').boundingBox();
      expect(filterBounds).not.toBeNull();
      for (const chip of await page
        .locator('.filter-axis-chip.requested:visible')
        .all()) {
        const chipBounds = await chip.boundingBox();
        expect(chipBounds).not.toBeNull();
        expect(chipBounds!.x).toBeGreaterThanOrEqual(filterBounds!.x - 1);
        expect(chipBounds!.x + chipBounds!.width).toBeLessThanOrEqual(
          filterBounds!.x + filterBounds!.width + 1,
        );
      }
      await page.screenshot({
        path: `test-results/cook-sheet-${width}.png`,
        animations: 'disabled',
      });
    });
  }

  test('keeps flavor filtering single-select without a search bar', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 360, height: 720 });
    await openCookFixture(page);
    await expect(page.getByTestId('ingredient-chip')).toHaveCount(100);
    await expect(page.getByTestId('compose-search')).toHaveCount(0);
    const requestedFilters = page.locator(
      '.filter-axis-chip.requested[data-compose-axis]',
    );
    expect(await requestedFilters.count()).toBeGreaterThan(1);

    const first = requestedFilters.nth(0);
    const second = requestedFilters.nth(1);
    await first.click();
    await expect(first).toHaveAttribute('aria-pressed', 'true');
    expect(await page.getByTestId('ingredient-chip').count()).toBeLessThan(100);

    await second.click();
    await expect(first).toHaveAttribute('aria-pressed', 'false');
    await expect(second).toHaveAttribute('aria-pressed', 'true');

    await second.click();
    await expect(second).toHaveAttribute('aria-pressed', 'false');
    await expect(page.getByTestId('ingredient-chip')).toHaveCount(100);
  });

  test('keeps full flavor detail visible above the mobile Plate action', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 720 });
    await openCookFixture(page);
    await expect(page.locator('.compose-flavor-mini')).toHaveCount(15);
    await expect(page.locator('.compose-flavor-mini-value')).toHaveCount(15);
    const flavorToggle = page.getByTestId('compose-flavor-toggle');
    await expect(flavorToggle).toBeVisible();
    await expect(page.locator('.compose-flavor-mini').first()).toBeHidden();
    await flavorToggle.click();
    await expect(flavorToggle).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('.compose-flavor-strip')).toHaveAttribute(
      'tabindex',
      '0',
    );
    await expect(page.locator('.compose-flavor-mini').last()).toBeVisible();
    await flavorToggle.focus();
    await page.keyboard.press('Tab');
    await expect(page.locator('.compose-flavor-strip')).toBeFocused();
    await page.locator('.compose-flavor-strip').evaluate((element) => {
      element.scrollLeft = element.scrollWidth;
    });
    const flavorStrip = await page.locator('.compose-flavor-strip').boundingBox();
    const plate = await page.getByTestId('plate-btn').boundingBox();
    expect(flavorStrip).not.toBeNull();
    expect(plate).not.toBeNull();
    expect(flavorStrip!.y).toBeGreaterThanOrEqual(plate!.y + plate!.height - 1);
  });

  test('isolates focus inside compose and preserves it across selection renders', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openCookFixture(page);
    const sheet = page.getByTestId('compose-sheet');
    const close = page.getByTestId('compose-close');
    await expect(close).toBeFocused();
    await expect(sheet).toHaveAttribute('aria-modal', 'true');
    await expect(page.locator('.canvas-mount')).toHaveAttribute(
      'aria-hidden',
      'true',
    );

    const ingredient = page.getByTestId('ingredient-chip').first();
    await ingredient.focus();
    await expect(ingredient).toBeFocused();
    await ingredient.click();
    await expect(ingredient).toBeFocused();
    const selectedChip = page.locator('.compose-selected-chip').first();
    const selectedChipBox = await selectedChip.boundingBox();
    expect(selectedChipBox).not.toBeNull();
    expect(selectedChipBox!.height).toBeGreaterThanOrEqual(44);
    await page.keyboard.press('Shift+Tab');
    await expect
      .poll(() =>
        page.evaluate(() =>
          Boolean(
            document.activeElement?.closest('[data-testid="compose-sheet"]'),
          ),
        ),
      )
      .toBe(true);

    await page.keyboard.press('Escape');
    await expect(sheet).toBeHidden();
    await expect(page.locator('.canvas-mount')).not.toHaveAttribute(
      'aria-hidden',
      'true',
    );
  });

  test('keeps a usable pantry across the upper mobile landscape breakpoint', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 844, height: 390 });
    await openCookFixture(page);
    await expect(
      page.locator('.filter-axis-chip:not(.requested):visible'),
    ).toHaveCount(0);
    const pantry = await page.getByTestId('compose-pantry').boundingBox();
    expect(pantry).not.toBeNull();
    expect(pantry!.height).toBeGreaterThan(80);
    await expectFooterInsideSheet(page);
    await page.screenshot({
      path: 'test-results/cook-sheet-wide-landscape.png',
      animations: 'disabled',
    });
    await expectExpandedFlavorFitsLandscape(page);
  });

  test('keeps the ingredient profile as the topmost modal focus scope', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openCookFixture(page);
    const ingredient = page.getByTestId('ingredient-chip').first();
    await ingredient.focus();
    await page.evaluate(() => window.__E2E__!.openFlavorInspector('almond'));

    const modal = page.locator('#flavor-inspector-modal [role="dialog"]');
    const modalClose = page.locator('#close-flavor-modal');
    const modalBack = page.locator('#close-flavor-modal-bottom');
    await expect(modal).toBeVisible();
    await expect(modalClose).toBeFocused();
    await expect(page.getByTestId('compose-sheet')).toHaveAttribute(
      'aria-hidden',
      'true',
    );
    await page.evaluate(() => window.dispatchEvent(new Event('food-atlas-ready')));
    await expect(page.getByTestId('compose-sheet')).toHaveAttribute(
      'aria-hidden',
      'true',
    );
    await expect(modalClose).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(modalBack).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(modalClose).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(modal).toHaveCount(0);
    await expect(page.getByTestId('compose-sheet')).not.toHaveAttribute(
      'aria-hidden',
      'true',
    );
    await expect(ingredient).toBeFocused();
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
    await expectExpandedFlavorFitsLandscape(page);
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
    await expect
      .poll(async () => {
        const sheet = await visibleRect(page.getByTestId('modifier-sheet'));
        const canvas = await visibleRect(page.getByTestId('restaurant-canvas'));
        return canvas.x + canvas.width <= sheet.x + 1;
      })
      .toBe(true);
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
    const nav = await page.locator('.bottom-nav').boundingBox();
    expect(sheet).not.toBeNull();
    expect(card).not.toBeNull();
    expect(nav).not.toBeNull();
    // The panel should hug its content, not reserve a fixed empty sheet that
    // makes the lower half of the restaurant appear missing.
    expect(sheet!.height).toBeLessThanOrEqual(card!.height + 26);
    // Overlay sits in the lower half of the viewport (same basis as other sheet-tier tests).
    expect(sheet!.y / 720).toBeGreaterThan(0.5);
    expect(Math.abs(sheet!.y + sheet!.height - nav!.y)).toBeLessThanOrEqual(3);
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
