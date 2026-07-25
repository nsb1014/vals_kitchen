export interface AppShellElements {
  shell: HTMLElement;
  surface: HTMLElement;
  canvasMount: HTMLElement;
  overlayMount: HTMLElement;
  bubbleMount: HTMLElement;
  hud: HTMLElement;
}

export function mountAppShell(): AppShellElements {
  const shell = document.querySelector('#app');
  const surface = document.querySelector('#game-root');
  if (!shell || !surface) {
    throw new Error('Missing #app or #game-root');
  }

  const surfaceEl = surface as HTMLElement;
  surfaceEl.innerHTML = '';
  surfaceEl.dataset.phase = '6';

  const canvasMount = document.createElement('div');
  canvasMount.id = 'canvas-mount';
  canvasMount.className = 'canvas-mount';

  const bubbleMount = document.createElement('div');
  bubbleMount.id = 'bubble-mount';
  bubbleMount.className = 'bubble-mount';

  const overlayMount = document.createElement('div');
  overlayMount.id = 'overlay-mount';
  overlayMount.className = 'overlay-mount';

  const hud = document.createElement('div');
  hud.id = 'layout-hud';
  hud.className = 'layout-hud';

  canvasMount.appendChild(bubbleMount);
  surface.appendChild(canvasMount);
  surface.appendChild(overlayMount);
  surface.appendChild(hud);

  return {
    shell: shell as HTMLElement,
    surface: surfaceEl,
    canvasMount,
    overlayMount,
    bubbleMount,
    hud,
  };
}
