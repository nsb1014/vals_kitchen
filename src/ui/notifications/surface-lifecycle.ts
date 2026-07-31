export function bindNotificationSurfaceLifecycle(opts: {
  isHostConnected: () => boolean;
  setActive: (active: boolean) => void;
  doc?: Document;
}): () => void {
  const doc = opts.doc ?? document;
  const pageLifecycleTarget: Document | Window = doc.defaultView ?? doc;
  let bfcacheHidden = false;

  const syncActive = () => {
    opts.setActive(
      opts.isHostConnected() &&
        doc.visibilityState === "visible" &&
        !bfcacheHidden,
    );
  };
  const onPageHide = () => {
    bfcacheHidden = true;
    syncActive();
  };
  const onPageShow = () => {
    bfcacheHidden = false;
    syncActive();
  };

  doc.addEventListener("visibilitychange", syncActive);
  pageLifecycleTarget.addEventListener("pagehide", onPageHide);
  pageLifecycleTarget.addEventListener("pageshow", onPageShow);
  syncActive();

  return () => {
    doc.removeEventListener("visibilitychange", syncActive);
    pageLifecycleTarget.removeEventListener("pagehide", onPageHide);
    pageLifecycleTarget.removeEventListener("pageshow", onPageShow);
  };
}
