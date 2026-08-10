import { describe, expect, it } from 'vitest';
import {
  beginSaveImport,
  buildImportConfirmCopy,
} from '../ui/presentation/save-code-ui.ts';

describe('chrome settings import confirm', () => {
  it('builds overwrite warning copy from the live day', () => {
    const copy = buildImportConfirmCopy(7, 2);
    expect(copy.title).toMatch(/replace/i);
    expect(copy.description).toContain('Day 7');
    expect(copy.description).toContain('P2');
    expect(copy.confirmLabel).toMatch(/restore/i);
    expect(copy.cancelLabel).toMatch(/cancel/i);
  });

  it('requires confirm before any restore proceeds', () => {
    expect(beginSaveImport('   ').status).toBe('empty');
    const gate = beginSaveImport('  RS1.abc  ');
    expect(gate).toEqual({ status: 'needs_confirm', code: 'RS1.abc' });
  });
});
