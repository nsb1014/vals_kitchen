import { describe, expect, it } from 'vitest';
import { mobileCatalogSheetSize } from '../../ui/presentation/catalog-sheet-layout.ts';

describe('mobile catalog sheet layout', () => {
  it('ends the shop sheet at the bottom nav instead of the viewport', () => {
    expect(
      mobileCatalogSheetSize({
        viewportWidth: 390,
        viewportHeight: 844,
        navOffsetFromBottom: 68,
      }),
    ).toEqual({ width: 390, height: 776 });
  });
});
