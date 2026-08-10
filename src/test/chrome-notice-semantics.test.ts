import { describe, expect, it } from 'vitest';
import { noticeBannerAria } from '../ui/components/CelebrationBanner.ts';

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
