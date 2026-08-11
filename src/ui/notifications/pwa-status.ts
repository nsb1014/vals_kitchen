import { useGameStore } from '../../store/game-store.ts';

export type PwaBannerKind = 'install' | 'offline' | 'online' | 'update' | 'a2hs';

export interface PwaBannerCopy {
  kind: PwaBannerKind;
  body: string;
}

export const PWA_A2HS_STORAGE_KEY = 'vk-a2hs-nudge-dismissed';
export const PWA_INSTALL_STORAGE_KEY = 'vk-install-nudge-dismissed';
/** PRD §11.3 — prompt once after ~3 service days on iOS. */
export const PWA_A2HS_MIN_DAY = 3;

export function buildPwaBannerCopy(kind: PwaBannerKind): PwaBannerCopy {
  switch (kind) {
    case 'install':
      return {
        kind,
        body: 'Install Val’s Kitchen for quicker launch and safer saves.',
      };
    case 'offline':
      return {
        kind,
        body: 'You’re offline — playing from the cached app shell.',
      };
    case 'online':
      return { kind, body: 'Back online.' };
    case 'update':
      return {
        kind,
        body: 'Update ready — reload to get the latest kitchen.',
      };
    case 'a2hs':
      return {
        kind,
        body: 'Add Val’s Kitchen to your Home Screen so progress stays safe on iOS.',
      };
  }
}

export function isIosSafari(userAgent = navigator.userAgent): boolean {
  const ua = userAgent;
  const iOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const webkit = /WebKit/.test(ua);
  const notOther = !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);
  return iOS && webkit && notOther;
}

export function isStandaloneDisplay(): boolean {
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    nav.standalone === true
  );
}

export function shouldShowA2hsNudge(input: {
  day: number;
  dismissed: boolean;
  ios: boolean;
  standalone: boolean;
}): boolean {
  return (
    input.ios &&
    !input.standalone &&
    !input.dismissed &&
    input.day >= PWA_A2HS_MIN_DAY
  );
}

export function readDismissedFlag(key: string): boolean {
  try {
    return localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}

export function writeDismissedFlag(key: string): void {
  try {
    localStorage.setItem(key, '1');
  } catch {
    // Private mode — nudge may reappear; Save Code remains the backup path.
  }
}

/**
 * Surfacing for install / offline / update / iOS A2HS via the shared toast stack.
 */
export function mountPwaStatusNotices(): () => void {
  let lastOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
  const cleanups: Array<() => void> = [];

  const push = (kind: PwaBannerKind) => {
    const copy = buildPwaBannerCopy(kind);
    useGameStore.getState().setFloorToast(copy.body);
  };

  const maybeA2hs = () => {
    const state = useGameStore.getState();
    if (
      shouldShowA2hsNudge({
        day: state.day,
        dismissed: readDismissedFlag(PWA_A2HS_STORAGE_KEY),
        ios: isIosSafari(),
        standalone: isStandaloneDisplay(),
      })
    ) {
      push('a2hs');
      writeDismissedFlag(PWA_A2HS_STORAGE_KEY);
    }
  };

  const onBeforeInstall = (event: Event) => {
    event.preventDefault();
    if (
      !isStandaloneDisplay() &&
      !readDismissedFlag(PWA_INSTALL_STORAGE_KEY) &&
      !isIosSafari()
    ) {
      push('install');
      writeDismissedFlag(PWA_INSTALL_STORAGE_KEY);
    }
  };

  const onOnline = () => {
    if (!lastOnline) push('online');
    lastOnline = true;
  };
  const onOffline = () => {
    lastOnline = false;
    push('offline');
  };

  window.addEventListener('beforeinstallprompt', onBeforeInstall);
  window.addEventListener('online', onOnline);
  window.addEventListener('offline', onOffline);
  cleanups.push(() => {
    window.removeEventListener('beforeinstallprompt', onBeforeInstall);
    window.removeEventListener('online', onOnline);
    window.removeEventListener('offline', onOffline);
  });

  if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
    const onControllerChange = () => {
      // SW soft-reload is handled by the register script; surface a heads-up first.
      push('update');
    };
    navigator.serviceWorker.addEventListener(
      'controllerchange',
      onControllerChange,
    );
    cleanups.push(() => {
      navigator.serviceWorker.removeEventListener(
        'controllerchange',
        onControllerChange,
      );
    });
  }

  const unsubscribe = useGameStore.subscribe((state, prev) => {
    if (state.day !== prev.day || state.daySummary !== prev.daySummary) {
      maybeA2hs();
    }
  });
  cleanups.push(unsubscribe);

  // Cold boot: if already offline or past day 3 on iOS, surface once.
  queueMicrotask(() => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      push('offline');
    }
    maybeA2hs();
  });

  return () => {
    cleanups.forEach((fn) => fn());
  };
}

/** Test seam: evaluate A2HS copy without mounting listeners. */
export function a2hsNudgeBody(): string {
  return buildPwaBannerCopy('a2hs').body;
}
