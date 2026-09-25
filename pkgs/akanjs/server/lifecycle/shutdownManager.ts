import type { Logger } from "akanjs/common";

export class ShutdownManager {
  /**
   * Registers process-level handlers that drive `onShutdown` on:
   *   - SIGTERM / SIGINT (graceful stop → exit(0) on success, exit(1) on error)
   *   - uncaughtException / unhandledRejection (best-effort stop → exit(1))
   *
   * Kept separate from `AkanServer` so the server class doesn't have to know about
   * Node-level process events, and so tests can opt out by not calling it.
   */
  static register(logger: Logger, onShutdown: () => Promise<void>): void {
    const signals: NodeJS.Signals[] = ["SIGTERM", "SIGINT"];

    for (const signal of signals) {
      process.on(signal, async () => {
        logger.info(`Received ${signal}, starting graceful shutdown...`);
        try {
          await onShutdown();
          process.exit(0);
        } catch (error) {
          logger.error(`Failed to shutdown gracefully: ${error instanceof Error ? error.message : String(error)}`);
          process.exit(1);
        }
      });
    }

    process.on("uncaughtException", async (error) => {
      logger.error(`Uncaught exception: ${ShutdownManager.#formatError(error)}`);
      try {
        await onShutdown();
        process.exit(1);
      } catch {
        process.exit(1);
      }
    });

    process.on("unhandledRejection", async (reason) => {
      logger.error(`Unhandled rejection: ${ShutdownManager.#formatError(reason)}`);
      try {
        await onShutdown();
        process.exit(1);
      } catch {
        process.exit(1);
      }
    });
  }

  static #formatError(error: unknown): string {
    return error instanceof Error ? (error.stack ?? error.message) : String(error);
  }
}
