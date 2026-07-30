import { expect, test, type Page } from '@playwright/test';
import {
  applyPageZoom,
  assertFinalFloorActionActivatable,
  assertScrollportAtLeastCta,
  gotoFreshGame,
} from './helpers.ts';

// WebKit is intentionally absent from playwright.config.ts: its binary
// downloaded, but launch is blocked by missing sandbox host libraries.
const VIEWPORT_MATRIX = [
  { width: 390, height: 844, rows: 2 },
  { width: 320, height: 568, rows: 3 },
  { width: 320, height: 480, rows: 3 },
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
    await expect(closeDay).toHaveCSS('visibility', 'hidden');

    const layout = await readFloorLayout(page, viewport.rows);
    expect(layout.chromeMinHeight).toBeCloseTo(layout.activeTokenHeight, 5);
    expect(layout.activeTokenHeight).toBeCloseTo(
      layout.expectedTokenHeight,
      5,
    );
    if (viewport.width === 320) {
      expect(layout.columns).toBe(2);
    }

    await dismissInitialNotice(page);
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

  await page
    .getByRole('button', { name: 'Dismiss notice' })
    .click();
  await expect(notice).toHaveCount(0);
  await expect(celebration).toBeVisible();
  await expect(celebration).not.toHaveAttribute('aria-hidden', 'true');
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
