import type { Logger } from "akanjs/common";
import type { AkanIpcMessage, AkanMetricFamily, AkanMetricsReport } from "akanjs/service";
import type { AkanServer } from "./akanServer";
import { metricRegistry } from "./metrics/metricRegistry";
import { RuntimeFamilies } from "./metrics/runtimeFamilies";
import { AppInfo } from "./ops/appInfo";
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

  families(): AkanMetricFamily[] {
    const role = this.#owner.serverMode;
    return [
      ...metricRegistry.snapshot({ role }),
      ...RuntimeFamilies.rscWorker(this.#webRouter()?.getMetrics(), { role }),
    ];
  }

  async #reportMetrics() {
    const metrics = await ProcessMetricsCollector.collect({
      role: this.#owner.serverMode,
      pubsubCoalesceCount: this.#listener.coalescedCount,
      ...(this.#webRouter()?.getMetrics() ?? {}),
    });
    //? Only a replica sends a report; a solo server reads its families live when it is scraped.
    if (process.send)
      Object.assign(metrics, { startedAt: AppInfo.startedAt.getTime(), metricFamilies: this.families() });
    this.#lastMetrics = metrics;
    process.send?.({ type: "metrics.report", pid: process.pid, metrics } satisfies AkanIpcMessage);
    if (process.env.AKAN_MEMORY_LOG === "1") {
      this.#logger.info(`memory role=${this.#owner.serverMode} ${ProcessMetricsCollector.format(metrics)}`);
    }
  }
}
