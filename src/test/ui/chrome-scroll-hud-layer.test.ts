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
