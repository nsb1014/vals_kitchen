import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  assertNoDiagnostics,
  completeServiceDay,
  gotoFreshGame,
  navigateToScreen,
  serveCurrentCustomer,
} from "./helpers.ts";

type Viewport = { width: number; height: number; label: string };

const COMPOSE_VIEWPORTS: Viewport[] = [
  { width: 320, height: 720, label: "320 portrait" },
  { width: 667, height: 375, label: "667x375 landscape" },
];

const SETTINGS_VIEWPORTS: Viewport[] = [
  { width: 320, height: 720, label: "320 portrait" },
  { width: 390, height: 844, label: "390 portrait" },
  { width: 667, height: 375, label: "667x375 landscape" },
];

const SUMMARY_VIEWPORTS: Viewport[] = [
  { width: 390, height: 720, label: "mobile" },
  { width: 1280, height: 800, label: "desktop" },
];

async function expectInsideViewport(
  locator: Locator,
  viewport: Pick<Viewport, "width" | "height">,
): Promise<void> {
  await expect(locator).toBeVisible();
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(-1);
  expect(box!.y).toBeGreaterThanOrEqual(-1);
  expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width + 1);
  expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height + 1);
}

async function expectTopmostAtCenter(locator: Locator): Promise<void> {
  const topmost = await locator.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const hit = document.elementFromPoint(
      rect.left + rect.width / 2,
      rect.top + rect.height / 2,
    );
    return Boolean(hit && (hit === element || element.contains(hit)));
  });
  expect(topmost).toBe(true);
}

async function expectBackdropOwnsAnExposedPoint(
  backdrop: Locator,
  dialog: Locator,
  coveredSurface: Locator,
): Promise<void> {
  const coveredTestId = await coveredSurface.getAttribute("data-testid");
  expect(coveredTestId).toBeTruthy();
  const coveredSelector = `[data-testid="${coveredTestId}"]`;
  const ownsPoint = await backdrop.evaluate(
    (element, selectors) => {
      const dialogElement = element.querySelector(selectors.dialogSelector);
      const coveredElement = document.querySelector(selectors.coveredSelector);
      if (!dialogElement || !coveredElement) return false;
      const outer = element.getBoundingClientRect();
      const inner = dialogElement.getBoundingClientRect();
      const covered = coveredElement.getBoundingClientRect();
      const overlap = {
        left: Math.max(outer.left, covered.left),
        right: Math.min(outer.right, covered.right),
        top: Math.max(outer.top, covered.top),
        bottom: Math.min(outer.bottom, covered.bottom),
      };
      const candidates = [
        { x: overlap.left + 4, y: overlap.top + 4 },
        { x: overlap.right - 4, y: overlap.top + 4 },
        { x: overlap.left + 4, y: overlap.bottom - 4 },
        { x: overlap.right - 4, y: overlap.bottom - 4 },
      ];
      const exposed = candidates.find(
        ({ x, y }) =>
          x >= overlap.left &&
          x <= overlap.right &&
          y >= overlap.top &&
          y <= overlap.bottom &&
          (x < inner.left ||
            x > inner.right ||
            y < inner.top ||
            y > inner.bottom),
      );
      return exposed
        ? document.elementFromPoint(exposed.x, exposed.y) === element
        : false;
    },
    { dialogSelector: '[role="dialog"]', coveredSelector },
  );
  expect(ownsPoint).toBe(true);
  await expectTopmostAtCenter(dialog);
}

async function openLiveCompose(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await window.__E2E__!.prepareCookUiFixture();
    window.__E2E__!.openComposeSheet();
  });
  await expect(page.getByTestId("compose-sheet")).toBeVisible();
}

async function floorSnapshot(page: Page): Promise<unknown> {
  return page.evaluate(() => {
    const state = window.__E2E__!.getGameState();
    return {
      day: state.day,
      cash: state.cash,
      rating: state.rating,
      activeDay: state.activeDay,
    };
  });
}

async function expectControlUnobscured(control: Locator): Promise<void> {
  await control.scrollIntoViewIfNeeded();
  await expect(control).toBeVisible();
  const unobscured = await control.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const hit = document.elementFromPoint(
      rect.left + rect.width / 2,
      rect.top + rect.height / 2,
    );
    return Boolean(hit && (hit === element || element.contains(hit)));
  });
  expect(unobscured).toBe(true);
}

test.describe("mobile state-transition boundaries", () => {
  test.describe("ingredient inspection over the live compose sheet", () => {
    for (const viewport of COMPOSE_VIEWPORTS) {
      test(`keeps the inspector modal isolated and lossless at ${viewport.label}`, async ({
        page,
      }) => {
        await page.setViewportSize(viewport);
        const diagnostics = await gotoFreshGame(page);
        await openLiveCompose(page);

        await page.getByTestId("ingredient-chip").first().click();
        const draftBefore = await page.evaluate(
          () => window.__E2E__!.getState().composeDraftIngredientIds,
        );
        expect(draftBefore).toHaveLength(1);

        const inspect = page.getByTestId("ingredient-inspect").first();
        const logicalTriggerId = await inspect.getAttribute("id");
        expect(logicalTriggerId).toBeTruthy();
        await inspect.click();

        const backdrop = page.locator("#flavor-inspector-modal");
        const dialog = backdrop.getByRole("dialog");
        const compose = page.getByTestId("compose-sheet");
        await expect(dialog).toBeVisible();
        await expectInsideViewport(dialog, viewport);
        await expectBackdropOwnsAnExposedPoint(backdrop, dialog, compose);
        await expect(compose).toHaveAttribute("aria-hidden", "true");
        expect(
          await compose.evaluate((element) => (element as HTMLElement).inert),
        ).toBe(true);

        if (viewport.width === 320) {
          await page.keyboard.press("Escape");
        } else {
          await page.getByRole("button", { name: "Back to compose" }).click();
        }

        await expect(dialog).toHaveCount(0);
        await expect(compose).not.toHaveAttribute("aria-hidden", "true");
        expect(
          await compose.evaluate((element) => (element as HTMLElement).inert),
        ).toBe(false);
        await expect(page.locator(`#${logicalTriggerId}`)).toBeFocused();
        expect(
          await page.evaluate(
            () => window.__E2E__!.getState().composeDraftIngredientIds,
          ),
        ).toEqual(draftBefore);
        assertNoDiagnostics(diagnostics);
      });
    }
  });

  test.describe("active service behind Settings", () => {
    for (const viewport of SETTINGS_VIEWPORTS) {
      test(`pauses floor guidance without covering Settings at ${viewport.label}`, async ({
        page,
      }) => {
        test.setTimeout(30_000);
        await page.setViewportSize(viewport);
        const diagnostics = await gotoFreshGame(page);
        await page.getByTestId("open-day-btn").click();
        await page.getByTestId("start-service-btn").click();

        const notice = page.getByTestId("notice-banner");
        await expect(notice).toBeVisible();
        await expect(notice).toHaveClass(/notice-banner-tutorial/);
        const noticeText = await notice.innerText();
        // Spend part of the authored dwell on the Floor so returning can prove
        // that the timer resumes instead of restarting from a fresh duration.
        await page.waitForTimeout(900);
        const beforeSettings = await floorSnapshot(page);

        await navigateToScreen(page, "settings");
        await expect(page.getByTestId("settings-screen")).toBeVisible();
        await expect(notice).toBeHidden();
        await expect(page.locator("#nav-lock-hint")).toBeHidden();
        await expectControlUnobscured(page.getByTestId("export-save-btn"));
        await expectControlUnobscured(page.getByTestId("import-save-input"));
        await expectControlUnobscured(page.getByTestId("import-save-btn"));

        // Staying away longer than the full tutorial duration must not consume
        // a floor-scoped notice or mutate the paused service simulation.
        await page.waitForTimeout(4_200);
        expect(await floorSnapshot(page)).toEqual(beforeSettings);

        await navigateToScreen(page, "restaurant");
        await expect(notice).toBeVisible();
        await expect(notice).toContainText(noticeText);
        const resumedAt = Date.now();
        await expect(notice).toBeHidden({ timeout: 3_500 });
        expect(Date.now() - resumedAt).toBeLessThan(3_500);

        assertNoDiagnostics(diagnostics);
      });
    }

    test("restores floor guidance after a global Settings toast expires", async ({
      page,
    }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      const diagnostics = await gotoFreshGame(page);
      await page.getByTestId("open-day-btn").click();
      await page.getByTestId("start-service-btn").click();

      const notice = page.getByTestId("notice-banner");
      await expect(notice).toBeVisible();
      const floorNoticeText = await notice.innerText();
      await navigateToScreen(page, "settings");
      await page.getByTestId("nav-recipes").click({ force: true });
      await expect(notice).toBeVisible();
      await expect(notice).toContainText(
        "Finish or close the service day before leaving the restaurant.",
      );
      await expect(notice).toHaveClass(/notice-banner-toast/);
      await expect(notice).toBeHidden({ timeout: 3_500 });

      await navigateToScreen(page, "restaurant");
      await expect(notice).toBeVisible();
      await expect(notice).toContainText(floorNoticeText);
      assertNoDiagnostics(diagnostics);
    });

    test("reconciles an open ticket menu before floor guidance resumes", async ({
      page,
    }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      const diagnostics = await gotoFreshGame(page);
      await page.getByTestId("open-day-btn").click();
      await page.getByTestId("start-service-btn").click();

      const notice = page.getByTestId("notice-banner");
      await expect(notice).toBeVisible();
      const noticeText = await notice.innerText();
      await page.getByTestId("floor-tickets-toggle").click();
      await expect(page.getByTestId("floor-tickets-menu")).toBeVisible();
      await expect(notice).toBeHidden();

      await page
        .getByTestId("hud-settings")
        .evaluate((element) => (element as HTMLElement).click());
      await expect(page.locator("#game-root")).toHaveAttribute(
        "data-screen",
        "settings",
      );
      await page
        .getByTestId("nav-restaurant")
        .evaluate((element) => (element as HTMLElement).click());
      await expect(page.locator("#game-root")).toHaveAttribute(
        "data-screen",
        "restaurant",
      );
      await expect(page.getByTestId("floor-tickets-menu")).toBeVisible();
      await expect(notice).toBeHidden();

      await page.getByTestId("floor-tickets-close").click();
      await expect(notice).toBeVisible();
      await expect(notice).toContainText(noticeText);
      assertNoDiagnostics(diagnostics);
    });
  });

  test.describe("completed-day identity in the summary boundary", () => {
    for (const viewport of SUMMARY_VIEWPORTS) {
      test(`keeps the HUD and summary day coherent on ${viewport.label}`, async ({
        page,
      }) => {
        test.setTimeout(45_000);
        await page.setViewportSize(viewport);
        const diagnostics = await gotoFreshGame(page);

        // Keep the HUD detail expanded across the close-day transition so both
        // the compact tile and its detail panel exercise the same checkpoint.
        await page.locator('[data-hud-detail="day"]').click();
        await expect(page.getByTestId("hud-detail-menu")).toBeVisible();
        await completeServiceDay(page, false);

        const summaryTitle = page.getByTestId("day-summary-title");
        const summaryText = await summaryTitle.innerText();
        const match = /^Day (\d+) Summary$/.exec(summaryText.trim());
        expect(match).not.toBeNull();
        const completedDay = Number(match![1]);
        const nextDay = completedDay + 1;

        await expect(page.locator('[data-hud-detail="day"] strong')).toHaveText(
          String(completedDay),
        );
        await expect(
          page.getByTestId("hud-detail-menu").locator("h2"),
        ).toHaveText(`Day ${completedDay}`);
        await expect(page.getByTestId("summary-back-floor")).toHaveText(
          `Continue to Day ${nextDay}`,
        );
        await expectInsideViewport(
          page.getByTestId("day-summary-sheet"),
          viewport,
        );
        assertNoDiagnostics(diagnostics);
      });
    }
  });

  test("keeps the short-landscape review identity and action fixed around a scroll body", async ({
    page,
  }) => {
    const viewport = { width: 667, height: 375 };
    await page.setViewportSize(viewport);
    const diagnostics = await gotoFreshGame(page);
    await page.getByTestId("open-day-btn").click();
    await page.getByTestId("start-service-btn").click();
    await serveCurrentCustomer(page);

    const sheet = page.getByTestId("review-sheet");
    const identity = page.getByTestId("review-guest-identity");
    const stars = page.getByTestId("review-stars");
    const score = page.getByTestId("review-score");
    const body = sheet.locator(".sheet-body-scroll");
    const footer = sheet.locator(".sheet-footer");
    const continueButton = page.getByTestId("continue-service-btn");

    await expectInsideViewport(sheet, viewport);
    await expectInsideViewport(identity, viewport);
    await expectInsideViewport(stars, viewport);
    await expectInsideViewport(score, viewport);
    await expect(score).toHaveText(/\d+\.\d+ \/ 10/);
    const initialGeometry = await Promise.all(
      [body, identity, stars, score, footer, continueButton].map((locator) =>
        locator.boundingBox(),
      ),
    );
    const [bodyBox, identityBox, starsBox, scoreBox, footerBox, ctaBox] =
      initialGeometry;
    for (const box of initialGeometry) expect(box).not.toBeNull();
    for (const box of [starsBox!, scoreBox!]) {
      expect(box.y).toBeGreaterThanOrEqual(bodyBox!.y - 1);
      expect(box.y + box.height).toBeLessThanOrEqual(
        bodyBox!.y + bodyBox!.height + 1,
      );
    }
    expect(footerBox!.y).toBeGreaterThanOrEqual(
      bodyBox!.y + bodyBox!.height - 1,
    );
    expect(ctaBox!.height).toBeGreaterThanOrEqual(44);
    expect(ctaBox!.y + ctaBox!.height).toBeLessThanOrEqual(viewport.height + 1);

    await body.evaluate((element) => {
      for (let index = 0; index < 6; index += 1) {
        const detail = document.createElement("p");
        detail.className = "review-detail";
        detail.textContent = `Additional review detail ${index + 1}`;
        element.appendChild(detail);
      }
    });
    const scrollState = await body.evaluate((element) => ({
      clientHeight: element.clientHeight,
      scrollHeight: element.scrollHeight,
      scrollTop: element.scrollTop,
      overflowY: getComputedStyle(element).overflowY,
    }));
    expect(scrollState.scrollTop).toBe(0);
    expect(scrollState.overflowY).toMatch(/^(auto|scroll)$/);
    expect(scrollState.scrollHeight).toBeGreaterThan(scrollState.clientHeight);
    const lastDetail = sheet.locator(".review-detail").last();
    await body.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
    await expect
      .poll(() => body.evaluate((element) => element.scrollTop))
      .toBeGreaterThan(0);
    const footerAfterScroll = await footer.boundingBox();
    const identityAfterScroll = await identity.boundingBox();
    const lastDetailBox = await lastDetail.boundingBox();
    expect(footerAfterScroll).not.toBeNull();
    expect(identityAfterScroll).not.toBeNull();
    expect(lastDetailBox).not.toBeNull();
    expect(Math.abs(footerAfterScroll!.y - footerBox!.y)).toBeLessThanOrEqual(
      1,
    );
    expect(
      Math.abs(identityAfterScroll!.y - identityBox!.y),
    ).toBeLessThanOrEqual(1);
    expect(lastDetailBox!.y).toBeGreaterThanOrEqual(bodyBox!.y - 1);
    expect(lastDetailBox!.y + lastDetailBox!.height).toBeLessThanOrEqual(
      bodyBox!.y + bodyBox!.height + 1,
    );
    assertNoDiagnostics(diagnostics);
  });
});
