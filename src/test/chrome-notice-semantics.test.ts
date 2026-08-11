import { describe, expect, it } from 'vitest';
import {
  BANNER_DISMISS_TABINDEX,
  celebrationAnnounceKey,
  celebrationAnnounceText,
  celebrationBannerAria,
  noticeBannerAria,
  replaceLiveRegionText,
  resolveBannerEscapeAction,
} from '../ui/components/CelebrationBanner.ts';

describe('chrome notice banner semantics', () => {
  it('exposes role=status live region for notices', () => {
    expect(noticeBannerAria('tutorial')).toEqual({
      role: 'status',
      'aria-live': 'polite',
      'aria-label': 'Tutorial',
    });
    expect(noticeBannerAria('toast').role).toBe('status');
    expect(noticeBannerAria('pacing')['aria-label']).toBe('Notice');
  });
});

describe('chrome celebration banner live region', () => {
  it('exposes role=status polite live region for celebrations', () => {
    expect(celebrationBannerAria('recipe')).toEqual({
      role: 'status',
      'aria-live': 'polite',
      'aria-atomic': 'true',
      'aria-label': 'Recipe celebration',
    });
    expect(celebrationBannerAria('achievement').role).toBe('status');
    expect(celebrationBannerAria('mastery')['aria-live']).toBe('polite');
    expect(celebrationBannerAria('prestige')['aria-label']).toBe(
      'Prestige celebration',
    );
  });

  it('re-announces each new celebration via clear-then-set text replacement', () => {
    const first = {
      kind: 'recipe' as const,
      title: 'Herb Pasta',
      body: 'Unlocked',
    };
    const second = {
      kind: 'achievement' as const,
      title: 'Regular',
      body: 'Seven days',
      achievementId: 'days-7' as const,
    };
    expect(celebrationAnnounceKey(first)).not.toBe(
      celebrationAnnounceKey(second),
    );

    const assignments: Array<string | null> = [];
    const target = {
      _text: null as string | null,
      get textContent() {
        return this._text;
      },
      set textContent(value: string | null) {
        assignments.push(value);
        this._text = value;
      },
    };

    replaceLiveRegionText(target, celebrationAnnounceText(first));
    replaceLiveRegionText(target, celebrationAnnounceText(second));

    expect(assignments).toEqual([
      '',
      'Herb Pasta. Unlocked',
      '',
      'Regular. Seven days',
    ]);
    expect(target.textContent).toBe('Regular. Seven days');
  });
});

describe('chrome banner dismiss focus order', () => {
  it('defers dismiss out of sequential Tab order (primary chrome first)', () => {
    expect(BANNER_DISMISS_TABINDEX).toBe(-1);
  });

  it('Escape dismisses front notice, then celebration, and yields when blocked', () => {
    const notice = {
      id: 'tutorial:set',
      source: 'tutorial' as const,
      body: 'Set tables',
    };
    const celebration = {
      kind: 'recipe' as const,
      title: 'Soup',
      body: 'Unlocked',
    };

    expect(
      resolveBannerEscapeAction(
        { noticeActive: notice, celebrationQueue: [celebration] },
        false,
      ),
    ).toBe('notice');
    expect(
      resolveBannerEscapeAction(
        { noticeActive: null, celebrationQueue: [celebration] },
        false,
      ),
    ).toBe('celebration');
    expect(
      resolveBannerEscapeAction(
        { noticeActive: notice, celebrationQueue: [celebration] },
        true,
      ),
    ).toBeNull();
    expect(
      resolveBannerEscapeAction(
        { noticeActive: null, celebrationQueue: [] },
        false,
      ),
    ).toBeNull();
  });
});
