import type { AxisKey, Band } from '../types.ts';
import { AXIS_KEYS } from '../types.ts';

/** Canonical axis display names — Flavors tab, customer requests, and ticket ideal view. */
export const AXIS_LABELS: Record<AxisKey, string> = {
  SW: 'Sweet',
  SA: 'Salty',
  SO: 'Sour',
  BI: 'Bitter',
  UM: 'Umami',
  HE: 'Herbal',
  FR: 'Fruity',
  EA: 'Earthy',
  SM: 'Smoky',
  PU: 'Pungent',
  NU: 'Nutty',
  RI: 'Rich',
  LI: 'Light',
  HT: 'Heat',
  CR: 'Crunch',
};

export function axisLabel(axis: AxisKey): string {
  return AXIS_LABELS[axis];
}

/** Request phrases use the same labels as the Flavors tab. */
export function phraseForAxisBand(axis: AxisKey, band: Band): string {
  const label = AXIS_LABELS[axis];
  if (band === 'high') return `high ${label}`;
  if (band === 'mid') return `moderate ${label}`;
  return `low ${label}`;
}

export function phraseForAvoidAxis(axis: AxisKey): string {
  return `low ${AXIS_LABELS[axis]}`;
}

export function emptyFlavorProfile(): Record<AxisKey, number> & { TE: -1 | 0 | 1 } {
  const profile = {} as Record<AxisKey, number> & { TE: -1 | 0 | 1 };
  for (const axis of AXIS_KEYS) {
    profile[axis] = 0;
  }
  profile.TE = 0;
  return profile;
}
