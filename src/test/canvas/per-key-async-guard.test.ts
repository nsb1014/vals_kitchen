import { describe, expect, it, vi } from "vitest";
import { PerKeyAsyncGuard } from "../../canvas/world/per-key-async-guard.ts";

function deferred(): {
  promise: Promise<void>;
  resolve: () => void;
  reject: (error: unknown) => void;
} {
  let resolve!: () => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<void>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

async function flushAsyncGuard(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe("PerKeyAsyncGuard", () => {
  it("acquires a key before starting work and ignores a duplicate attempt", async () => {
    const guard = new PerKeyAsyncGuard();
    const work = deferred();
    const operation = vi.fn(() => work.promise);
    const onFailure = vi.fn();

    expect(guard.start("ticket_1", operation, onFailure)).toBe(true);
    expect(guard.isPending("ticket_1")).toBe(true);
    expect(guard.start("ticket_1", operation, onFailure)).toBe(false);
    expect(operation).toHaveBeenCalledTimes(1);

    work.resolve();
    await flushAsyncGuard();
    expect(guard.isPending("ticket_1")).toBe(false);
    expect(onFailure).not.toHaveBeenCalled();
  });

  it("handles a rejection, releases the key, and permits a successful retry", async () => {
    const guard = new PerKeyAsyncGuard();
    const first = deferred();
    const second = deferred();
    const operation = vi
      .fn<() => Promise<void>>()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const onFailure = vi.fn();

    expect(guard.start("ticket_1", operation, onFailure)).toBe(true);
    first.reject(new Error("recipes unavailable"));
    await flushAsyncGuard();

    expect(onFailure).toHaveBeenCalledTimes(1);
    expect(guard.isPending("ticket_1")).toBe(false);
    expect(guard.start("ticket_1", operation, onFailure)).toBe(true);
    second.resolve();
    await flushAsyncGuard();

    expect(operation).toHaveBeenCalledTimes(2);
    expect(guard.isPending("ticket_1")).toBe(false);
  });

  it("contains a failure thrown by the failure presenter", async () => {
    const guard = new PerKeyAsyncGuard();
    const onFailure = vi.fn(() => {
      throw new Error("toast renderer unavailable");
    });

    expect(
      guard.start(
        "ticket_1",
        () => Promise.reject(new Error("delivery failed")),
        onFailure,
      ),
    ).toBe(true);
    await flushAsyncGuard();

    expect(onFailure).toHaveBeenCalledTimes(1);
    expect(guard.isPending("ticket_1")).toBe(false);
  });
});
