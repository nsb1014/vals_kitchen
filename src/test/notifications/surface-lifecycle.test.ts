import { describe, expect, it, vi } from "vitest";
import { bindNotificationSurfaceLifecycle } from "../../ui/notifications/surface-lifecycle.ts";

class FakeDocument extends EventTarget {
  visibilityState: "visible" | "hidden" = "visible";
  readonly defaultView = new EventTarget();
}

describe("notification surface lifecycle", () => {
  it("pauses on pagehide and resumes only after pageshow", () => {
    const doc = new FakeDocument();
    const setActive = vi.fn();
    const unbind = bindNotificationSurfaceLifecycle({
      isHostConnected: () => true,
      setActive,
      doc: doc as unknown as Document,
    });

    expect(setActive).toHaveBeenLastCalledWith(true);

    doc.defaultView.dispatchEvent(new Event("pagehide"));
    expect(setActive).toHaveBeenLastCalledWith(false);

    doc.dispatchEvent(new Event("visibilitychange"));
    expect(setActive).toHaveBeenLastCalledWith(false);

    doc.defaultView.dispatchEvent(new Event("pageshow"));
    expect(setActive).toHaveBeenLastCalledWith(true);

    unbind();
  });

  it("requires a visible document and connected host, then removes listeners", () => {
    const doc = new FakeDocument();
    let hostConnected = true;
    const setActive = vi.fn();
    const unbind = bindNotificationSurfaceLifecycle({
      isHostConnected: () => hostConnected,
      setActive,
      doc: doc as unknown as Document,
    });

    doc.visibilityState = "hidden";
    doc.dispatchEvent(new Event("visibilitychange"));
    expect(setActive).toHaveBeenLastCalledWith(false);

    hostConnected = false;
    doc.visibilityState = "visible";
    doc.dispatchEvent(new Event("visibilitychange"));
    expect(setActive).toHaveBeenLastCalledWith(false);

    const callsBeforeUnbind = setActive.mock.calls.length;
    unbind();
    doc.defaultView.dispatchEvent(new Event("pagehide"));
    doc.defaultView.dispatchEvent(new Event("pageshow"));
    doc.dispatchEvent(new Event("visibilitychange"));
    expect(setActive).toHaveBeenCalledTimes(callsBeforeUnbind);
  });
});
