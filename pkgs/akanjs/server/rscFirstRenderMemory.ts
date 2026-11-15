import type { AkanMetricsReport } from "akanjs/service";

export type FirstRenderMemory = NonNullable<AkanMetricsReport["rscFirstRenderMemory"]>[number];

type MemoryRead = () => Pick<NodeJS.MemoryUsage, "rss" | "heapUsed" | "external" | "arrayBuffers">;

export interface FirstRenderStart {
  readonly routeId: string;
  readonly before: ReturnType<MemoryRead>;
}

export class RscFirstRenderMemory {
  static readonly maxRoutes = 20;
  readonly #enabled: boolean;
  readonly #read: MemoryRead;
  readonly #measured = new Set<string>();
  #entries: FirstRenderMemory[] = [];

  constructor(enabled = process.env.AKAN_MEMORY_LOG === "1", read: MemoryRead = () => process.memoryUsage()) {
    this.#enabled = enabled;
    this.#read = read;
  }

  begin(routeId: string): FirstRenderStart | null {
    if (!this.#enabled || this.#measured.has(routeId)) return null;
    return { routeId, before: this.#read() };
  }

  //? Concurrent renders land in the delta too, so it is approximate; the first of a route's renders to finish is kept.
  end(start: FirstRenderStart | null, loadedModules: string[]): void {
    if (!start || this.#measured.has(start.routeId)) return;
    this.#measured.add(start.routeId);
    const after = this.#read();
    const entry: FirstRenderMemory = {
      routeId: start.routeId,
      rssDeltaBytes: after.rss - start.before.rss,
      heapUsedDeltaBytes: after.heapUsed - start.before.heapUsed,
      externalDeltaBytes: after.external - start.before.external,
      arrayBuffersDeltaBytes: after.arrayBuffers - start.before.arrayBuffers,
      loadedModules,
    };
    this.#entries = [...this.#entries, entry]
      .sort((a, b) => b.rssDeltaBytes - a.rssDeltaBytes)
      .slice(0, RscFirstRenderMemory.maxRoutes);
  }

  get report(): FirstRenderMemory[] | undefined {
    return this.#enabled ? this.#entries : undefined;
  }
}
