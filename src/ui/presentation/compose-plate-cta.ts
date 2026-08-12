import {
  MAX_DISH_INGREDIENTS,
  MIN_DISH_INGREDIENTS,
} from '../../domain/state/game-state.ts';

/** Stable 1-based table label from seat placement id + ordered table ids. */
export function formatGuestTableLabel(input: {
  tablePlacementId: string | undefined | null;
  tablePlacementIds: readonly string[];
}): string | null {
  const id = input.tablePlacementId;
  if (!id) return null;
  const index = input.tablePlacementIds.indexOf(id);
  if (index < 0) return null;
  return `Table ${index + 1}`;
}

export interface ComposePlateCtaModel {
  /** Visible primary action label (kept even when disabled). */
  label: string;
  /** Inline reason when Plate is disabled; null when enabled. */
  disabledReason: string | null;
  canPlate: boolean;
}

/**
 * Presentation-only Plate CTA copy. Does not change plating rules — callers
 * still gate on valid 3–6 counts + selected ticket.
 */
export function buildComposePlateCta(input: {
  hasTicket: boolean;
  ingredientCount: number;
  tableLabel?: string | null;
  guestLabel?: string | null;
  minIngredients?: number;
  maxIngredients?: number;
  /** When false, compose surface is open without a platable ticket. */
  canPlate?: boolean;
}): ComposePlateCtaModel {
  const minIngredients = input.minIngredients ?? MIN_DISH_INGREDIENTS;
  const maxIngredients = input.maxIngredients ?? MAX_DISH_INGREDIENTS;
  const count = input.ingredientCount;
  const destination =
    input.tableLabel?.trim() ||
    (input.guestLabel?.trim() ? input.guestLabel.trim() : null);
  // Compact primary CTA — destination stays in the disabled-reason line.
  const label = 'Plate';

  if (!input.hasTicket) {
    return {
      label: 'Plate',
      disabledReason: 'Select a ticket to plate',
      canPlate: false,
    };
  }

  if (count < minIngredients) {
    const need = minIngredients - count;
    const where = destination ? ` for ${destination}` : '';
    return {
      label,
      disabledReason: `Add ${need} more ingredient${need === 1 ? '' : 's'}${where} (${count}/${maxIngredients}, need ${minIngredients}–${maxIngredients})`,
      canPlate: false,
    };
  }

  if (count > maxIngredients) {
    return {
      label,
      disabledReason: `Remove ingredients (max ${maxIngredients})`,
      canPlate: false,
    };
  }

  const canPlate = input.canPlate !== false;
  return {
    label,
    disabledReason: canPlate
      ? null
      : destination
        ? `Cannot plate for ${destination} right now`
        : 'Cannot plate right now',
    canPlate,
  };
}
