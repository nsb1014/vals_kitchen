export type SaveCodeUiStatus = 'idle' | 'export_success' | 'import_success' | 'import_error';

export interface SaveCodeFeedback {
  status: SaveCodeUiStatus;
  message: string;
}

export function buildExportSuccessFeedback(codeLength: number): SaveCodeFeedback {
  return {
    status: 'export_success',
    message: `Save Code copied (${codeLength} characters). Store it somewhere safe.`,
  };
}

export function buildImportSuccessFeedback(day: number, prestige: number): SaveCodeFeedback {
  return {
    status: 'import_success',
    message: `Save restored — Day ${day}, Prestige P${prestige}.`,
  };
}

export function buildImportErrorFeedback(error: unknown): SaveCodeFeedback {
  const detail = error instanceof Error ? error.message : String(error);
  return {
    status: 'import_error',
    message: detail.startsWith('Invalid Save Code') ? detail : `Could not restore save: ${detail}`,
  };
}

export function saveCodeFeedbackClass(status: SaveCodeUiStatus): string {
  switch (status) {
    case 'export_success':
    case 'import_success':
      return 'save-feedback-success';
    case 'import_error':
      return 'save-feedback-error';
    default:
      return 'save-feedback-idle';
  }
}

export const IOS_STORAGE_WARNING = `Your progress is saved in this browser. To keep it safe:
1. Add this app to your Home Screen
2. Export a Save Code regularly
3. Playing in Private Browsing will not save progress`;

export const SAVE_CODE_PLACEHOLDER = 'Paste RS1. save code here…';
