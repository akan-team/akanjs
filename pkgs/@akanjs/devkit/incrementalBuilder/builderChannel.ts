import type { BuilderMessage } from "akanjs/server";

/**
 * Every message the builder sends its host, and the record of which of those writes have actually left
 * the process.
 *
 * `process.exit` discards an ipc write that has not flushed, and this process exits routinely — the
 * recycle that keeps its RSS under the ceiling ends in `process.exit(0)`. Whether a given message
 * survives that depends on its *shape*, not only its size. Measured on bun 1.3.14 (darwin,
 * `serialization: "advanced"`), send-then-exit-immediately, 20 rounds each:
 *
 * - one long string: 8KB delivered 20/20, 16KB delivered **0/20**
 * - many short strings: 60KB delivered 20/20, 100KB delivered **0/20**
 *
 * `css-updated` is the first shape (a base64 stylesheet per url) and `build-route-res` the second (a
 * manifest delta), so neither sits safely under a threshold worth relying on. Nothing here assumes one:
 * every send reports when it flushed, and `drain` is what `shutdown` awaits before exiting.
 *
 * A natural exit does *not* have this problem — a process that simply returns from `main` flushes 1MB
 * 20/20 — which is why the disposable build worker needs none of this. Only an explicit `process.exit`
 * cuts a write short.
 */
export class BuilderChannel {
  /**
   * Bound so a runtime that ever stops invoking the flush callback costs one late message instead of
   * wedging the shutdown drain until the host's kill watchdog fires.
   */
  static readonly #flushTimeoutMs = 5_000;
  /** Sends that have not flushed yet; `drain` only ever needs to await them all. */
  static readonly #flushing = new Set<Promise<void>>();

  /** Send, and resolve once the write has left this process. */
  static send(message: BuilderMessage): Promise<void> {
    const send = process.send;
    if (!send) return Promise.resolve();
    const flushed = new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, BuilderChannel.#flushTimeoutMs);
      // A failed send has nothing to retry: the host answers an unanswered request id itself when this
      // process exits, and a lost event is superseded by the next generation's.
      send.call(process, message, undefined, undefined, () => {
        clearTimeout(timer);
        resolve();
      });
    });
    BuilderChannel.#flushing.add(flushed);
    void flushed.then(() => BuilderChannel.#flushing.delete(flushed));
    return flushed;
  }

  /**
   * Send an event no caller awaits. Tracked exactly like `send`, which is the whole point: a relayed
   * `css-updated` has nobody to await it, so `drain` is the only thing standing between it and the exit.
   */
  static emit(message: BuilderMessage): void {
    void BuilderChannel.send(message);
  }

  /**
   * Resolve once every send handed over so far has flushed, and report how many were still in flight.
   * Sends started *while* draining are covered too — `#reportMetrics` can fire from a work item's
   * `finally`, after the drain has already begun.
   */
  static async drain(): Promise<number> {
    let flushed = 0;
    while (BuilderChannel.#flushing.size) {
      const pending = [...BuilderChannel.#flushing];
      flushed += pending.length;
      await Promise.all(pending);
    }
    return flushed;
  }
}
