import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildPwaBannerCopy,
  isIosSafari,
  PWA_A2HS_MIN_DAY,
  shouldShowA2hsNudge,
} from '../ui/notifications/pwa-status.ts';
import { MOUNTED_META_SCREENS } from '../app/screenRouter.ts';

describe('chrome pwa + mounted screens', () => {
  it('ships a dev-reachable web manifest link in index.html', () => {
    const html = readFileSync(path.resolve('index.html'), 'utf8');
    expect(html).toContain('rel="manifest"');
    expect(html).toContain('manifest.webmanifest');
    expect(html).not.toMatch(/user-scalable\s*=\s*no/i);

    const manifest = JSON.parse(
      readFileSync(path.resolve('public/manifest.webmanifest'), 'utf8'),
    ) as { name: string; display: string };
    expect(manifest.name).toContain("Val's Kitchen");
    expect(manifest.display).toBe('standalone');
  });

  it('registers shop and rating as mounted meta screens', () => {
    expect(MOUNTED_META_SCREENS).toContain('shop');
    expect(MOUNTED_META_SCREENS).toContain('rating');
    expect(MOUNTED_META_SCREENS).toContain('settings');
  });

  it('gates iOS A2HS nudge after day 3 when not standalone', () => {
    expect(PWA_A2HS_MIN_DAY).toBe(3);
    expect(
      shouldShowA2hsNudge({
        day: 2,
        dismissed: false,
        ios: true,
        standalone: false,
      }),
    ).toBe(false);
    expect(
      shouldShowA2hsNudge({
        day: 3,
        dismissed: false,
        ios: true,
        standalone: false,
      }),
    ).toBe(true);
    expect(
      shouldShowA2hsNudge({
        day: 9,
        dismissed: true,
        ios: true,
        standalone: false,
      }),
    ).toBe(false);
    expect(buildPwaBannerCopy('a2hs').body).toMatch(/Home Screen/i);
    expect(buildPwaBannerCopy('offline').body).toMatch(/offline/i);
    expect(buildPwaBannerCopy('update').body).toMatch(/reload/i);
  });

  it('detects iOS Safari user agents for A2HS', () => {
    expect(
      isIosSafari(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
      ),
    ).toBe(true);
    expect(
      isIosSafari(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120.0.0.0 Mobile/15E148 Safari/604.1',
      ),
    ).toBe(false);
  });
});
