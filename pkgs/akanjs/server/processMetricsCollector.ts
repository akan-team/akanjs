import type { AkanMetricsReport } from "akanjs/service";
import { getTraceSnapshot, isTraceEnabled } from "akanjs/signal";

type BunJscHeapStats = {
  heapSize?: number;
  heapCapacity?: number;
  extraMemorySize?: number;
  objectCount?: number;
  protectedObjectCount?: number;
};

/**
 * Samples event-loop scheduling delay by measuring how late a fixed-interval timer
 * actually fires. The sample window is summarized and reset on each metrics report,
 * so values reflect recent load rather than process lifetime.
 */
class EventLoopLagMonitor {
  static readonly #maxSamples = 600;
  #timer: ReturnType<typeof setInterval> | null = null;
  #intervalMs = 500;
  #lastTickAt = 0;
  #samples: number[] = [];
  #maxMs = 0;

  start(intervalMs = 500): void {
    if (this.#timer) return;
    this.#intervalMs = intervalMs;
    this.#lastTickAt = performance.now();
    this.#timer = setInterval(() => {
      const now = performance.now();
      const lag = Math.max(0, now - this.#lastTickAt - this.#intervalMs);
      this.#lastTickAt = now;
      this.#maxMs = Math.max(this.#maxMs, lag);
      if (this.#samples.length < EventLoopLagMonitor.#maxSamples) this.#samples.push(lag);
      else this.#samples[Math.floor(Math.random() * EventLoopLagMonitor.#maxSamples)] = lag;
    }, intervalMs);
    // Do not keep the process alive solely for lag sampling.
    (this.#timer as { unref?: () => void }).unref?.();
  }

  /** Summarize the current window and reset it. */
  snapshotAndReset(): { meanMs: number; p99Ms: number; maxMs: number } | null {
    if (this.#samples.length === 0) return null;
    const sorted = [...this.#samples].sort((a, b) => a - b);
    const sum = sorted.reduce((acc, v) => acc + v, 0);
    const p99Index = Math.min(sorted.length - 1, Math.floor(0.99 * sorted.length));
    const result = {
      meanMs: round(sum / sorted.length),
      p99Ms: round(sorted[p99Index] ?? 0),
      maxMs: round(this.#maxMs),
    };
    this.#samples = [];
    this.#maxMs = 0;
    return result;
  }
}

const round = (value: number, digits = 3): number => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

export class ProcessMetricsCollector {
  static readonly #defaultMemoryLogIntervalMs = 60_000;
  static readonly #lagMonitor = new EventLoopLagMonitor();

  static parseMemoryLogIntervalMs(value = process.env.AKAN_MEMORY_LOG_INTERVAL_MS) {
    const parsed = Number.parseInt(value ?? "", 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : ProcessMetricsCollector.#defaultMemoryLogIntervalMs;
  }

  /** Begin sampling event-loop lag. Idempotent; safe to call from each server role. */
  static startEventLoopLagMonitor(intervalMs = 500): void {
    ProcessMetricsCollector.#lagMonitor.start(intervalMs);
  }

  static async collect(extra: AkanMetricsReport = {}): Promise<AkanMetricsReport> {
    ProcessMetricsCollector.#lagMonitor.start();
    let gcDurationMs: number | undefined;
    if (process.env.AKAN_MEMORY_GC_ON_REPORT === "1") {
      const gcStart = performance.now();
      Bun.gc(true);
      gcDurationMs = round(performance.now() - gcStart);
    }
    const memory = process.memoryUsage();
    const resourceUsage = process.resourceUsage?.();
    const jsc = await ProcessMetricsCollector.#collectJscHeapStats();
    const lag = ProcessMetricsCollector.#lagMonitor.snapshotAndReset();
    return {
      pid: process.pid,
      reportedAt: Date.now(),
      rssBytes: memory.rss,
      heapTotalBytes: memory.heapTotal,
      heapUsedBytes: memory.heapUsed,
      externalBytes: memory.external,
      arrayBuffersBytes: memory.arrayBuffers,
      ...(resourceUsage
        ? {
            cpuUserMicros: resourceUsage.userCPUTime,
            cpuSystemMicros: resourceUsage.systemCPUTime,
            maxRssKb: resourceUsage.maxRSS,
          }
        : {}),
      ...(jsc
        ? {
            jscHeapSizeBytes: jsc.heapSize,
            jscHeapCapacityBytes: jsc.heapCapacity,
            jscExtraMemorySizeBytes: jsc.extraMemorySize,
            jscObjectCount: jsc.objectCount,
            jscProtectedObjectCount: jsc.protectedObjectCount,
          }
        : {}),
      ...(lag
        ? {
            eventLoopLagMeanMs: lag.meanMs,
            eventLoopLagP99Ms: lag.p99Ms,
            eventLoopLagMaxMs: lag.maxMs,
          }
        : {}),
      ...(gcDurationMs !== undefined ? { gcDurationMs } : {}),
      ...(isTraceEnabled() ? { trace: getTraceSnapshot() } : {}),
      ...extra,
    };
  }

  static formatBytes(bytes = 0) {
    return `${(bytes / 1024 / 1024).toFixed(1)}MiB`;
  }

  static format(metrics: AkanMetricsReport) {
    return [
      `pid=${metrics.pid ?? "unknown"}`,
      `rss=${ProcessMetricsCollector.formatBytes(metrics.rssBytes)}`,
      `heapUsed=${ProcessMetricsCollector.formatBytes(metrics.heapUsedBytes)}`,
      `heapTotal=${ProcessMetricsCollector.formatBytes(metrics.heapTotalBytes)}`,
      `external=${ProcessMetricsCollector.formatBytes(metrics.externalBytes)}`,
      `arrayBuffers=${ProcessMetricsCollector.formatBytes(metrics.arrayBuffersBytes)}`,
      ...(metrics.jscHeapSizeBytes !== undefined
        ? [`jscHeap=${ProcessMetricsCollector.formatBytes(metrics.jscHeapSizeBytes)}`]
        : []),
      ...(metrics.eventLoopLagMeanMs !== undefined
        ? [`elLag=${metrics.eventLoopLagMeanMs}/${metrics.eventLoopLagP99Ms ?? 0}/${metrics.eventLoopLagMaxMs ?? 0}ms`]
        : []),
      ...(metrics.gcDurationMs !== undefined ? [`gc=${metrics.gcDurationMs}ms`] : []),
    ].join(" ");
  }

  static async #collectJscHeapStats(): Promise<BunJscHeapStats | null> {
    try {
      const mod = (await import("bun:jsc")) as { heapStats?: () => BunJscHeapStats };
      return mod.heapStats?.() ?? null;
    } catch {
      return null;
    }
  }
}
