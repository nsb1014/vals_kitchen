import { useGameStore } from '../../store/game-store.ts';
import {
  loadCreditsManifest,
  renderCreditsHtml,
} from '../../assets/credits.ts';
import {
  buildExportSuccessFeedback,
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
      <header class="screen-header">
        <h1 class="screen-title">Settings</h1>
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
        </section>
        <section class="settings-section" id="credits-section">
          <h2>Credits & Attribution</h2>
          <div id="credits-content"><p class="settings-note">Loading CC0 credits…</p></div>
        </section>
      </div>
    </section>
  `;

  const panel = root.querySelector('#settings-screen') as HTMLElement;
  const feedbackEl = root.querySelector('#save-feedback') as HTMLElement;
  const importInput = root.querySelector(
    '#import-save-input',
  ) as HTMLTextAreaElement;
  const audioToggle = root.querySelector('#audio-toggle') as HTMLInputElement;
  const musicToggle = root.querySelector('#music-toggle') as HTMLInputElement;
  const creditsEl = root.querySelector('#credits-content') as HTMLElement;

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

  root
    .querySelector('#import-save-btn')
    ?.addEventListener('click', async () => {
      const code = importInput.value.trim();
      if (!code) {
        showFeedback(
          buildImportErrorFeedback(new Error('Paste a Save Code first.')),
        );
        return;
      }
      const result = await useGameStore.getState().importSaveCode(code);
      if (result.ok) {
        const state = useGameStore.getState();
        showFeedback(buildImportSuccessFeedback(state.day, state.prestige));
        importInput.value = '';
        audioToggle.checked = state.audioEnabled;
        musicToggle.checked = state.musicEnabled;
      } else {
        showFeedback(buildImportErrorFeedback(new Error(result.error)));
      }
    });

  audioToggle.addEventListener('change', () => {
    useGameStore.getState().setAudioEnabled(audioToggle.checked);
  });
  musicToggle.addEventListener('change', () => {
    useGameStore.getState().setMusicEnabled(musicToggle.checked);
  });

  const syncVisibility = () => {
    const state = useGameStore.getState();
    panel.hidden = state.screen !== 'settings';
    audioToggle.checked = state.audioEnabled;
    musicToggle.checked = state.musicEnabled;
  };

  const unsubscribe = useGameStore.subscribe((state, prev) => {
    if (
      state.screen !== prev.screen ||
      state.audioEnabled !== prev.audioEnabled ||
      state.musicEnabled !== prev.musicEnabled
    ) {
      syncVisibility();
    }
  });

  syncVisibility();

  return () => {
    unsubscribe();
    root.remove();
  };
}
