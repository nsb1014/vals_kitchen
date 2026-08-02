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

type ElementRect = Awaited<ReturnType<typeof rect>>;
type GridProjection = { x: number; y: number };
type ServiceGeometry = {
  canvas: ElementRect;
  mount: ElementRect;
  hud: ElementRect;
  chrome: ElementRect;
  projection: GridProjection;
};

const GEOMETRY_TOLERANCE_PX = 0.5;
const CONTINUITY_GRID_CELL = { x: 4, y: 4 } as const;

async function nextAnimationFrame(page: Page): Promise<void> {
  await page.evaluate(
    () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())),
  );
}

async function gridProjection(page: Page): Promise<GridProjection> {
  return page.evaluate(
    ({ x, y }) => window.__E2E__!.gridCellToScreen(x, y),
    CONTINUITY_GRID_CELL,
  );
}

async function captureServiceGeometry(page: Page): Promise<ServiceGeometry> {
  await nextAnimationFrame(page);
  return {
    canvas: await rect(page.getByTestId('restaurant-canvas')),
    mount: await rect(page.locator('.canvas-mount')),
    hud: await rect(page.getByTestId('game-hud')),
    chrome: await rect(page.getByTestId('chrome-mount')),
    projection: await gridProjection(page),
  };
}

function maxRectDelta(actual: ElementRect, expected: ElementRect): number {
  return Math.max(
    Math.abs(actual.x - expected.x),
    Math.abs(actual.y - expected.y),
    Math.abs(actual.width - expected.width),
    Math.abs(actual.height - expected.height),
  );
}

function maxProjectionDelta(
  actual: GridProjection,
  expected: GridProjection,
): number {
  return Math.max(
    Math.abs(actual.x - expected.x),
    Math.abs(actual.y - expected.y),
  );
}

async function expectRectStable(
  locator: Locator,
  expected: ElementRect,
  label: string,
): Promise<void> {
  await expect
    .poll(async () => maxRectDelta(await rect(locator), expected), {
      message: `${label} must remain within ${GEOMETRY_TOLERANCE_PX}px`,
    })
    .toBeLessThanOrEqual(GEOMETRY_TOLERANCE_PX);
}

async function expectProjectionStable(
  page: Page,
  expected: GridProjection,
): Promise<void> {
  await expect
    .poll(
      async () => maxProjectionDelta(await gridProjection(page), expected),
      {
        message: `grid cell (${CONTINUITY_GRID_CELL.x}, ${CONTINUITY_GRID_CELL.y}) must remain within ${GEOMETRY_TOLERANCE_PX}px`,
      },
    )
    .toBeLessThanOrEqual(GEOMETRY_TOLERANCE_PX);
}

async function expectServiceGeometryStable(
  page: Page,
  expected: ServiceGeometry,
): Promise<void> {
  await expectRectStable(
    page.getByTestId('restaurant-canvas'),
    expected.canvas,
    'restaurant canvas rect',
  );
  await expectRectStable(
    page.locator('.canvas-mount'),
    expected.mount,
    'canvas mount rect',
  );
  await expectRectStable(
    page.getByTestId('game-hud'),
    expected.hud,
    'status HUD rect',
  );
  await expectRectStable(
    page.getByTestId('chrome-mount'),
    expected.chrome,
    'service chrome rect',
  );
  await expectProjectionStable(page, expected.projection);
}

async function expectInsideViewport(
  locator: Locator,
  viewport: { width: number; height: number },
  label: string,
): Promise<ElementRect> {
  await expect(locator, `${label} should be visible`).toBeVisible();
  const bounds = await rect(locator);
  expect(bounds.x, `${label} left edge`).toBeGreaterThanOrEqual(0);
  expect(bounds.y, `${label} top edge`).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width, `${label} right edge`).toBeLessThanOrEqual(
    viewport.width + GEOMETRY_TOLERANCE_PX,
  );
  expect(bounds.y + bounds.height, `${label} bottom edge`).toBeLessThanOrEqual(
    viewport.height + GEOMETRY_TOLERANCE_PX,
  );
  return bounds;
}

function expectPanelBelowHud(
  panel: ElementRect,
  hud: ElementRect,
  label: string,
): void {
  expect(panel.y, `${label} should begin below the status HUD`).toBeGreaterThanOrEqual(
    hud.y + hud.height - GEOMETRY_TOLERANCE_PX,
  );
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

      const reserve = await captureServiceGeometry(page);
      if (viewport.width >= 900) {
        const panel = await expectInsideViewport(
          page.getByTestId('modifier-sheet'),
          viewport,
          'modifier panel',
        );
        const start = await expectInsideViewport(
          page.getByTestId('start-service-btn'),
          viewport,
          'Start Service button',
        );
        expectPanelBelowHud(panel, reserve.hud, 'modifier panel');
        expect(start.x).toBeGreaterThanOrEqual(panel.x);
        expect(start.x + start.width).toBeLessThanOrEqual(
          panel.x + panel.width + GEOMETRY_TOLERANCE_PX,
        );
      }

      await page.getByTestId('start-service-btn').click();
      await expect(page.getByTestId('modifier-sheet')).toBeHidden();
      await expect(page.getByTestId('floor-service-panel')).toBeVisible();
      await expectServiceGeometryStable(page, reserve);

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
    const viewports = [
      { width: 390, height: 720 },
      { width: 1280, height: 800 },
    ];

    for (const viewport of viewports) {
      await page.setViewportSize(viewport);
      await gotoFreshGame(page);
      await page.getByTestId('open-day-btn').click();
      await page.getByTestId('start-service-btn').click();
      // Start Service is a durable async boundary. The bridge intentionally
      // bypasses pointer blocking, so wait for the save curtain to finish before
      // advancing the floor simulation behind it.
      await expect(page.getByTestId('modifier-sheet')).toBeHidden();

      let checkpoint:
        | { guestId: string; geometry: ServiceGeometry }
        | undefined;
      for (let guard = 0; guard < 80; guard += 1) {
        const geometry = await captureServiceGeometry(page);
        const step = await page.evaluate(() =>
          window.__E2E__!.advanceFloorServiceOnce(),
        );
        if (step !== 'pending_review') continue;
        const guestId = await page.evaluate(() => {
          const guest = window.__E2E__!
            .getGameState()
            .activeDay!.floor!.pool.find(
              (candidate) => candidate.stage === 'eating',
            );
          if (!guest) throw new Error('review opened without an eating guest');
          return guest.id;
        });
        checkpoint = { guestId, geometry };
        break;
      }
      if (!checkpoint) throw new Error('customer review did not open');

      const review = page.getByTestId('review-sheet');
      await expect(review).toBeVisible();
      await expectServiceGeometryStable(page, checkpoint.geometry);
      const continueButton = page.getByTestId('continue-service-btn');
      if (viewport.width >= 900) {
        const panel = await expectInsideViewport(
          review,
          viewport,
          'review panel',
        );
        const action = await expectInsideViewport(
          continueButton,
          viewport,
          'Continue service button',
        );
        expectPanelBelowHud(panel, checkpoint.geometry.hud, 'review panel');
        expect(action.x).toBeGreaterThanOrEqual(panel.x);
        expect(action.x + action.width).toBeLessThanOrEqual(
          panel.x + panel.width + GEOMETRY_TOLERANCE_PX,
        );
      }
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

      await continueButton.click();
      await expect(review).toBeHidden();
      await expectServiceGeometryStable(page, checkpoint.geometry);
    }
  });

  test('keeps the restaurant framing fixed behind the day-summary transition', async ({
    page,
  }) => {
    const viewports = [
      { width: 390, height: 844 },
      { width: 1280, height: 800 },
    ];

    for (const viewport of viewports) {
      await page.setViewportSize(viewport);
      await gotoFreshGame(page);
      await page.getByTestId('open-day-btn').click();
      await page.getByTestId('start-service-btn').click();
      await finishFloorWithoutClosing(page);

      const before = await captureServiceGeometry(page);
      await page.evaluate(() => window.__E2E__!.dispatch({ type: 'CLOSE_DAY' }));
      const summary = page.getByTestId('day-summary-sheet');
      await expect(summary).toBeVisible();
      await expectServiceGeometryStable(page, before);
      if (viewport.width >= 900) {
        const panel = await expectInsideViewport(
          summary,
          viewport,
          'day summary panel',
        );
        const continueButton = await expectInsideViewport(
          page.getByTestId('summary-back-floor'),
          viewport,
          'summary Continue button',
        );
        const editButton = await expectInsideViewport(
          page.getByTestId('summary-edit-restaurant'),
          viewport,
          'summary Shop and Edit button',
        );
        expectPanelBelowHud(panel, before.hud, 'day summary panel');
        for (const action of [continueButton, editButton]) {
          expect(action.x).toBeGreaterThanOrEqual(panel.x);
          expect(action.x + action.width).toBeLessThanOrEqual(
            panel.x + panel.width + GEOMETRY_TOLERANCE_PX,
          );
        }
      }
    }
  });

  test('reserves and restores the expected desktop cooking workspace', async ({
    page,
  }) => {
    const viewport = { width: 1280, height: 800 };
    const expectedWorkspaceWidth = Math.min(600, viewport.width * 0.46);
    await page.setViewportSize(viewport);
    await gotoFreshGame(page);
    await page.evaluate(() => window.__E2E__!.prepareCookUiFixture());
    await expect(page.getByTestId('floor-service-panel')).toBeVisible();

    const before = await captureServiceGeometry(page);
    await page.evaluate(() => window.__E2E__!.openComposeSheet());

    const compose = page.getByTestId('compose-sheet');
    const workspaceLocators = [
      { label: 'restaurant canvas', locator: page.getByTestId('restaurant-canvas'), before: before.canvas },
      { label: 'canvas mount', locator: page.locator('.canvas-mount'), before: before.mount },
      { label: 'status HUD', locator: page.getByTestId('game-hud'), before: before.hud },
      { label: 'service chrome', locator: page.getByTestId('chrome-mount'), before: before.chrome },
    ];
    await expect(compose).toBeVisible();
    for (const workspace of workspaceLocators) {
      await expect
        .poll(async () => {
          const narrowed = await rect(workspace.locator);
          return Math.abs(
            workspace.before.width - narrowed.width - expectedWorkspaceWidth,
          );
        }, {
          message: `${workspace.label} should reserve the authored desktop side workspace`,
        })
        .toBeLessThanOrEqual(GEOMETRY_TOLERANCE_PX);
    }

    const panel = await expectInsideViewport(compose, viewport, 'compose panel');
    const footer = await expectInsideViewport(
      page.locator('.compose-sheet-footer'),
      viewport,
      'compose footer',
    );
    const close = await expectInsideViewport(
      page.getByTestId('compose-close'),
      viewport,
      'compose close button',
    );
    const overlay = await rect(page.locator('.service-overlay'));
    expect(
      Math.abs(panel.width - expectedWorkspaceWidth),
      'compose panel should match the authored desktop side workspace',
    ).toBeLessThanOrEqual(GEOMETRY_TOLERANCE_PX);
    expect(
      Math.abs(panel.x + panel.width - (overlay.x + overlay.width)),
      'compose panel should be right-aligned in the service overlay',
    ).toBeLessThanOrEqual(GEOMETRY_TOLERANCE_PX);
    for (const workspace of workspaceLocators) {
      const narrowed = await rect(workspace.locator);
      expect(
        narrowed.x + narrowed.width,
        `${workspace.label} should not overlap the compose panel`,
      ).toBeLessThanOrEqual(panel.x + GEOMETRY_TOLERANCE_PX);
    }
    expect(footer.y + footer.height).toBeLessThanOrEqual(
      panel.y + panel.height + GEOMETRY_TOLERANCE_PX,
    );
    expect(close.x + close.width).toBeLessThanOrEqual(
      panel.x + panel.width + GEOMETRY_TOLERANCE_PX,
    );

    await page.getByTestId('compose-close').click();
    await expect(compose).toBeHidden();
    await expectServiceGeometryStable(page, before);
  });
});
