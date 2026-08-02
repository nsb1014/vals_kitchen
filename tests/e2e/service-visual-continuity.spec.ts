import { expect, test, type Locator, type Page } from '@playwright/test';
import { guestVariant } from '../../src/canvas/world/character-frames.ts';
import { gotoFreshGame } from './helpers.ts';

async function rect(locator: Locator) {
  const box = await locator.boundingBox();
  if (!box) throw new Error('expected a visible element');
  return box;
}

async function finishFloorWithoutClosing(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const bridge = window.__E2E__!;
    for (let guard = 0; guard < 500; guard += 1) {
      const state = bridge.getGameState();
      if (!state.activeDay?.floor) {
        throw new Error('floor closed before continuity checkpoint');
      }
      const step = await bridge.advanceFloorServiceOnce();
      if (step === 'pending_review') {
        bridge.dismissPendingReview();
      } else if (step === 'day_complete') {
        return;
      } else if (step === 'idle') {
        throw new Error('floor service stalled before continuity checkpoint');
      }
    }
    throw new Error('floor service did not finish within guard limit');
  });
}

test.describe('service visual continuity', () => {
  test('carries the served guest identity into review without reframing the restaurant', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 720 });
    await gotoFreshGame(page);
    await page.getByTestId('open-day-btn').click();
    await page.getByTestId('start-service-btn').click();

    const checkpoint = await page.evaluate(async () => {
      const bridge = window.__E2E__!;
      for (let guard = 0; guard < 80; guard += 1) {
        const canvas = document.querySelector<HTMLCanvasElement>(
          '[data-testid="restaurant-canvas"]',
        );
        const canvasRect = canvas?.getBoundingClientRect();
        const step = await bridge.advanceFloorServiceOnce();
        if (step !== 'pending_review') continue;
        const guest = bridge
          .getGameState()
          .activeDay!.floor!.pool.find((candidate) => candidate.stage === 'eating');
        if (!guest) throw new Error('review opened without an eating guest');
        return {
          guestId: guest.id,
          canvasHeightBeforeReview: canvasRect?.height ?? null,
        };
      }
      throw new Error('customer review did not open');
    });
    await expect(page.getByTestId('review-sheet')).toBeVisible();
    await page.waitForTimeout(100);

    const canvas = await rect(page.getByTestId('restaurant-canvas'));
    expect(checkpoint.canvasHeightBeforeReview).not.toBeNull();
    expect(canvas.height).toBeCloseTo(checkpoint.canvasHeightBeforeReview!, 0);
    await expect(page.getByTestId('review-guest-identity')).toBeVisible();
    await expect(page.getByTestId('review-guest-name')).not.toHaveText('Customer');
    const portrait = page
      .getByTestId('review-guest-identity')
      .getByTestId('guest-portrait');
    await expect(portrait).toBeVisible();
    await expect(portrait).toHaveAttribute(
      'src',
      `/assets/portraits/guest_${guestVariant(checkpoint.guestId)}.png`,
    );
  });

  test('keeps the restaurant framing fixed behind the day-summary transition', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoFreshGame(page);
    await page.getByTestId('open-day-btn').click();
    await page.getByTestId('start-service-btn').click();
    await finishFloorWithoutClosing(page);

    const canvas = page.getByTestId('restaurant-canvas');
    const before = await rect(canvas);
    await page.evaluate(() => window.__E2E__!.dispatch({ type: 'CLOSE_DAY' }));
    await expect(page.getByTestId('day-summary-sheet')).toBeVisible();
    const after = await rect(canvas);

    expect(after.x).toBeCloseTo(before.x, 0);
    expect(after.y).toBeCloseTo(before.y, 0);
    expect(after.width).toBeCloseTo(before.width, 0);
    expect(after.height).toBeCloseTo(before.height, 0);
  });
});
