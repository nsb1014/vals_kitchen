import { describe, expect, it } from 'vitest';
import { buildInspectorIngredientList } from '../../ui/components/FlavorInspectorPanel.ts';
import { testContext } from '../test-helpers.ts';

describe('flavor inspector list rows', () => {
  it('left-aligns the ingredient name between the icon and category', () => {
    const first = testContext.ingredients[0];
    const html = buildInspectorIngredientList([first.id], 'none');
    expect(html).toContain('class="inspector-list-name"');
    expect(html).toContain(`>${first.name}<`);
    expect(html).toContain('class="inspector-list-meta"');
    expect(html.indexOf('inspector-list-name')).toBeLessThan(
      html.indexOf('inspector-list-meta'),
    );
  });
});
