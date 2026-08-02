import { expect, test, type Locator, type Page } from '@playwright/test';
import { guestVariant } from '../../src/canvas/world/character-frames.ts';
import {
  gotoFreshGame,
  readSaveFromIndexedDb,
  waitForGameReady,
} from './helpers.ts';

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
  test('keeps the first arrival offstage until service starts', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoFreshGame(page);
    await page.getByTestId('open-day-btn').click();

    const enteringGuestId = await page.evaluate(() => {
      const guest = window.__E2E__!
        .getGameState()
        .activeDay!.floor!.pool.find((candidate) => candidate.stage === 'entering');
      if (!guest) throw new Error('expected the first queued arrival');
      return guest.id;
    });

    await expect(page.getByTestId('modifier-sheet')).toBeVisible();
    expect(
      await page.evaluate(
        (guestId) => window.__E2E__!.getGuestScreenFeetAnchor(guestId),
        enteringGuestId,
      ),
    ).toBeNull();
    await page.screenshot({
      path: 'test-results/modifier-mobile-guest-curtain.png',
      animations: 'disabled',
    });

    await expect
      .poll(async () => {
        const save = (await readSaveFromIndexedDb(page)) as {
          gameState?: { activeDay?: { serviceStarted?: boolean } | null };
        } | null;
        return save?.gameState?.activeDay?.serviceStarted;
      })
      .toBe(false);
    await page.reload({ waitUntil: 'networkidle' });
    await waitForGameReady(page);
    await expect(page.getByTestId('modifier-sheet')).toBeVisible();
    expect(
      await page.evaluate(
        (guestId) => window.__E2E__!.getGuestScreenFeetAnchor(guestId),
        enteringGuestId,
      ),
    ).toBeNull();

    await page.getByTestId('start-service-btn').click();
    await expect
      .poll(() =>
        page.evaluate(
          (guestId) => window.__E2E__!.getGuestScreenFeetAnchor(guestId),
          enteringGuestId,
        ),
      )
      .not.toBeNull();
    await expect
      .poll(async () => {
        const save = (await readSaveFromIndexedDb(page)) as {
          gameState?: { activeDay?: { serviceStarted?: boolean } | null };
        } | null;
        return save?.gameState?.activeDay?.serviceStarted;
      })
      .toBe(true);
    await page.reload({ waitUntil: 'networkidle' });
    await waitForGameReady(page);
    await expect(page.getByTestId('modifier-sheet')).toBeHidden();
    await expect(page.getByTestId('floor-service-panel')).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(
          (guestId) => window.__E2E__!.getGuestScreenFeetAnchor(guestId),
          enteringGuestId,
        ),
      )
      .not.toBeNull();
    await page.screenshot({
      path: 'test-results/service-first-arrival-mobile.png',
      animations: 'disabled',
    });
  });

  test('eases between service sheets without replaying on compose updates', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoFreshGame(page);
    await page.getByTestId('open-day-btn').click();

    const modifier = page.getByTestId('modifier-sheet');
    await expect(modifier).toBeVisible();
    await expect(modifier).toHaveAttribute('data-panel-entering', '');
    expect(
      await modifier.evaluate((element) =>
        element
          .getAnimations()
          .some(
            (animation) =>
              animation instanceof CSSAnimation &&
              animation.animationName === 'service-panel-enter',
          ),
      ),
    ).toBe(true);

    await page.getByTestId('start-service-btn').click();
    await page.evaluate(async () => {
      await window.__E2E__!.prepareCookUiFixture();
      window.__E2E__!.openComposeSheet();
    });
    const compose = page.getByTestId('compose-sheet');
    await expect(compose).toBeVisible();
    await expect(compose).toHaveAttribute('data-panel-entering', '');
    await compose.evaluate(async (element) => {
      await Promise.all(element.getAnimations().map((animation) => animation.finished));
    });

    await compose.getByTestId('ingredient-chip').first().click();
    const rerenderedCompose = page.getByTestId('compose-sheet');
    await expect(rerenderedCompose).toBeVisible();
    await expect(rerenderedCompose).not.toHaveAttribute(
      'data-panel-entering',
      '',
    );
    expect(
      await rerenderedCompose.evaluate((element) =>
        element
          .getAnimations()
          .some(
            (animation) =>
              animation instanceof CSSAnimation &&
              animation.animationName === 'service-panel-enter',
          ),
      ),
    ).toBe(false);
  });

  test('keeps service sheet changes immediate with reduced motion', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoFreshGame(page);
    await page.getByTestId('open-day-btn').click();

    const modifier = page.getByTestId('modifier-sheet');
    await expect(modifier).toBeVisible();
    expect(
      await modifier.evaluate((element) =>
        element
          .getAnimations()
          .some(
            (animation) =>
              animation instanceof CSSAnimation &&
              animation.animationName === 'service-panel-enter',
          ),
      ),
    ).toBe(false);
  });

  test('keeps the restaurant viewport fixed when service controls replace their reserve', async ({
    page,
  }) => {
    const viewports = [
      { width: 390, height: 720 },
      { width: 360, height: 720 },
      { width: 321, height: 568 },
      { width: 320, height: 568 },
      { width: 667, height: 375 },
      { width: 1280, height: 800 },
    ];

    for (const viewport of viewports) {
      await page.setViewportSize(viewport);
      await gotoFreshGame(page);
      await page.getByTestId('open-day-btn').click();
      await expect(page.getByTestId('modifier-sheet')).toBeVisible();

      const reserve = {
        canvas: await rect(page.getByTestId('restaurant-canvas')),
        mount: await rect(page.locator('.canvas-mount')),
        chrome: await rect(page.getByTestId('chrome-mount')),
      };

      await page.getByTestId('start-service-btn').click();
      await expect(page.getByTestId('modifier-sheet')).toBeHidden();
      await expect(page.getByTestId('floor-service-panel')).toBeVisible();

      const active = {
        canvas: await rect(page.getByTestId('restaurant-canvas')),
        mount: await rect(page.locator('.canvas-mount')),
        chrome: await rect(page.getByTestId('chrome-mount')),
      };
      expect(active.canvas.height).toBeCloseTo(reserve.canvas.height, 0);
      expect(active.mount.height).toBeCloseTo(reserve.mount.height, 0);
      expect(active.chrome.height).toBeCloseTo(reserve.chrome.height, 0);

      const controls = await page.locator('.floor-actions .service-btn:visible').evaluateAll(
        (buttons) => ({
          expectedHeight: Number.parseFloat(
            getComputedStyle(document.documentElement).getPropertyValue('--vk-cta-h'),
          ),
          buttons: buttons.map((button) => {
            const label = button.querySelector<HTMLElement>('.floor-action-label');
            return {
              height: button.getBoundingClientRect().height,
              labelClientHeight: label?.clientHeight ?? 0,
              labelScrollHeight: label?.scrollHeight ?? 0,
            };
          }),
        }),
      );
      expect(controls.buttons.length).toBeGreaterThan(0);
      for (const control of controls.buttons) {
        expect(control.height).toBeCloseTo(controls.expectedHeight, 0);
        expect(control.labelScrollHeight).toBeLessThanOrEqual(control.labelClientHeight);
      }
    }
  });

  test('carries the served guest identity into review without reframing the restaurant', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 720 });
    await gotoFreshGame(page);
    await page.getByTestId('open-day-btn').click();
    await page.getByTestId('start-service-btn').click();
    // Start Service is a durable async boundary. The bridge intentionally
    // bypasses pointer blocking, so wait for the save curtain to finish before
    // advancing the floor simulation behind it.
    await expect(page.getByTestId('modifier-sheet')).toBeHidden();

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
