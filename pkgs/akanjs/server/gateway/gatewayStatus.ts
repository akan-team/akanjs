import type { Logger } from "akanjs/common";
import type { AkanMetricsReport } from "akanjs/service";
import { ProcessMetricsCollector } from "../processMetricsCollector";
import type { GatewayChildren } from "./gatewayChildren";
import type { GatewayConfig } from "./gatewayConfig";
import type { GatewayRooms } from "./gatewayRooms";

export class GatewayStatus {
  readonly #config: GatewayConfig;
  readonly #children: GatewayChildren;
  readonly #rooms: GatewayRooms;
  readonly #logger: Logger;
  #gatewayMetrics: AkanMetricsReport = {};
  #proxyHopCount = 0;
  #proxyHopSumMs = 0;
  #proxyHopMaxMs = 0;

  constructor(config: GatewayConfig, children: GatewayChildren, rooms: GatewayRooms, logger: Logger) {
    this.#config = config;
    this.#children = children;
    this.#rooms = rooms;
    this.#logger = logger;
  }

  healthStatus() {
    return {
      status: this.#children.stopping ? "stopping" : "running",
      pid: process.pid,
      children: [...this.#children.values()].map((child) => ({
        idx: child.idx,
        role: child.role,
        status: child.status,
        ready: child.ready,
        pid: child.pid,
        upstream: child.upstream,
        restartAttempts: child.restart.attempts,
        restartCount: child.restartCount,
        restartPending: child.restartPending,
        lastExitCode: child.lastExitCode,
        lastRestartAt: child.lastRestartAt,
        lastRestartReason: child.lastRestartReason,
        lastErrorMessage: child.lastErrorMessage,
      })),
    };
  }

  readyStatus() {
    return {
      ready: this.#isReady(),
      pid: process.pid,
      children: [...this.#children.values()].map(({ idx, role, status, ready, rscWorker }) => ({
        idx,
        role,
        status,
        ready,
        rscWorker,
      })),
    };
  }

  //? A batch-only gateway serves no traffic, so its batch replicas are what it waits on, or its rollout never ends.
  #isReady() {
    if (this.#children.stopping) return false;
    if (this.#config.replica.federation + this.#config.replica.all > 0)
      return this.#children.renderingCandidates().length > 0;
    return [...this.#children.values()].some((child) => child.ready && !this.#children.isUnavailable(child));
  }

  metricsStatus() {
    return {
      rooms: this.#rooms.roomCount,
      sockets: this.#rooms.socketCount,
      gateway: this.#gatewayMetrics,
      proxyHop: this.#proxyHopCount
        ? {
            count: this.#proxyHopCount,
            meanMs: Math.round((this.#proxyHopSumMs / this.#proxyHopCount) * 1000) / 1000,
            maxMs: Math.round(this.#proxyHopMaxMs * 1000) / 1000,
          }
        : null,
      children: [...this.#children.values()].map((child) => ({
        idx: child.idx,
        role: child.role,
        metrics: child.metrics,
        rooms: this.#rooms.roomCountOf(child.idx),
        restartAttempts: child.restart.attempts,
        restartCount: child.restartCount,
        restartPending: child.restartPending,
        lastExitCode: child.lastExitCode,
        lastRestartAt: child.lastRestartAt,
        lastRestartReason: child.lastRestartReason,
      })),
    };
  }

  // Upstream round trip as the gateway sees it; proxy overhead = this minus the child's traced handler time.
  recordProxyHop(durationMs: number) {
    this.#proxyHopCount += 1;
    this.#proxyHopSumMs += durationMs;
    this.#proxyHopMaxMs = Math.max(this.#proxyHopMaxMs, durationMs);
  }

  async reportMetrics() {
    this.#gatewayMetrics = await ProcessMetricsCollector.collect({ role: "gateway" });
    if (process.env.AKAN_MEMORY_LOG !== "1") return;
    this.#logger.verbose(
      `memory role=gateway ${ProcessMetricsCollector.format(this.#gatewayMetrics)} children=${this.#children.size}`,
    );
    for (const child of this.#children.values()) {
      if (!child.metrics.rssBytes) continue;
      const rooms = this.#rooms.roomCountOf(child.idx);
      this.#logger.verbose(
        `memory role=${child.role} idx=${child.idx} ${ProcessMetricsCollector.format({
          ...child.metrics,
          pid: child.metrics.pid ?? child.pid,
        })} activeRequests=${child.metrics.activeRequests ?? 0} activeWebSockets=${
          child.metrics.activeWebSockets ?? 0
        } rooms=${rooms} rscPending=${child.metrics.rscPendingRenderCount ?? 0} rscModules=${
          child.metrics.rscLoadedRouteModuleCount ?? 0
        }`,
      );
    }
  }
}
