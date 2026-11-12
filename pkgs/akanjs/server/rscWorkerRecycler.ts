import type { Logger } from "akanjs/common";
import type { AkanMetricsReport } from "akanjs/service";
import { MemoryLimit } from "./memoryLimit";
import type { RscHostRequests } from "./rscHostRequests";
import type { RscProcess, RscWorkerProcess } from "./rscWorkerProcess";

interface RscRollingRecycle {
  oldProc: RscProcess;
  reason: string;
  reloadsSinceSpawn: number;
}

export class RscWorkerRecycler {
  static readonly #devMaxReloads = 10;
  static readonly #devMaxRssBytes = 768 * 1024 * 1024;
  rollingRecycle: RscRollingRecycle | null = null;
  #recycleCount = 0;
  #lastRecycleAtMono: number | null = null;
  #lastRecycleReason: string | undefined;
  #recycleTimer: ReturnType<typeof setTimeout> | null = null;
  readonly #worker: RscWorkerProcess;
  readonly #requests: RscHostRequests;
  readonly #logger: Logger;

  constructor(worker: RscWorkerProcess, requests: RscHostRequests, logger: Logger) {
    this.#worker = worker;
    this.#requests = requests;
    this.#logger = logger;
  }

  get recycleCount() {
    return this.#recycleCount;
  }

  get lastRecycleReason() {
    return this.#lastRecycleReason;
  }

  restartWhenIdle(reason: string): boolean {
    if (
      this.#worker.killed ||
      this.#worker.status === "stopped" ||
      this.#worker.status === "starting" ||
      this.#worker.status === "restarting"
    ) {
      return false;
    }
    if (this.#requests.pending.size > 0 || this.#requests.calls.size > 0 || this.#requests.queuedSends.length > 0) {
      if (!this.#recycleTimer) {
        const graceMs = MemoryLimit.parsePositiveIntEnv("AKAN_RSC_WORKER_RECYCLE_GRACE_MS") ?? 5_000;
        this.#recycleTimer = setTimeout(() => {
          this.#recycleTimer = null;
          this.restartWhenIdle(reason);
        }, graceMs);
      }
      return false;
    }
    this.#lastRecycleReason = reason;
    this.#recycleCount += 1;
    this.#lastRecycleAtMono = performance.now();
    this.#logger.info(`[rsc] rolling recycle worker reason=${reason} oldPid=${this.#worker.proc.pid}`);
    this.#worker.status = "restarting";
    this.rollingRecycle = { oldProc: this.#worker.proc, reason, reloadsSinceSpawn: this.#worker.reloadsSinceSpawn };
    this.#worker.proc = this.#worker.spawn();
    return true;
  }

  stop(): void {
    if (this.#recycleTimer) clearTimeout(this.#recycleTimer);
    this.#recycleTimer = null;
    this.rollingRecycle?.oldProc.kill();
    this.rollingRecycle = null;
  }

  finishRollingRecycle(): void {
    const recycle = this.rollingRecycle;
    if (!recycle) return;
    this.rollingRecycle = null;
    this.#logger.info(
      `[rsc] rolling recycle ready reason=${recycle.reason} oldPid=${recycle.oldProc.pid} newPid=${this.#worker.proc.pid}`,
    );
    recycle.oldProc.kill();
    this.#worker.lastWorkerMetrics = {};
  }

  shouldRecycleForReloadAccumulation(): boolean {
    const maxReloads = RscWorkerRecycler.#getRscMaxReloads();
    if (!maxReloads || this.#worker.reloadsSinceSpawn < maxReloads) return false;
    // A save-on-keystroke burst reloads in place; the counter stays over the threshold, so the next reload recycles.
    if (this.#lastRecycleAtMono === null) return true;
    const minIntervalMs = MemoryLimit.parsePositiveIntEnv("AKAN_RSC_WORKER_MIN_RECYCLE_INTERVAL_MS") ?? 1_000;
    return performance.now() - this.#lastRecycleAtMono >= minIntervalMs;
  }

  maybeRecycleFromMetrics(metrics: AkanMetricsReport): void {
    if (this.#requests.pending.size > 0 || this.#requests.calls.size > 0) return;
    const maxRssBytes = RscWorkerRecycler.#getRscMaxRssBytes();
    if (maxRssBytes && metrics.rssBytes && metrics.rssBytes >= maxRssBytes) {
      this.restartWhenIdle(`rss>${Math.round(maxRssBytes / 1024 / 1024)}MiB`);
      return;
    }
    const maxRenderCount = MemoryLimit.parsePositiveIntEnv("AKAN_RSC_WORKER_MAX_RENDER_COUNT");
    if (maxRenderCount && (metrics.rscRenderCount ?? 0) >= maxRenderCount) {
      this.restartWhenIdle(`renderCount>${maxRenderCount}`);
      return;
    }
    const maxRouteModules = MemoryLimit.parsePositiveIntEnv("AKAN_RSC_WORKER_MAX_ROUTE_MODULES");
    if (maxRouteModules && (metrics.rscLoadedRouteModuleCount ?? 0) >= maxRouteModules) {
      this.restartWhenIdle(`routeModules>${maxRouteModules}`);
    }
  }

  // Production imports the pages bundle once at boot and never reloads, so only dev gets a threshold.
  static #getRscMaxReloads(): number | null {
    if (process.env.AKAN_RSC_WORKER_MAX_RELOADS !== undefined)
      return MemoryLimit.parsePositiveIntEnv("AKAN_RSC_WORKER_MAX_RELOADS");
    return process.env.NODE_ENV === "production" ? null : RscWorkerRecycler.#devMaxReloads;
  }

  static #getRscMaxRssBytes(): number | null {
    return MemoryLimit.resolveMaxRssBytes({
      megabytesEnv: "AKAN_RSC_WORKER_MAX_RSS_MB",
      bytesEnv: "AKAN_RSC_WORKER_MAX_RSS",
      limitFraction: 0.55,
      // Dev has no limit to derive from, yet should recycle before swapping; well above the ~142MB post-boot baseline.
      fallbackBytes: process.env.NODE_ENV === "production" ? null : RscWorkerRecycler.#devMaxRssBytes,
    });
  }
}
