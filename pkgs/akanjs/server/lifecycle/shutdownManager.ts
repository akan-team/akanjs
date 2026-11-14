import type { Logger } from "akanjs/common";
import { StartGuard } from "./startGuard";

export class ShutdownManager {
  static register(logger: Logger, onShutdown: () => Promise<void>): void {
    //? Bun runs a handler in the async context of what raised it, a start step's too, where a stop would not wait.
    const shutdown = () => StartGuard.outside(onShutdown);
    const signals: NodeJS.Signals[] = ["SIGTERM", "SIGINT"];

    for (const signal of signals) {
      process.on(signal, async () => {
        logger.debug(`Received ${signal}, starting graceful shutdown...`);
        try {
          await shutdown();
          process.exit(0);
        } catch (error) {
          logger.error(`Failed to shutdown gracefully: ${error instanceof Error ? error.message : String(error)}`);
          process.exit(1);
        }
      });
    }

    process.on("uncaughtException", async (error) => {
      logger.error(`Uncaught exception: ${ShutdownManager.#formatError(error)}`);
      await shutdown().catch(() => undefined);
      process.exit(1);
    });

    process.on("unhandledRejection", async (reason) => {
      logger.error(`Unhandled rejection: ${ShutdownManager.#formatError(reason)}`);
      if (!ShutdownManager.#isFatalUnhandledRejection()) return;
      await shutdown().catch(() => undefined);
      process.exit(1);
    });
  }

  // Not fatal by default: React SSR rejects an unheld `stream.allReady` post-shell, and exiting drops every request.
  static #isFatalUnhandledRejection(): boolean {
    const flag = process.env.AKAN_FATAL_UNHANDLED_REJECTION;
    return flag === "1" || flag === "true";
  }

  static #formatError(error: unknown): string {
    return error instanceof Error ? (error.stack ?? error.message) : String(error);
  }
}
