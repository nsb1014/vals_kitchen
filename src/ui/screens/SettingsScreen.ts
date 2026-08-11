import { useGameStore } from '../../store/game-store.ts';
import {
  getSettingsReturnScreen,
  showScreen,
  trackScreenChange,
} from '../../app/screenRouter.ts';
import { applyAppShellMotionPreference } from '../presentation/motion-preference.ts';
import {
  loadCreditsManifest,
  renderCreditsHtml,
} from '../../assets/credits.ts';
import {
  buildExportSuccessFeedback,
  buildImportConfirmCopy,
  beginSaveImport,
  buildImportErrorFeedback,
  buildImportSuccessFeedback,
  IOS_STORAGE_WARNING,
  SAVE_CODE_PLACEHOLDER,
  saveCodeFeedbackClass,
  type SaveCodeFeedback,
} from '../presentation/save-code-ui.ts';

export function mountSettingsScreen(container: HTMLElement): () => void {
  const root = document.createElement('div');
  root.className = 'screen-root';
  container.appendChild(root);
  root.innerHTML = `
    <section class="screen-panel sheet-tier-meta-full meta-screen" id="settings-screen" data-testid="settings-screen" hidden>
      <header class="screen-header settings-header">
        <h1 class="screen-title" data-testid="settings-title" tabindex="-1">Settings</h1>
        <button type="button" class="settings-close" data-testid="settings-close" aria-label="Close settings">Close</button>
      </header>
      <div class="settings-body" id="settings-body">
        <section class="settings-section">
          <h2>Save & Backup</h2>
          <p class="settings-warning">${IOS_STORAGE_WARNING.replace(/\n/g, '<br />')}</p>
          <div class="settings-actions">
            <button type="button" class="service-btn primary" id="export-save-btn" data-testid="export-save-btn">Copy Save Code</button>
          </div>
          <label class="screen-field">
            <span>Restore Save Code</span>
            <textarea id="import-save-input" class="screen-textarea" data-testid="import-save-input" rows="4" placeholder="${SAVE_CODE_PLACEHOLDER}"></textarea>
          </label>
          <button type="button" class="service-btn" id="import-save-btn" data-testid="import-save-btn">Restore Save</button>
          <p id="save-feedback" class="save-feedback save-feedback-idle" data-testid="save-feedback" role="status" aria-live="polite"></p>
        </section>
        <section class="settings-section">
          <h2>Audio</h2>
          <label class="toggle-row">
            <span>Sound effects</span>
            <input type="checkbox" id="audio-toggle" />
          </label>
          <label class="toggle-row">
            <span>Music</span>
            <input type="checkbox" id="music-toggle" />
          </label>
          <label class="screen-field settings-volume-field">
            <span>Master volume</span>
            <input type="range" id="volume-slider" data-testid="settings-volume" min="0" max="100" step="1" />
          </label>
        </section>
        <section class="settings-section">
          <h2>Accessibility</h2>
          <label class="toggle-row">
            <span>Reduce motion</span>
            <input type="checkbox" id="reduced-motion-toggle" data-testid="settings-reduced-motion" />
          </label>
          <div class="settings-actions">
            <button type="button" class="service-btn" id="replay-tutorial-btn" data-testid="replay-tutorial-btn">Replay tutorial</button>
          </div>
        </section>
        <section class="settings-section" id="credits-section">
          <h2>Credits & Attribution</h2>
          <div id="credits-content"><p class="settings-note">Loading CC0 credits…</p></div>
        </section>
      </div>
      <div
        class="settings-import-confirm"
        id="settings-import-confirm"
        data-testid="settings-import-confirm"
        hidden
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-import-confirm-title"
        aria-describedby="settings-import-confirm-desc"
      >
        <div class="settings-import-confirm-card">
          <h2 id="settings-import-confirm-title" class="settings-import-confirm-title" tabindex="-1">Replace current save?</h2>
          <p id="settings-import-confirm-desc" class="settings-import-confirm-desc"></p>
          <div class="settings-import-confirm-actions">
            <button type="button" class="service-btn" data-testid="import-save-cancel">Cancel</button>
            <button type="button" class="service-btn primary" data-testid="import-save-confirm">Restore Save</button>
          </div>
        </div>
      </div>
    </section>
  `;

  const panel = root.querySelector('#settings-screen') as HTMLElement;
  const title = root.querySelector(
    '[data-testid="settings-title"]',
  ) as HTMLElement;
  const closeBtn = root.querySelector(
    '[data-testid="settings-close"]',
  ) as HTMLButtonElement;
  const feedbackEl = root.querySelector('#save-feedback') as HTMLElement;
  const importInput = root.querySelector(
    '#import-save-input',
  ) as HTMLTextAreaElement;
  const audioToggle = root.querySelector('#audio-toggle') as HTMLInputElement;
  const musicToggle = root.querySelector('#music-toggle') as HTMLInputElement;
  const volumeSlider = root.querySelector(
    '#volume-slider',
  ) as HTMLInputElement;
  const reducedMotionToggle = root.querySelector(
    '#reduced-motion-toggle',
  ) as HTMLInputElement;
  const creditsEl = root.querySelector('#credits-content') as HTMLElement;
  const confirmHost = root.querySelector(
    '#settings-import-confirm',
  ) as HTMLElement;
  const confirmDesc = root.querySelector(
    '#settings-import-confirm-desc',
  ) as HTMLElement;
  const confirmTitle = root.querySelector(
    '#settings-import-confirm-title',
  ) as HTMLElement;
  const confirmBtn = root.querySelector(
    '[data-testid="import-save-confirm"]',
  ) as HTMLButtonElement;
  const cancelBtn = root.querySelector(
    '[data-testid="import-save-cancel"]',
  ) as HTMLButtonElement;

  let pendingImportCode: string | null = null;
  let visible = false;
  let focusReturnTestId: string | null = null;
  let focusReturnElement: HTMLElement | null = null;

  void loadCreditsManifest()
    .then((manifest) => {
      creditsEl.innerHTML = renderCreditsHtml(manifest);
    })
    .catch((error) => {
      creditsEl.innerHTML = `<p class="settings-note">Could not load credits manifest: ${String(error)}</p>`;
    });

  const showFeedback = (feedback: SaveCodeFeedback) => {
    feedbackEl.textContent = feedback.message;
    feedbackEl.className = `save-feedback ${saveCodeFeedbackClass(feedback.status)}`;
  };

  const closeConfirm = () => {
    pendingImportCode = null;
    confirmHost.hidden = true;
  };

  const openConfirm = (code: string) => {
    const state = useGameStore.getState();
    const copy = buildImportConfirmCopy(state.day, state.prestige);
    pendingImportCode = code;
    confirmTitle.textContent = copy.title;
    confirmDesc.textContent = copy.description;
    confirmBtn.textContent = copy.confirmLabel;
    cancelBtn.textContent = copy.cancelLabel;
    confirmHost.hidden = false;
    queueMicrotask(() => confirmTitle.focus({ preventScroll: true }));
  };

  const syncControls = (state: ReturnType<typeof useGameStore.getState>) => {
    audioToggle.checked = state.audioEnabled;
    musicToggle.checked = state.musicEnabled;
    volumeSlider.value = String(Math.round((state.audioVolume ?? 1) * 100));
    reducedMotionToggle.checked = Boolean(state.reducedMotion);
    applyAppShellMotionPreference(Boolean(state.reducedMotion));
  };

  const closeSettings = () => {
    if (!visible) return;
    closeConfirm();
    const target = getSettingsReturnScreen();
    useGameStore.getState().navigateTo(target);
    trackScreenChange(target);
    showScreen(target);
  };

  const runImport = async (code: string) => {
    const result = await useGameStore.getState().importSaveCode(code);
    if (result.ok) {
      const state = useGameStore.getState();
      showFeedback(buildImportSuccessFeedback(state.day, state.prestige));
      importInput.value = '';
      syncControls(state);
      // importSaveCode already sets screen=restaurant; keep the shell data-screen
      // and return-route bookkeeping aligned when restore finishes from Settings.
      trackScreenChange('restaurant');
      showScreen('restaurant');
    } else {
      showFeedback(buildImportErrorFeedback(new Error(result.error)));
    }
  };

  root
    .querySelector('#export-save-btn')
    ?.addEventListener('click', async () => {
      const result = await useGameStore.getState().exportSaveCodeToClipboard();
      if (result.ok) {
        showFeedback(buildExportSuccessFeedback(result.code.length));
      } else {
        showFeedback(buildImportErrorFeedback(new Error(result.error)));
      }
    });

  root.querySelector('#import-save-btn')?.addEventListener('click', () => {
    const gate = beginSaveImport(importInput.value);
    if (gate.status === 'empty') {
      showFeedback(buildImportErrorFeedback(new Error(gate.message)));
      return;
    }
    openConfirm(gate.code);
  });

  cancelBtn.addEventListener('click', () => {
    closeConfirm();
    showFeedback({
      status: 'idle',
      message: 'Restore cancelled — current save kept.',
    });
  });

  confirmBtn.addEventListener('click', async () => {
    const code = pendingImportCode;
    closeConfirm();
    if (!code) return;
    await runImport(code);
  });

  confirmHost.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !confirmHost.hidden) {
      event.preventDefault();
      event.stopPropagation();
      closeConfirm();
    }
  });

  closeBtn.addEventListener('click', () => closeSettings());

  audioToggle.addEventListener('change', () => {
    useGameStore.getState().setAudioEnabled(audioToggle.checked);
  });
  musicToggle.addEventListener('change', () => {
    useGameStore.getState().setMusicEnabled(musicToggle.checked);
  });
  volumeSlider.addEventListener('input', () => {
    useGameStore.getState().setAudioVolume(Number(volumeSlider.value) / 100);
  });
  reducedMotionToggle.addEventListener('change', () => {
    useGameStore.getState().setReducedMotion(reducedMotionToggle.checked);
  });
  root.querySelector('#replay-tutorial-btn')?.addEventListener('click', () => {
    useGameStore.getState().replayTutorial();
    showFeedback({
      status: 'idle',
      message: 'Tutorial tips re-armed for Day 1 service.',
    });
  });

  const isUsableFocusTarget = (
    target: HTMLElement | null,
  ): target is HTMLElement => {
    if (
      !target?.isConnected ||
      target === document.body ||
      target === document.documentElement ||
      target.closest('[hidden], [inert], [aria-hidden="true"]')
    ) {
      return false;
    }
    const style = getComputedStyle(target);
    return style.display !== 'none' && style.visibility !== 'hidden';
  };

  const resolveFocusReturn = (): HTMLElement | null => {
    const byTestId = focusReturnTestId
      ? document.querySelector<HTMLElement>(
          `[data-testid="${CSS.escape(focusReturnTestId)}"]`,
        )
      : null;
    const target = byTestId ?? focusReturnElement;
    if (!isUsableFocusTarget(target)) {
      return document.querySelector<HTMLElement>(
        '[data-testid="restaurant-canvas"]',
      );
    }
    return target;
  };

  const syncVisibility = () => {
    const state = useGameStore.getState();
    const nextVisible = state.screen === 'settings';
    if (nextVisible && !visible) {
      const active =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
      focusReturnTestId = active?.dataset.testid ?? null;
      focusReturnElement = active;
      queueMicrotask(() => {
        if (!panel.hidden && title.isConnected) {
          title.focus({ preventScroll: true });
        }
      });
    } else if (!nextVisible && visible) {
      closeConfirm();
      queueMicrotask(() => {
        const active =
          document.activeElement instanceof HTMLElement
            ? document.activeElement
            : null;
        if (isUsableFocusTarget(active)) {
          focusReturnTestId = null;
          focusReturnElement = null;
          return;
        }
        resolveFocusReturn()?.focus({ preventScroll: true });
        focusReturnTestId = null;
        focusReturnElement = null;
      });
    }
    panel.hidden = !nextVisible;
    visible = nextVisible;
    syncControls(state);
  };

  const onDocumentKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Escape' || !visible) return;
    if (!confirmHost.hidden) return;
    const modalTrap = document.querySelector(
      '[role="dialog"][aria-modal="true"]:not([hidden])',
    );
    if (modalTrap && !panel.contains(modalTrap)) return;
    event.preventDefault();
    closeSettings();
  };
  document.addEventListener('keydown', onDocumentKeyDown);

  const unsubscribe = useGameStore.subscribe((state, prev) => {
    if (
      state.screen !== prev.screen ||
      state.audioEnabled !== prev.audioEnabled ||
      state.musicEnabled !== prev.musicEnabled ||
      state.audioVolume !== prev.audioVolume ||
      state.reducedMotion !== prev.reducedMotion
    ) {
      syncVisibility();
    }
  });

  syncVisibility();

  return () => {
    unsubscribe();
    document.removeEventListener('keydown', onDocumentKeyDown);
    root.remove();
  };
}
