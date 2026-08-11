import { expect, test, type Page } from "@playwright/test";
import {
  assertNoDiagnostics,
  gotoFreshGame,
  navigateToScreen,
  waitForServiceStarted,
} from "./helpers.ts";

/**
 * CI evidence helper for the Settings pause/resume notice path.
 * Logs getNoticeDebugSnapshot() at each step so failed CI jobs show whether
 * the tip was dismissed, parked, or failed to remount — without weakening
 * the production assertions in mobile-state-transitions.
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
  test(`notice resume debug dump at ${viewport.label}`, async ({ page }) => {
    test.setTimeout(30_000);
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

    await expect(page.getByTestId("settings-screen")).toBeVisible();
    await expect(notice).toBeHidden();
    await logNotice(page, "on-settings");

    await page.waitForTimeout(4_200);
    await logNotice(page, "settings-after-4200ms");

    await navigateToScreen(page, "restaurant");
    await logNotice(page, "after-return-restaurant");

    // Soft evidence for CI logs; the hard contract remains in mobile-state-transitions.
    const after = await page.evaluate(() =>
      window.__E2E__!.getNoticeDebugSnapshot(),
    );
    expect(after.screen).toBe("restaurant");
    // Prefer remount; if CI still loses the tip, the logged snapshots above
    // are the evidence trail — keep this assert as the local green path.
    expect(after.bannerPresent || after.noticeActive !== null).toBe(true);

    assertNoDiagnostics(diagnostics);
  });
}
