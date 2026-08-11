import { expect, test, type Page } from "@playwright/test";
import {
  assertNoDiagnostics,
  gotoFreshGame,
  waitForServiceStarted,
} from "./helpers.ts";

/**
 * Regression for notice dwell under slow banner-host remounts.
 * CI burned remainingMs while the banner host was not yet presented; dwell
 * must stay frozen until presented, then dismiss on schedule. Driven with an
 * actionable toast: instructional guidance no longer uses the banner (it is a
 * persistent hud-hint), so toasts are the remaining dwell-timed banner kind.
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

    // Instructional guidance no longer banners, so drive the dwell machinery
    // with an actionable toast (the remaining bannered notice kind).
    await page.evaluate(() =>
      window.__E2E__!.setFloorToast("Resume budget probe"),
    );
    const notice = page.getByTestId("notice-banner");
    await expect(notice).toBeVisible();
    await logNotice(page, "after-toast");

    const timed = await page.evaluate(async () => {
      const restarted = window.__E2E__!.restartActiveNoticeDwell();
      await new Promise<void>((resolve) => window.setTimeout(resolve, 1_200));
      const mid = window.__E2E__!.getNoticeDebugSnapshot();
      return { restarted, mid };
    });
    console.log(`[notice-resume-debug] mid-dwell`, JSON.stringify(timed));
    expect(timed.restarted).toBe(true);
    expect(timed.mid.remainingMs).toBeGreaterThan(0);
    const midRemaining = timed.mid.remainingMs!;

    // Simulate CI remount lag: host stays unpresented (~3.5s window that
    // previously burned the notice unseen). Dwell must stay frozen.
    await page.evaluate(() => {
      window.__E2E__!.setNotificationBannerPresentationHold(true);
    });
    await logNotice(page, "hold-unpresented");

    await page.waitForTimeout(3_500);
    const held = await page.evaluate(() =>
      window.__E2E__!.getNoticeDebugSnapshot(),
    );
    await logNotice(page, "held-unpresented-3500ms");
    expect(held.screen).toBe("restaurant");
    expect(held.noticeActive).not.toBeNull();
    expect(held.notificationBannerPresented).toBe(false);
    expect(held.remainingMs).toBeGreaterThan(0);
    expect(held.remainingMs!).toBeLessThanOrEqual(midRemaining + 50);
    expect(held.remainingMs!).toBeGreaterThanOrEqual(midRemaining - 50);

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

    // Dismiss on the remaining schedule (toast 2.5s; mid-dwell left ~1.3s).
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
