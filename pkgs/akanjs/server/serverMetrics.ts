import type { Logger } from "akanjs/common";
import type { AkanIpcMessage, AkanMetricsReport } from "akanjs/service";
import type { AkanServer } from "./akanServer";
import { ProcessMetricsCollector } from "./processMetricsCollector";
import type { ServerListener } from "./routing/serverListener";
import type { WebRouter } from "./webRouter";

export class ServerMetrics {
  readonly #owner: Pick<AkanServer, "logger" | "serverMode">;
  readonly #logger: Logger;
  readonly #listener: ServerListener;
  readonly #webRouter: () => WebRouter | null;
  #metricsTimer: Timer | null = null;
  #lastMetrics: AkanMetricsReport = {};

  constructor(
    owner: Pick<AkanServer, "logger" | "serverMode">,
    listener: ServerListener,
    webRouter: () => WebRouter | null,
  ) {
    this.#owner = owner;
    this.#logger = owner.logger;
    this.#listener = listener;
    this.#webRouter = webRouter;
  }

  get last() {
    return this.#lastMetrics;
  }

  start() {
    this.#metricsTimer ??= ProcessMetricsCollector.startReporting(() => this.#reportMetrics());
  }

  stop() {
    if (this.#metricsTimer) clearInterval(this.#metricsTimer);
    this.#metricsTimer = null;
  }

  async #reportMetrics() {
    const metrics = await ProcessMetricsCollector.collect({
      role: this.#owner.serverMode,
      pubsubCoalesceCount: this.#listener.coalescedCount,
      ...(this.#webRouter()?.getMetrics() ?? {}),
    });
    this.#lastMetrics = metrics;
    process.send?.({ type: "metrics.report", pid: process.pid, metrics } satisfies AkanIpcMessage);
    if (process.env.AKAN_MEMORY_LOG === "1") {
      this.#logger.info(`memory role=${this.#owner.serverMode} ${ProcessMetricsCollector.format(metrics)}`);
    }
  }
}
