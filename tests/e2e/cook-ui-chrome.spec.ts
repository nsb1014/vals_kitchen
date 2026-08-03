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
  const ingredient = await page
    .getByTestId('ingredient-chip')
    .first()
    .boundingBox();
  expect(pantry).not.toBeNull();
  expect(ingredient).not.toBeNull();
  expect(ingredient!.height).toBeLessThanOrEqual(pantry!.height + 1);
  await expectFooterInsideSheet(page);
}

async function expectServiceBackgroundIsolated(page: Page): Promise<void> {
  for (const selector of [
    '#status-mount',
    '#canvas-mount',
    '#chrome-mount',
    '#bubble-mount',
    '[data-testid="floor-tickets-dock"]',
  ]) {
    const target = page.locator(selector);
    await expect(target).toHaveCount(1);
    await expect(target).toHaveAttribute('aria-hidden', 'true');
    expect(
      await target.evaluate((element) => (element as HTMLElement).inert),
      `${selector} should be inert while a mandatory outcome owns focus`,
    ).toBe(true);
  }
}

async function outcomeGameplaySnapshot(page: Page) {
  return page.evaluate(() => {
    const state = window.__E2E__!.getGameState();
    const floor = state.activeDay?.floor;
    return {
      day: state.day,
      cash: state.cash,
      rating: state.rating,
      customers:
        state.activeDay?.customers.map((customer) => customer.id) ?? [],
      guests:
        floor?.pool.map((guest) => ({
          id: guest.id,
          customerId: guest.customer.id,
          stage: guest.stage,
        })) ?? [],
      tables:
        floor?.tables.map((table) => ({
          id: table.placementId,
          state: table.state,
        })) ?? [],
      tickets:
        floor?.tickets.map((ticket) => ({
          id: ticket.id,
          customerId: ticket.customerId,
          status: ticket.status,
        })) ?? [],
    };
  });
}

test.describe('cook sheet responsive chrome', () => {
  for (const width of [320, 360, 390]) {
    test(`holds fixed regions with the full pantry at ${width}px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 720 });
      await openCookFixture(page);
      await expect(page.getByTestId('ingredient-chip')).toHaveCount(100);
      await expect(page.getByTestId('ingredient-inspect')).toHaveCount(100);
      await expect(page.getByTestId('ingredient-inspect').first()).toHaveText('i');
      await expect(page.getByTestId('compose-order-panel')).toBeVisible();
      await expect(page.getByTestId('compose-request-axis')).not.toHaveCount(0);
      await expect(
        page.getByTestId('compose-sheet').getByTestId('guest-portrait'),
      ).toBeVisible();
      await expect(page.getByTestId('compose-search')).toHaveCount(0);
      await expect(page.locator('.compose-filters')).toBeVisible();
      await expect(page.locator('.compose-order-mobile-legend')).toBeVisible();
      await expect(
        page.locator('.compose-request-bars[aria-hidden="true"]'),
      ).not.toHaveCount(0);
      await expect(
        page.locator('.compose-request-bar[role="meter"]'),
      ).toHaveCount(0);
      await expectFooterInsideSheet(page);
      const pantry = await page.getByTestId('compose-pantry').boundingBox();
      const orderPanel = await page
        .getByTestId('compose-order-panel')
        .boundingBox();
      const close = await page.getByTestId('compose-close').boundingBox();
      expect(pantry).not.toBeNull();
      expect(orderPanel).not.toBeNull();
      expect(close).not.toBeNull();
      expect(pantry!.height).toBeGreaterThan(150);
      expect(orderPanel!.y + orderPanel!.height).toBeLessThanOrEqual(
        pantry!.y + 1,
      );
      expect(close!.width).toBeGreaterThanOrEqual(44);
      expect(close!.height).toBeGreaterThanOrEqual(44);
      const firstCard = await page.locator('.compose-ingredient-card').first().boundingBox();
      const firstIngredient = await page.getByTestId('ingredient-chip').first().boundingBox();
      const firstInspect = await page.getByTestId('ingredient-inspect').first().boundingBox();
      expect(firstCard).not.toBeNull();
      expect(firstIngredient).not.toBeNull();
      expect(firstInspect).not.toBeNull();
      // Inspection stays a full touch target without adding a labeled row to
      // every pantry card.
      expect(firstInspect!.width).toBeGreaterThanOrEqual(44);
      expect(firstInspect!.height).toBeGreaterThanOrEqual(44);
      expect(firstCard!.height).toBeLessThanOrEqual(firstIngredient!.height + 1);
      expect(firstInspect!.x + firstInspect!.width).toBeLessThanOrEqual(
        firstCard!.x + firstCard!.width + 1,
      );
      const filterBounds = await page
        .locator('.compose-axis-row')
        .boundingBox();
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
    await expect(page.locator('.compose-flavor-mini-value')).toHaveCount(0);
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
    const flavorStrip = await page
      .locator('.compose-flavor-strip')
      .boundingBox();
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

  test('keeps compose qualitative while Tickets Ideal remains numeric', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openCookFixture(page);

    const sheet = page.getByTestId('compose-sheet');
    await expect(sheet.getByTestId('compose-request-axis')).not.toHaveCount(0);
    await expect(sheet.locator('.compose-request-status')).not.toHaveCount(0);
    for (const status of await sheet.locator('.compose-request-status').all()) {
      await expect(status).toHaveText(
        /^(Below request|In range|Above request)$/,
      );
    }
    await expect(sheet.locator('[role="meter"]')).toHaveCount(0);
    await expect(sheet.locator('[aria-valuenow]')).toHaveCount(0);
    await expect(sheet.locator('.compose-flavor-mini-value')).toHaveCount(0);
    await expect(sheet.locator('.compose-footer-copy')).not.toContainText(
      'Current request match',
    );
    const requestCopy = await sheet
      .locator('.compose-request-axis-list')
      .innerText();
    expect(requestCopy).not.toMatch(/\d+(?:\.\d+)?\s+(?:dish|target)/i);

    await page.getByTestId('compose-close').click();
    await page.getByTestId('floor-tickets-toggle').click();
    await page.getByTestId('tickets-view-ideal').click();
    await expect(
      page.locator('.floor-tickets-ideal .flavor-bar-value'),
    ).toHaveCount(15);
    await expect(
      page.locator('.floor-tickets-ideal [role="meter"][aria-valuenow]'),
    ).toHaveCount(15);
  });

  test('inspects by pointer and keyboard without changing the selected draft', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openCookFixture(page);

    await page.getByTestId('ingredient-chip').first().click();
    const before = await page.evaluate(
      () => window.__E2E__!.getState().composeDraftIngredientIds,
    );
    const firstInspect = page.getByTestId('ingredient-inspect').first();
    const firstBounds = await firstInspect.boundingBox();
    expect(firstBounds).not.toBeNull();
    expect(firstBounds!.width).toBeGreaterThanOrEqual(44);
    expect(firstBounds!.height).toBeGreaterThanOrEqual(44);

    await firstInspect.click();
    await expect(
      page.locator('#flavor-inspector-modal [role="dialog"]'),
    ).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(firstInspect).toBeFocused();
    expect(
      await page.evaluate(
        () => window.__E2E__!.getState().composeDraftIngredientIds,
      ),
    ).toEqual(before);

    const secondInspect = page.getByTestId('ingredient-inspect').nth(1);
    await secondInspect.focus();
    await secondInspect.press('Enter');
    await expect(
      page.locator('#flavor-inspector-modal [role="dialog"]'),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Back to compose' }).click();
    await expect(secondInspect).toBeFocused();
    expect(
      await page.evaluate(
        () => window.__E2E__!.getState().composeDraftIngredientIds,
      ),
    ).toEqual(before);
  });

  test('restores independent A/B ticket drafts and plates the chosen ticket', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoFreshGame(page);
    const ticketIds = await page.evaluate(async () => {
      await window.__E2E__!.prepareTicketPanelFixture(2);
      await window.__E2E__!.prepareCookUiFixture();
      window.__E2E__!.openComposeSheet();
      return window
        .__E2E__!.getGameState()
        .activeDay!.floor!.tickets.filter((ticket) => ticket.status === 'open')
        .map((ticket) => ticket.id);
    });
    expect(ticketIds).toHaveLength(2);
    await expect(page.getByTestId('compose-sheet')).toBeVisible();

    for (let index = 0; index < 3; index += 1) {
      await page.getByTestId('ingredient-chip').nth(index).click();
    }
    const draftA = await page.evaluate(
      (ticketId) => window.__E2E__!.getState().floorTicketDrafts[ticketId],
      ticketIds[0]!,
    );
    expect(draftA).toHaveLength(3);

    const selectTicket = async (ticketId: string) => {
      await page.getByTestId('compose-close').click();
      await page.getByTestId('floor-tickets-toggle').click();
      await page.locator(`[data-menu-ticket-id="${ticketId}"]`).click();
      await page.getByTestId('floor-tickets-close').click();
      await page.evaluate(() => window.__E2E__!.openComposeSheet());
      await expect(page.getByTestId('compose-sheet')).toBeVisible();
    };

    await selectTicket(ticketIds[1]!);
    expect(
      await page.evaluate(
        () => window.__E2E__!.getState().composeDraftIngredientIds,
      ),
    ).toEqual([]);
    for (let index = 3; index < 7; index += 1) {
      await page.getByTestId('ingredient-chip').nth(index).click();
    }
    const draftB = await page.evaluate(
      (ticketId) => window.__E2E__!.getState().floorTicketDrafts[ticketId],
      ticketIds[1]!,
    );
    expect(draftB).toHaveLength(4);

    await selectTicket(ticketIds[0]!);
    expect(
      await page.evaluate(
        () => window.__E2E__!.getState().composeDraftIngredientIds,
      ),
    ).toEqual(draftA);
    await selectTicket(ticketIds[1]!);
    expect(
      await page.evaluate(
        () => window.__E2E__!.getState().composeDraftIngredientIds,
      ),
    ).toEqual(draftB);

    await page.getByTestId('plate-btn').click();
    await expect(page.getByTestId('compose-sheet')).toBeHidden();
    const plated = await page.evaluate(
      (ticketId) =>
        window
          .__E2E__!.getGameState()
          .activeDay!.floor!.tickets.find((ticket) => ticket.id === ticketId),
      ticketIds[1]!,
    );
    expect(plated?.status).toBe('plated');
    expect(plated?.ingredientIds).toEqual(draftB);
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
    await page.evaluate(() =>
      window.dispatchEvent(new Event('food-atlas-ready')),
    );
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

  test('keeps the desktop restaurant fixed behind the readable modifier sheet', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 2048, height: 1152 });
    await gotoFreshGame(page);
    const canvas = page.getByTestId('restaurant-canvas');
    await page.getByTestId('open-day-btn').click();
    const modifier = page.getByTestId('modifier-sheet');
    await expect(modifier).toBeVisible();
    const modifierCanvas = await visibleRect(canvas);
    const modifierProjection = await page.evaluate(() =>
      window.__E2E__!.gridCellToScreen(4, 4),
    );
    const sheet = await visibleRect(modifier);
    const start = await visibleRect(page.getByTestId('start-service-btn'));
    const hud = await visibleRect(page.getByTestId('game-hud'));
    expect(sheet.x + sheet.width).toBeLessThanOrEqual(2048 + 0.5);
    expect(sheet.y).toBeGreaterThanOrEqual(hud.y + hud.height - 0.5);
    expect(sheet.x).toBeLessThan(modifierCanvas.x + modifierCanvas.width);
    expect(start.x).toBeGreaterThanOrEqual(sheet.x);
    expect(start.x + start.width).toBeLessThanOrEqual(sheet.x + sheet.width);
    await expect(page.getByRole('button', { name: 'Cash details' })).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Restaurant rating details' }),
    ).toBeVisible();
    expect(
      await modifier.evaluate(
        (element) => getComputedStyle(element).backgroundColor,
      ),
    ).not.toBe('rgba(0, 0, 0, 0)');
    await page.screenshot({
      path: 'test-results/modifier-desktop-full-restaurant.png',
      animations: 'disabled',
    });

    await page.getByTestId('start-service-btn').click();
    await expect(modifier).toBeHidden();
    await expect
      .poll(async () => {
        const activeCanvas = await visibleRect(canvas);
        const activeProjection = await page.evaluate(() =>
          window.__E2E__!.gridCellToScreen(4, 4),
        );
        return Math.max(
          Math.abs(activeCanvas.x - modifierCanvas.x),
          Math.abs(activeCanvas.y - modifierCanvas.y),
          Math.abs(activeCanvas.width - modifierCanvas.width),
          Math.abs(activeCanvas.height - modifierCanvas.height),
          Math.abs(activeProjection.x - modifierProjection.x),
          Math.abs(activeProjection.y - modifierProjection.y),
        );
      })
      .toBeLessThanOrEqual(0.5);
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

  test('keeps customer review compact while retaining a bounded scroll area', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 720 });
    await gotoFreshGame(page);
    await page.getByTestId('open-day-btn').click();
    await page.getByTestId('start-service-btn').click();
    await serveCurrentCustomer(page);
    const reviewSheet = page.getByTestId('review-sheet');
    const sheet = await reviewSheet.boundingBox();
    const card = await reviewSheet.locator('.service-card').boundingBox();
    expect(sheet).not.toBeNull();
    expect(card).not.toBeNull();
    expect(sheet!.height).toBeLessThanOrEqual(card!.height + 27);
    expect(sheet!.height / 720).toBeLessThan(0.48);
    expect(sheet!.y / 720).toBeGreaterThan(0.5);
    await expectFooterInsideSheet(
      page,
      'review-sheet',
      '[data-testid="review-sheet"] .sheet-footer',
      'continue-service-btn',
    );
    await page.screenshot({
      path: 'test-results/customer-review-compact.png',
      animations: 'disabled',
    });
  });

  test('keeps the review action reachable in a short mobile viewport', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 480 });
    await gotoFreshGame(page);
    await page.getByTestId('open-day-btn').click();
    await page.getByTestId('start-service-btn').click();
    await serveCurrentCustomer(page);

    const sheet = await page.getByTestId('review-sheet').boundingBox();
    expect(sheet).not.toBeNull();
    expect(sheet!.height).toBeLessThanOrEqual(480 * 0.72 + 1);
    await expectFooterInsideSheet(
      page,
      'review-sheet',
      '[data-testid="review-sheet"] .sheet-footer',
      'continue-service-btn',
    );
  });

  test('makes review a mandatory focus scope and restores gameplay without mutation', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 720 });
    await gotoFreshGame(page);
    await page.getByTestId('open-day-btn').click();
    await page.getByTestId('start-service-btn').click();
    await page.locator('#canvas-mount').evaluate((element) => {
      element.setAttribute('aria-hidden', 'false');
    });
    await serveCurrentCustomer(page);

    const review = page.getByRole('dialog', { name: /^Review from .+/ });
    const title = page.locator('#review-context-title');
    const continueButton = page.getByTestId('continue-service-btn');
    await expect(review).toHaveAttribute('data-testid', 'review-sheet');
    await expect(review).toHaveAttribute('aria-modal', 'true');
    await expect(title).toBeFocused();
    await expectServiceBackgroundIsolated(page);

    await page.keyboard.press('Tab');
    await expect(continueButton).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(continueButton).toBeFocused();
    await title.focus();
    await page.keyboard.press('Shift+Tab');
    await expect(continueButton).toBeFocused();

    await page.evaluate(() =>
      window.dispatchEvent(new Event('food-atlas-ready')),
    );
    await expect(continueButton).toBeFocused();

    const beforeEscape = await outcomeGameplaySnapshot(page);
    await page.keyboard.press('Escape');
    await expect(review).toBeVisible();
    expect(await outcomeGameplaySnapshot(page)).toEqual(beforeEscape);

    const transition = await page.evaluate(() => {
      const snapshot = () => {
        const state = window.__E2E__!.getGameState();
        const floor = state.activeDay?.floor;
        return {
          day: state.day,
          cash: state.cash,
          rating: state.rating,
          customers:
            state.activeDay?.customers.map((customer) => customer.id) ?? [],
          guests:
            floor?.pool.map((guest) => ({
              id: guest.id,
              customerId: guest.customer.id,
              stage: guest.stage,
            })) ?? [],
          tables:
            floor?.tables.map((table) => ({
              id: table.placementId,
              state: table.state,
            })) ?? [],
          tickets:
            floor?.tickets.map((ticket) => ({
              id: ticket.id,
              customerId: ticket.customerId,
              status: ticket.status,
            })) ?? [],
        };
      };
      const before = snapshot();
      const button = document.querySelector<HTMLButtonElement>(
        '[data-testid="continue-service-btn"]',
      );
      if (!button) throw new Error('review Continue button missing');
      button.click();
      return { before, after: snapshot() };
    });
    expect(transition.after).toEqual(transition.before);
    await expect(page.getByTestId('review-sheet')).toBeHidden();
    await expect(page.getByTestId('restaurant-canvas')).toBeFocused();
    await expect(page.locator('#canvas-mount')).toHaveAttribute(
      'aria-hidden',
      'false',
    );
    expect(
      await page
        .locator('#canvas-mount')
        .evaluate((element) => (element as HTMLElement).inert),
    ).toBe(false);
    await expect(page.locator('#chrome-mount')).not.toHaveAttribute(
      'aria-hidden',
      'true',
    );
    expect(
      await page
        .locator('#chrome-mount')
        .evaluate((element) => (element as HTMLElement).inert),
    ).toBe(false);
  });

  test('keeps the day summary compact with two dedicated next choices', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 720 });
    await gotoFreshGame(page);
    await completeServiceDay(page, false);
    const summarySheet = page.getByTestId('day-summary-sheet');
    const sheet = await summarySheet.boundingBox();
    const card = await summarySheet.locator('.service-card').boundingBox();
    expect(sheet).not.toBeNull();
    expect(card).not.toBeNull();
    expect(sheet!.height).toBeLessThanOrEqual(card!.height + 27);
    expect(sheet!.height / 720).toBeLessThan(0.7);
    await expect(page.locator('.bottom-nav')).toBeHidden();
    await expect(summarySheet.locator('.service-btn')).toHaveCount(2);
    await expectFooterInsideSheet(
      page,
      'day-summary-sheet',
      '[data-testid="day-summary-sheet"] .sheet-footer',
      'summary-edit-restaurant',
    );
    await page.screenshot({
      path: 'test-results/day-summary-compact.png',
      animations: 'disabled',
    });
  });

  test('keeps both summary choices reachable in a short mobile viewport', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 480 });
    await gotoFreshGame(page);
    await completeServiceDay(page, false);

    const sheet = await page.getByTestId('day-summary-sheet').boundingBox();
    expect(sheet).not.toBeNull();
    expect(sheet!.height).toBeLessThanOrEqual(480 * 0.94 + 1);
    await expect(page.locator('.bottom-nav')).toBeHidden();
    await expectFooterInsideSheet(
      page,
      'day-summary-sheet',
      '[data-testid="day-summary-sheet"] .sheet-footer',
      'summary-edit-restaurant',
    );
    await expect(page.getByTestId('summary-back-floor')).toBeVisible();
  });

  test('makes summary a mandatory focus scope and focuses the next day action', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 720 });
    await gotoFreshGame(page);
    await completeServiceDay(page, false);

    const summary = page.getByRole('dialog', {
      name: /Day \d+ Summary/,
    });
    const title = page.getByTestId('day-summary-title');
    const continueButton = page.getByTestId('summary-back-floor');
    const editButton = page.getByTestId('summary-edit-restaurant');
    await expect(summary).toHaveAttribute('data-testid', 'day-summary-sheet');
    await expect(summary).toHaveAttribute('aria-modal', 'true');
    await expect(title).toBeFocused();
    await expectServiceBackgroundIsolated(page);

    await page.keyboard.press('Tab');
    await expect(continueButton).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(editButton).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(continueButton).toBeFocused();
    await title.focus();
    await page.keyboard.press('Shift+Tab');
    await expect(editButton).toBeFocused();

    const beforeEscape = await outcomeGameplaySnapshot(page);
    await page.keyboard.press('Escape');
    await expect(summary).toBeVisible();
    expect(await outcomeGameplaySnapshot(page)).toEqual(beforeEscape);

    await continueButton.click();
    await expect(summary).toBeHidden();
    await expect(page.getByTestId('open-day-btn')).toBeFocused();
  });

  test('keeps Shop and Edit focus after summary teardown finishes', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 720 });
    await gotoFreshGame(page);
    await completeServiceDay(page, false);

    await page.getByTestId('summary-edit-restaurant').click();
    const ingredientsTab = page
      .getByTestId('layout-catalog-sheet')
      .getByRole('tab', { name: 'Ingredients' });
    await expect(ingredientsTab).toBeFocused();
    await page.evaluate(
      () =>
        new Promise<void>((resolve) => {
          queueMicrotask(() =>
            requestAnimationFrame(() =>
              requestAnimationFrame(() => setTimeout(resolve, 0)),
            ),
          );
        }),
    );
    await expect(ingredientsTab).toBeFocused();
  });

  test('gives ceremony precedence over a pending review and restores review focus', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 720 });
    await gotoFreshGame(page);
    await page.getByTestId('open-day-btn').click();
    await page.getByTestId('start-service-btn').click();
    await serveCurrentCustomer(page);
    await page.evaluate(() =>
      window.__E2E__!.showCeremonyOverPendingReview(),
    );

    const ceremony = page.getByRole('dialog', {
      name: 'Prestige Achieved!',
    });
    const ceremonyTitle = page.locator('#ceremony-title');
    const ceremonyAction = page.locator('#dismiss-ceremony');
    await expect(ceremony).toHaveAttribute('aria-modal', 'true');
    await expect(ceremonyTitle).toBeFocused();
    await expect(page.getByTestId('review-sheet')).toBeHidden();
    await expectServiceBackgroundIsolated(page);

    await page.keyboard.press('Tab');
    await expect(ceremonyAction).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(ceremonyAction).toBeFocused();
    await ceremonyTitle.focus();
    await page.keyboard.press('Shift+Tab');
    await expect(ceremonyAction).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(ceremony).toBeVisible();
    await expect(page.getByTestId('review-sheet')).toBeHidden();

    await ceremonyAction.click();
    await expect(ceremony).toBeHidden();
    await expect(page.getByTestId('review-sheet')).toBeVisible();
    await expect(page.locator('#review-context-title')).toBeFocused();
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

    const catalog = page.getByTestId('layout-catalog-sheet');
    await expect(
      catalog.getByRole('tab', { name: 'Ingredients' }),
    ).toHaveAttribute('aria-selected', 'true');
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

    await expect(page.getByRole('tab', { name: 'Flavors' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
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
