/** Popover (non-modal) dialog semantics for HUD cash/rating/prestige/day details. */
export function hudDetailDialogAria(labelledById = 'hud-detail-title'): {
  role: 'dialog';
  'aria-modal': 'false';
  'aria-labelledby': string;
} {
  return {
    role: 'dialog',
    'aria-modal': 'false',
    'aria-labelledby': labelledById,
  };
}

export function hudDetailDialogAriaAttrString(
  labelledById = 'hud-detail-title',
): string {
  const aria = hudDetailDialogAria(labelledById);
  return `role="${aria.role}" aria-modal="${aria['aria-modal']}" aria-labelledby="${aria['aria-labelledby']}"`;
}
