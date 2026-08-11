import { describe, expect, it } from 'vitest';
import { emptyFlavorProfile } from '../domain/flavor/axis-labels.ts';
import {
  buildFlavorBarsViewModel,
  IDEAL_FLAVOR_GROUP_ORDER,
  renderFlavorBarsHtml,
} from '../ui/presentation/flavor-profile.ts';
import { FLAVOR_INSPECTOR_LONG_PRESS_HINT } from '../ui/components/FlavorInspectorPanel.ts';

describe('cooking ideal aroma + inspector hint', () => {
  it('renders aroma group above taste for Ideal fold priority', () => {
    const profile = emptyFlavorProfile();
    profile.UM = 8;
    profile.HE = 6;
    profile.RI = 4;
    const html = renderFlavorBarsHtml(buildFlavorBarsViewModel(profile), {
      showValues: true,
      showZeroValues: true,
      groupOrder: IDEAL_FLAVOR_GROUP_ORDER,
    });
    const aromaAt = html.indexOf('Aroma');
    const tasteAt = html.indexOf('Basic Tastes');
    const mouthfeelAt = html.indexOf('Mouthfeel');
    expect(aromaAt).toBeGreaterThanOrEqual(0);
    expect(tasteAt).toBeGreaterThan(aromaAt);
    expect(mouthfeelAt).toBeGreaterThan(tasteAt);
  });

  it('exposes a long-press discoverability hint string', () => {
    expect(FLAVOR_INSPECTOR_LONG_PRESS_HINT.toLowerCase()).toContain('long-press');
  });
});
