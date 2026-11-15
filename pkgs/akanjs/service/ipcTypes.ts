import type { LogRecord } from "akanjs/common";
import type { LiveChange } from "./predefinedAdaptor/websocket.adaptor";

export type AkanChildRole = "all" | "federation" | "batch";

export type AkanChildStatus = "starting" | "ready" | "healthy" | "draining" | "unhealthy" | "exited" | "crashed";

/** A replica's RSC worker; `null` on a replica that renders no pages. */
export type AkanRscWorkerStatus = "starting" | "ready" | "restarting" | "stopped" | null;

export type AkanUpstream = { type: "unix"; socketPath: string } | { type: "tcp"; host: string; port: number };

export interface AkanJobOptions {
  delay?: number;
  attempts?: number;
  /** Smaller runs sooner, and a job with none runs before every prioritized one — bullmq's reading. */
  priority?: number;
  /** `maxDelay` caps what an exponential backoff grows to between attempts. */
  backoff?: number | { type?: string; delay?: number; maxDelay?: number };
  removeOnComplete?: boolean | number;
  removeOnFail?: boolean | number;
  /** The trace id of the call that enqueued the job, set by the framework: the job's own trace names it as `link`. */
  traceLink?: string;
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

export interface AkanMetricSample {
  labels: Record<string, string>;
  value: number;
}

export interface AkanHistogramSample {
  labels: Record<string, string>;
  /** One count per bucket, not cumulative; the last counts what passed every bound. */
  counts: number[];
  sum: number;
  count: number;
}

export type AkanMetricFamily =
  | { name: string; help: string; type: "counter" | "gauge"; samples: AkanMetricSample[] }
  | { name: string; help: string; type: "histogram"; buckets: number[]; samples: AkanHistogramSample[] };

export interface AkanStatementSender {
  endpoint: string;
  count: number;
  totalMs: number;
}

export interface AkanStatementStat {
  fingerprint: string;
  text: string;
  model: string;
  op: string;
  count: number;
  totalMs: number;
  waitMs: number;
  rows: number;
  /** Milliseconds this process has counted the statement: since it first listed it, or last admitted it again after dropping it. */
  sinceMs: number;
  /** Statements per duration bucket, the last one past every bound. */
  buckets: number[];
  sentBy: AkanStatementSender[];
}

export interface AkanMetricsReport {
  role?: string;
  pid?: number;
  reportedAt?: number;
  /** Epoch ms the reporting process started: a new value means its counters started again from zero. */
  startedAt?: number;
  metricFamilies?: AkanMetricFamily[];
  activeRequests?: number;
  totalRequests?: number;
  activeWebSockets?: number;
  roomCount?: number;
  replayBytes?: number;
  pubsubBufferedCount?: number;
  statements?: AkanStatementStat[];
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
  // The RSC worker's own process sample, prefixed so it cannot overwrite its host replica's.
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
  /** Only under `AKAN_MEMORY_LOG=1`: what each route's first render in this worker grew it by, largest RSS first. */
  rscFirstRenderMemory?: Array<{
    routeId: string;
    rssDeltaBytes: number;
    heapUsedDeltaBytes: number;
    externalDeltaBytes: number;
    arrayBuffersDeltaBytes: number;
    loadedModules: string[];
  }>;
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
  httpRscPrefetchCount?: number;
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
      crossSite?: { allowedOrigins: string[]; enabled: boolean };
      rscWorker?: AkanRscWorkerStatus;
    }
  | { type: "pubsub.publish"; roomId: string; data: object | object[]; origin?: string }
  | { type: "pubsub.deliver"; roomId: string; data: object | object[]; origin?: string }
  | { type: "pubsub.subscribe"; roomId: string; socketId?: string; pid?: number; ack?: number }
  /** Gateway → child: the subscribe carrying `ack`, and whatever the child sent before it, now route to the child. */
  | { type: "pubsub.subscribed"; ack: number }
  | { type: "pubsub.unsubscribe"; roomId: string; socketId?: string; pid?: number }
  | { type: "pubsub.snapshot.request" }
  | { type: "pubsub.snapshot"; rooms: string[]; liveModels?: string[]; pid?: number }
  | { type: "live.change"; change: LiveChange; origin?: string }
  /** Child → gateway: every model the child holds live rooms for. */
  | { type: "live.models"; models: string[]; pid?: number }
  | { type: "queue.enqueued"; queue: string; name: string; jobId: string }
  | { type: "queue.wake"; queue?: string; name?: string }
  | { type: "health.ping"; nonce: string; sentAt: number }
  | { type: "health.pong"; nonce: string; sentAt: number; pid?: number; rscWorker?: AkanRscWorkerStatus }
  | { type: "ws.opened"; socketId: string; roomId?: string; pid?: number }
  | { type: "ws.closed"; socketId: string; roomId?: string; pid?: number }
  | { type: "metrics.report"; metrics: AkanMetricsReport; pid?: number }
  | { type: "log.records"; records: LogRecord[]; dropped?: number; pid?: number }
  /** Hub → child: the lowest severity any subscriber wants; `null` tells the child to stop forwarding. */
  | { type: "log.level"; minSev: number | null }
  | { type: "shutdown"; signal?: string }
  /** Desktop server → the shell that started it: the path behind a file picker grant (forServer). */
  | { type: "file.resolve"; id: string; grant: string }
  | { type: "file.resolved"; id: string; path?: string; mode?: "read" | "write" | "folder"; error?: string }
  /** Desktop server → the shell that started it: one of its secrets in the OS credential store (NativeSecret). */
  | { type: "secret.request"; id: string; op: "get" | "set" | "remove"; key: string; value?: string }
  | { type: "secret.answer"; id: string; value?: string | null; error?: string }
  | { type: "error"; message: string; stack?: string; pid?: number };

export const sendAkanIpc = (message: AkanIpcMessage) => {
  process.send?.(message);
};
