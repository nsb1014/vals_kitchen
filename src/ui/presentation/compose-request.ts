import type { Band } from '../../domain/types.ts';

export type RequestBandPosition = 'below' | 'in-range' | 'above';

/** Inclusive flavor band ranges on the 0–10 witness scale. */
export function requestBandRange(band: Band): { min: number; max: number } {
  if (band === 'low') return { min: 0, max: 3 };
  if (band === 'mid') return { min: 3, max: 7 };
  return { min: 6, max: 10 };
}

export function requestBandPosition(
  value: number,
  band: Band,
): RequestBandPosition {
  const { min, max } = requestBandRange(band);
  if (value < min) return 'below';
  if (value > max) return 'above';
  return 'in-range';
}

export function requestBandPositionLabel(position: RequestBandPosition): string {
  if (position === 'in-range') return 'In range';
  return position === 'below' ? 'Below request' : 'Above request';
}

/** How far the dish sits outside the requested band (null when in range). */
export function requestBandDelta(value: number, band: Band): number | null {
  const { min, max } = requestBandRange(band);
  if (value < min) return Number((min - value).toFixed(1));
  if (value > max) return Number((value - max).toFixed(1));
  return null;
}

export function formatRequestBandStatus(
  value: number,
  band: Band,
): { position: RequestBandPosition; label: string; deltaText: string | null } {
  const position = requestBandPosition(value, band);
  const label = requestBandPositionLabel(position);
  const delta = requestBandDelta(value, band);
  if (delta === null) {
    return { position, label, deltaText: null };
  }
  const signed = position === 'below' ? `+${delta.toFixed(1)}` : `+${delta.toFixed(1)}`;
  return { position, label, deltaText: signed };
}

/** CSS left/width percents for shading the accepted band on a 0–10 meter. */
export function requestBandShadePercents(band: Band): {
  leftPct: number;
  widthPct: number;
} {
  const { min, max } = requestBandRange(band);
  return {
    leftPct: min * 10,
    widthPct: Math.max(0, (max - min) * 10),
  };
}
