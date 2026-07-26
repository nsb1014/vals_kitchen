import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';

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
      await Promise.all(registrations.map((registration) => registration.unregister()));
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
  await page.goto(E2E_PATH);
  await clearBrowserStorage(page);
  await page.reload({ waitUntil: 'networkidle' });
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
  await page.waitForFunction(() => window.__E2E__?.getState()?.hydrated === true);
  await page.waitForSelector('[data-testid="inspector-screen"]', { state: 'attached' });
}

export async function assertScreenOpen(page: Page, testId: string): Promise<void> {
  const panel = page.locator(`[data-testid="${testId}"]`);
  await expect(panel).toBeAttached();
  await expect(panel).not.toHaveAttribute('hidden', '');
}

export async function readSaveFromIndexedDb(page: Page): Promise<unknown | null> {
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

export async function assertCanvasHasRenderedContent(page: Page): Promise<void> {
  await expect
    .poll(
      async () =>
        page.evaluate(() => {
          const canvas = document.querySelector(
            '[data-testid="restaurant-canvas"]',
          ) as HTMLCanvasElement | null;
          if (!canvas || canvas.clientWidth === 0 || canvas.clientHeight === 0) {
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

export async function selectIngredientCount(page: Page, count: number): Promise<void> {
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
  await expect(page.locator('[data-testid="floor-service-panel"]')).toBeVisible();

  for (let guard = 0; guard < 40; guard += 1) {
    if (await page.locator('[data-testid="review-score"]').isVisible()) {
      break;
    }
    const step = await page.evaluate(async () => window.__E2E__!.advanceFloorServiceOnce());
    if (step === 'pending_review' || step === 'day_complete') break;
  }

  await expect(page.locator('[data-testid="review-score"]')).toBeVisible();
  const scoreText = await page.locator('[data-testid="review-score"]').innerText();
  expect(scoreText).toMatch(/\d+\.\d+ \/ 10/);
}

export async function completeServiceDay(page: Page): Promise<void> {
  await page.locator('[data-testid="open-day-btn"]').click();
  await page.locator('[data-testid="start-service-btn"]').click();
  await expect(page.locator('[data-testid="floor-service-panel"]')).toBeVisible();

  await page.evaluate(async () => {
    await window.__E2E__!.completeFloorServiceDay();
  });

  await expect(page.locator('[data-testid="day-summary-title"]')).toBeVisible();
  await page.locator('[data-testid="summary-back-floor"]').click();
  await expect(page.locator('[data-testid="open-day-btn"]')).toBeVisible();
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
        start: { x: fromInset.x + insetToCenterPx, y: fromInset.y + insetToCenterPx },
        end: { x: toInset.x + insetToCenterPx, y: toInset.y + insetToCenterPx },
      };
    },
    { fromGx, fromGy, toGx, toGy },
  );

  await page.evaluate(
    ({ start, end }) => {
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
    },
    coords,
  );
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
    if ((DEFERRED_CONTENT as readonly string[]).includes(file) && response.ok()) {
      deferred.add(file);
    }
  });

  return {
    boot,
    deferred,
    async waitForBoot() {
      await expect.poll(() => boot.size, { timeout: 15_000 }).toBe(BOOT_CONTENT.length);
    },
    async waitForDeferred() {
      await expect.poll(() => deferred.size, { timeout: 20_000 }).toBe(DEFERRED_CONTENT.length);
    },
  };
}

export async function navigateToScreen(
  page: Page,
  screen: 'restaurant' | 'shop' | 'inspector' | 'recipes' | 'rating' | 'settings',
): Promise<void> {
  await page.locator(`[data-testid="nav-${screen}"]`).click();
  await expect(page.locator('#game-root')).toHaveAttribute('data-screen', screen);
}

export async function assertNoHorizontalOverflow(page: Page): Promise<void> {
  const overflow = await page.evaluate(() => {
    const root = document.documentElement;
    return root.scrollWidth > root.clientWidth + 1;
  });
  expect(overflow).toBe(false);
}

export async function assertPrimaryControlsInViewport(page: Page): Promise<void> {
  for (const testId of ['nav-restaurant', 'nav-shop', 'open-day-btn']) {
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

declare global {
  interface Window {
    __E2E__?: {
      getPlacements: () => Array<{ id: string; x: number; y: number }>;
      getState: () => {
        day: number;
        cash: number;
        hydrated: boolean;
        activeDay: { queueIndex: number; customerCount: number } | null;
        composeDraftIngredientIds: string[];
        screen: string;
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
      dispatch: (action: { type: string; [key: string]: unknown }) => Promise<void>;
      setFloorNavPosition: (pos: { x: number; y: number }) => void;
      dismissPendingReview: () => void;
    };
  }
}
