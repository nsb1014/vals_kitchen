import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';
import type { E2eBridge } from '../../src/app/e2e-bridge.ts';

export const E2E_PATH = '/?e2e=1';

const BOOT_CONTENT = [
  'ingredients.json',
  'equipment.json',
  'archetypes.json',
  'modifiers.json',
] as const;

const DEFERRED_CONTENT = ['compound-affinity.json', 'recipes.json'] as const;

export interface PageDiagnostics {
  pageErrors: string[];
  consoleErrors: string[];
}

export function attachDiagnostics(page: Page): PageDiagnostics {
  const diagnostics: PageDiagnostics = { pageErrors: [], consoleErrors: [] };

  page.on('pageerror', (error) => {
    diagnostics.pageErrors.push(error.message);
  });

  page.on('console', (message) => {
    if (message.type() === 'error') {
      diagnostics.consoleErrors.push(message.text());
    }
  });

  return diagnostics;
}

export function assertNoDiagnostics(diagnostics: PageDiagnostics): void {
  expect(diagnostics.pageErrors, 'uncaught page errors').toEqual([]);
  expect(diagnostics.consoleErrors, 'console errors').toEqual([]);
}

export async function clearBrowserStorage(page: Page): Promise<void> {
  await page.evaluate(async () => {
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(
        registrations.map((registration) => registration.unregister()),
      );
    }
    if (typeof indexedDB.databases === 'function') {
      const databases = await indexedDB.databases();
      await Promise.all(
        databases.map(
          (db) =>
            new Promise<void>((resolve, reject) => {
              if (!db.name) {
                resolve();
                return;
              }
              const request = indexedDB.deleteDatabase(db.name);
              request.onerror = () => reject(request.error);
              request.onblocked = () => resolve();
              request.onsuccess = () => resolve();
            }),
        ),
      );
    }
    localStorage.clear();
    sessionStorage.clear();
  });
}

export async function gotoFreshGame(page: Page): Promise<PageDiagnostics> {
  const diagnostics = attachDiagnostics(page);
  const throttleRate = Number(process.env.E2E_CPU_THROTTLE ?? '');
  if (Number.isFinite(throttleRate) && throttleRate > 1) {
    const client = await page.context().newCDPSession(page);
    await client.send('Emulation.setCPUThrottlingRate', { rate: throttleRate });
  }
  // Establish the app origin without starting bootstrap, then clear storage.
  // Clearing IndexedDB during bootstrap races hydrate(), especially in Firefox.
  await page.goto('/data/ingredients.json');
  await clearBrowserStorage(page);
  await page.goto(E2E_PATH, { waitUntil: 'networkidle' });
  await waitForInteractiveBoot(page);
  return diagnostics;
}

export async function waitForInteractiveBoot(page: Page): Promise<void> {
  await waitForGameReady(page);
  await expect(page.locator('[data-testid="open-day-btn"]')).toBeVisible();
}

export async function waitForGameReady(page: Page): Promise<void> {
  await expect(page.locator('[data-testid="game-root"]')).toBeVisible();
  await expect(page.locator('[data-testid="restaurant-canvas"]')).toBeVisible();
  await page.waitForFunction(() => {
    const canvas = document.querySelector(
      '[data-testid="restaurant-canvas"]',
    ) as HTMLCanvasElement | null;
    return Boolean(canvas && canvas.clientWidth > 0 && canvas.clientHeight > 0);
  });
  await page.waitForFunction(
    () => window.__E2E__?.getState()?.hydrated === true,
  );
  await page.waitForSelector('[data-testid="recipes-screen"]', {
    state: 'attached',
  });
}

export async function waitForServiceStarted(page: Page): Promise<void> {
  await expect
    .poll(() =>
      page.evaluate(() => {
        const state = window.__E2E__!.getState();
        return state.modifierDismissed && !state.serviceStartPending;
      }),
    )
    .toBe(true);
  await expect(page.getByTestId('modifier-sheet')).toBeHidden();
}

export async function assertScreenOpen(
  page: Page,
  testId: string,
): Promise<void> {
  const panel = page.locator(`[data-testid="${testId}"]`);
  await expect(panel).toBeAttached();
  await expect(panel).not.toHaveAttribute('hidden', '');
}

export async function readSaveFromIndexedDb(
  page: Page,
): Promise<unknown | null> {
  return page.evaluate(async () => {
    return new Promise<unknown | null>((resolve, reject) => {
      const request = indexedDB.open('keyval-store');
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction('keyval', 'readonly');
        const getReq = tx.objectStore('keyval').get('restaurant-save');
        getReq.onerror = () => reject(getReq.error);
        getReq.onsuccess = () => resolve(getReq.result ?? null);
      };
    });
  });
}

export async function assertCanvasHasRenderedContent(
  page: Page,
): Promise<void> {
  await expect
    .poll(
      async () =>
        page.evaluate(() => {
          const canvas = document.querySelector(
            '[data-testid="restaurant-canvas"]',
          ) as HTMLCanvasElement | null;
          if (
            !canvas ||
            canvas.clientWidth === 0 ||
            canvas.clientHeight === 0
          ) {
            return false;
          }
          const placements = window.__E2E__?.getPlacements().length ?? 0;
          if (placements === 0) return false;
          const dataUrl = canvas.toDataURL('image/png');
          return dataUrl.length > 3000;
        }),
      { timeout: 10_000 },
    )
    .toBe(true);
}

export async function selectIngredientCount(
  page: Page,
  count: number,
): Promise<void> {
  const chips = page.locator('[data-testid="ingredient-chip"]:not([disabled])');
  await expect(chips.first()).toBeVisible();
  const available = await chips.count();
  expect(available).toBeGreaterThanOrEqual(count);

  for (let i = 0; i < count; i += 1) {
    await chips.nth(i).click();
    await expect(chips.nth(i)).toHaveAttribute('aria-pressed', 'true');
  }
}

/** Serve one floor guest via bridge (set → seat → order → plate → deliver). */
export async function serveCurrentCustomer(page: Page): Promise<void> {
  await expect(
    page.locator('[data-testid="floor-service-panel"]'),
  ).toBeVisible();

  for (let guard = 0; guard < 40; guard += 1) {
    if (await page.locator('[data-testid="review-score"]').isVisible()) {
      break;
    }
    const step = await page.evaluate(async () =>
      window.__E2E__!.advanceFloorServiceOnce(),
    );
    if (step === 'pending_review' || step === 'day_complete') break;
  }

  await expect(page.locator('[data-testid="review-score"]')).toBeVisible();
  const scoreText = await page
    .locator('[data-testid="review-score"]')
    .innerText();
  expect(scoreText).toMatch(/\d+\.\d+ \/ 10/);
}

export async function completeServiceDay(
  page: Page,
  dismissSummary = true,
): Promise<void> {
  await page.locator('[data-testid="open-day-btn"]').click();
  await page.locator('[data-testid="start-service-btn"]').click();
  await waitForServiceStarted(page);
  await expect(
    page.locator('[data-testid="floor-service-panel"]'),
  ).toBeVisible();

  await page.evaluate(async () => {
    await window.__E2E__!.completeFloorServiceDay();
  });

  await expect(page.locator('[data-testid="day-summary-title"]')).toBeVisible();
  if (dismissSummary) {
    await page.locator('[data-testid="summary-back-floor"]').click();
    await expect(page.locator('[data-testid="open-day-btn"]')).toBeVisible();
  }
}

export async function dragGridCell(
  page: Page,
  fromGx: number,
  fromGy: number,
  toGx: number,
  toGy: number,
): Promise<void> {
  const coords = await page.evaluate(
    ({ fromGx, fromGy, toGx, toGy }) => {
      const bridge = window.__E2E__!;
      const insetToCenterPx = 8;
      const fromInset = bridge.gridCellToScreen(fromGx, fromGy);
      const toInset = bridge.gridCellToScreen(toGx, toGy);
      return {
        start: {
          x: fromInset.x + insetToCenterPx,
          y: fromInset.y + insetToCenterPx,
        },
        end: { x: toInset.x + insetToCenterPx, y: toInset.y + insetToCenterPx },
      };
    },
    { fromGx, fromGy, toGx, toGy },
  );

  await page.evaluate(({ start, end }) => {
    const canvas = document.querySelector(
      '[data-testid="restaurant-canvas"]',
    ) as HTMLCanvasElement | null;
    if (!canvas) throw new Error('canvas missing for drag');

    const pe = (type: string, x: number, y: number, buttons: number) =>
      new PointerEvent(type, {
        bubbles: true,
        cancelable: true,
        clientX: x,
        clientY: y,
        pointerId: 1,
        pointerType: 'touch',
        isPrimary: true,
        buttons,
      });

    canvas.dispatchEvent(pe('pointerdown', start.x, start.y, 1));
    canvas.dispatchEvent(pe('pointermove', end.x, end.y, 1));
    canvas.dispatchEvent(pe('pointerup', end.x, end.y, 0));
  }, coords);
}

export async function trackContentRequests(page: Page): Promise<{
  boot: Set<string>;
  deferred: Set<string>;
  waitForBoot: () => Promise<void>;
  waitForDeferred: () => Promise<void>;
}> {
  const boot = new Set<string>();
  const deferred = new Set<string>();

  page.on('response', (response) => {
    const url = response.url();
    if (!url.includes('/data/')) return;
    const file = url.split('/data/')[1]?.split('?')[0];
    if (!file) return;
    if ((BOOT_CONTENT as readonly string[]).includes(file) && response.ok()) {
      boot.add(file);
    }
    if (
      (DEFERRED_CONTENT as readonly string[]).includes(file) &&
      response.ok()
    ) {
      deferred.add(file);
    }
  });

  return {
    boot,
    deferred,
    async waitForBoot() {
      await expect
        .poll(() => boot.size, { timeout: 15_000 })
        .toBe(BOOT_CONTENT.length);
    },
    async waitForDeferred() {
      await expect
        .poll(() => deferred.size, { timeout: 20_000 })
        .toBe(DEFERRED_CONTENT.length);
    },
  };
}

export async function navigateToScreen(
  page: Page,
  screen: 'restaurant' | 'recipes' | 'settings',
): Promise<void> {
  if (screen === 'settings') {
    await page.getByTestId('hud-settings').click();
  } else {
    await page.locator(`[data-testid="nav-${screen}"]`).click();
  }
  await expect(page.locator('#game-root')).toHaveAttribute(
    'data-screen',
    screen,
  );
}

export async function assertNoHorizontalOverflow(page: Page): Promise<void> {
  const overflow = await page.evaluate(() => {
    const root = document.documentElement;
    return root.scrollWidth > root.clientWidth + 1;
  });
  expect(overflow).toBe(false);
}

/** Apply Chromium's real CSS page zoom without changing the emulated DPR. */
export async function applyPageZoom(page: Page, factor: 2): Promise<void> {
  await page.evaluate((zoom) => {
    document.documentElement.style.zoom = String(zoom);
  }, factor);
}

/** The action scrollport must always expose at least one full CTA row. */
export async function assertScrollportAtLeastCta(page: Page): Promise<void> {
  const ok = await page.evaluate(() => {
    const scroll = document.querySelector(
      '.floor-actions-scroll',
    ) as HTMLElement | null;
    if (!scroll) return false;
    const cta = getComputedStyle(document.documentElement)
      .getPropertyValue('--vk-cta-h')
      .trim();
    const ctaPx = Number.parseFloat(cta) || 52;
    return scroll.getBoundingClientRect().height + 0.5 >= ctaPx;
  });
  expect(ok).toBe(true);
}

/** Scroll the final reserved action fully into view and activate it. */
export async function assertFinalFloorActionActivatable(
  page: Page,
): Promise<void> {
  const last = page.locator('.floor-actions .service-btn').last();
  await last.evaluate((element) =>
    element.scrollIntoView({ block: 'nearest', inline: 'nearest' }),
  );
  await expect(last).toBeVisible();
  await expect(last).toBeEnabled();
  const geometry = await last.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const visual = window.visualViewport;
    return {
      button: {
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        left: rect.left,
        height: rect.height,
      },
      layoutViewport: {
        top: 0,
        right: window.innerWidth,
        bottom: window.innerHeight,
        left: 0,
      },
      visualViewport: visual
        ? {
            top: visual.offsetTop,
            right: visual.offsetLeft + visual.width,
            bottom: visual.offsetTop + visual.height,
            left: visual.offsetLeft,
          }
        : null,
    };
  });
  expect(geometry.button.height).toBeGreaterThan(0);
  expect(geometry.button.top).toBeGreaterThanOrEqual(
    geometry.layoutViewport.top - 1,
  );
  expect(geometry.button.bottom).toBeLessThanOrEqual(
    geometry.layoutViewport.bottom + 1,
  );
  expect(geometry.button.left).toBeGreaterThanOrEqual(
    geometry.layoutViewport.left - 1,
  );
  expect(geometry.button.right).toBeLessThanOrEqual(
    geometry.layoutViewport.right + 1,
  );
  if (geometry.visualViewport) {
    expect(geometry.button.top).toBeGreaterThanOrEqual(
      geometry.visualViewport.top - 1,
    );
    expect(geometry.button.bottom).toBeLessThanOrEqual(
      geometry.visualViewport.bottom + 1,
    );
    expect(geometry.button.left).toBeGreaterThanOrEqual(
      geometry.visualViewport.left - 1,
    );
    expect(geometry.button.right).toBeLessThanOrEqual(
      geometry.visualViewport.right + 1,
    );
  }
  await last.click();
}

export async function assertPrimaryControlsInViewport(
  page: Page,
): Promise<void> {
  for (const testId of ['nav-restaurant', 'nav-recipes', 'open-day-btn']) {
    const box = await page.locator(`[data-testid="${testId}"]`).boundingBox();
    expect(box).not.toBeNull();
    const viewport = page.viewportSize();
    expect(viewport).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.y).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(viewport!.width + 1);
    expect(box!.y + box!.height).toBeLessThanOrEqual(viewport!.height + 1);
  }
}

/** Floor chrome is a dedicated strip below the canvas, not an overlay on the playfield. */
export async function assertFloorChromeBelowCanvas(page: Page): Promise<void> {
  const canvas = await page.locator('#canvas-mount').boundingBox();
  const panel = await page
    .locator('[data-testid="floor-service-panel"]')
    .boundingBox();
  expect(canvas).not.toBeNull();
  expect(panel).not.toBeNull();
  expect(panel!.y).toBeGreaterThanOrEqual(canvas!.y + canvas!.height - 1);
}

/**
 * Canvas height must stay put while floor status copy changes. Notices live in
 * the top banner stack; chrome keeps a token min-height so the Pixi mount does
 * not flex-shrink.
 */
export async function assertCanvasHeightStableAcrossFloorChrome(
  page: Page,
): Promise<void> {
  await expect(
    page.locator('[data-testid="floor-service-panel"]'),
  ).toBeVisible();
  const beforeBox = await page.locator('#canvas-mount').boundingBox();
  expect(beforeBox).not.toBeNull();
  const before = Math.round(beforeBox!.height);

  await page.evaluate(() => {
    window.__E2E__!.setFloorToast(
      'Move next to the station to cook — canvas height must not change.',
    );
  });
  await expect(page.locator('[data-testid="notice-banner"]')).toBeVisible();

  const duringBox = await page.locator('#canvas-mount').boundingBox();
  expect(duringBox).not.toBeNull();
  expect(Math.round(duringBox!.height)).toBe(before);

  await page.evaluate(() => {
    window.__E2E__!.setFloorToast(null);
  });
  // Sticky tutorial / pacing may return after the toast clears — canvas must stay put.

  const afterBox = await page.locator('#canvas-mount').boundingBox();
  expect(afterBox).not.toBeNull();
  expect(Math.round(afterBox!.height)).toBe(before);
}

/** Status HUD is a dedicated strip above the canvas, not an overlay on the playfield. */
export async function assertStatusHudAboveCanvas(page: Page): Promise<void> {
  const hud = await page.locator('[data-testid="game-hud"]').boundingBox();
  const canvas = await page.locator('#canvas-mount').boundingBox();
  expect(hud).not.toBeNull();
  expect(canvas).not.toBeNull();
  expect(hud!.y + hud!.height).toBeLessThanOrEqual(canvas!.y + 1);
}

/** Tickets toggle sits below Cash/status HUD (not overlapping it on the overlay). */
export async function assertTicketsBelowStatusHud(page: Page): Promise<void> {
  const hud = await page.locator('[data-testid="game-hud"]').boundingBox();
  const ticketsToggle = page.locator('[data-testid="floor-tickets-toggle"]');
  let tickets = await ticketsToggle.boundingBox();
  await expect
    .poll(async () => {
      tickets = await ticketsToggle.boundingBox();
      return tickets !== null;
    })
    .toBe(true);
  expect(hud).not.toBeNull();
  expect(tickets).not.toBeNull();
  expect(tickets!.y).toBeGreaterThanOrEqual(hud!.y + hud!.height - 1);
}

/** Floor actions stay clear of the shell bottom safe inset (Android nav clearance). */
export async function assertFloorChromeAboveSafeBottom(
  page: Page,
): Promise<void> {
  const clearance = await page.evaluate(() => {
    const panel = document.querySelector('[data-testid="floor-service-panel"]');
    const shell = document.querySelector('.game-shell');
    if (!panel || !shell) return null;
    const panelBox = panel.getBoundingClientRect();
    const shellStyle = getComputedStyle(shell);
    const padBottom = Number.parseFloat(shellStyle.paddingBottom) || 0;
    const shellBox = shell.getBoundingClientRect();
    return {
      panelBottom: panelBox.bottom,
      contentBottom: shellBox.bottom - padBottom,
      padBottom,
    };
  });
  expect(clearance).not.toBeNull();
  expect(clearance!.padBottom).toBeGreaterThanOrEqual(15);
  expect(clearance!.panelBottom).toBeLessThanOrEqual(
    clearance!.contentBottom + 1,
  );
}

declare global {
  interface Window {
    __E2E__?: {
      getPlacements: () => Array<{
        id: string;
        itemKey: string;
        x: number;
        y: number;
      }>;
      getState: () => {
        day: number;
        cash: number;
        hydrated: boolean;
        modifierDismissed: boolean;
        serviceStartPending: boolean;
        activeDay: { queueIndex: number; customerCount: number } | null;
        composeDraftIngredientIds: string[];
        floorTicketDrafts: Record<string, string[]>;
        selectedTicketId: string | null;
        screen: string;
        floorPlayerGrid: { x: number; y: number } | null;
      };
      getGameState: () => {
        day: number;
        cash: number;
        placements: Array<{ id: string; x: number; y: number }>;
      };
      isScoringReady: () => boolean;
      isRecipesReady: () => boolean;
      gridCellToScreen: (gx: number, gy: number) => { x: number; y: number };
      exportSaveCode: () => string;
      advanceFloorServiceOnce: () => Promise<
        'pending_review' | 'day_complete' | 'advanced' | 'idle'
      >;
      completeFloorServiceDay: () => Promise<void>;
      dispatch: (action: {
        type: string;
        [key: string]: unknown;
      }) => Promise<void>;
      setFloorNavPosition: (pos: { x: number; y: number }) => void;
      failNextSaveForTest: () => void;
      restartActiveNoticeDwell: () => boolean;
      getNoticeDebugSnapshot: () => {
        screen: string;
        rootScreen: string | null;
        notificationSurfaceActive: boolean;
        notificationBannerPresented: boolean;
        noticeActive: {
          id: string;
          source: string;
          scope: string;
          body: string;
          stepId: string | null;
        } | null;
        noticeSticky: { id: string; source: string } | null;
        remainingMs: number | null;
        hostConnected: boolean;
        hostHidden: boolean | null;
        bannerPresent: boolean;
        bannerText: string | null;
      };
      setNotificationBannerPresentationHold: (hold: boolean) => void;
      releaseNotificationBannerPresentationHold: () => void;
      dismissPendingReview: () => Promise<void>;
      prepareCookUiFixture: () => Promise<void>;
      prepareFourFacingSeatedGuestsFixture: () => Promise<
        Array<{
          guestId: string;
          seat: {
            x: number;
            y: number;
            facing: 0 | 90 | 180 | 270;
            tablePlacementId: string;
            slotIndex: number;
          };
        }>
      >;
      prepareQueuedDepartureVisualFixture: () => Promise<{
        firstGuestId: string;
        heldGuestId: string;
        heldSeat: {
          x: number;
          y: number;
          facing: 0 | 90 | 180 | 270;
          tablePlacementId: string;
          slotIndex: number;
        };
      }>;
      prepareStationCarryFixture: (
        mode: 'valid_carry' | 'stale_with_open' | 'stale_without_open',
      ) => Promise<{
        station: { x: number; y: number };
        remote: { x: number; y: number };
        ticketId: string | null;
      }>;
      prepareCarryInteractionBoundaryFixture: () => Promise<{
        station: { x: number; y: number };
        stationServicePosition: { x: number; y: number };
        ticketId: string;
        matchingGuest: {
          guestId: string;
          seat: { x: number; y: number };
          servicePosition: { x: number; y: number };
        };
        wrongGuest: {
          guestId: string;
          seat: { x: number; y: number };
          servicePosition: { x: number; y: number };
        };
      }>;
      prepareCarryAnimationCross: () => {
        center: { x: number; y: number };
        targets: {
          right: { x: number; y: number };
          down: { x: number; y: number };
          up: { x: number; y: number };
          left: { x: number; y: number };
        };
        ticketId: string;
      };
      prepareDecorVisualFixture: () => void;
      prepareEquipmentVisualFixture: () => void;
      openComposeSheet: () => void;
      getActorSpriteMetrics: () => Array<{
        kind: string;
        tex: string;
        width: number;
        height: number;
        scaleX: number;
        scaleY: number;
        alpha: number;
        x: number;
        y: number;
        zIndex: number;
      }>;
      getPlayerVisualDebug: () => {
        requestedTextureKey: string;
        boundTextureKey: string;
        authoredCarry: boolean;
        plateOverlayVisible: boolean;
        spriteVisible: boolean;
        spriteAlpha: number;
        frameWidth: number;
        frameHeight: number;
        feet: { x: number; y: number } | null;
        facing: 'right' | 'down' | 'up' | 'left';
        isMoving: boolean;
      } | null;
      getGuestDoorwayTransitionDebug: (guestId: string) => {
        guestId: string;
        stage:
          | 'queued'
          | 'entering'
          | 'waiting'
          | 'seating'
          | 'seated'
          | 'ordered'
          | 'eating'
          | 'leaving'
          | 'done'
          | null;
        guest: {
          requestedFrameKey: string;
          actualBoundFrameKey: string;
          textureMatchesActualBoundFrame: boolean;
          actualMaskWorldBounds: {
            left: number;
            top: number;
            right: number;
            bottom: number;
          } | null;
          isMoving: boolean;
          facing: 'right' | 'down' | 'up' | 'left';
          visible: boolean;
          alpha: number;
          feet: { x: number; y: number };
          doorwayCrop: {
            progress: number;
            visibleFraction: number;
            apertureWorldY: number;
            visualOffsetY: number;
            maskApplied: boolean;
            contentRenderable: boolean;
            unclippedWorldBounds: {
              left: number;
              top: number;
              right: number;
              bottom: number;
            };
            clippedWorldBounds: {
              left: number;
              top: number;
              right: number;
              bottom: number;
            } | null;
          } | null;
        } | null;
        door: {
          cell: { x: number; y: number } | null;
          requestedOpen: boolean;
          paintedOpen: boolean;
          spriteCount: number;
        };
        authoritativeOpen: boolean;
        exitLingerRemainingMs: number;
        camera: {
          x: number;
          y: number;
          scale: number;
          stageOffsetX: number;
          stageOffsetY: number;
        };
      } | null;
      startServiceAndCaptureGuestDoorwayFrame: (
        guestId: string,
      ) => Promise<
        NonNullable<ReturnType<E2eBridge['getGuestDoorwayTransitionDebug']>>
      >;
      repaintRestaurantFromStoreForTest: () => void;
      getSeatingSceneDebug: () => {
        depthParent: {
          shared: boolean;
          sortable: boolean;
        };
        tables: Array<{
          placementId: string;
          itemKey: string;
          zIndex: number;
          paintOrder: number;
          inDepthParent: boolean;
          x: number;
          y: number;
        }>;
        chairs: Array<{
          tablePlacementId: string;
          slotIndex: number;
          zIndex: number;
          paintOrder: number;
          inDepthParent: boolean;
          x: number;
          y: number;
        }>;
        guests: Array<{
          guestId: string;
          tablePlacementId: string;
          slotIndex: number;
          seatFacing: 0 | 90 | 180 | 270;
          rootZIndex: number;
          paintOrder: number;
          inDepthParent: boolean;
          requestedFrameKey: string;
          actualBoundFrameKey: string;
          isSeated: boolean;
          isMoving: boolean;
          walkFrame: number;
          facing: 'right' | 'down' | 'up' | 'left';
          visible: boolean;
          alpha: number;
          feet: { x: number; y: number };
        }>;
      } | null;
      getOpaqueTableOverlapScreenPoint: (guestId: string) => {
        x: number;
        y: number;
        tablePlacementId: string;
        usesTableOverhang: boolean;
        gridCell: { x: number; y: number };
        occlusionSource: 'texture-alpha';
      } | null;
      getInteractHintVisible: () => boolean;
      getInteractHintCells: () => Array<{ x: number; y: number }>;
      setFloorToast: (message: string | null) => void;
      enqueueCelebration: (celebration: {
        kind: 'recipe' | 'mastery' | 'achievement';
        title: string;
        body: string;
        ingredientIds?: string[];
        level?: number;
      }) => void;
    };
  }
}
