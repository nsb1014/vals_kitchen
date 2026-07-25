import { describe, expect, it } from 'vitest';
import {
  buildExportSuccessFeedback,
  buildImportErrorFeedback,
  buildImportSuccessFeedback,
  saveCodeFeedbackClass,
} from '../../ui/presentation/save-code-ui.ts';

describe('save code ui presentation', () => {
  it('builds success feedback for export and import', () => {
    const exported = buildExportSuccessFeedback(120);
    expect(exported.status).toBe('export_success');
    expect(exported.message).toContain('120');

    const imported = buildImportSuccessFeedback(12, 3);
    expect(imported.status).toBe('import_success');
    expect(imported.message).toContain('Day 12');
    expect(imported.message).toContain('P3');
  });

  it('surfaces readable import failures', () => {
    const feedback = buildImportErrorFeedback(new Error('Invalid Save Code: corrupted compression payload'));
    expect(feedback.status).toBe('import_error');
    expect(feedback.message).toContain('corrupted');
    expect(saveCodeFeedbackClass('import_error')).toBe('save-feedback-error');
  });
});
