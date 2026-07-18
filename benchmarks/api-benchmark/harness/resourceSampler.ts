import { round, sleep } from "./lib";

interface ProcessMetrics {
  rssBytes?: number;
  heapTotalBytes?: number;
  heapUsedBytes?: number;
  externalBytes?: number;
  cpuUserMicros?: number;
  cpuSystemMicros?: number;
  eventLoopLagP99Ms?: number;
  gcDurationMs?: number;
  activeWebSockets?: number;
  trace?: unknown;
  rscWorkerRestartCount?: number;
  rscWorkerRecycleCount?: number;
  rscWorkerLastRecycleReason?: string;
}

interface AkanMetricsResponse {
  rooms?: number;
  sockets?: number;
  gateway?: ProcessMetrics;
  proxyHop?: { meanMs?: number; maxMs?: number } | null;
  children?: Array<{
    idx?: number;
    role?: string;
    restartCount?: number;
    restartPending?: boolean;
    lastRestartReason?: string;
    metrics?: ProcessMetrics;
  }>;
}

export interface ResourceSample {
  tMs: number;
  rssMb: number | null;
  gatewayRssMb?: number | null;
  workerRssMb?: number | null;
  heapUsedMb?: number | null;
  externalMb?: number | null;
  eventLoopLagP99Ms?: number | null;
  gcDurationMs?: number | null;
  cpuPct?: number | null;
  childRestartCount?: number | null;
  rscWorkerRestartCount?: number | null;
  rscWorkerRecycleCount?: number | null;
  rooms?: number | null;
  trackedSockets?: number | null;
  activeWebSockets?: number | null;
}

export interface ResourceSummary {
  maxRssMb: number | null;
  avgRssMb: number | null;
  peakCpuPct: number | null;
  eventLoopLagP99Ms: number | null;
  gcDurationP99Ms?: number | null;
  rssGrowthMbPerHour?: number | null;
  childRestartCount?: number | null;
  workerRestartCount?: number | null;
  rscWorkerRestartCount?: number | null;
  rscWorkerRecycleCount?: number | null;
  sampleIntervalMs?: number;
  slopeWarmupMs?: number;
  maxRooms?: number | null;
  maxTrackedSockets?: number | null;
  maxActiveWebSockets?: number | null;
  proxyHopMeanMs?: number | null;
  samples: number;
  timeSeries?: ResourceSample[];
  trace?: unknown;
}

/**
 * Samples process resource usage during a load run. For akanjs targets it polls the
 * gateway metrics endpoint (sums gateway + child RSS, captures event-loop lag and the
 * trace snapshot). For single-process competitors it shells out to `ps`.
 */
export class ResourceSampler {
  #timer: ReturnType<typeof setInterval> | null = null;
  #startedAt = 0;
  #lastCpuUserMicros: number | null = null;
  #lastCpuSystemMicros: number | null = null;
  #lastCpuSampleAt: number | null = null;
  #rssSamples: number[] = [];
  #cpuSamples: number[] = [];
  #lagSamples: number[] = [];
  #gcSamples: number[] = [];
  #proxyHop: number[] = [];
  #roomSamples: number[] = [];
  #trackedSocketSamples: number[] = [];
  #activeWebSocketSamples: number[] = [];
  #timeSeries: ResourceSample[] = [];
  #lastTrace: unknown;

  constructor(
    private readonly opts: {
      pid?: number;
      metricsUrl?: string;
      intervalMs?: number;
      slopeWarmupMs?: number;
    },
  ) {}

  start(): void {
    if (this.#timer) return;
    this.#startedAt = Date.now();
    const interval = this.opts.intervalMs ?? 5_000;
    this.#timer = setInterval(() => void this.#sample(), interval);
    void this.#sample();
  }

  async #sample(): Promise<void> {
    if (this.opts.metricsUrl) await this.#sampleAkan();
    else if (this.opts.pid) await this.#samplePs(this.opts.pid);
  }

  async #sampleAkan(): Promise<void> {
    try {
      const res = await fetch(this.opts.metricsUrl as string, { signal: AbortSignal.timeout(2_000) });
      if (!res.ok) return;
      const data = (await res.json()) as AkanMetricsResponse;
      const gatewayRss = data.gateway?.rssBytes ?? 0;
      let workerRss = 0;
      let heapUsed = data.gateway?.heapUsedBytes ?? 0;
      let external = data.gateway?.externalBytes ?? 0;
      let lag = data.gateway?.eventLoopLagP99Ms ?? 0;
      let gcDurationMs = data.gateway?.gcDurationMs;
      let activeWebSockets = 0;
      let childRestartCount = 0;
      let rscWorkerRestartCount = 0;
      let rscWorkerRecycleCount = 0;
      for (const child of data.children ?? []) {
        workerRss += child.metrics?.rssBytes ?? 0;
        heapUsed += child.metrics?.heapUsedBytes ?? 0;
        external += child.metrics?.externalBytes ?? 0;
        lag = Math.max(lag, child.metrics?.eventLoopLagP99Ms ?? 0);
        if (child.metrics?.gcDurationMs != null) gcDurationMs = Math.max(gcDurationMs ?? 0, child.metrics.gcDurationMs);
        activeWebSockets += child.metrics?.activeWebSockets ?? 0;
        childRestartCount += child.restartCount ?? 0;
        rscWorkerRestartCount += child.metrics?.rscWorkerRestartCount ?? 0;
        rscWorkerRecycleCount += child.metrics?.rscWorkerRecycleCount ?? 0;
        // Workers report metrics on an interval, so keep the richest trace seen (most
        // endpoints) rather than the latest, which can be a pre-load empty snapshot.
        const trace = child.metrics?.trace as { endpoints?: unknown[] } | undefined;
        if (trace?.endpoints?.length) {
          const prev = this.#lastTrace as { endpoints?: unknown[] } | undefined;
          if (!prev?.endpoints?.length || trace.endpoints.length >= prev.endpoints.length) this.#lastTrace = trace;
        }
      }
      const rss = gatewayRss + workerRss;
      const cpuPct = this.#cpuPctFrom(data.gateway);
      if (rss) this.#rssSamples.push(rss / 1024 / 1024);
      if (cpuPct != null) this.#cpuSamples.push(cpuPct);
      if (lag) this.#lagSamples.push(lag);
      if (gcDurationMs != null) this.#gcSamples.push(gcDurationMs);
      if (typeof data.rooms === "number") this.#roomSamples.push(data.rooms);
      if (typeof data.sockets === "number") this.#trackedSocketSamples.push(data.sockets);
      if (Number.isFinite(activeWebSockets)) this.#activeWebSocketSamples.push(activeWebSockets);
      if (data.proxyHop?.meanMs != null) this.#proxyHop.push(data.proxyHop.meanMs);
      this.#timeSeries.push({
        tMs: Date.now() - this.#startedAt,
        rssMb: rss ? round(rss / 1024 / 1024) : null,
        gatewayRssMb: gatewayRss ? round(gatewayRss / 1024 / 1024) : null,
        workerRssMb: workerRss ? round(workerRss / 1024 / 1024) : null,
        heapUsedMb: heapUsed ? round(heapUsed / 1024 / 1024) : null,
        externalMb: external ? round(external / 1024 / 1024) : null,
        eventLoopLagP99Ms: lag ? round(lag) : null,
        gcDurationMs: gcDurationMs != null ? round(gcDurationMs) : null,
        cpuPct,
        childRestartCount,
        rscWorkerRestartCount,
        rscWorkerRecycleCount,
        rooms: typeof data.rooms === "number" ? data.rooms : null,
        trackedSockets: typeof data.sockets === "number" ? data.sockets : null,
        activeWebSockets,
      });
    } catch {
      // metrics endpoint not ready / transient
    }
  }

  #cpuPctFrom(metrics: ProcessMetrics | undefined): number | null {
    const user = metrics?.cpuUserMicros;
    const system = metrics?.cpuSystemMicros;
    if (user == null || system == null) return null;
    const now = Date.now();
    const total = user + system;
    if (this.#lastCpuSampleAt == null || this.#lastCpuUserMicros == null || this.#lastCpuSystemMicros == null) {
      this.#lastCpuSampleAt = now;
      this.#lastCpuUserMicros = user;
      this.#lastCpuSystemMicros = system;
      return null;
    }
    const prevTotal = this.#lastCpuUserMicros + this.#lastCpuSystemMicros;
    const elapsedMicros = (now - this.#lastCpuSampleAt) * 1000;
    this.#lastCpuSampleAt = now;
    this.#lastCpuUserMicros = user;
    this.#lastCpuSystemMicros = system;
    if (elapsedMicros <= 0 || total < prevTotal) return null;
    return round(((total - prevTotal) / elapsedMicros) * 100);
  }

  async #samplePs(pid: number): Promise<void> {
    try {
      const proc = Bun.spawn(["ps", "-o", "rss=,%cpu=", "-p", String(pid)], { stdout: "pipe", stderr: "ignore" });
      const out = (await new Response(proc.stdout).text()).trim();
      await proc.exited;
      if (!out) return;
      const [rssKb, cpu] = out.split(/\s+/).map(Number);
      if (rssKb) this.#rssSamples.push(rssKb / 1024);
      if (Number.isFinite(cpu)) this.#cpuSamples.push(cpu);
      this.#timeSeries.push({
        tMs: Date.now() - this.#startedAt,
        rssMb: rssKb ? round(rssKb / 1024) : null,
        cpuPct: Number.isFinite(cpu) ? round(cpu) : null,
      });
    } catch {
      // process may have exited
    }
  }

  async stop(): Promise<ResourceSummary> {
    if (this.#timer) clearInterval(this.#timer);
    this.#timer = null;
    await sleep(50);
    const max = (arr: number[]) => (arr.length ? Math.max(...arr) : null);
    const avg = (arr: number[]) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null);
    const p99 = (arr: number[]) => {
      if (!arr.length) return null;
      const sorted = [...arr].sort((a, b) => a - b);
      return sorted[Math.min(sorted.length - 1, Math.floor(0.99 * sorted.length))];
    };
    const last = this.#timeSeries.at(-1);
    return {
      maxRssMb: round(max(this.#rssSamples)),
      avgRssMb: round(avg(this.#rssSamples)),
      peakCpuPct: round(max(this.#cpuSamples)),
      eventLoopLagP99Ms: round(p99(this.#lagSamples)),
      gcDurationP99Ms: round(p99(this.#gcSamples)),
      rssGrowthMbPerHour: round(this.#rssGrowthMbPerHour()),
      childRestartCount: last?.childRestartCount ?? null,
      workerRestartCount: last?.childRestartCount ?? null,
      rscWorkerRestartCount: last?.rscWorkerRestartCount ?? null,
      rscWorkerRecycleCount: last?.rscWorkerRecycleCount ?? null,
      sampleIntervalMs: this.opts.intervalMs ?? 5_000,
      slopeWarmupMs: this.opts.slopeWarmupMs ?? 0,
      maxRooms: round(max(this.#roomSamples)),
      maxTrackedSockets: round(max(this.#trackedSocketSamples)),
      maxActiveWebSockets: round(max(this.#activeWebSocketSamples)),
      proxyHopMeanMs: this.#proxyHop.length ? round(avg(this.#proxyHop)) : null,
      samples: this.#rssSamples.length,
      timeSeries: this.#timeSeries,
      trace: this.#lastTrace,
    };
  }

  #rssGrowthMbPerHour(): number | null {
    const warmupMs = this.opts.slopeWarmupMs ?? 0;
    const points = this.#timeSeries.filter(
      (sample) => sample.tMs >= warmupMs && typeof sample.rssMb === "number",
    ) as Array<ResourceSample & { rssMb: number }>;
    if (points.length < 2) return null;
    const meanX = points.reduce((sum, point) => sum + point.tMs, 0) / points.length;
    const meanY = points.reduce((sum, point) => sum + point.rssMb, 0) / points.length;
    let numerator = 0;
    let denominator = 0;
    for (const point of points) {
      numerator += (point.tMs - meanX) * (point.rssMb - meanY);
      denominator += (point.tMs - meanX) ** 2;
    }
    if (denominator === 0) return null;
    return (numerator / denominator) * 3_600_000;
  }
}
