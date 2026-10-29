import type { PromiseOrObject } from "akanjs/base";
import { type Logger, toError } from "akanjs/common";

//? Logged, never thrown: the writes are in by then, and a rejection reads as a failed write that a retry repeats.
export class AfterCommitHooks {
  static async run(hook: () => PromiseOrObject<void>, logger: Logger) {
    try {
      await hook();
    } catch (error) {
      const { message, stack } = toError(error);
      logger.error(`An afterCommit callback failed after the commit:\n${stack ?? message}`);
    }
  }
}
