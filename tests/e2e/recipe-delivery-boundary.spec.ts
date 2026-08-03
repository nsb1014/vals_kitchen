import { expect, test, type Page, type Route } from "@playwright/test";
import recipes from "../../src/data/recipes.json" with { type: "json" };
import { clearBrowserStorage, E2E_PATH, waitForGameReady } from "./helpers.ts";

const namedRecipe = recipes[0]!;

// Requests served inside the production service worker bypass Playwright's
// routing layer. Disable it here so the deferred content boundary is observed
// at the real network request instead of silently satisfied from the PWA cache.
test.use({ serviceWorkers: "block" });

interface HeldRecipeRequest {
  requestCount: () => number;
  waitForFirstRequest: () => Promise<void>;
  releaseSuccess: () => void;
  releaseFailure: () => void;
}

async function bootWithHeldRecipeRequest(
  page: Page,
): Promise<HeldRecipeRequest> {
  await page.goto("/data/ingredients.json");
  await clearBrowserStorage(page);

  let requestCount = 0;
  const observedDataPaths = new Set<string>();
  let firstRequestSeen!: () => void;
  const firstRequest = new Promise<void>((resolve) => {
    firstRequestSeen = resolve;
  });
  let releaseFirst!: (outcome: "success" | "failure") => void;
  const firstOutcome = new Promise<"success" | "failure">((resolve) => {
    releaseFirst = resolve;
  });

  await page.route("**/*", async (route: Route) => {
    const requestPath = new URL(route.request().url()).pathname;
    if (requestPath.includes("/data/")) observedDataPaths.add(requestPath);
    if (requestPath !== "/data/recipes.json") {
      await route.continue();
      return;
    }
    requestCount += 1;
    if (requestCount !== 1) {
      await route.continue();
      return;
    }

    firstRequestSeen();
    const outcome = await firstOutcome;
    if (outcome === "failure") {
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "recipe fixture unavailable" }),
      });
      return;
    }
    await route.continue();
  });

  // The deferred preload intentionally remains in flight, so networkidle is
  // not a valid readiness boundary for these tests.
  await page.goto(E2E_PATH, { waitUntil: "domcontentloaded" });
  await waitForGameReady(page);

  return {
    requestCount: () => requestCount,
    waitForFirstRequest: () =>
      Promise.race([
        firstRequest,
        new Promise<never>((_, reject) => {
          setTimeout(
            () =>
              reject(
                new Error(
                  `the recipe request was not intercepted; observed ${[
                    ...observedDataPaths,
                  ].join(", ")}`,
                ),
              ),
            10_000,
          );
        }),
      ]),
    releaseSuccess: () => releaseFirst("success"),
    releaseFailure: () => releaseFirst("failure"),
  };
}

async function prepareNamedRecipeForDelivery(page: Page): Promise<{
  ticketId: string;
  customerId: string;
  seat: { x: number; y: number };
  servicePosition: { x: number; y: number };
}> {
  await page.evaluate(() => window.__E2E__!.prepareCookUiFixture());
  return page.evaluate(async (recipe) => {
    const bridge = window.__E2E__!;
    const floor = bridge.getGameState().activeDay!.floor!;
    const ticket = floor.tickets.find(
      (candidate) => candidate.status === "open",
    );
    if (!ticket) throw new Error("expected an open delivery fixture ticket");
    const guest = floor.pool.find(
      (candidate) => candidate.customer.id === ticket.customerId,
    );
    if (!guest?.seat)
      throw new Error("expected the ticket guest to have a seat");

    await bridge.dispatch({
      type: "FLOOR_SET_TICKET_DRAFT",
      ticketId: ticket.id,
      ingredientIds: recipe.ingredientIds,
    });
    await bridge.dispatch({ type: "FLOOR_PLATE", ticketId: ticket.id });
    const servicePosition = {
      x: guest.seat.x > 0 ? guest.seat.x - 1 : guest.seat.x + 1,
      y: guest.seat.y,
    };
    bridge.setFloorNavPosition(servicePosition);
    return {
      ticketId: ticket.id,
      customerId: ticket.customerId,
      seat: { x: guest.seat.x, y: guest.seat.y },
      servicePosition,
    };
  }, namedRecipe);
}

async function tapGuest(
  page: Page,
  seat: { x: number; y: number },
): Promise<void> {
  await page.evaluate(({ x, y }) => {
    const canvas = document.querySelector<HTMLCanvasElement>(
      '[data-testid="restaurant-canvas"]',
    );
    if (!canvas) throw new Error("restaurant canvas is missing");
    const point = window.__E2E__!.gridCellToScreen(x, y);
    canvas.dispatchEvent(
      new PointerEvent("pointerdown", {
        bubbles: true,
        cancelable: true,
        clientX: point.x,
        clientY: point.y,
        pointerId: 1,
        pointerType: "touch",
        isPrimary: true,
      }),
    );
  }, seat);
}

async function deliverySnapshot(
  page: Page,
  ticketId: string,
  customerId: string,
) {
  return page.evaluate(
    ({ ticketId: id, customerId: guestCustomerId }) => {
      const state = window.__E2E__!.getGameState();
      const floor = state.activeDay!.floor!;
      return {
        cash: state.cash,
        rating: state.rating,
        totalEarnings: state.stats.totalEarnings,
        customersServed: state.activeDay!.customersServed,
        totalCustomersServed: state.stats.totalCustomersServed,
        dayEarnings: state.activeDay!.dayEarnings,
        dayMatchSum: state.activeDay!.dayMatchSum,
        dayRatingDelta: state.activeDay!.dayRatingDelta ?? 0,
        discoveredRecipeIds: [...state.discoveredRecipeIds],
        recipeMastery: structuredClone(state.recipeMastery),
        carriedTicketId: floor.carriedTicketId,
        ticketStatus: floor.tickets.find((ticket) => ticket.id === id)?.status,
        guestStage: floor.pool.find(
          (guest) => guest.customer.id === guestCustomerId,
        )?.stage,
      };
    },
    { ticketId, customerId },
  );
}

function expectExactlyOneNamedRecipeServe(
  before: Awaited<ReturnType<typeof deliverySnapshot>>,
  after: Awaited<ReturnType<typeof deliverySnapshot>>,
): void {
  const tip = after.cash - before.cash;
  const matchStars = after.dayMatchSum - before.dayMatchSum;
  const ratingDelta = after.rating - before.rating;

  expect(tip).toBeGreaterThan(0);
  expect(after.totalEarnings - before.totalEarnings).toBe(tip);
  expect(after.dayEarnings - before.dayEarnings).toBe(tip);
  expect(matchStars).toBeGreaterThan(0);
  // Rating is signed: a named recipe can still fit this guest poorly. Prove
  // the one review changed it and that the day aggregate records it exactly.
  expect(Math.abs(ratingDelta)).toBeGreaterThan(0);
  expect(after.dayRatingDelta - before.dayRatingDelta).toBeCloseTo(
    ratingDelta,
    10,
  );
  expect(after.customersServed).toBe(before.customersServed + 1);
  expect(after.totalCustomersServed).toBe(before.totalCustomersServed + 1);
  expect(
    after.discoveredRecipeIds.filter((id) => id === namedRecipe.id),
  ).toHaveLength(1);
  expect(after.recipeMastery[namedRecipe.id]).toEqual({
    level: 1,
    progress: 0,
  });
}

async function expectNamedRecipeReview(page: Page): Promise<void> {
  await expect(page.getByTestId("review-sheet")).toBeVisible();
  await expect(
    page.getByText(`Named dish: ${namedRecipe.name}`, { exact: true }),
  ).toBeVisible();
}

test.describe("retryable recipe delivery boundary", () => {
  test("ignores a delayed duplicate tap and delivers the named recipe exactly once", async ({
    page,
  }) => {
    test.setTimeout(45_000);
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    const recipesRequest = await bootWithHeldRecipeRequest(page);
    const fixture = await prepareNamedRecipeForDelivery(page);
    const before = await deliverySnapshot(
      page,
      fixture.ticketId,
      fixture.customerId,
    );

    expect(before.ticketStatus).toBe("plated");
    expect(before.carriedTicketId).toBe(fixture.ticketId);
    expect(before.guestStage).toBe("ordered");
    await tapGuest(page, fixture.seat);
    await tapGuest(page, fixture.seat);
    await recipesRequest.waitForFirstRequest();
    await page.waitForTimeout(100);

    expect(
      await deliverySnapshot(page, fixture.ticketId, fixture.customerId),
    ).toEqual(before);
    expect(recipesRequest.requestCount()).toBe(1);

    recipesRequest.releaseSuccess();
    await expect(page.getByTestId("review-sheet")).toBeVisible();

    const after = await deliverySnapshot(
      page,
      fixture.ticketId,
      fixture.customerId,
    );
    expect(after.carriedTicketId).toBeNull();
    expect(after.ticketStatus).toBe("delivered");
    expect(after.guestStage).toBe("eating");
    expectExactlyOneNamedRecipeServe(before, after);
    await expectNamedRecipeReview(page);
    await expect(
      page.getByText("Could not deliver that dish — tap the guest to retry"),
    ).toHaveCount(0);
    expect(pageErrors).toEqual([]);
  });

  test("shows a retryable error and succeeds through a second recipe request", async ({
    page,
  }) => {
    test.setTimeout(45_000);
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    const recipesRequest = await bootWithHeldRecipeRequest(page);
    const fixture = await prepareNamedRecipeForDelivery(page);
    const before = await deliverySnapshot(
      page,
      fixture.ticketId,
      fixture.customerId,
    );

    await tapGuest(page, fixture.seat);
    await recipesRequest.waitForFirstRequest();
    recipesRequest.releaseFailure();
    await expect(
      page.getByText("Could not deliver that dish — tap the guest to retry"),
    ).toBeVisible();
    expect(
      await deliverySnapshot(page, fixture.ticketId, fixture.customerId),
    ).toEqual(before);
    expect(recipesRequest.requestCount()).toBe(1);

    await tapGuest(page, fixture.seat);
    await expect.poll(recipesRequest.requestCount, { timeout: 10_000 }).toBe(2);
    await expect(page.getByTestId("review-sheet")).toBeVisible();

    const after = await deliverySnapshot(
      page,
      fixture.ticketId,
      fixture.customerId,
    );
    expect(after.carriedTicketId).toBeNull();
    expect(after.ticketStatus).toBe("delivered");
    expect(after.guestStage).toBe("eating");
    expectExactlyOneNamedRecipeServe(before, after);
    await expectNamedRecipeReview(page);
    expect(pageErrors).toEqual([]);
  });

  test("cancels a held delivery across settings restore and permits a fresh retry", async ({
    page,
  }) => {
    test.setTimeout(45_000);
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    const recipesRequest = await bootWithHeldRecipeRequest(page);
    const fixture = await prepareNamedRecipeForDelivery(page);
    const saveCode = await page.evaluate(() =>
      window.__E2E__!.exportSaveCode(),
    );
    const before = await deliverySnapshot(
      page,
      fixture.ticketId,
      fixture.customerId,
    );

    await tapGuest(page, fixture.seat);
    await recipesRequest.waitForFirstRequest();
    await page.getByTestId("hud-settings").click();
    await expect(page.locator("#game-root")).toHaveAttribute(
      "data-screen",
      "settings",
    );
    await page.getByTestId("import-save-input").fill(saveCode);
    await page.getByTestId("import-save-btn").click();
    await expect
      .poll(() => page.evaluate(() => window.__E2E__!.getState().screen))
      .toBe("restaurant");
    expect(
      await deliverySnapshot(page, fixture.ticketId, fixture.customerId),
    ).toEqual(before);

    recipesRequest.releaseSuccess();
    await expect
      .poll(() => page.evaluate(() => window.__E2E__!.isRecipesReady()))
      .toBe(true);
    await expect
      .poll(() =>
        page.evaluate(
          (ticketId) => window.__E2E__!.isDeliveryPending(ticketId),
          fixture.ticketId,
        ),
      )
      .toBe(false);
    expect(
      await deliverySnapshot(page, fixture.ticketId, fixture.customerId),
    ).toEqual(before);
    await expect(page.getByTestId("review-sheet")).toHaveCount(0);
    await expect(
      page.getByText("Could not deliver that dish — tap the guest to retry"),
    ).toHaveCount(0);

    // Restoring an equal floor does not change its seed, so explicitly resync
    // the canvas NavController with the restored persisted player position.
    await page.evaluate(
      (position) => window.__E2E__!.setFloorNavPosition(position),
      fixture.servicePosition,
    );
    await tapGuest(page, fixture.seat);
    await expectNamedRecipeReview(page);
    const after = await deliverySnapshot(
      page,
      fixture.ticketId,
      fixture.customerId,
    );
    expect(after.carriedTicketId).toBeNull();
    expect(after.ticketStatus).toBe("delivered");
    expect(after.guestStage).toBe("eating");
    expectExactlyOneNamedRecipeServe(before, after);
    expect(pageErrors).toEqual([]);
  });
});
