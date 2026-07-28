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
 * Resolve the customer’s optimal flavor vector. Generated requests always store
 * the witness aggregate; this backfills older saves / incomplete fixtures.
 */
export function resolveIdealFlavorProfile(preference: CustomerPreference): FlavorVector {
  if (preference.idealProfile) {
    return preference.idealProfile;
  }
  const profile = emptyFlavorProfile();
  for (const axis of AXIS_KEYS) {
    const band = preference.primary[axis];
    if (band) profile[axis] = BAND_TARGET[band];
    else if (preference.avoid[axis]) profile[axis] = BAND_TARGET.low;
  }
  return profile;
}
