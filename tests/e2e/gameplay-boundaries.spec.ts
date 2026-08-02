import { expect, test, type Page } from '@playwright/test';
import { gotoFreshGame } from './helpers.ts';

async function floorSnapshot(page: Page) {
  return page.evaluate(() => {
    const state = window.__E2E__!.getGameState();
    const floor = state.activeDay?.floor;
    const guest = floor?.pool.find((candidate) => candidate.stage !== 'queued');
    return {
      guestStage: guest?.stage ?? null,
      eatTicksRemaining: guest?.eatTicksRemaining ?? null,
      playerPosition: floor?.playerPosition ?? null,
    };
  });
}

async function attemptBlockedFloorInput(page: Page): Promise<void> {
  await page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>(
      '[data-testid="restaurant-canvas"]',
    );
    if (!canvas) throw new Error('restaurant canvas is missing');
    const rect = canvas.getBoundingClientRect();
    canvas.dispatchEvent(
      new PointerEvent('pointerdown', {
        bubbles: true,
        clientX: rect.left + rect.width * 0.75,
        clientY: rect.top + rect.height * 0.5,
      }),
    );
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' }));
  });
}

test.describe('canonical gameplay boundaries', () => {
  test('does not start floor motion behind the day modifier', async ({ page }) => {
    await gotoFreshGame(page);
    await page.getByTestId('open-day-btn').click();
    await expect(page.getByTestId('modifier-sheet')).toBeVisible();

    const before = await floorSnapshot(page);
    expect(before.guestStage).toBe('entering');
    await attemptBlockedFloorInput(page);
    await page.waitForTimeout(2_500);
    expect(await floorSnapshot(page)).toEqual(before);

    await page.getByTestId('start-service-btn').click();
    await expect.poll(async () => (await floorSnapshot(page)).guestStage, {
      timeout: 10_000,
    }).toBe('waiting');
  });

  test('pauses eating and movement while the customer review is open', async ({
    page,
  }) => {
    test.setTimeout(45_000);
    await gotoFreshGame(page);
    await page.getByTestId('open-day-btn').click();
    await page.getByTestId('start-service-btn').click();

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
    await expect(page.getByTestId('review-sheet')).toBeVisible();

    const before = await floorSnapshot(page);
    expect(before.guestStage).toBe('eating');
    expect(before.eatTicksRemaining).toBe(3);
    await attemptBlockedFloorInput(page);
    await page.waitForTimeout(4_200);
    expect(await floorSnapshot(page)).toEqual(before);

    await page.getByTestId('continue-service-btn').click();
    await expect(page.getByTestId('review-sheet')).toHaveCount(0);
    await expect.poll(async () => (await floorSnapshot(page)).eatTicksRemaining, {
      timeout: 2_500,
    }).toBeLessThan(3);
  });
});
