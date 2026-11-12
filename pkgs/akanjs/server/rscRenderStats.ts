export interface RouteRenderStats {
  routeId: string;
  count: number;
  flightBytes: number;
  totalDurationMs: number;
}

export class RscRenderStats {
  renderCount = 0;
  lastRenderedPath?: string;
  lastRenderKind?: string;
  lastRenderRouteId?: string;
  lastRenderDurationMs?: number;
  lastRenderLoadedModuleDelta = 0;
  lastRenderLoadedModules: string[] = [];
  lastFlightBytes = 0;
  lastFlightChunks = 0;
  totalFlightBytes = 0;
  totalFlightChunks = 0;
  pagesBundleBuildId = 0;
  readonly routeStats = new Map<string, RouteRenderStats>();

  recordFlight({ bytes, chunksCount }: { bytes: number; chunksCount: number }): void {
    this.lastFlightBytes = bytes;
    this.lastFlightChunks = chunksCount;
    this.totalFlightBytes += bytes;
    this.totalFlightChunks += chunksCount;
  }

  recordRouteStats(routeId: string, flightBytes: number, durationMs: number): void {
    const current = this.routeStats.get(routeId) ?? { routeId, count: 0, flightBytes: 0, totalDurationMs: 0 };
    current.count += 1;
    current.flightBytes += flightBytes;
    current.totalDurationMs += durationMs;
    this.routeStats.set(routeId, current);
  }

  topRoutes(sortBy: (route: RouteRenderStats) => number) {
    return [...this.routeStats.values()]
      .sort((a, b) => sortBy(b) - sortBy(a))
      .slice(0, 10)
      .map((route) => ({
        routeId: route.routeId,
        count: route.count,
        flightBytes: route.flightBytes,
        avgDurationMs: route.count > 0 ? Math.round(route.totalDurationMs / route.count) : 0,
      }));
  }
}
