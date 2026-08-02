import { expect, test, type Page } from '@playwright/test';
import {
  assertNoDiagnostics,
  gotoFreshGame,
  navigateToScreen,
  type PageDiagnostics,
} from './helpers.ts';
import {
  guestSitFrameKey,
  guestVariant,
} from '../../src/canvas/world/character-frames.ts';
import { TILE_PX } from '../../src/canvas/coordinates.ts';
import { seatSitWorldPosition } from '../../src/canvas/world/seat-sit.ts';
import {
  doorForGrid,
  STARTER_DOOR,
} from '../../src/domain/floor/starter-map.ts';

const VIEWPORTS = [
  { name: 'mobile', width: 390, height: 844, expanded: false },
  { name: 'desktop-expanded', width: 1280, height: 800, expanded: true },
] as const;

type DoorwayDebug = NonNullable<
  ReturnType<NonNullable<Window['__E2E__']>['getGuestDoorwayTransitionDebug']>
>;
type SeatingGuestDebug = NonNullable<
  ReturnType<NonNullable<Window['__E2E__']>['getSeatingSceneDebug']>
>['guests'][number];

const ACTOR_FACING_BY_SEAT = {
  0: 'down',
  90: 'right',
  180: 'up',
  270: 'left',
} as const;

interface DoorwaySample {
  debug: DoorwayDebug;
  cash: number;
  rating: number;
  ticketCount: number;
  heldGuest?: {
    stage: DoorwayDebug['stage'];
    seat: {
      x: number;
      y: number;
      facing: 0 | 90 | 180 | 270;
      tablePlacementId: string;
      slotIndex: number;
    } | null;
    visual: SeatingGuestDebug | null;
  };
}

const MAX_RAF_VISIBILITY_DELTA = 0.26;

async function openDayBeforeService(
  page: Page,
  viewport: { width: number; height: number },
  expanded: boolean,
): Promise<{
  diagnostics: PageDiagnostics;
  enteringGuestId: string;
  gridSize: { w: number; h: number };
}> {
  await page.setViewportSize(viewport);
  const diagnostics = await gotoFreshGame(page);
  if (expanded) {
    await page.evaluate(() =>
      window.__E2E__!.dispatch({
        type: 'PURCHASE',
        purchase: { type: 'grid_expansion' },
      }),
    );
  }
  await page.getByTestId('open-day-btn').click();
  await expect(page.getByTestId('modifier-sheet')).toBeVisible();
  const fixture = await page.evaluate(() => {
    const entering = window.__E2E__!
      .getGameState()
      .activeDay!.floor!.pool.find((guest) => guest.stage === 'entering');
    if (!entering) throw new Error('expected the canonical first arrival');
    return {
      enteringGuestId: entering.id,
      gridSize: { ...window.__E2E__!.getGameState().gridSize },
    };
  });
  return { diagnostics, ...fixture };
}

async function sampleDoorway(
  page: Page,
  guestId: string,
  terminalStage: 'waiting' | 'done',
  heldGuestId?: string,
): Promise<DoorwaySample[]> {
  return page.evaluate(
    ({ id, terminal, heldId }) => {
      const bridge = window.__E2E__!;
      const samples: DoorwaySample[] = [];
      const deadline = performance.now() + 15_000;
      let sawTerminal = false;

      const push = (debug: DoorwayDebug) => {
        const state = bridge.getGameState();
        const heldDomain = heldId
          ? state.activeDay?.floor?.pool.find((guest) => guest.id === heldId)
          : undefined;
        const heldVisual = heldId
          ? bridge
              .getSeatingSceneDebug()
              ?.guests.find((guest) => guest.guestId === heldId) ?? null
          : null;
        samples.push({
          debug,
          cash: state.cash,
          rating: state.rating,
          ticketCount: state.activeDay?.floor?.tickets.length ?? 0,
          ...(heldId
            ? {
                heldGuest: {
                  stage: heldDomain?.stage ?? null,
                  seat: heldDomain?.seat ? { ...heldDomain.seat } : null,
                  visual: heldVisual,
                },
              }
            : {}),
        });
      };

      return new Promise<DoorwaySample[]>((resolve, reject) => {
        const sample = () => {
          const debug = bridge.getGuestDoorwayTransitionDebug(id);
          if (!debug) {
            reject(new Error('restaurant app omitted doorway debug'));
            return;
          }
          push(debug);
          sawTerminal ||= debug.stage === terminal;
          const arrivalSettled =
            terminal === 'waiting' &&
            sawTerminal &&
            debug.guest != null &&
            debug.guest.doorwayCrop == null;
          const departureCleared =
            terminal === 'done' &&
            sawTerminal &&
            debug.guest == null &&
            !debug.door.requestedOpen &&
            !debug.door.paintedOpen &&
            debug.exitLingerRemainingMs === 0;
          if (arrivalSettled || departureCleared) {
            resolve(samples);
            return;
          }
          if (performance.now() >= deadline) {
            reject(
              new Error(
                `doorway transition did not settle: ${JSON.stringify(debug)}`,
              ),
            );
            return;
          }
          requestAnimationFrame(sample);
        };
        requestAnimationFrame(sample);
      });
    },
    { id: guestId, terminal: terminalStage, heldId: heldGuestId },
  );
}

async function startServiceAndSampleArrival(
  page: Page,
  guestId: string,
): Promise<DoorwaySample[]> {
  return page.evaluate(async (id) => {
    const bridge = window.__E2E__!;
    const samples: DoorwaySample[] = [];
    const deadline = performance.now() + 15_000;
    const push = (debug: DoorwayDebug) => {
      const state = bridge.getGameState();
      samples.push({
        debug,
        cash: state.cash,
        rating: state.rating,
        ticketCount: state.activeDay?.floor?.tickets.length ?? 0,
      });
    };

    // The click, synchronous fraction-zero capture, and first rAF sample all
    // remain in this browser task. No Playwright round trip can consume the
    // first doorway frames or exempt the initial continuity delta.
    push(await bridge.startServiceAndCaptureGuestDoorwayFrame(id));
    return new Promise<DoorwaySample[]>((resolve, reject) => {
      const sample = () => {
        const debug = bridge.getGuestDoorwayTransitionDebug(id);
        if (!debug) {
          reject(new Error('restaurant app omitted arrival doorway debug'));
          return;
        }
        push(debug);
        if (debug.stage === 'waiting' && debug.guest?.doorwayCrop == null) {
          resolve(samples);
          return;
        }
        if (performance.now() >= deadline) {
          reject(new Error(`arrival did not settle: ${JSON.stringify(debug)}`));
          return;
        }
        requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    });
  }, guestId);
}

async function startServiceAndPauseAtPartial(
  page: Page,
  guestId: string,
): Promise<{
  immediate: DoorwayDebug;
  beforePause: DoorwayDebug;
  paused: DoorwayDebug;
}> {
  return page.evaluate(async (id) => {
    const bridge = window.__E2E__!;
    const immediate = await bridge.startServiceAndCaptureGuestDoorwayFrame(id);
    const deadline = performance.now() + 10_000;
    return new Promise((resolve, reject) => {
      const inspect = () => {
        const beforePause = bridge.getGuestDoorwayTransitionDebug(id);
        if (!beforePause) {
          reject(new Error('restaurant app omitted partial doorway debug'));
          return;
        }
        const fraction = beforePause.guest?.doorwayCrop?.visibleFraction;
        if (fraction != null && fraction > 0 && fraction < 1) {
          const settings = document.querySelector<HTMLButtonElement>(
            '[data-testid="hud-settings"]',
          );
          if (!settings) {
            reject(new Error('settings control is unavailable during service'));
            return;
          }
          settings.click();
          queueMicrotask(() => {
            const paused = bridge.getGuestDoorwayTransitionDebug(id);
            if (!paused) {
              reject(new Error('doorway debug disappeared after UI pause'));
              return;
            }
            resolve({ immediate, beforePause, paused });
          });
          return;
        }
        if (performance.now() >= deadline) {
          reject(new Error(`arrival never reached a partial frame: ${JSON.stringify(beforePause)}`));
          return;
        }
        requestAnimationFrame(inspect);
      };
      requestAnimationFrame(inspect);
    });
  }, guestId);
}

function expectSameDoorwayPaint(
  actual: DoorwayDebug,
  expected: DoorwayDebug,
): void {
  expect(actual.stage).toBe(expected.stage);
  expect(actual.guest?.requestedFrameKey).toBe(
    expected.guest?.requestedFrameKey,
  );
  expect(actual.guest?.actualBoundFrameKey).toBe(
    expected.guest?.actualBoundFrameKey,
  );
  expect(actual.guest?.textureMatchesActualBoundFrame).toBe(true);
  expect(actual.guest?.feet).toEqual(expected.guest?.feet);
  expect(actual.guest?.doorwayCrop).toEqual(expected.guest?.doorwayCrop);
  expect(actual.guest?.actualMaskWorldBounds).toEqual(
    expected.guest?.actualMaskWorldBounds,
  );
  expect(actual.door).toEqual(expected.door);
  expect(actual.authoritativeOpen).toBe(expected.authoritativeOpen);
}

function visibleFraction(sample: DoorwaySample): number {
  const guest = sample.debug.guest;
  if (!guest) return 0;
  return guest.doorwayCrop?.visibleFraction ?? 1;
}

function expectStableCamera(samples: DoorwaySample[]): void {
  const first = samples[0]!.debug.camera;
  for (const sample of samples) {
    const camera = sample.debug.camera;
    expect(Math.abs(camera.x - first.x)).toBeLessThanOrEqual(0.01);
    expect(Math.abs(camera.y - first.y)).toBeLessThanOrEqual(0.01);
    expect(Math.abs(camera.scale - first.scale)).toBeLessThanOrEqual(0.001);
    expect(Math.abs(camera.stageOffsetX - first.stageOffsetX)).toBeLessThanOrEqual(0.01);
    expect(Math.abs(camera.stageOffsetY - first.stageOffsetY)).toBeLessThanOrEqual(0.01);
  }
}

function expectExactAuthoredWalkFrames(
  samples: DoorwaySample[],
  guestId: string,
): void {
  const variant = guestVariant(guestId);
  for (const sample of samples) {
    const guest = sample.debug.guest;
    if (!guest || !guest.visible) continue;
    expect(guest.alpha).toBe(1);
    const crossing = guest.isMoving || guest.doorwayCrop != null;
    const expected = crossing
      ? new RegExp(`^guest_${variant}_${guest.facing}_[0-2]$`)
      : new RegExp(
          `^guest_${variant}(?:_sit_${guest.facing}|_${guest.facing}_0)$`,
        );
    expect(guest.requestedFrameKey).toMatch(expected);
    expect(guest.actualBoundFrameKey).toBe(guest.requestedFrameKey);
    expect(guest.textureMatchesActualBoundFrame).toBe(true);
  }
}

function expectDoorOpenDuringThreshold(samples: DoorwaySample[]): void {
  const thresholdSamples = samples.filter((sample) => {
    const crop = sample.debug.guest?.doorwayCrop;
    return crop != null || sample.debug.exitLingerRemainingMs > 0;
  });
  expect(thresholdSamples.length).toBeGreaterThan(0);
  for (const sample of thresholdSamples) {
    expect(sample.debug.authoritativeOpen).toBe(true);
    expect(sample.debug.door.requestedOpen).toBe(true);
    expect(sample.debug.door.paintedOpen).toBe(true);
    expect(sample.debug.door.spriteCount).toBeGreaterThan(0);
  }
}

function expectCropGeometry(samples: DoorwaySample[]): void {
  for (const sample of samples) {
    const crop = sample.debug.guest?.doorwayCrop;
    if (!crop) continue;
    expect(crop.progress).toBeGreaterThanOrEqual(0);
    expect(crop.progress).toBeLessThanOrEqual(1);
    expect(crop.visibleFraction).toBeGreaterThanOrEqual(0);
    expect(crop.visibleFraction).toBeLessThanOrEqual(1);
    expect(Number.isFinite(crop.apertureWorldY)).toBe(true);
    expect(Number.isFinite(crop.visualOffsetY)).toBe(true);
    expect(crop.maskApplied).toBe(true);
    if (crop.visibleFraction === 0) {
      expect(crop.clippedWorldBounds).toBeNull();
      expect(sample.debug.guest?.actualMaskWorldBounds).toBeNull();
      expect(crop.contentRenderable).toBe(false);
      continue;
    }
    expect(crop.contentRenderable).toBe(true);
    expect(crop.clippedWorldBounds).not.toBeNull();
    const unclippedHeight =
      crop.unclippedWorldBounds.bottom - crop.unclippedWorldBounds.top;
    const clippedHeight =
      crop.clippedWorldBounds!.bottom - crop.clippedWorldBounds!.top;
    expect(clippedHeight).toBeGreaterThan(0);
    expect(clippedHeight).toBeLessThanOrEqual(unclippedHeight + 0.01);
    expect(crop.clippedWorldBounds!.bottom).toBeCloseTo(
      crop.apertureWorldY,
      5,
    );
    expect(sample.debug.guest?.actualMaskWorldBounds).not.toBeNull();
    expect(sample.debug.guest!.actualMaskWorldBounds!.left).toBeCloseTo(
      crop.clippedWorldBounds!.left,
      5,
    );
    expect(sample.debug.guest!.actualMaskWorldBounds!.top).toBeCloseTo(
      crop.clippedWorldBounds!.top,
      5,
    );
    expect(sample.debug.guest!.actualMaskWorldBounds!.right).toBeCloseTo(
      crop.clippedWorldBounds!.right,
      5,
    );
    expect(sample.debug.guest!.actualMaskWorldBounds!.bottom).toBeCloseTo(
      crop.apertureWorldY,
      5,
    );
  }
}

function expectSmoothFractions(
  samples: DoorwaySample[],
  direction: 'arrival' | 'departure',
): void {
  const fractions = samples.map(visibleFraction);
  const partials = fractions.filter((fraction) => fraction > 0 && fraction < 1);
  expect(new Set(partials.map((fraction) => fraction.toFixed(4))).size).toBeGreaterThanOrEqual(3);
  for (let index = 1; index < fractions.length; index += 1) {
    const previous = fractions[index - 1]!;
    const current = fractions[index]!;
    if (direction === 'arrival') {
      expect(current + 0.0001).toBeGreaterThanOrEqual(previous);
    } else {
      expect(current - 0.0001).toBeLessThanOrEqual(previous);
    }
    expect(Math.abs(current - previous)).toBeLessThanOrEqual(
      MAX_RAF_VISIBILITY_DELTA,
    );
  }
}

for (const viewport of VIEWPORTS) {
  test(`reveals arrivals and clears departures through one stable guest door at ${viewport.name}`, async ({
    page,
  }) => {
    const { diagnostics, enteringGuestId, gridSize } = await openDayBeforeService(
      page,
      viewport,
      viewport.expanded,
    );
    const beforeService = await page.evaluate((guestId) =>
      window.__E2E__!.getGuestDoorwayTransitionDebug(guestId),
    enteringGuestId);
    expect(beforeService).not.toBeNull();
    expect(beforeService!.guest).toBeNull();
    expect(beforeService!.door.requestedOpen).toBe(false);
    expect(beforeService!.door.paintedOpen).toBe(false);
    expect(beforeService!.authoritativeOpen).toBe(false);

    const expectedDoor = doorForGrid(gridSize.w, gridSize.h, { room: 'main' });
    if (viewport.expanded) {
      expect(expectedDoor.y).toBeGreaterThan(STARTER_DOOR.y);
    }
    const arrival = await startServiceAndSampleArrival(page, enteringGuestId);
    const immediateArrival = arrival[0]!.debug;
    expect(immediateArrival.stage).toBe('entering');
    expect(immediateArrival.door.cell).toEqual(expectedDoor);
    expect(immediateArrival.guest?.doorwayCrop?.visibleFraction).toBe(0);
    expect(immediateArrival.guest?.doorwayCrop?.maskApplied).toBe(true);
    expect(immediateArrival.guest?.doorwayCrop?.contentRenderable).toBe(false);
    expect(immediateArrival.authoritativeOpen).toBe(true);
    expect(immediateArrival.door.requestedOpen).toBe(true);
    expect(immediateArrival.door.paintedOpen).toBe(true);
    await expect(page.getByTestId('floor-service-panel')).toBeVisible();
    const arrivalFractions = arrival.map(visibleFraction);
    const firstArrivalPartial = arrivalFractions.findIndex(
      (fraction) => fraction > 0 && fraction < 1,
    );
    const firstArrivalFull = arrivalFractions.findIndex((fraction) => fraction === 1);
    expect(arrivalFractions).toContain(0);
    expect(firstArrivalPartial).toBeGreaterThan(arrivalFractions.indexOf(0));
    expect(firstArrivalFull).toBeGreaterThan(firstArrivalPartial);
    expect(arrival.at(-1)!.debug.stage).toBe('waiting');
    expect(arrival.at(-1)!.debug.guest?.doorwayCrop).toBeNull();
    expect(arrival.at(-1)!.debug.authoritativeOpen).toBe(false);
    expect(arrival.at(-1)!.debug.door.requestedOpen).toBe(false);
    expect(arrival.at(-1)!.debug.door.paintedOpen).toBe(false);
    expect(arrival.at(-1)!.debug.exitLingerRemainingMs).toBe(0);
    expectSmoothFractions(arrival, 'arrival');
    expectExactAuthoredWalkFrames(arrival, enteringGuestId);
    expectDoorOpenDuringThreshold(arrival);
    expectCropGeometry(arrival);
    expectStableCamera(arrival);

    const departureFixture = await page.evaluate(() =>
      window.__E2E__!.prepareQueuedDepartureVisualFixture(),
    );
    const beforeDeparture = await page.evaluate((guestId) =>
      window.__E2E__!.getGuestDoorwayTransitionDebug(guestId),
    departureFixture.firstGuestId);
    expect(beforeDeparture?.guest).not.toBeNull();
    const gameplayBaseline = {
      cash: arrival.at(-1)!.cash,
      rating: arrival.at(-1)!.rating,
      ticketCount: 0,
    };
    const departure = await sampleDoorway(
      page,
      departureFixture.firstGuestId,
      'done',
      departureFixture.heldGuestId,
    );
    const departureFractions = departure.map(visibleFraction);
    const firstDeparturePartial = departureFractions.findIndex(
      (fraction) => fraction > 0 && fraction < 1,
    );
    const firstDepartureZeroAfterPartial = departureFractions.findIndex(
      (fraction, index) => index > firstDeparturePartial && fraction === 0,
    );
    expect(departureFractions[0]).toBe(1);
    expect(firstDeparturePartial).toBeGreaterThan(0);
    expect(firstDepartureZeroAfterPartial).toBeGreaterThan(firstDeparturePartial);
    expect(departure.at(-1)!.debug.stage).toBe('done');
    expect(departure.at(-1)!.debug.guest).toBeNull();
    expect(departure.at(-1)!.debug.door.paintedOpen).toBe(false);
    expect(
      departure.some(
        (sample) =>
          sample.debug.stage === 'done' &&
          sample.debug.exitLingerRemainingMs > 0 &&
          sample.debug.door.paintedOpen,
      ),
      'the open door should outlive the logical zero-visibility threshold',
    ).toBe(true);
    expectSmoothFractions(departure, 'departure');
    expectExactAuthoredWalkFrames(departure, departureFixture.firstGuestId);
    expectDoorOpenDuringThreshold(departure);
    expectCropGeometry(departure);
    expectStableCamera(departure);

    const heldSitKey = guestSitFrameKey(
      guestVariant(departureFixture.heldGuestId),
      ACTOR_FACING_BY_SEAT[departureFixture.heldSeat.facing],
    );
    const heldSit = seatSitWorldPosition(departureFixture.heldSeat);
    const heldFeet = {
      x: Math.round(heldSit.x),
      y: Math.round(heldSit.y + TILE_PX / 2 - 2),
    };
    const beforeFirstDone = departure.filter(
      (sample) => sample.debug.stage !== 'done',
    );
    expect(beforeFirstDone.length).toBeGreaterThan(0);
    for (const sample of beforeFirstDone) {
      expect(sample.heldGuest?.stage).toBe('leaving');
      expect(sample.heldGuest?.seat).toEqual(departureFixture.heldSeat);
      expect(sample.heldGuest?.visual).toMatchObject({
        guestId: departureFixture.heldGuestId,
        tablePlacementId: departureFixture.heldSeat.tablePlacementId,
        slotIndex: departureFixture.heldSeat.slotIndex,
        seatFacing: departureFixture.heldSeat.facing,
        isSeated: true,
        isMoving: false,
        requestedFrameKey: heldSitKey,
        actualBoundFrameKey: heldSitKey,
        facing: ACTOR_FACING_BY_SEAT[departureFixture.heldSeat.facing],
        feet: heldFeet,
      });
    }

    for (const sample of departure) {
      expect({
        cash: sample.cash,
        rating: sample.rating,
        ticketCount: sample.ticketCount,
      }).toEqual(gameplayBaseline);
    }
    const finalState = await page.evaluate(() =>
      window.__E2E__!.getGameState().activeDay!.floor!,
    );
    expect(
      finalState.pool.find((guest) => guest.id === departureFixture.firstGuestId)?.stage,
    ).toBe('done');

    assertNoDiagnostics(diagnostics);
  });
}

test('preserves a real partial doorway frame across paused resize and store repaint independently', async ({
  page,
}) => {
  const initialViewport = { width: 390, height: 844 };
  const resizedViewport = { width: 430, height: 760 };
  const { diagnostics, enteringGuestId } = await openDayBeforeService(
    page,
    initialViewport,
    false,
  );
  const pausedTransition = await startServiceAndPauseAtPartial(
    page,
    enteringGuestId,
  );
  expect(pausedTransition.immediate.guest?.doorwayCrop?.visibleFraction).toBe(0);
  const pausedFraction =
    pausedTransition.paused.guest?.doorwayCrop?.visibleFraction;
  expect(pausedFraction).toBeGreaterThan(0);
  expect(pausedFraction).toBeLessThan(1);
  expectSameDoorwayPaint(
    pausedTransition.paused,
    pausedTransition.beforePause,
  );
  expectCropGeometry([
    {
      debug: pausedTransition.paused,
      cash: 0,
      rating: 0,
      ticketCount: 0,
    },
  ]);
  await expect(page.getByTestId('settings-screen')).toBeVisible();

  // This is a real browser/container resize performed from Playwright while
  // the Settings UI has paused simulation. Inspect it before any store repaint
  // can reconstruct or heal actor state.
  await page.setViewportSize(resizedViewport);
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );
  expect(page.viewportSize()).toEqual(resizedViewport);
  const afterResize = await page.evaluate((guestId) =>
    window.__E2E__!.getGuestDoorwayTransitionDebug(guestId),
  enteringGuestId);
  expect(afterResize).not.toBeNull();
  expectSameDoorwayPaint(afterResize!, pausedTransition.paused);
  expectCropGeometry([
    { debug: afterResize!, cash: 0, rating: 0, ticketCount: 0 },
  ]);

  const beforeStoreRepaint = afterResize!;
  const afterStoreRepaint = await page.evaluate((guestId) => {
    window.__E2E__!.repaintRestaurantFromStoreForTest();
    return window.__E2E__!.getGuestDoorwayTransitionDebug(guestId);
  }, enteringGuestId);
  expect(afterStoreRepaint).not.toBeNull();
  expectSameDoorwayPaint(afterStoreRepaint!, beforeStoreRepaint);
  expect(afterStoreRepaint!.camera).toEqual(beforeStoreRepaint.camera);
  expectCropGeometry([
    { debug: afterStoreRepaint!, cash: 0, rating: 0, ticketCount: 0 },
  ]);

  await navigateToScreen(page, 'restaurant');
  const resumed = await sampleDoorway(page, enteringGuestId, 'waiting');
  expect(resumed.at(-1)!.debug.stage).toBe('waiting');
  expect(resumed.at(-1)!.debug.guest?.doorwayCrop).toBeNull();
  expect(resumed.at(-1)!.debug.door.paintedOpen).toBe(false);
  assertNoDiagnostics(diagnostics);
});
