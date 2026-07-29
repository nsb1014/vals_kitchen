import { emptyFlavorProfile } from '../../domain/flavor/axis-labels.ts';
import type { CustomerPreference, FlavorVector } from '../../domain/types.ts';
import { AXIS_KEYS } from '../../domain/types.ts';

/** Midpoints for bands — used only when a save lacks idealProfile. */
const BAND_TARGET: Record<'low' | 'mid' | 'high', number> = {
  low: 2,
  mid: 5,
  high: 8,
};

/**
 * Resolve only the axes that affect this request's score. Generated requests
 * store an achievable aggregate witness; older saves use the full-credit band
 * targets. Unrequested witness flavors stay hidden so "Ideal" matches scoring.
 */
export function resolveIdealFlavorProfile(preference: CustomerPreference): FlavorVector {
  const profile = emptyFlavorProfile();
  for (const axis of AXIS_KEYS) {
    const band = preference.primary[axis];
    if (band) {
      profile[axis] = preference.idealProfile?.[axis] ?? BAND_TARGET[band];
    } else if (preference.avoid[axis]) {
      profile[axis] = preference.idealProfile?.[axis] ?? BAND_TARGET.low;
    }
  }
  return profile;
}
