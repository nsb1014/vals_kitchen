import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

function css(rel: string): string {
  return readFileSync(new URL(rel, import.meta.url), 'utf8');
}

describe('viewport scroll containment CSS', () => {
  it('locks html/body and the game shell against page scroll chaining', () => {
    const globalCss = css('../../ui/styles/global.css');
    expect(globalCss).toMatch(
      /html,\s*body\s*\{[^}]*overflow:\s*hidden/s,
    );
    expect(globalCss).toMatch(
      /html,\s*body\s*\{[^}]*overscroll-behavior:\s*none/s,
    );
    expect(globalCss).toMatch(
      /\.game-shell\s*\{[^}]*overflow:\s*hidden/s,
    );
    expect(globalCss).toMatch(
      /\.game-shell\s*\{[^}]*overscroll-behavior:\s*none/s,
    );
    expect(globalCss).toMatch(
      /\.canvas-mount\s*\{[^}]*overflow:\s*hidden/s,
    );
  });

  it('keeps menu scroll hosts contained (not chaining to the document)', () => {
    const screens = css('../../ui/styles/screens.css');
    const service = css('../../ui/styles/service-day.css');

    expect(screens).toMatch(
      /\.shop-sections\s*\{[^}]*overscroll-behavior:\s*contain/s,
    );
    expect(screens).toMatch(
      /\.recipe-virtual-scroll\s*\{[^}]*overflow:\s*auto[^}]*overscroll-behavior:\s*contain/s,
    );
    expect(screens).toMatch(
      /\.inspector-list\s*\{[^}]*overscroll-behavior:\s*contain/s,
    );
    expect(screens).toMatch(
      /\.rating-body\s*\{[^}]*overscroll-behavior:\s*contain/s,
    );
    expect(service).toMatch(
      /\.sheet-body-scroll\s*\{[^}]*overscroll-behavior:\s*contain/s,
    );
    expect(service).toMatch(
      /\.compose-order-panel\s*\{[^}]*overscroll-behavior:\s*contain/s,
    );
  });

  it('keeps the mobile order-target panel tall enough for request bars and status', () => {
    const service = css('../../ui/styles/service-day.css');
    expect(service).not.toMatch(
      /\.compose-order-panel\s*\{[^}]*max-height:\s*3\.25rem/s,
    );
    // A rem ceiling plus minmax(0, auto) lets the pantry crush the
    // target/dish comparison. Size that row to the bars instead.
    expect(service).not.toMatch(
      /\.compose-workspace\s*\{[^}]*grid-template-rows:\s*minmax\(\s*0\s*,\s*auto\s*\)/s,
    );
    expect(service).toMatch(
      /\.compose-workspace\s*\{[^}]*grid-template-rows:\s*max-content\s+minmax\(\s*0\s*,\s*1fr\s*\)/s,
    );
    const remCaps = [
      ...service.matchAll(
        /\.compose-order-panel\s*\{[^}]*max-height:\s*([0-9.]+)rem/gs,
      ),
    ].map((match) => Number(match[1]));
    expect(remCaps).toEqual([]);
    expect(service).toMatch(
      /\.compose-order-panel\s*\{[^}]*min-height:\s*min-content/s,
    );
    expect(service).toMatch(
      /\.compose-request-axis-list\s*\{[^}]*grid-template-columns:\s*1fr/s,
    );
    expect(service).not.toMatch(
      /\.compose-request-axis-list\s*\{[^}]*overflow:\s*hidden/s,
    );
  });
});

describe('status HUD above canvas layering', () => {
  it('positions status HUD above the canvas and below overlays', () => {
    const globalCss = css('../../ui/styles/global.css');
    const appShell = readFileSync(
      new URL('../../app/AppShell.ts', import.meta.url),
      'utf8',
    );

    expect(globalCss).toMatch(
      /\.status-mount\s*\{[^}]*position:\s*relative/s,
    );
    expect(globalCss).toMatch(/\.status-mount\s*\{[^}]*z-index:\s*45/s);
    expect(globalCss).toMatch(/\.canvas-mount\s*\{[^}]*z-index:\s*1/s);
    expect(globalCss).toMatch(/\.overlay-mount\s*\{[^}]*z-index:\s*60/s);
    expect(globalCss).toMatch(/\.layout-hud\s*\{[^}]*z-index:\s*50/s);

    // Mount order in AppShell: status (top flex) then canvas, chrome, overlay, layout-hud.
    const statusIdx = appShell.indexOf("statusMount.id = 'status-mount'");
    const canvasIdx = appShell.indexOf("canvasMount.id = 'canvas-mount'");
    const appendStatus = appShell.indexOf('surface.appendChild(statusMount)');
    const appendCanvas = appShell.indexOf('surface.appendChild(canvasMount)');
    const appendOverlay = appShell.indexOf('surface.appendChild(overlayMount)');
    expect(statusIdx).toBeGreaterThan(-1);
    expect(canvasIdx).toBeGreaterThan(statusIdx);
    expect(appendStatus).toBeGreaterThan(-1);
    expect(appendCanvas).toBeGreaterThan(appendStatus);
    expect(appendOverlay).toBeGreaterThan(appendCanvas);
  });

  it('keeps the tutorial skip control above the notice/highlight stack', () => {
    const service = css('../../ui/styles/service-day.css');
    expect(service).toMatch(
      /\.tutorial-skip-host\s*\{[^}]*z-index:\s*85/s,
    );
    expect(service).toMatch(
      /\.tutorial-skip-btn\s*\{[^}]*pointer-events:\s*auto/s,
    );
  });
});
