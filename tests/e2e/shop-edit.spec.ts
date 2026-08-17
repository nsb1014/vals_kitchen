import { expect, test, type Locator, type Page } from '@playwright/test';
import { applyPageZoom, completeServiceDay, gotoFreshGame } from './helpers.ts';

async function expectAtLeast44(locator: Locator): Promise<void> {
  const bounds = await locator.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.width).toBeGreaterThanOrEqual(44);
  expect(bounds!.height).toBeGreaterThanOrEqual(44);
}

async function openShopAndEdit(page: Page): Promise<Locator> {
  await page.getByTestId('edit-restaurant-btn').click();
  const shop = page.getByTestId('layout-catalog-sheet');
  await expect(shop).toBeVisible();
  await expect(shop.getByRole('heading', { name: 'Restaurant shop' })).toBeVisible();
  await expect(shop.getByRole('tab', { name: 'Ingredients' })).toBeFocused();
  return shop;
}

test.describe('Shop & Edit progression journey', () => {
  for (const width of [320, 390]) {
    test(`keeps purchases actionable and placement reversible at ${width}px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: width === 320 ? 568 : 844 });
      await gotoFreshGame(page);

      for (const control of await page
        .locator('.game-hud button:visible')
        .all()) {
        await expectAtLeast44(control);
      }

      const shop = await openShopAndEdit(page);
      const viewport = page.viewportSize()!;
      const shopBounds = await shop.boundingBox();
      const navBounds = await page.locator('#bottom-nav').boundingBox();
      const scroll = shop.locator('.layout-catalog-scroll:not([hidden])');
      const scrollBounds = await scroll.boundingBox();
      const firstRowBounds = await shop
        .locator('.layout-catalog-row')
        .first()
        .boundingBox();
      expect(shopBounds).not.toBeNull();
      expect(navBounds).not.toBeNull();
      expect(shopBounds!.x).toBeCloseTo(0, 1);
      expect(shopBounds!.y).toBeCloseTo(0, 1);
      expect(shopBounds!.width).toBeCloseTo(viewport.width, 1);
      expect(shopBounds!.y + shopBounds!.height).toBeLessThanOrEqual(
        navBounds!.y + 1,
      );
      expect(shopBounds!.y + shopBounds!.height).toBeGreaterThanOrEqual(
        navBounds!.y - 2,
      );
      expect(scrollBounds).not.toBeNull();
      expect(scrollBounds!.y + scrollBounds!.height).toBeLessThanOrEqual(
        navBounds!.y + 1,
      );
      expect(scrollBounds!.height).toBeGreaterThanOrEqual(48);
      expect(firstRowBounds).not.toBeNull();
      expect(firstRowBounds!.y).toBeGreaterThanOrEqual(scrollBounds!.y);
      expect(firstRowBounds!.y + firstRowBounds!.height).toBeLessThanOrEqual(
        scrollBounds!.y + scrollBounds!.height + 1,
      );
      const lastRow = shop.locator('.layout-catalog-row').last();
      await lastRow.scrollIntoViewIfNeeded();
      const lastRowBounds = await lastRow.boundingBox();
      expect(lastRowBounds).not.toBeNull();
      expect(lastRowBounds!.y + lastRowBounds!.height).toBeLessThanOrEqual(
        navBounds!.y + 1,
      );
      const ingredientTab = shop.getByRole('tab', { name: 'Ingredients' });
      const equipmentTab = shop.getByRole('tab', { name: 'Kitchen Equipment' });
      const layoutTab = shop.getByRole('tab', { name: 'Layout' });
      await ingredientTab.press('ArrowRight');
      await expect(equipmentTab).toBeFocused();
      await expect(equipmentTab).toHaveAttribute('aria-selected', 'true');
      await equipmentTab.press('End');
      await expect(layoutTab).toBeFocused();
      await layoutTab.press('Home');
      await expect(ingredientTab).toBeFocused();

      const ingredientRows = shop.locator('.layout-catalog-row');
      await expect(ingredientRows.first()).toHaveClass(/shop-item-available/);
      await expect(ingredientRows.first()).toBeEnabled();
      await expect(
        ingredientRows.first().locator('.layout-catalog-row-action small'),
      ).toHaveText('Buy');
      const firstOwnedIndex = await ingredientRows.evaluateAll((rows) =>
        rows.findIndex((row) => row.classList.contains('shop-item-owned')),
      );
      expect(firstOwnedIndex).toBeGreaterThan(0);

      const beforeIngredient = await page.evaluate(() =>
        window.__E2E__!.getGameState(),
      );
      const purchasedIngredientName = await ingredientRows
        .first()
        .locator('.layout-catalog-row-copy strong')
        .innerText();
      await ingredientRows.first().click();
      await expect(shop).toBeVisible();
      const afterIngredient = await page.evaluate(() =>
        window.__E2E__!.getGameState(),
      );
      expect(afterIngredient.unlockedIngredientIds).toHaveLength(
        beforeIngredient.unlockedIngredientIds.length + 1,
      );
      expect(
        (await page.evaluate(() => window.__E2E__!.getState()))
          .pendingPlacementItemKey,
      ).toBeNull();
      await expect(shop).toContainText(purchasedIngredientName.trim());
      await expect(page.locator('body')).not.toBeFocused();
      await expect(shop.locator(':focus')).toHaveCount(1);

      await shop.getByRole('tab', { name: 'Layout' }).click();
      const tableRow = shop
        .locator('.layout-catalog-row')
        .filter({ hasText: 'Table (2 seats)' });
      await expect(tableRow.locator('.layout-catalog-row-action small')).toHaveText(
        'Buy & place',
      );
      const beforeTable = await page.evaluate(() =>
        window.__E2E__!.getGameState(),
      );
      await tableRow.click();
      await expect(shop).toBeHidden();
      const afterTable = await page.evaluate(() =>
        window.__E2E__!.getGameState(),
      );
      expect(afterTable.tableCount).toBe(beforeTable.tableCount + 1);
      expect(
        (await page.evaluate(() => window.__E2E__!.getState()))
          .pendingPlacementItemKey,
      ).toBe('table_2seat');
      await expect(page.getByTestId('cancel-placement')).toBeVisible();
      await expect(page.getByTestId('cancel-placement')).toBeFocused();
      await expect(page.locator('#placement-hint')).toContainText(
        'Place Table (2 seats)',
      );

      await page.getByTestId('cancel-placement').click();
      await expect(page.getByTestId('layout-catalog-sheet')).toBeHidden();
      await expect(page.getByTestId('open-layout-catalog')).toBeFocused();
      expect(
        (await page.evaluate(() => window.__E2E__!.getState()))
          .pendingPlacementItemKey,
      ).toBeNull();
    });
  }

  test('keeps the complete shop header and one scroll host at 200% zoom', async ({
    page,
    browserName,
  }) => {
    test.skip(browserName !== 'chromium', 'CSS page zoom case is Chromium-only');
    await page.setViewportSize({ width: 320, height: 568 });
    await gotoFreshGame(page);
    await applyPageZoom(page, 2);
    const shop = await openShopAndEdit(page);

    const viewport = page.viewportSize()!;
    for (const locator of [
      shop,
      shop.getByRole('button', { name: 'Close restaurant shop' }),
      shop.getByRole('tab', { name: 'Ingredients' }),
      shop.locator('.layout-catalog-row').first(),
    ]) {
      const bounds = await locator.boundingBox();
      expect(bounds).not.toBeNull();
      expect(bounds!.x).toBeGreaterThanOrEqual(0);
      expect(bounds!.y).toBeGreaterThanOrEqual(0);
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport.width + 1);
      expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(viewport.height + 1);
    }
    await expectAtLeast44(
      shop.getByRole('button', { name: 'Close restaurant shop' }),
    );
    const scrollHosts = await shop.locator('*:visible').evaluateAll((elements) =>
      elements.filter((element) => /auto|scroll/.test(getComputedStyle(element).overflowY))
        .length,
    );
    expect(scrollHosts).toBe(1);

    await page.keyboard.press('Escape');
    await expect(shop).toBeHidden();
    await expect(page.getByTestId('open-layout-catalog')).toBeFocused();
  });

  test('pauses a transient notice while the shop covers it', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoFreshGame(page);
    await page.evaluate(() =>
      window.__E2E__!.setFloorToast('Paused behind shop fixture'),
    );
    const notice = page
      .getByTestId('notice-banner')
      .filter({ hasText: 'Paused behind shop fixture' });
    await expect(notice).toBeVisible();

    const shop = await openShopAndEdit(page);
    await expect(notice).toBeHidden();
    await page.waitForTimeout(2_750);
    await expect(notice).toHaveCount(1);

    await page.keyboard.press('Escape');
    await expect(shop).toBeHidden();
    await expect(notice).toBeVisible();
    await expect(notice).toHaveCount(0, { timeout: 3_500 });
  });

  test('labels the completed day and keeps both post-day choices explicit', async ({
    page,
  }) => {
    await gotoFreshGame(page);
    await completeServiceDay(page, false);
    await expect(page.getByTestId('day-summary-title')).toHaveText(
      'Day 1 Summary',
    );
    await expect(page.getByTestId('summary-back-floor')).toHaveText(
      'Continue to Day 2',
    );
    await expect(page.locator('.bottom-nav')).toBeHidden();
    await page.getByTestId('summary-back-floor').click();
    await expect(page.getByTestId('open-day-btn')).toBeVisible();
    await expect(page.locator('.bottom-nav')).toBeVisible();
    const continued = await page.evaluate(() => window.__E2E__!.getGameState());
    expect(continued.day).toBe(2);
    expect(continued.activeDay).toBeNull();

    await gotoFreshGame(page);
    await completeServiceDay(page, false);
    await page.getByTestId('summary-edit-restaurant').click();
    await expect(page.getByTestId('layout-catalog-sheet')).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Ingredients' })).toBeFocused();
  });
});
