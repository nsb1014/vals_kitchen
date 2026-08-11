import type { AxisKey, Band, FlavorVector } from '../../domain/types.ts';
import {
  MAX_DISH_INGREDIENTS,
  MIN_DISH_INGREDIENTS,
} from '../../domain/state/game-state.ts';
import {
  formatRequestBandStatus,
  type RequestBandPosition,
} from './compose-request.ts';

export interface ComposeProgressModel {
  ingredientCount: number;
  minIngredients: number;
  maxIngredients: number;
  /** 0–100 fill toward the minimum plating window. */
  windowFillPct: number;
  countLabel: string;
  statusHint: string;
  statusKind: 'empty' | 'building' | 'ready' | 'full';
  coherenceInRange: number;
  coherenceTotal: number;
  coherenceLabel: string;
  coherenceKind: 'idle' | 'building' | 'partial' | 'matched';
}

export function buildComposeProgress(input: {
  ingredientCount: number;
  requestedBands: Partial<Record<AxisKey, Band>>;
  profile: FlavorVector | null;
  minIngredients?: number;
  maxIngredients?: number;
}): ComposeProgressModel {
  const minIngredients = input.minIngredients ?? MIN_DISH_INGREDIENTS;
  const maxIngredients = input.maxIngredients ?? MAX_DISH_INGREDIENTS;
  const count = input.ingredientCount;
  const windowFillPct = Math.min(
    100,
    Math.round((count / minIngredients) * 100),
  );
  const countLabel = `${count} / ${maxIngredients}`;

  let statusKind: ComposeProgressModel['statusKind'];
  let statusHint: string;
  if (count === 0) {
    statusKind = 'empty';
    statusHint = `Pick ${minIngredients}–${maxIngredients} ingredients`;
  } else if (count < minIngredients) {
    statusKind = 'building';
    const need = minIngredients - count;
    statusHint = `Add ${need} more to plate`;
  } else if (count < maxIngredients) {
    statusKind = 'ready';
    statusHint = `In plating window · ${count} of ${maxIngredients}`;
  } else {
    statusKind = 'full';
    statusHint = `At capacity · ${maxIngredients} ingredients`;
  }

  const axes = Object.keys(input.requestedBands) as AxisKey[];
  const coherenceTotal = axes.length;
  let coherenceInRange = 0;
  if (input.profile && coherenceTotal > 0) {
    for (const axis of axes) {
      const band = input.requestedBands[axis];
      if (!band) continue;
      const status = formatRequestBandStatus(input.profile[axis], band);
      if (status.position === 'in-range') coherenceInRange += 1;
    }
  }

  let coherenceKind: ComposeProgressModel['coherenceKind'] = 'idle';
  let coherenceLabel: string;
  if (coherenceTotal === 0) {
    coherenceLabel = 'No pinned request axes';
  } else if (count === 0) {
    coherenceKind = 'idle';
    coherenceLabel = `0 / ${coherenceTotal} flavors in range`;
  } else if (coherenceInRange === coherenceTotal) {
    coherenceKind = 'matched';
    coherenceLabel = `All ${coherenceTotal} request flavors in range`;
  } else if (coherenceInRange === 0) {
    coherenceKind = 'building';
    coherenceLabel = `0 / ${coherenceTotal} flavors in range`;
  } else {
    coherenceKind = 'partial';
    coherenceLabel = `${coherenceInRange} / ${coherenceTotal} flavors in range`;
  }

  return {
    ingredientCount: count,
    minIngredients,
    maxIngredients,
    windowFillPct,
    countLabel,
    statusHint,
    statusKind,
    coherenceInRange,
    coherenceTotal,
    coherenceLabel,
    coherenceKind,
  };
}

export function composeProgressMeterHtml(
  model: ComposeProgressModel,
  escapeHtml: (text: string) => string,
): string {
  return `<div class="compose-progress" data-testid="compose-progress" data-status="${model.statusKind}" data-coherence="${model.coherenceKind}">
    <div class="compose-progress-count">
      <strong data-testid="compose-progress-count">${escapeHtml(model.countLabel)}</strong>
      <span class="compose-progress-hint" data-testid="compose-progress-hint">${escapeHtml(model.statusHint)}</span>
    </div>
    <div class="compose-progress-track" aria-hidden="true">
      <span class="compose-progress-fill" style="width:${model.windowFillPct}%"></span>
      <span class="compose-progress-window-mark" style="left:${(model.minIngredients / model.maxIngredients) * 100}%"></span>
    </div>
    <p class="compose-progress-coherence" data-testid="compose-progress-coherence" aria-live="polite">${escapeHtml(model.coherenceLabel)}</p>
  </div>`;
}

export type { RequestBandPosition };
