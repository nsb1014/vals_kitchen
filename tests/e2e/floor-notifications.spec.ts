import { expect, test, type Locator, type Page } from '@playwright/test';
import {
  applyPageZoom,
  assertFinalFloorActionActivatable,
  assertScrollportAtLeastCta,
  gotoFreshGame,
} from './helpers.ts';
import { waitingGuestServicePositions } from '../../src/domain/floor/interact.ts';

// Default Playwright project is Chromium (matches CI). Firefox is opt-in via
// PLAYWRIGHT_BROWSERS. WebKit/iOS remains unverified in this environment.
const VIEWPORT_MATRIX = [
  { width: 390, height: 844, rows: 1 },
  { width: 320, height: 568, rows: 2 },
  { width: 320, height: 480, rows: 2 },
  { width: 667, height: 375, rows: 1 },
  { width: 768, height: 1024, rows: 1 },
  { width: 1280, height: 800, rows: 1 },
] as const;

async function openFloorDay(page: Page): Promise<void> {
  await gotoFreshGame(page);
  await page.locator('[data-testid="open-day-btn"]').click();
  await page.locator('[data-testid="start-service-btn"]').click();
  await expect(
    page.locator('[data-testid="floor-service-panel"]'),
  ).toBeVisible();
}

async function dismissInitialNotice(page: Page): Promise<void> {
  const notice = page.locator('[data-testid="notice-banner"]');
  for (let guard = 0; guard < 4 && (await notice.isVisible()); guard += 1) {
    await page
      .getByRole('button', { name: 'Dismiss notice' })
      .click();
  }
  await expect(notice).toHaveCount(0);
}

async function expectMinimumTargetSize(
  target: Locator,
  minimum = 44,
): Promise<void> {
  await expect
    .poll(async () => {
      const box = await target.boundingBox();
      return box ? Math.min(box.width, box.height) : 0;
    })
    .toBeGreaterThanOrEqual(minimum);
}

test('uses distinct guidance while a guest arrives, waits, and walks to a table', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openFloorDay(page);
  const gridSize = await page.evaluate(async () => {
    const bridge = window.__E2E__!;
    const floor = () => bridge.getGameState().activeDay!.floor!;
    for (const table of floor().tables) {
      await bridge.dispatch({
        type: 'FLOOR_SET_TABLE',
        placementId: table.placementId,
      });
    }
    return bridge.getGameState().gridSize;
  });

  const noticeBody = page.locator('.notice-banner-body');
  const seatGuest = page.getByTestId('floor-seat-next');
  await expect(noticeBody).toHaveText('The first guest is arriving…');
  await expect(seatGuest).toBeDisabled();
  await expect(seatGuest).not.toHaveClass(/\bprimary\b/);

  await page.evaluate(() =>
    window.__E2E__!.dispatch({ type: 'FLOOR_COMPLETE_ENTERING' }),
  );
  await expect(noticeBody).toHaveText('Seat the waiting guest.');
  await expect(seatGuest).toBeEnabled();
  await expect(seatGuest).toHaveClass(/\bprimary\b/);

  const nearWaiting = waitingGuestServicePositions(
    gridSize.w,
    gridSize.h,
  )[0]!;
  await page.evaluate(async (position) => {
    const bridge = window.__E2E__!;
    bridge.setFloorNavPosition(position);
    await bridge.dispatch({ type: 'FLOOR_SEAT_NEXT' });
  }, nearWaiting);
  await expect(noticeBody).toHaveText('Guest is heading to the table…');
  await expect(seatGuest).toBeDisabled();
  await expect(seatGuest).not.toHaveClass(/\bprimary\b/);
});

async function readFloorLayout(
  page: Page,
  expectedRows: 1 | 2 | 3,
): Promise<{
  chromeMinHeight: number;
  activeTokenHeight: number;
  expectedTokenHeight: number;
  columns: number;
}> {
  return page.evaluate((rows) => {
    const chrome = document.querySelector(
      '[data-testid="chrome-mount"]',
    ) as HTMLElement | null;
    const actions = document.querySelector(
      '.floor-actions',
    ) as HTMLElement | null;
    if (!chrome || !actions) throw new Error('floor chrome is not mounted');

    const resolveLength = (property: string) => {
      const probe = document.createElement('div');
      probe.style.cssText =
        'position:fixed;visibility:hidden;pointer-events:none;';
      probe.style.minHeight = `var(${property})`;
      document.body.appendChild(probe);
      const value = Number.parseFloat(getComputedStyle(probe).minHeight);
      probe.remove();
      return value;
    };

    return {
      chromeMinHeight: Number.parseFloat(getComputedStyle(chrome).minHeight),
      activeTokenHeight: resolveLength('--vk-floor-chrome-min-h'),
      expectedTokenHeight: resolveLength(`--vk-floor-chrome-min-h-${rows}`),
      columns: getComputedStyle(actions).gridTemplateColumns.split(' ').length,
    };
  }, expectedRows);
}

for (const viewport of VIEWPORT_MATRIX) {
  test(`floor chrome and toast are stable at ${viewport.width}x${viewport.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await openFloorDay(page);

    const chrome = page.locator('[data-testid="chrome-mount"]');
    await expect(chrome.locator('.floor-tutorial')).toHaveCount(0);
    await expect(chrome.locator('.floor-toast')).toHaveCount(0);
    await expect(
      chrome.locator('[data-testid="floor-arrival-panel"]'),
    ).toHaveCount(0);

    const actions = chrome.locator('.floor-actions .service-btn');
    await expect(actions).toHaveCount(5);
    for (const verb of [
      'Set table',
      'Seat guest',
      'Take orders',
      'Clear table',
    ]) {
      await expect(
        chrome.getByRole('button', { name: verb, exact: true }),
      ).toBeVisible();
    }

    const closeDay = chrome.locator('[data-testid="close-day-btn"]');
    await expect(closeDay).toBeAttached();
    await expect(closeDay).toBeHidden();
    await expect(closeDay).toBeDisabled();
    await expect(closeDay).toHaveAttribute('aria-hidden', 'true');
    await expect(closeDay).toHaveAttribute('hidden', '');

    const layout = await readFloorLayout(page, viewport.rows);
    expect(layout.chromeMinHeight).toBeCloseTo(layout.activeTokenHeight, 5);
    expect(layout.activeTokenHeight).toBeCloseTo(
      layout.expectedTokenHeight,
      5,
    );
    if (viewport.width === 320) {
      expect(layout.columns).toBe(2);
      const labelOverflow = await actions.evaluateAll((buttons) =>
        buttons.map((button) => ({
          label: (button.textContent ?? '').trim(),
          scrollWidth: button.scrollWidth,
          clientWidth: button.clientWidth,
        })),
      );
      for (const metric of labelOverflow) {
        expect(
          metric.scrollWidth,
          `${metric.label || 'action'} overflowed at 320px`,
        ).toBeLessThanOrEqual(metric.clientWidth + 1);
      }
    }

    await dismissInitialNotice(page);
    const ticketsToggle = page.getByTestId('floor-tickets-toggle');
    await expect(ticketsToggle).toBeVisible();
    await expectMinimumTargetSize(ticketsToggle);
    await ticketsToggle.click();
    const ticketsClose = page.getByTestId('floor-tickets-close');
    await expect(ticketsClose).toBeVisible();
    await expectMinimumTargetSize(ticketsClose);
    await ticketsClose.click();
    const canvas = page.locator('#canvas-mount');
    const before = (await canvas.boundingBox())?.height;
    expect(before).toBeTruthy();

    const toast = `Toast layout fixture at ${viewport.width}x${viewport.height}`;
    await page.evaluate(
      (message) => window.__E2E__!.setFloorToast(message),
      toast,
    );
    await expect(page.locator('.notice-banner-body')).toHaveText(toast);
    const during = (await canvas.boundingBox())?.height;

    await page.evaluate(() => window.__E2E__!.setFloorToast(null));
    await expect(page.locator('[data-testid="notice-banner"]')).toHaveCount(0);
    const after = (await canvas.boundingBox())?.height;

    expect(during).toBeCloseTo(before!, 5);
    expect(after).toBeCloseTo(before!, 5);
  });
}

test('banner uses the HUD offset, clamps body, and reveals queued celebration', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openFloorDay(page);
  await dismissInitialNotice(page);

  await page.evaluate(() => {
    window.__E2E__!.enqueueCelebration({
      kind: 'recipe',
      title: 'Queue fixture celebration',
      body: 'Celebration waits behind the notice.',
    });
    window.__E2E__!.setFloorToast(
      'A deliberately long notification fixture that wraps over many narrow lines so the browser must enforce the three-line clamp without changing the canvas or floor chrome layout.',
    );
  });

  const host = page.locator('[data-testid="celebration-banner-host"]');
  const notice = page.locator('[data-testid="notice-banner"]');
  const celebration = page.locator('[data-testid="celebration-banner"]');
  await expect(host).toBeVisible();
  await expect(notice).toBeVisible();
  await expect(celebration).toHaveAttribute('aria-hidden', 'true');

  const bannerStyle = await page.evaluate(() => {
    const host = document.querySelector(
      '[data-testid="celebration-banner-host"]',
    ) as HTMLElement;
    const body = document.querySelector('.notice-banner-body') as HTMLElement;
    const surface = document.querySelector('.game-surface') as HTMLElement;
    const bodyStyle = getComputedStyle(body);
    return {
      hostTop: Number.parseFloat(getComputedStyle(host).top),
      hudHeight: Number.parseFloat(
        getComputedStyle(surface).getPropertyValue('--vk-status-hud-height'),
      ),
      rootFontSize: Number.parseFloat(
        getComputedStyle(document.documentElement).fontSize,
      ),
      lineClamp: bodyStyle.webkitLineClamp,
      maxHeight: Number.parseFloat(bodyStyle.maxHeight),
      lineHeight: Number.parseFloat(bodyStyle.lineHeight),
    };
  });
  expect(bannerStyle.hostTop).toBeCloseTo(
    bannerStyle.hudHeight + bannerStyle.rootFontSize * 0.45,
    1,
  );
  expect(bannerStyle.lineClamp).toBe('3');
  expect(bannerStyle.maxHeight).toBeCloseTo(
    bannerStyle.lineHeight * 3,
    1,
  );

  const passThrough = await page.evaluate(() => {
    const host = document.querySelector(
      '[data-testid="celebration-banner-host"]',
    ) as HTMLElement;
    const body = document.querySelector('.notice-banner-body') as HTMLElement;
    const dismiss = document.querySelector(
      '.notice-banner-dismiss',
    ) as HTMLElement;
    const tickets = document.querySelector(
      '.floor-tickets-toggle',
    ) as HTMLElement | null;
    const canvas = document.querySelector('#canvas-mount') as HTMLElement;
    const bodyRect = body.getBoundingClientRect();
    const dismissRect = dismiss.getBoundingClientRect();
    const ticketsRect = tickets?.getBoundingClientRect() ?? null;
    // Sample the body center — left edge overlaps the tickets toggle (same band).
    const sampleX = bodyRect.left + bodyRect.width * 0.5;
    const sampleY = bodyRect.top + bodyRect.height * 0.5;
    const hit = document.elementFromPoint(sampleX, sampleY) as HTMLElement | null;
    const awayFrom = (rect: DOMRect) =>
      sampleX < rect.left - 2 ||
      sampleX > rect.right + 2 ||
      sampleY < rect.top - 2 ||
      sampleY > rect.bottom + 2;
    return {
      hostPointerEvents: getComputedStyle(host).pointerEvents,
      bodyPointerEvents: getComputedStyle(body).pointerEvents,
      dismissPointerEvents: getComputedStyle(dismiss).pointerEvents,
      hitInHost: Boolean(hit && host.contains(hit)),
      hitIsCanvas: Boolean(hit && canvas.contains(hit)),
      hitIsDismiss: Boolean(hit && dismiss.contains(hit)),
      hitIsTickets: Boolean(hit && tickets?.contains(hit)),
      sampleAwayFromDismiss: awayFrom(dismissRect),
      sampleAwayFromTickets: ticketsRect ? awayFrom(ticketsRect) : true,
    };
  });
  expect(passThrough.hostPointerEvents).toBe('none');
  expect(passThrough.bodyPointerEvents).toBe('none');
  expect(passThrough.dismissPointerEvents).toBe('auto');
  expect(passThrough.sampleAwayFromDismiss).toBe(true);
  expect(passThrough.sampleAwayFromTickets).toBe(true);
  expect(passThrough.hitIsDismiss).toBe(false);
  expect(passThrough.hitIsTickets).toBe(false);
  expect(passThrough.hitInHost).toBe(false);
  expect(passThrough.hitIsCanvas).toBe(true);

  await page
    .getByRole('button', { name: 'Dismiss notice' })
    .click();
  await expect(notice).toHaveCount(0);
  await expect(celebration).toBeVisible();
  await expect(celebration).not.toHaveAttribute('aria-hidden', 'true');

  const dismissHitBoxes = await page.evaluate(() => {
    const celebrationDismiss = document.querySelector(
      '.celebration-banner-dismiss',
    ) as HTMLElement;
    const rect = celebrationDismiss.getBoundingClientRect();
    return { width: rect.width, height: rect.height };
  });
  expect(dismissHitBoxes.width).toBeGreaterThanOrEqual(44);
  expect(dismissHitBoxes.height).toBeGreaterThanOrEqual(44);
});

test('an elapsed tutorial cue does not replay after compose closes', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openFloorDay(page);
  await dismissInitialNotice(page);
  await page.evaluate(() => window.__E2E__!.prepareCookUiFixture());

  const notice = page.getByTestId('notice-banner');
  const orderBubble = page.getByTestId('chat-bubble');
  await expect(notice).toContainText('Plate a ticket');
  await expect(orderBubble).toBeVisible();
  await expect(notice).toBeHidden();
  await expect(orderBubble).toBeHidden({ timeout: 3_000 });
  await expect(notice).toBeVisible();
  await expect(notice).toHaveCount(0, { timeout: 5000 });

  await page.evaluate(() => window.__E2E__!.openComposeSheet());
  await expect(page.getByTestId('compose-sheet')).toBeVisible();
  await page.getByTestId('compose-close').click();
  await expect(page.getByTestId('compose-sheet')).toHaveCount(0);
  await page.waitForTimeout(250);
  await expect(notice).toHaveCount(0);
});

test('transient notices pause behind compose and review sheets, then resume', async ({
  page,
}) => {
  test.setTimeout(45_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await openFloorDay(page);
  await dismissInitialNotice(page);
  await page.evaluate(() => window.__E2E__!.prepareCookUiFixture());

  await page.evaluate(() => window.__E2E__!.openComposeSheet());
  await expect(page.locator('[data-testid="compose-sheet"]')).toBeVisible();
  await page.evaluate(() =>
    window.__E2E__!.setFloorToast('Paused behind compose fixture'),
  );

  const host = page.locator('[data-testid="celebration-banner-host"]');
  const composeNotice = page
    .locator('[data-testid="notice-banner"]')
    .filter({ hasText: 'Paused behind compose fixture' });
  await expect(host).toBeHidden();
  await expect(composeNotice).toBeHidden();
  await page.waitForTimeout(2_750);
  await expect(composeNotice).toHaveCount(1);

  await page.locator('[data-testid="compose-close"]').click();
  await expect(page.locator('[data-testid="compose-sheet"]')).toHaveCount(0);
  await expect(composeNotice).toBeVisible();
  const noticeDismissHitBox = await page
    .getByRole('button', { name: 'Dismiss notice' })
    .evaluate((button) => {
      const rect = button.getBoundingClientRect();
      return { width: rect.width, height: rect.height };
    });
  expect(noticeDismissHitBox.width).toBeGreaterThanOrEqual(44);
  expect(noticeDismissHitBox.height).toBeGreaterThanOrEqual(44);
  await expect(composeNotice).toHaveCount(0, { timeout: 3_500 });

  await page.evaluate(async () => {
    for (let guard = 0; guard < 80; guard += 1) {
      const step = await window.__E2E__!.advanceFloorServiceOnce();
      if (step === 'pending_review') return;
      if (step === 'day_complete' || step === 'idle') {
        throw new Error(`service reached ${step} before review`);
      }
    }
    throw new Error('service did not reach review');
  });
  await expect(page.locator('[data-testid="review-sheet"]')).toBeVisible();
  await page.evaluate(() =>
    window.__E2E__!.setFloorToast('Paused behind review fixture'),
  );

  const reviewNotice = page
    .locator('[data-testid="notice-banner"]')
    .filter({ hasText: 'Paused behind review fixture' });
  await expect(host).toBeHidden();
  await expect(reviewNotice).toBeHidden();
  await page.waitForTimeout(2_750);
  await expect(reviewNotice).toHaveCount(1);

  await page.locator('[data-testid="continue-service-btn"]').click();
  await expect(page.locator('[data-testid="review-sheet"]')).toHaveCount(0);
  await expect(reviewNotice).toBeVisible();
  await expect(reviewNotice).toHaveCount(0, { timeout: 3_500 });
});

test('final floor action remains activatable at 200% page zoom', async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== 'chromium', 'CSS page zoom case is Chromium-only');
  await page.setViewportSize({ width: 390, height: 844 });
  await openFloorDay(page);

  await page.evaluate(async () => {
    const bridge = window.__E2E__!;
    for (let guard = 0; guard < 500; guard += 1) {
      const step = await bridge.advanceFloorServiceOnce();
      if (step === 'pending_review') {
        bridge.dismissPendingReview();
      } else if (step === 'day_complete') {
        return;
      } else if (step === 'idle') {
        throw new Error('floor service stalled before Close Day');
      }
    }
    throw new Error('floor service did not become closable');
  });

  const closeDay = page.locator('[data-testid="close-day-btn"]');
  await expect(closeDay).toBeVisible();
  await expect(closeDay).toBeEnabled();
  await expect(
    page.locator('.floor-actions .service-btn:visible'),
  ).toHaveCount(1);

  await applyPageZoom(page, 2);
  const actionMetrics = await page
    .locator('.floor-actions .service-btn')
    .evaluateAll((buttons) =>
      buttons.map((button) => {
        const label = button.querySelector(
          '.floor-action-label',
        ) as HTMLElement | null;
        if (!label) throw new Error('floor action label is missing');
        const buttonStyle = getComputedStyle(button);
        const labelStyle = getComputedStyle(label);
        return {
          buttonHeight: (button as HTMLElement).offsetHeight,
          labelLineClamp: labelStyle.webkitLineClamp,
          labelLineHeight: Number.parseFloat(labelStyle.lineHeight),
          labelMaxHeight: Number.parseFloat(labelStyle.maxHeight),
          verticalExtras:
            Number.parseFloat(buttonStyle.paddingTop) +
            Number.parseFloat(buttonStyle.paddingBottom) +
            Number.parseFloat(buttonStyle.borderTopWidth) +
            Number.parseFloat(buttonStyle.borderBottomWidth),
        };
      }),
    );
  for (const metric of actionMetrics) {
    expect(metric.labelLineClamp).toBe('2');
    expect(metric.labelMaxHeight).toBeCloseTo(metric.labelLineHeight * 2, 1);
    expect(metric.buttonHeight).toBeLessThanOrEqual(
      metric.labelMaxHeight + metric.verticalExtras + 1,
    );
  }
  await assertScrollportAtLeastCta(page);
  await assertFinalFloorActionActivatable(page);
  await expect(page.locator('[data-testid="day-summary-title"]')).toBeVisible();
});
