import { expect, test, type Page } from '@playwright/test';
import {
  assertNoDiagnostics,
  gotoFreshGame,
  type PageDiagnostics,
} from './helpers.ts';

type Facing = 'right' | 'down' | 'up' | 'left';
type GridPoint = { x: number; y: number };
type CarryCross = {
  center: GridPoint;
  targets: Record<Facing, GridPoint>;
  ticketId: string;
};
type PlayerVisual = NonNullable<
  ReturnType<NonNullable<Window['__E2E__']>['getPlayerVisualDebug']>
>;
type CarryTransitionSample = {
  visual: PlayerVisual;
  carriedTicketId: string | null;
};

const VIEWPORTS = [
  { name: 'mobile', width: 390, height: 844 },
  { name: 'desktop', width: 1280, height: 800 },
] as const;
const FACINGS: Facing[] = ['right', 'down', 'up', 'left'];

async function openRunningFloor(
  page: Page,
  viewport: { width: number; height: number },
): Promise<PageDiagnostics> {
  await page.setViewportSize(viewport);
  const diagnostics = await gotoFreshGame(page);
  await page.getByTestId('open-day-btn').click();
  await page.getByTestId('start-service-btn').click();
  await expect(page.getByTestId('floor-service-panel')).toBeVisible();
  return diagnostics;
}

async function prepareCarryCross(page: Page): Promise<CarryCross> {
  const fixture = await page.evaluate(async () => {
    const bridge = window.__E2E__!;
    const carry = await bridge.prepareStationCarryFixture('valid_carry');
    if (!carry.ticketId)
      throw new Error('valid carry fixture omitted its ticket');
    return bridge.prepareCarryAnimationCross();
  });
  await expect
    .poll(() => page.evaluate(() => window.__E2E__!.getPlayerVisualDebug()))
    .toMatchObject({
      requestedTextureKey: 'player_carry_down',
      boundTextureKey: 'player_carry_down',
      authoredCarry: true,
      plateOverlayVisible: false,
      spriteVisible: true,
      spriteAlpha: 1,
      frameWidth: 128,
      frameHeight: 160,
      isMoving: false,
    });
  return fixture;
}

async function tapAndCaptureWalk(
  page: Page,
  target: GridPoint,
  maxFrames = 120,
): Promise<PlayerVisual[]> {
  return page.evaluate(
    async ({ x, y, frameGuard }) => {
      const bridge = window.__E2E__!;
      const canvas = document.querySelector<HTMLCanvasElement>(
        '[data-testid="restaurant-canvas"]',
      );
      if (!canvas) throw new Error('restaurant canvas is missing');
      const point = bridge.gridCellToScreen(x, y);
      const samples: PlayerVisual[] = [];
      let sawMovement = false;

      canvas.dispatchEvent(
        new PointerEvent('pointerdown', {
          bubbles: true,
          cancelable: true,
          clientX: point.x,
          clientY: point.y,
          pointerId: 1,
          pointerType: 'touch',
          isPrimary: true,
        }),
      );

      for (let frame = 0; frame < frameGuard; frame += 1) {
        await new Promise<void>((resolve) =>
          requestAnimationFrame(() => resolve()),
        );
        const visual = bridge.getPlayerVisualDebug();
        if (!visual) throw new Error('player visual debug is unavailable');
        samples.push(visual);
        if (visual.isMoving) sawMovement = true;
        if (sawMovement && !visual.isMoving) break;
      }
      if (!sawMovement)
        throw new Error('real pointer tap did not start movement');
      if (samples.at(-1)?.isMoving) {
        throw new Error('movement did not finish within the frame guard');
      }
      return samples;
    },
    { ...target, frameGuard: maxFrames },
  );
}

async function tapAndCaptureRoomTransition(
  page: Page,
  target: GridPoint,
  expectedRoom: 'main' | 'back_kitchen',
  maxFrames: number,
): Promise<PlayerVisual[]> {
  return page.evaluate(
    async ({ pointTarget, roomTarget, frameGuard }) => {
      const bridge = window.__E2E__!;
      const canvas = document.querySelector<HTMLCanvasElement>(
        '[data-testid="restaurant-canvas"]',
      );
      if (!canvas) throw new Error('restaurant canvas is missing');
      const point = bridge.gridCellToScreen(pointTarget.x, pointTarget.y);
      const samples: PlayerVisual[] = [];
      let sawMovement = false;
      let settledFrames = 0;

      canvas.dispatchEvent(
        new PointerEvent('pointerdown', {
          bubbles: true,
          cancelable: true,
          clientX: point.x,
          clientY: point.y,
          pointerId: 1,
          pointerType: 'touch',
          isPrimary: true,
        }),
      );

      for (let frame = 0; frame < frameGuard; frame += 1) {
        await new Promise<void>((resolve) =>
          requestAnimationFrame(() => resolve()),
        );
        const visual = bridge.getPlayerVisualDebug();
        if (!visual) throw new Error('player visual debug is unavailable');
        samples.push(visual);
        if (visual.isMoving) sawMovement = true;
        const roomSettled =
          bridge.getState().activeFloorRoom === roomTarget &&
          canvas.dataset.roomTransition == null;
        settledFrames = roomSettled ? settledFrames + 1 : 0;
        if (settledFrames >= 3) break;
      }
      if (!sawMovement) {
        throw new Error('annex pointer tap did not start movement');
      }
      if (settledFrames < 3) {
        throw new Error(`annex transition did not settle in ${roomTarget}`);
      }
      return samples;
    },
    {
      pointTarget: target,
      roomTarget: expectedRoom,
      frameGuard: maxFrames,
    },
  );
}

async function tapGridCell(page: Page, target: GridPoint): Promise<void> {
  await page.evaluate(({ x, y }) => {
    const bridge = window.__E2E__!;
    const canvas = document.querySelector<HTMLCanvasElement>(
      '[data-testid="restaurant-canvas"]',
    );
    if (!canvas) throw new Error('restaurant canvas is missing');
    const point = bridge.gridCellToScreen(x, y);
    canvas.dispatchEvent(
      new PointerEvent('pointerdown', {
        bubbles: true,
        cancelable: true,
        clientX: point.x,
        clientY: point.y,
        pointerId: 1,
        pointerType: 'touch',
        isPrimary: true,
      }),
    );
  }, target);
}

async function captureCarryBoundary(
  page: Page,
  target:
    { kind: 'grid'; point: GridPoint } | { kind: 'testid'; testId: string },
  completion: 'carrying' | 'not_carrying' | 'fixed_frames',
  maxFrames = 180,
): Promise<CarryTransitionSample[]> {
  return page.evaluate(
    async ({ pointerTarget, expectedCompletion, frameGuard }) => {
      const bridge = window.__E2E__!;
      const samples: CarryTransitionSample[] = [];
      const capture = () => {
        const visual = bridge.getPlayerVisualDebug();
        if (!visual) throw new Error('player visual debug is unavailable');
        samples.push({
          visual,
          carriedTicketId:
            bridge.getGameState().activeDay!.floor!.carriedTicketId,
        });
      };
      capture();

      if (pointerTarget.kind === 'grid') {
        const canvas = document.querySelector<HTMLCanvasElement>(
          '[data-testid="restaurant-canvas"]',
        );
        if (!canvas) throw new Error('restaurant canvas is missing');
        const point = bridge.gridCellToScreen(
          pointerTarget.point.x,
          pointerTarget.point.y,
        );
        canvas.dispatchEvent(
          new PointerEvent('pointerdown', {
            bubbles: true,
            cancelable: true,
            clientX: point.x,
            clientY: point.y,
            pointerId: 1,
            pointerType: 'touch',
            isPrimary: true,
          }),
        );
      } else {
        const element = document.querySelector<HTMLElement>(
          `[data-testid="${pointerTarget.testId}"]`,
        );
        if (!element) {
          throw new Error(
            `interaction target ${pointerTarget.testId} is missing`,
          );
        }
        const rect = element.getBoundingClientRect();
        const eventInit = {
          bubbles: true,
          cancelable: true,
          clientX: rect.left + rect.width / 2,
          clientY: rect.top + rect.height / 2,
          pointerId: 1,
          pointerType: 'touch',
          isPrimary: true,
        };
        element.dispatchEvent(new PointerEvent('pointerdown', eventInit));
        element.dispatchEvent(new PointerEvent('pointerup', eventInit));
        element.dispatchEvent(new PointerEvent('click', eventInit));
      }
      capture();

      let completionFrames = 0;
      for (let frame = 0; frame < frameGuard; frame += 1) {
        await new Promise<void>((resolve) =>
          requestAnimationFrame(() => resolve()),
        );
        capture();
        const carried = samples.at(-1)!.carriedTicketId !== null;
        const complete =
          expectedCompletion === 'fixed_frames' ||
          (expectedCompletion === 'carrying' && carried) ||
          (expectedCompletion === 'not_carrying' && !carried);
        completionFrames = complete ? completionFrames + 1 : 0;
        const requiredFrames = expectedCompletion === 'fixed_frames' ? 8 : 3;
        if (completionFrames >= requiredFrames) break;
      }
      if (completionFrames === 0) {
        throw new Error(`carry boundary did not reach ${expectedCompletion}`);
      }
      return samples;
    },
    {
      pointerTarget: target,
      expectedCompletion: completion,
      frameGuard: maxFrames,
    },
  );
}

function expectAuthoredCarryVisual(visual: PlayerVisual, facing: Facing): void {
  const carryKey = new RegExp(`^player_carry_${facing}(?:_[12])?$`);
  expect(visual.requestedTextureKey).toMatch(carryKey);
  expect(visual.boundTextureKey).toMatch(carryKey);
  expect(visual.authoredCarry).toBe(true);
  expect(visual.plateOverlayVisible).toBe(false);
  expect(visual.spriteVisible).toBe(true);
  expect(visual.spriteAlpha).toBe(1);
  expect(visual.frameWidth).toBe(128);
  expect(visual.frameHeight).toBe(160);
  expect(visual.facing).toBe(facing);
  expect(visual.feet).not.toBeNull();
}

function expectOrdinaryPlayerVisual(visual: PlayerVisual): void {
  const walkKey = new RegExp(`^player_${visual.facing}_[012]$`);
  expect(visual.requestedTextureKey).toMatch(walkKey);
  expect(visual.boundTextureKey).toMatch(walkKey);
  expect(visual.authoredCarry).toBe(false);
  expect(visual.plateOverlayVisible).toBe(false);
  expect(visual.spriteVisible).toBe(true);
  expect(visual.spriteAlpha).toBe(1);
  expect(visual.frameWidth).toBe(128);
  expect(visual.frameHeight).toBe(160);
  expect(visual.feet).not.toBeNull();
}

function expectValidCarryBoundarySample(sample: CarryTransitionSample): void {
  if (sample.carriedTicketId) {
    expectAuthoredCarryVisual(sample.visual, sample.visual.facing);
  } else {
    expectOrdinaryPlayerVisual(sample.visual);
  }
}

function expectCarryStrideCoverage(
  samples: PlayerVisual[],
  facing?: Facing,
): void {
  const movementSamples = samples.filter(
    (sample) => sample.isMoving && (!facing || sample.facing === facing),
  );
  const requested = new Set(
    movementSamples.map((sample) => sample.requestedTextureKey),
  );
  const bound = new Set(
    movementSamples.map((sample) => sample.boundTextureKey),
  );
  if (facing) {
    for (const stride of [1, 2]) {
      const key = `player_carry_${facing}_${stride}`;
      expect(requested.has(key), `${facing} should request ${key}`).toBe(true);
      expect(bound.has(key), `${facing} should bind ${key}`).toBe(true);
    }
    return;
  }
  expect(
    [...requested].some((key) => key.endsWith('_1')),
    'annex walk should request stride frame 1',
  ).toBe(true);
  expect(
    [...requested].some((key) => key.endsWith('_2')),
    'annex walk should request stride frame 2',
  ).toBe(true);
  expect(
    [...bound].some((key) => key.endsWith('_1')),
    'annex walk should bind stride frame 1',
  ).toBe(true);
  expect(
    [...bound].some((key) => key.endsWith('_2')),
    'annex walk should bind stride frame 2',
  ).toBe(true);
}

function expectStableFeet(samples: PlayerVisual[], facing: Facing): void {
  const feet = samples.map((sample) => sample.feet);
  expect(
    feet.every(Boolean),
    `${facing} frames must retain a feet anchor`,
  ).toBe(true);
  const points = feet as GridPoint[];
  const orthogonal = points.map((point) =>
    facing === 'left' || facing === 'right' ? point.y : point.x,
  );
  expect(
    Math.max(...orthogonal) - Math.min(...orthogonal),
    `${facing} stride must not wobble at the feet`,
  ).toBeLessThanOrEqual(0.01);

  const along = points.map((point) =>
    facing === 'left' || facing === 'right' ? point.x : point.y,
  );
  const sign = facing === 'left' || facing === 'up' ? -1 : 1;
  for (let index = 1; index < along.length; index += 1) {
    expect(
      (along[index]! - along[index - 1]!) * sign,
      `${facing} feet must move monotonically`,
    ).toBeGreaterThanOrEqual(-0.01);
  }
}

for (const viewport of VIEWPORTS) {
  test(`keeps authored carry art intact through all four tapped directions on ${viewport.name}`, async ({
    page,
  }) => {
    const diagnostics = await openRunningFloor(page, viewport);
    let fixture = await prepareCarryCross(page);

    for (const facing of FACINGS) {
      // Reset between directions so each assertion observes one direct segment
      // rather than a pathfinding turn chosen by fixture geometry.
      fixture = await page.evaluate(() =>
        window.__E2E__!.prepareCarryAnimationCross(),
      );
      const samples = await tapAndCaptureWalk(page, fixture.targets[facing]);
      const movementSamples = samples.filter((sample) => sample.isMoving);
      expect(
        movementSamples.length,
        `${facing} should expose more than one rendered movement frame`,
      ).toBeGreaterThan(1);
      for (const visual of samples) expectAuthoredCarryVisual(visual, facing);
      expectCarryStrideCoverage(samples, facing);
      expectStableFeet(samples, facing);
      await expect
        .poll(() =>
          page.evaluate(() => window.__E2E__!.getState().floorPlayerGrid),
        )
        .toEqual(fixture.targets[facing]);
    }

    const state = await page.evaluate(() => window.__E2E__!.getGameState());
    expect(state.activeDay!.floor!.carriedTicketId).toBe(fixture.ticketId);
    assertNoDiagnostics(diagnostics);
  });
}

test('keeps the carried sprite through a visibility pause and resume', async ({
  page,
}) => {
  const diagnostics = await openRunningFloor(page, VIEWPORTS[0]);
  const fixture = await prepareCarryCross(page);
  const paused = await page.evaluate(async (target) => {
    const bridge = window.__E2E__!;
    const canvas = document.querySelector<HTMLCanvasElement>(
      '[data-testid="restaurant-canvas"]',
    );
    if (!canvas) throw new Error('restaurant canvas is missing');
    const point = bridge.gridCellToScreen(target.x, target.y);
    canvas.dispatchEvent(
      new PointerEvent('pointerdown', {
        bubbles: true,
        cancelable: true,
        clientX: point.x,
        clientY: point.y,
        pointerId: 1,
        pointerType: 'touch',
        isPrimary: true,
      }),
    );
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => resolve()),
    );
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'hidden',
    });
    document.dispatchEvent(new Event('visibilitychange'));
    return bridge.getPlayerVisualDebug();
  }, fixture.targets.right);
  if (!paused)
    throw new Error('player visual debug is unavailable while paused');
  expectAuthoredCarryVisual(paused, 'right');

  await page.waitForTimeout(200);
  const stillPaused = await page.evaluate(() =>
    window.__E2E__!.getPlayerVisualDebug(),
  );
  expect(stillPaused).toEqual(paused);

  await page.evaluate(() => {
    delete (document as unknown as Record<string, unknown>).visibilityState;
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect
    .poll(() => page.evaluate(() => window.__E2E__!.getState().floorPlayerGrid))
    .toEqual(fixture.targets.right);
  const resumed = await page.evaluate(() =>
    window.__E2E__!.getPlayerVisualDebug(),
  );
  if (!resumed)
    throw new Error('player visual debug is unavailable after resume');
  expectAuthoredCarryVisual(resumed, 'right');
  expect(resumed.isMoving).toBe(false);
  assertNoDiagnostics(diagnostics);
});

test('keeps the carried sprite visible across the annex round trip', async ({
  page,
}) => {
  const diagnostics = await openRunningFloor(page, VIEWPORTS[1]);
  const fixture = await prepareCarryCross(page);
  const door = await page.evaluate(() => {
    const bridge = window.__E2E__!;
    bridge.unlockKitchenAnnexForTest();
    const { gridSize } = bridge.getGameState();
    return { x: gridSize.w - 1, y: Math.floor(gridSize.h / 2) };
  });

  const outboundSamples = await tapAndCaptureRoomTransition(
    page,
    door,
    'back_kitchen',
    600,
  );
  for (const visual of outboundSamples) {
    expectAuthoredCarryVisual(visual, visual.facing);
  }
  expectCarryStrideCoverage(outboundSamples);
  await expect
    .poll(() => page.evaluate(() => window.__E2E__!.getState().activeFloorRoom))
    .toBe('back_kitchen');
  const inAnnex = await page.evaluate(() =>
    window.__E2E__!.getPlayerVisualDebug(),
  );
  if (!inAnnex) throw new Error('player visual debug is unavailable in annex');
  expectAuthoredCarryVisual(inAnnex, 'right');
  expect(inAnnex.isMoving).toBe(false);

  const returnSamples = await tapAndCaptureRoomTransition(
    page,
    { x: 0, y: door.y },
    'main',
    240,
  );
  for (const visual of returnSamples) {
    expectAuthoredCarryVisual(visual, visual.facing);
  }
  expectCarryStrideCoverage(returnSamples);
  await expect
    .poll(() => page.evaluate(() => window.__E2E__!.getState().activeFloorRoom))
    .toBe('main');
  const returned = await page.evaluate(() =>
    window.__E2E__!.getPlayerVisualDebug(),
  );
  if (!returned)
    throw new Error('player visual debug is unavailable after annex');
  expectAuthoredCarryVisual(returned, 'left');
  expect(returned.isMoving).toBe(false);
  expect(
    await page.evaluate(
      () => window.__E2E__!.getGameState().activeDay!.floor!.carriedTicketId,
    ),
  ).toBe(fixture.ticketId);
  assertNoDiagnostics(diagnostics);
});

test('switches cleanly at real plate, wrong-table, and delivery pointer boundaries', async ({
  page,
}) => {
  const diagnostics = await openRunningFloor(page, VIEWPORTS[1]);
  const fixture = await page.evaluate(() =>
    window.__E2E__!.prepareCarryInteractionBoundaryFixture(),
  );

  await expect
    .poll(() => page.evaluate(() => window.__E2E__!.getPlayerVisualDebug()))
    .toMatchObject({
      authoredCarry: false,
      plateOverlayVisible: false,
      spriteVisible: true,
      spriteAlpha: 1,
      frameWidth: 128,
      frameHeight: 160,
    });

  // Open the real station interaction, then use its real Plate control. The
  // fixture supplies only the surrounding ordered guest and completed draft.
  await tapGridCell(page, fixture.station);
  await expect(page.getByTestId('compose-sheet')).toBeVisible();
  await expect(page.getByTestId('plate-btn')).toBeEnabled();
  const pickupSamples = await captureCarryBoundary(
    page,
    { kind: 'testid', testId: 'plate-btn' },
    'carrying',
  );
  expect(pickupSamples[0]!.carriedTicketId).toBeNull();
  expect(
    pickupSamples.some((sample) => sample.carriedTicketId === fixture.ticketId),
  ).toBe(true);
  for (const sample of pickupSamples) expectValidCarryBoundarySample(sample);
  await expect(page.getByTestId('compose-sheet')).toBeHidden();

  await page.evaluate(
    (position) => window.__E2E__!.setFloorNavPosition(position),
    fixture.wrongGuest.servicePosition,
  );
  const wrongDeliverySamples = await captureCarryBoundary(
    page,
    { kind: 'grid', point: fixture.wrongGuest.seat },
    'fixed_frames',
  );
  expect(
    wrongDeliverySamples.every(
      (sample) => sample.carriedTicketId === fixture.ticketId,
    ),
    'wrong-table pointer must preserve the carried dish on every sampled frame',
  ).toBe(true);
  for (const sample of wrongDeliverySamples) {
    expectAuthoredCarryVisual(sample.visual, sample.visual.facing);
  }
  await expect(page.locator('.notice-banner-body')).toHaveText(
    'Wrong table — deliver to the matching guest',
  );

  await page.evaluate(
    (position) => window.__E2E__!.setFloorNavPosition(position),
    fixture.matchingGuest.servicePosition,
  );
  const deliverySamples = await captureCarryBoundary(
    page,
    { kind: 'grid', point: fixture.matchingGuest.seat },
    'not_carrying',
  );
  expect(deliverySamples[0]!.carriedTicketId).toBe(fixture.ticketId);
  expect(
    deliverySamples.some((sample) => sample.carriedTicketId === null),
  ).toBe(true);
  for (const sample of deliverySamples) expectValidCarryBoundarySample(sample);

  await expect(page.getByTestId('review-sheet')).toBeVisible();
  const delivered = await page.evaluate(
    ({ ticketId, matchingGuestId }) => {
      const floor = window.__E2E__!.getGameState().activeDay!.floor!;
      return {
        carriedTicketId: floor.carriedTicketId,
        ticketStatus: floor.tickets.find((ticket) => ticket.id === ticketId)
          ?.status,
        matchingGuestStage: floor.pool.find(
          (guest) => guest.id === matchingGuestId,
        )?.stage,
      };
    },
    {
      ticketId: fixture.ticketId,
      matchingGuestId: fixture.matchingGuest.guestId,
    },
  );
  expect(delivered).toEqual({
    carriedTicketId: null,
    ticketStatus: 'delivered',
    matchingGuestStage: 'eating',
  });
  assertNoDiagnostics(diagnostics);
});
