import { expect, test, type Page } from "@playwright/test";
import {
  assertNoDiagnostics,
  gotoFreshGame,
  navigateToScreen,
  waitForServiceStarted,
} from "./helpers.ts";

/**
 * Regression for Settings→Floor notice resume under slow remounts.
 * CI burned remainingMs while screen==='restaurant' before the banner host
 * was visible; dwell must stay frozen until presented, then dismiss on schedule.
 */
async function logNotice(page: Page, label: string): Promise<void> {
  const snap = await page.evaluate(
    (step) => ({
      step,
      ...window.__E2E__!.getNoticeDebugSnapshot(),
    }),
    label,
  );
  console.log(`[notice-resume-debug] ${label}`, JSON.stringify(snap));
}

const VIEWPORTS = [
  { width: 320, height: 720, label: "320 portrait" },
  { width: 390, height: 844, label: "390 portrait" },
] as const;

for (const viewport of VIEWPORTS) {
  test(`notice resume keeps remaining budget at ${viewport.label}`, async ({
    page,
  }) => {
    test.setTimeout(45_000);
    await page.setViewportSize(viewport);
    const diagnostics = await gotoFreshGame(page);
    await page.getByTestId("open-day-btn").click();
    await page.getByTestId("start-service-btn").click();
    await waitForServiceStarted(page);

    const notice = page.getByTestId("notice-banner");
    await expect(notice).toBeVisible();
    await logNotice(page, "after-service-start");

    const timed = await page.evaluate(async () => {
      const restarted = window.__E2E__!.restartActiveNoticeDwell();
      await new Promise<void>((resolve) => window.setTimeout(resolve, 1_200));
      const mid = window.__E2E__!.getNoticeDebugSnapshot();
      document
        .querySelector<HTMLButtonElement>('[data-testid="hud-settings"]')
        ?.click();
      return { restarted, mid };
    });
    console.log(
      `[notice-resume-debug] mid-dwell-before-settings`,
      JSON.stringify(timed),
    );
    expect(timed.restarted).toBe(true);
    expect(timed.mid.remainingMs).toBeGreaterThan(0);

    await expect(page.getByTestId("settings-screen")).toBeVisible();
    await expect(notice).toBeHidden();
    await logNotice(page, "on-settings");

    await page.waitForTimeout(4_200);
    const parked = await page.evaluate(() =>
      window.__E2E__!.getNoticeDebugSnapshot(),
    );
    await logNotice(page, "settings-after-4200ms");
    expect(parked.noticeActive).not.toBeNull();
    expect(parked.remainingMs).toBeGreaterThan(0);
    const parkedRemaining = parked.remainingMs!;

    // Simulate CI remount lag: screen returns to restaurant while host stays
    // unpresented (~3.9s window that previously burned the tip unseen).
    await page.evaluate(() => {
      window.__E2E__!.setNotificationBannerPresentationHold(true);
    });
    await navigateToScreen(page, "restaurant");
    await logNotice(page, "after-return-unpresented");

    await page.waitForTimeout(3_500);
    const held = await page.evaluate(() =>
      window.__E2E__!.getNoticeDebugSnapshot(),
    );
    await logNotice(page, "held-unpresented-3500ms");
    expect(held.screen).toBe("restaurant");
    expect(held.noticeActive).not.toBeNull();
    expect(held.notificationBannerPresented).toBe(false);
    expect(held.remainingMs).toBeGreaterThan(0);
    expect(held.remainingMs!).toBeLessThanOrEqual(parkedRemaining + 50);
    expect(held.remainingMs!).toBeGreaterThanOrEqual(parkedRemaining - 50);

    await page.evaluate(() => {
      window.__E2E__!.releaseNotificationBannerPresentationHold();
    });
    await logNotice(page, "after-present");

    await expect(notice).toBeVisible({ timeout: 5_000 });
    const afterPresent = await page.evaluate(() =>
      window.__E2E__!.getNoticeDebugSnapshot(),
    );
    expect(afterPresent.bannerPresent).toBe(true);
    expect(afterPresent.remainingMs).toBeGreaterThan(0);
    expect(afterPresent.noticeActive).not.toBeNull();

    // Dismiss on the remaining schedule (tutorial ~4s; mid-dwell left ~2.8s).
    await expect(notice).toBeHidden({ timeout: 5_000 });
    const afterDismiss = await page.evaluate(() =>
      window.__E2E__!.getNoticeDebugSnapshot(),
    );
    await logNotice(page, "after-scheduled-dismiss");
    expect(afterDismiss.noticeActive).toBeNull();
    expect(afterDismiss.bannerPresent).toBe(false);

    assertNoDiagnostics(diagnostics);
  });
}
