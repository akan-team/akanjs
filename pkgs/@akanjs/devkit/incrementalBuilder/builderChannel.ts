import type { Logger } from "akanjs/common";
import type { BuilderMessage } from "akanjs/server";

// `process.exit` drops an ipc write that has not flushed (a natural exit does not), and whether one survives
// depends on the message's shape as well as its size — so every send reports its flush and `shutdown` drains.
export class BuilderChannel {
  // Bounded so a runtime that never calls the flush callback costs one late message, not a wedged drain.
  static readonly #flushTimeoutMs = 5_000;
  static readonly #flushing = new Set<Promise<void>>();

  static send(message: BuilderMessage): Promise<void> {
    const send = process.send;
    if (!send) return Promise.resolve();
    const flushed = new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, BuilderChannel.#flushTimeoutMs);
      // No retry: the host answers an orphaned request id on exit, and a lost event is superseded next generation.
      send.call(process, message, undefined, undefined, () => {
        clearTimeout(timer);
        resolve();
      });
    });
    BuilderChannel.#flushing.add(flushed);
    void flushed.then(() => BuilderChannel.#flushing.delete(flushed));
    return flushed;
  }

  // Tracked like `send`: for an event nobody awaits, `drain` is all that stands between it and the exit.
  static emit(message: BuilderMessage): void {
    void BuilderChannel.send(message);
  }

  //? `AKAN_DEV_BUILDER_READY_GATE` is a test hook: the dev-stability suite holds a replacement short of ready.
  static async announceReady(logger: Logger): Promise<void> {
    const gate = process.env.AKAN_DEV_BUILDER_READY_GATE;
    if (gate && !(await Bun.file(gate).exists())) {
      logger.warn(`AKAN_DEV_BUILDER_READY_GATE is set: holding builder-ready until ${gate} exists`);
      while (!(await Bun.file(gate).exists())) await Bun.sleep(100);
    }
    BuilderChannel.emit({ type: "builder-ready" });
  }

  // Loops because `#reportMetrics` can send from a work item's `finally` after the drain has begun.
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
