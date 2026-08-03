/**
 * Starts at most one asynchronous interaction for each key.
 *
 * The operation owns its errors: callers can safely start it from a pointer
 * handler without creating an unhandled rejection. A key is released after
 * either success or failure so the same interaction remains retryable.
 */
export class PerKeyAsyncGuard {
  private readonly pendingKeys = new Set<string>();

  start(
    key: string,
    operation: () => Promise<void>,
    onFailure: (error: unknown) => void | Promise<void>,
  ): boolean {
    if (this.pendingKeys.has(key)) return false;

    // Acquire before invoking the operation. Pointer events can arrive back
    // to back while the first operation is still waiting on deferred content.
    this.pendingKeys.add(key);
    void this.run(key, operation, onFailure);
    return true;
  }

  isPending(key: string): boolean {
    return this.pendingKeys.has(key);
  }

  private async run(
    key: string,
    operation: () => Promise<void>,
    onFailure: (error: unknown) => void | Promise<void>,
  ): Promise<void> {
    try {
      await operation();
    } catch (error) {
      try {
        await onFailure(error);
      } catch {
        // A presentation failure must not turn a handled interaction failure
        // into an unhandled rejection.
      }
    } finally {
      this.pendingKeys.delete(key);
    }
  }
}
