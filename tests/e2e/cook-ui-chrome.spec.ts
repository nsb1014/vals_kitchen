import { expect, test, type Page } from '@playwright/test';
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

async function expectFooterInsideSheet(
  page: Page,
  sheetTestId = 'compose-sheet',
  footerSelector = '.compose-sheet-footer',
  actionTestId = 'plate-btn',
): Promise<void> {
  const sheet = await page.getByTestId(sheetTestId).boundingBox();
  const footer = await page.locator(footerSelector).boundingBox();
  const plate = await page.getByTestId(actionTestId).boundingBox();
  expect(sheet).not.toBeNull();
  expect(footer).not.toBeNull();
  expect(plate).not.toBeNull();
  expect(footer!.y + footer!.height).toBeLessThanOrEqual(
    sheet!.y + sheet!.height + 1,
  );
  expect(plate!.y + plate!.height).toBeLessThanOrEqual(
    sheet!.y + sheet!.height + 1,
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
      await expect(
        page.locator(
          '.compose-filters .filter-axis-chip:not(.requested):not([data-compose-all]):visible',
        ),
      ).toHaveCount(0);
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

  test('keeps search focus while typing and filters without rebuilding the input', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 360, height: 720 });
    await openCookFixture(page);
    const search = page.getByTestId('compose-search');
    await search.pressSequentially('oil');
    await expect(search).toBeFocused();
    await expect(search).toHaveValue('oil');
    await expect(page.getByTestId('compose-filter-summary')).toContainText(
      'matching',
    );
    await expect(page.getByTestId('ingredient-chip')).toHaveCount(2);
  });

  test('order flavor pills visibly filter with request-band semantics', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 720 });
    await openCookFixture(page);
    const requestedFilter = page.locator('.filter-axis-chip.requested').first();
    await expect(requestedFilter).toBeVisible();
    const label = (await requestedFilter.textContent())?.trim();
    expect(label).toMatch(/^(High|Moderate|Low) /);
    await requestedFilter.click();
    await expect(requestedFilter).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('compose-filter-summary')).toContainText(label!);
    await expect(page.getByTestId('ingredient-chip')).not.toHaveCount(100);
  });

  test('keeps full flavor detail available without crowding the mobile pantry', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 720 });
    await openCookFixture(page);
    await expect(page.locator('.compose-flavor-mini')).toHaveCount(15);
    await expect(page.locator('.compose-flavor-mini-value')).toHaveCount(15);
    await expect(page.locator('.compose-flavor-mini').first()).toBeHidden();
    const flavorToggle = page.getByTestId('compose-flavor-toggle');
    await expect(flavorToggle).toHaveAttribute('aria-expanded', 'false');
    await flavorToggle.click();
    await expect(flavorToggle).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('.compose-flavor-mini').first()).toBeVisible();
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
    expect(sheet!.y).toBeGreaterThan(canvas!.y + canvas!.height * 0.6);
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
      'summary-visit-shop',
    );
    await page.screenshot({
      path: 'test-results/day-summary-near-full.png',
      animations: 'disabled',
    });
  });
});

test.describe('meta-full screen chrome', () => {
  for (const [screen, testId] of [
    ['shop', 'shop-screen'],
    ['inspector', 'inspector-screen'],
    ['recipes', 'recipes-screen'],
    ['rating', 'rating-screen'],
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
