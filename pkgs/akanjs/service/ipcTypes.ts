export type AkanChildRole = "all" | "federation" | "batch";

export type AkanChildStatus = "starting" | "ready" | "healthy" | "draining" | "unhealthy" | "exited" | "crashed";

export type AkanUpstream = { type: "unix"; socketPath: string } | { type: "tcp"; host: string; port: number };

export interface AkanJobOptions {
  delay?: number;
  attempts?: number;
  priority?: number;
  backoff?: number | { type?: string; delay?: number };
  removeOnComplete?: boolean | number;
  removeOnFail?: boolean | number;
}

export interface AkanJob<Data = unknown, Returns = unknown> {
  id: string;
  name: string;
  data: Data;
  attemptsMade: number;
  opts?: AkanJobOptions;
  returnvalue?: Returns;
}

export interface AkanWorker {
  close(): Promise<void> | void;
}

export interface AkanMetricsReport {
  role?: string;
  pid?: number;
  reportedAt?: number;
  activeRequests?: number;
  totalRequests?: number;
  activeWebSockets?: number;
  roomCount?: number;
  queueWakeCount?: number;
  pubsubDeliverCount?: number;
  pubsubDropCount?: number;
  pubsubCoalesceCount?: number;
  rssBytes?: number;
  heapTotalBytes?: number;
  heapUsedBytes?: number;
  externalBytes?: number;
  arrayBuffersBytes?: number;
  cpuUserMicros?: number;
  cpuSystemMicros?: number;
  maxRssKb?: number;
  jscHeapSizeBytes?: number;
  jscHeapCapacityBytes?: number;
  jscExtraMemorySizeBytes?: number;
  jscObjectCount?: number;
  jscProtectedObjectCount?: number;
  rscWorkerPid?: number;
  rscWorkerStatus?: string;
  rscWorkerRestartCount?: number;
  rscWorkerRecycleCount?: number;
  rscWorkerLastRecycleReason?: string;
  // The RSC worker samples its own process the same way its host replica does. These carry that
  // sample under a prefix so it cannot overwrite the replica's own — see `RscWorker.getMetrics`.
  rscWorkerReportedAt?: number;
  rscWorkerRssBytes?: number;
  rscWorkerHeapTotalBytes?: number;
  rscWorkerHeapUsedBytes?: number;
  rscWorkerExternalBytes?: number;
  rscWorkerArrayBuffersBytes?: number;
  rscWorkerCpuUserMicros?: number;
  rscWorkerCpuSystemMicros?: number;
  rscWorkerMaxRssKb?: number;
  rscWorkerJscHeapSizeBytes?: number;
  rscWorkerJscHeapCapacityBytes?: number;
  /** Off-heap bytes JSC attributes to JS objects — typed-array backing stores, i.e. cached Flight chunks. */
  rscWorkerJscExtraMemorySizeBytes?: number;
  rscWorkerJscObjectCount?: number;
  rscWorkerJscProtectedObjectCount?: number;
  rscWorkerEventLoopLagMeanMs?: number;
  rscWorkerEventLoopLagP99Ms?: number;
  rscWorkerEventLoopLagMaxMs?: number;
  rscWorkerGcDurationMs?: number;
  rscPendingRenderCount?: number;
  rscQueuedSendCount?: number;
  rscHostPendingChunkOverflowCount?: number;
  rscRenderCount?: number;
  rscInFlightRenderCount?: number;
  rscLastRenderedPath?: string;
  rscLastRenderKind?: string;
  rscLastFlightBytes?: number;
  rscLastFlightChunks?: number;
  rscTotalFlightBytes?: number;
  rscTotalFlightChunks?: number;
  rscPagesBundleBuildId?: number;
  rscRouteModuleCount?: number;
  rscLoadedRouteModuleCount?: number;
  rscRouteModuleCacheHits?: number;
  rscRouteModuleCacheMisses?: number;
  rscRouteModuleCacheDisabled?: boolean;
  rscLoadedRouteModuleKeys?: string[];
  rscTopRoutesByRenderCount?: Array<{ routeId: string; count: number; flightBytes: number; avgDurationMs: number }>;
  rscTopRoutesByFlightBytes?: Array<{ routeId: string; count: number; flightBytes: number; avgDurationMs: number }>;
  rscLastRenderDurationMs?: number;
  rscLastRenderRouteId?: string;
  rscLastRenderLoadedModuleDelta?: number;
  rscLastRenderLoadedModules?: string[];
  rscResultCacheEntries?: number;
  rscResultCacheBytes?: number;
  rscPatchResultCacheEntries?: number;
  rscPatchResultCacheBytes?: number;
  rscResultCacheHits?: number;
  rscResultCacheMisses?: number;
  rscResultCacheBypass?: number;
  /** Keys the SSR chunk registry tracks — NOT a memory bound; the modules stay in Bun's ESM registry. */
  ssrChunkRegistrySize?: number;
  ssrChunkLoadCount?: number;
  ssrChunkCacheHitCount?: number;
  ssrChunkEvictionCount?: number;
  httpFullSsrCount?: number;
  httpRscNavigationCount?: number;
  httpStaticAssetCount?: number;
  httpCsrCount?: number;
  httpImageCount?: number;
  httpHtmlCacheEntries?: number;
  httpHtmlCacheBytes?: number;
  httpHtmlCacheHits?: number;
  httpHtmlCacheMisses?: number;
  httpHtmlCacheBypass?: number;
  eventLoopLagMeanMs?: number;
  eventLoopLagP99Ms?: number;
  eventLoopLagMaxMs?: number;
  gcDurationMs?: number;
  trace?: unknown;
}

export type AkanIpcMessage =
  | {
      type: "ready";
      pid: number;
      replicaIdx: number;
      role: AkanChildRole;
      upstream?: AkanUpstream;
      /** Actual websocket upstream the child bound; may differ from the preferred port when it was in use. */
      wsUpstream?: Extract<AkanUpstream, { type: "tcp" }>;
      healthPath?: string;
    }
  | { type: "backend-ready"; pid: number }
  | { type: "pubsub.publish"; roomId: string; data: object | object[]; origin?: string }
  | { type: "pubsub.deliver"; roomId: string; data: object | object[]; origin?: string }
  | { type: "pubsub.subscribe"; roomId: string; socketId?: string; pid?: number }
  | { type: "pubsub.unsubscribe"; roomId: string; socketId?: string; pid?: number }
  | { type: "pubsub.snapshot.request" }
  | { type: "pubsub.snapshot"; rooms: string[]; pid?: number }
  | { type: "queue.enqueued"; queue: string; name: string; jobId: string }
  | { type: "queue.wake"; queue?: string; name?: string }
  | { type: "health.ping"; nonce: string; sentAt: number }
  | { type: "health.pong"; nonce: string; sentAt: number; pid?: number }
  | { type: "ws.opened"; socketId: string; roomId?: string; pid?: number }
  | { type: "ws.closed"; socketId: string; roomId?: string; pid?: number }
  | { type: "metrics.report"; metrics: AkanMetricsReport; pid?: number }
  | { type: "shutdown"; signal?: string }
  | { type: "error"; message: string; stack?: string; pid?: number };

export const sendAkanIpc = (message: AkanIpcMessage) => {
  process.send?.(message);
};
