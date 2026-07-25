import { test, expect } from '@playwright/test';
import {
  assertCanvasHasRenderedContent,
  assertNoDiagnostics,
  assertNoHorizontalOverflow,
  assertPrimaryControlsInViewport,
  assertScreenOpen,
  completeServiceDay,
  dragGridCell,
  gotoFreshGame,
  navigateToScreen,
  readSaveFromIndexedDb,
  serveCurrentCustomer,
  trackContentRequests,
  waitForGameReady,
  waitForInteractiveBoot,
} from './helpers.ts';

test.describe('boot and rendering', () => {
  test('loads without errors, fetches boot content, and renders canvas', async ({ page }) => {
    const tracker = await trackContentRequests(page);
    const diagnostics = await gotoFreshGame(page);

    await tracker.waitForBoot();
    assertNoDiagnostics(diagnostics);
    await assertCanvasHasRenderedContent(page);
  });
});

test.describe('service day flow', () => {
  test('opens day, serves customers, and reaches day summary', async ({ page }) => {
    await gotoFreshGame(page);
    await completeServiceDay(page);
  });
});

test.describe('deferred content', () => {
  test('loads scoring and recipe JSON before serve succeeds', async ({ page }) => {
    const tracker = await trackContentRequests(page);
    await gotoFreshGame(page);
    await tracker.waitForBoot();

    await page.locator('[data-testid="open-day-btn"]').click();
    await tracker.waitForDeferred();
    await expect.poll(() => page.evaluate(() => window.__E2E__?.isScoringReady())).toBe(true);

    await page.locator('[data-testid="start-service-btn"]').click();
    await expect(page.locator('[data-testid="chat-bubble"]')).toBeVisible();

    await serveCurrentCustomer(page);
    await expect.poll(() => page.evaluate(() => window.__E2E__?.isRecipesReady())).toBe(true);
  });
});

test.describe('layout editing', () => {
  test('dragging furniture from tile center moves it to the target tile center', async ({ page }) => {
    await gotoFreshGame(page);

    const before = await page.evaluate(() => window.__E2E__!.getPlacements());
    const table = before.find((item) => item.id === 'table_1');
    expect(table).toBeDefined();

    await dragGridCell(page, table!.x, table!.y, table!.x, table!.y + 2);

    await expect
      .poll(async () => {
        const placements = await page.evaluate(() => window.__E2E__!.getPlacements());
        const moved = placements.find((item) => item.id === 'table_1');
        return moved ? `${moved.x},${moved.y}` : '';
      })
      .toBe(`${table!.x},${table!.y + 2}`);

    await dragGridCell(page, table!.x, table!.y + 2, table!.x + 1, table!.y + 1);

    await expect
      .poll(async () => {
        const placements = await page.evaluate(() => window.__E2E__!.getPlacements());
        const moved = placements.find((item) => item.id === 'table_1');
        return moved ? `${moved.x},${moved.y}` : '';
      })
      .toBe(`${table!.x + 1},${table!.y + 1}`);
  });
});

test.describe('screen navigation', () => {
  test('each Phase 6 screen renders key content', async ({ page }) => {
    await gotoFreshGame(page);

    await navigateToScreen(page, 'inspector');
    await assertScreenOpen(page, 'inspector-screen');
    await expect(page.locator('[data-testid="flavor-axis-row"]')).toHaveCount(15);
    await expect(page.locator('.flavor-temp-badge')).toBeVisible();

    await navigateToScreen(page, 'shop');
    await assertScreenOpen(page, 'shop-screen');
    await expect(page.locator('#shop-sections')).not.toBeEmpty();

    await navigateToScreen(page, 'recipes');
    await assertScreenOpen(page, 'recipes-screen');
    await expect(page.locator('#recipe-progress')).not.toHaveText('Loading…');

    await navigateToScreen(page, 'rating');
    await assertScreenOpen(page, 'rating-screen');
    await expect(page.locator('.rating-current')).toContainText('★');

    await navigateToScreen(page, 'settings');
    await assertScreenOpen(page, 'settings-screen');
    await expect(page.locator('[data-testid="export-save-btn"]')).toBeVisible();

    await navigateToScreen(page, 'restaurant');
    await expect(page.locator('[data-testid="open-day-btn"]')).toBeVisible();
  });
});

test.describe('persistence', () => {
  test('restores progress after reload', async ({ page }) => {
    await gotoFreshGame(page);
    await page.locator('[data-testid="open-day-btn"]').click();
    await page.locator('[data-testid="start-service-btn"]').click();
    await selectThreeDraftIngredients(page);

    const before = await page.evaluate(() => window.__E2E__!.getState());
    expect(before.composeDraftIngredientIds.length).toBe(3);

    await expect.poll(() => readSaveFromIndexedDb(page)).not.toBeNull();

    await page.reload({ waitUntil: 'networkidle' });
    await waitForGameReady(page);

    const after = await page.evaluate(() => window.__E2E__!.getState());
    expect(after.activeDay).not.toBeNull();
    expect(after.activeDay!.queueIndex).toBe(before.activeDay!.queueIndex);
    expect(after.composeDraftIngredientIds).toEqual(before.composeDraftIngredientIds);
    await expect(page.locator('[data-testid="chat-bubble"]')).toBeVisible();
  });
});

test.describe('save code', () => {
  test('exports and imports a valid save code; rejects corrupt codes', async ({ page }) => {
    await gotoFreshGame(page);
    await navigateToScreen(page, 'settings');

    await page.locator('[data-testid="export-save-btn"]').click();
    await expect(page.locator('[data-testid="save-feedback"]')).toHaveClass(/save-feedback-success/);

    const exported = await page.evaluate(() => window.__E2E__!.getGameState());
    const saveCode = await page.evaluate(() => window.__E2E__!.exportSaveCode());

    await page.locator('[data-testid="import-save-input"]').fill('RS1.not-a-valid-save-code');
    await page.locator('[data-testid="import-save-btn"]').click();
    await expect(page.locator('[data-testid="save-feedback"]')).toHaveClass(/save-feedback-error/);

    await page.locator('[data-testid="import-save-input"]').fill(saveCode);
    await page.locator('[data-testid="import-save-btn"]').click();
    await expect(page.locator('[data-testid="save-feedback"]')).toHaveClass(/save-feedback-success/);

    const restored = await page.evaluate(() => window.__E2E__!.getGameState());
    expect(restored.day).toBe(exported.day);
    expect(restored.cash).toBe(exported.cash);
  });
});

async function selectThreeDraftIngredients(page: import('@playwright/test').Page): Promise<void> {
  const chips = page.locator('[data-testid="ingredient-chip"]:not([disabled])');
  for (let i = 0; i < 3; i += 1) {
    await chips.nth(i).click();
  }
}

test.describe('mobile viewport', () => {
  test.use({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
  });

  test('core flow fits iPhone viewport without horizontal overflow', async ({ page }) => {
    await gotoFreshGame(page);
    await assertNoHorizontalOverflow(page);
    await assertPrimaryControlsInViewport(page);

    await page.locator('[data-testid="open-day-btn"]').click();
    await page.locator('[data-testid="start-service-btn"]').click();
    await expect(page.locator('[data-testid="chat-bubble"]')).toBeVisible();
    await assertNoHorizontalOverflow(page);
    await serveCurrentCustomer(page);
    await assertNoHorizontalOverflow(page);
  });
});
