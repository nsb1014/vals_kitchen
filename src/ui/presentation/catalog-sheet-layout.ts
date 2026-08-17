/** Mobile shop sheet size that stops at the bottom nav instead of the viewport. */
export function mobileCatalogSheetSize(input: {
  viewportWidth: number;
  viewportHeight: number;
  navOffsetFromBottom: number;
}): { width: number; height: number } {
  return {
    width: input.viewportWidth,
    height: Math.max(0, input.viewportHeight - input.navOffsetFromBottom),
  };
}
