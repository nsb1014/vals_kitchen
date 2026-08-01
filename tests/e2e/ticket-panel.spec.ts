import { expect, test, type Page } from '@playwright/test';
import { applyPageZoom, gotoFreshGame } from './helpers.ts';

async function prepareTickets(
  page: Page,
  count: number,
  carrying = false,
): Promise<void> {
  await page.evaluate(
    async ({ ticketCount, hasCarriedDish }) => {
      await window.__E2E__!.prepareTicketPanelFixture(
        ticketCount,
        hasCarriedDish,
      );
    },
    { ticketCount: count, hasCarriedDish: carrying },
  );
}

async function expectMenuInsideViewport(page: Page): Promise<void> {
  const bounds = await page.getByTestId('floor-tickets-menu').boundingBox();
  const viewport = page.viewportSize();
  expect(bounds).not.toBeNull();
  expect(viewport).not.toBeNull();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.y).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport!.width + 1);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(viewport!.height + 1);
}

test.describe('ticket planning panel', () => {
  test('shows capacity, numeric Ideal bars, and reliable keyboard focus', async ({
    page,
  }) => {
    const pageErrors: Error[] = [];
    page.on('pageerror', (error) => pageErrors.push(error));
    await gotoFreshGame(page);

    await prepareTickets(page, 0);
    await expect(page.getByTestId('floor-tickets-toggle')).toHaveText(
      'Tickets 0/4',
    );

    await prepareTickets(page, 4);
    const toggle = page.getByTestId('floor-tickets-toggle');
    await expect(toggle).toHaveText('Tickets 4/4');
    await expect(page.getByTestId('floor-take-orders')).toBeDisabled();
    await page.evaluate(() =>
      window.__E2E__!.setFloorToast('Ticket planning stays unobstructed'),
    );
    const planningNotice = page
      .getByTestId('notice-banner')
      .filter({ hasText: 'Ticket planning stays unobstructed' });
    await expect(planningNotice).toBeVisible();

    await toggle.click();
    await expect(page.getByTestId('celebration-banner-host')).toBeHidden();
    await page.waitForTimeout(2_750);
    await expect(planningNotice).toHaveCount(1);
    await expect(page.getByTestId('floor-tickets-capacity')).toHaveText(
      'Tickets full (4/4) — cook or deliver first.',
    );
    const orderTab = page.getByTestId('tickets-view-order');
    const idealTab = page.getByTestId('tickets-view-ideal');
    await expect(orderTab).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByTestId('floor-tickets-item')).toHaveCount(4);
    const orderMenuWidth =
      (await page.getByTestId('floor-tickets-menu').boundingBox())!.width;

    const firstGuest = await page
      .locator('.floor-tickets-item-guest')
      .first()
      .textContent();
    await idealTab.click();
    await expect(idealTab).toBeFocused();
    await expect(idealTab).toHaveAttribute('aria-selected', 'true');
    const idealMenuWidth =
      (await page.getByTestId('floor-tickets-menu').boundingBox())!.width;
    expect(idealMenuWidth).toBeCloseTo(orderMenuWidth, 0);
    await expect(page.getByTestId('floor-tickets-ideal')).toContainText(
      firstGuest?.trim() ?? '',
    );
    await expect(
      page.locator('.floor-tickets-ideal .flavor-bar-value'),
    ).not.toHaveCount(0);
    await expect(
      page.locator('.floor-tickets-ideal .flavor-temp-badge'),
    ).toHaveCount(0);

    await idealTab.press('ArrowLeft');
    await expect(orderTab).toBeFocused();
    await expect(orderTab).toHaveAttribute('aria-selected', 'true');
    await orderTab.press('ArrowLeft');
    await expect(idealTab).toBeFocused();
    await expect(idealTab).toHaveAttribute('aria-selected', 'true');

    await page.keyboard.press('Escape');
    await expect(page.getByTestId('floor-tickets-menu')).toBeHidden();
    await expect(toggle).toBeFocused();
    await expect(planningNotice).toBeVisible();
    await expect(planningNotice).toHaveCount(0, {
      timeout: 3_500,
    });

    await toggle.click();
    await page.evaluate(() => {
      const button = document.querySelector<HTMLButtonElement>(
        '[data-testid="floor-take-orders"]',
      )!;
      button.disabled = false;
      button.addEventListener('click', () => {
        document.documentElement.dataset.outsideTicketAction = 'clicked';
      });
    });
    await page.getByTestId('floor-take-orders').click();
    await expect(page.getByTestId('floor-tickets-menu')).toBeHidden();
    await expect(page.locator('html')).toHaveAttribute(
      'data-outside-ticket-action',
      'clicked',
    );
    expect(pageErrors).toEqual([]);
  });

  test('makes a carried dish and its locked ticket choices explicit', async ({
    page,
  }) => {
    await gotoFreshGame(page);
    await prepareTickets(page, 2, true);

    const toggle = page.getByTestId('floor-tickets-toggle');
    await expect(toggle).toContainText(/^Carrying .+ · 2\/4$/);
    await toggle.click();
    const carryingRow = page.locator('.floor-tickets-item.carrying');
    await expect(carryingRow).toContainText('Carrying');
    const carryingGuest = await carryingRow
      .locator('.floor-tickets-item-guest')
      .textContent();
    await expect(page.locator('[data-menu-ticket-id]')).toHaveCount(0);
    await expect(page.locator('[data-static-ticket-id]')).toHaveCount(2);

    await page.getByTestId('tickets-view-ideal').click();
    await expect(page.getByTestId('floor-tickets-ideal')).toContainText(
      carryingGuest?.trim() ?? '',
    );
    await page.getByTestId('floor-tickets-close').click();
    await expect(toggle).toBeFocused();
  });

  for (const width of [320, 390]) {
    test(`keeps four tickets and both views within a ${width}px viewport`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 720 });
      await gotoFreshGame(page);
      await prepareTickets(page, 4);
      await page.evaluate(() =>
        window.__E2E__!.setFloorToast('Mobile ticket notice fixture'),
      );
      await page.getByTestId('floor-tickets-toggle').click();

      await expect(page.getByTestId('celebration-banner-host')).toBeHidden();
      await expectMenuInsideViewport(page);
      await expect(page.getByTestId('floor-tickets-item')).toHaveCount(4);
      const orderWidth =
        (await page.getByTestId('floor-tickets-menu').boundingBox())!.width;
      await page.getByTestId('tickets-view-ideal').click();
      await expectMenuInsideViewport(page);
      const idealWidth =
        (await page.getByTestId('floor-tickets-menu').boundingBox())!.width;
      expect(idealWidth).toBeCloseTo(orderWidth, 0);

      for (const control of await page
        .locator(
          '[data-testid="tickets-view-order"], [data-testid="tickets-view-ideal"], [data-testid="floor-tickets-close"]',
        )
        .all()) {
        const bounds = await control.boundingBox();
        expect(bounds).not.toBeNull();
        expect(bounds!.height).toBeGreaterThanOrEqual(44);
      }
    });
  }

  test('keeps one ticket scroll host and complete controls at 200% zoom', async ({
    page,
    browserName,
  }) => {
    test.skip(browserName !== 'chromium', 'CSS page zoom case is Chromium-only');
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoFreshGame(page);
    await prepareTickets(page, 4);
    await page.getByTestId('floor-tickets-toggle').click();
    await applyPageZoom(page, 2);

    await expectMenuInsideViewport(page);
    await expect(page.getByTestId('floor-tickets-close')).toBeVisible();
    const orderPanel = page.locator(
      '.floor-tickets-panel-body:not([hidden])',
    );
    await orderPanel.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
    await expect(page.getByTestId('floor-tickets-item').last()).toBeVisible();

    await page.getByTestId('tickets-view-ideal').click();
    await expectMenuInsideViewport(page);
    const idealPanel = page.locator(
      '.floor-tickets-panel-body:not([hidden])',
    );
    await idealPanel.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
    await expect(
      page.locator('.floor-tickets-ideal .flavor-bar-value').last(),
    ).toBeVisible();

    const scrollHosts = await page
      .getByTestId('floor-tickets-menu')
      .locator('*:visible')
      .evaluateAll((elements) =>
        elements.filter((element) => {
          const style = getComputedStyle(element);
          return /auto|scroll/.test(style.overflowY);
        }).length,
      );
    expect(scrollHosts).toBe(1);
  });
});
