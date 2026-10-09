import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { type AkanI18nConfig, DEFAULT_AKAN_I18N, Logger, type LogRecord } from "akanjs/common";
import type { AkanTheme } from "akanjs/fetch";
import type { AkanMetricsReport } from "akanjs/service";
import type { PagePromptEntry, PagePromptRun, PagePromptRunInput } from "../signal/mcp/pagePrompt";
import type { ClientManifest } from "./artifact";
import type { RouteCacheInvalidation, RouteCacheRenderState } from "./cachePolicy";
import { ChildOutputReader } from "./logging/childOutputReader";
import { MemoryLimit } from "./memoryLimit";
import type { RscTraceMetadata, SsrLateControl } from "./ssrTypes";
import type { BaseBuildArtifact, CssAsset } from "./types";

// A bounded queue guard, not backpressure: a host that cannot drain IPC chunks fails the render instead of buffering.
const DEFAULT_RSC_HOST_MAX_PENDING_CHUNKS = 256;

export interface RscPending {
  onChunk: (data: Uint8Array) => void;
  onEnd: () => void;
  onError: (message: string) => void;
  onMeta?: (meta: { theme?: AkanTheme; status?: number; trace?: RscTraceMetadata }) => void;
  onTheme?: (theme: AkanTheme | undefined) => void;
  onCacheState?: (state: RouteCacheRenderState) => void;
  onRedirect?: (location: string, method: RscRedirectMethod, status: RscRedirectStatus) => void;
  onLateRedirect?: (location: string, method: RscRedirectMethod, status: RscRedirectStatus) => void;
  onLateNotFound?: () => void;
  onNotFound?: () => void;
}

interface RscCall {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
}

export type RscRedirectMethod = "replace" | "push";
export type RscRedirectStatus = 303 | 307 | 308;

export interface RscWorkerInvalidateCacheMessage {
  type: "invalidate-cache";
  reason?: string;
  tags?: string[];
  paths?: string[];
}

export type RscRenderResult =
  | {
      type: "stream";
      stream: ReadableStream<Uint8Array>;
      theme?: AkanTheme;
      status?: number;
      trace?: RscTraceMetadata;
      lateControl: Promise<SsrLateControl | null>;
      cacheState: Promise<RouteCacheRenderState>;
      cancel: (reason?: unknown) => void;
    }
  | { type: "redirect"; location: string; method: RscRedirectMethod; status: RscRedirectStatus }
  | { type: "not-found" };

export function getRscHostMaxPendingChunks(value = process.env.AKAN_RSC_HOST_MAX_PENDING_CHUNKS): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_RSC_HOST_MAX_PENDING_CHUNKS;
}

export function nextRscHostPendingChunkCount(currentPendingChunks: number, desiredSize: number | null): number {
  return desiredSize !== null && desiredSize <= 0 ? currentPendingChunks + 1 : 0;
}

export function isRscHostPendingChunkOverflow(pendingChunks: number, maxPendingChunks: number): boolean {
  return pendingChunks > maxPendingChunks;
}

function createRscRenderAbortError(reason?: unknown): Error {
  if (reason instanceof Error) return reason;
  const error = new Error(reason === undefined ? "rsc render aborted" : String(reason));
  error.name = "AbortError";
  return error;
}

export function createIdempotentRscRenderCancel(onCancel: (reason?: unknown) => void): (reason?: unknown) => void {
  let cancelled = false;
  return (reason?: unknown) => {
    if (cancelled) return;
    cancelled = true;
    onCancel(reason);
  };
}

export function createRscWorkerInvalidateCacheMessage(
  invalidation?: string | RouteCacheInvalidation,
): RscWorkerInvalidateCacheMessage {
  if (!invalidation) return { type: "invalidate-cache" };
  if (typeof invalidation === "string") return { type: "invalidate-cache", reason: invalidation };
  return {
    type: "invalidate-cache",
    reason: invalidation.reason,
    tags: invalidation.tags,
    paths: invalidation.paths,
  };
}

// `collect` spreads `extra` last, so the worker's own pid/rss/… would overwrite the replica's: rename them.
// XXX A new process-level field in `ProcessMetricsCollector.collect` must be added here too, or it shadows the replica.
export function projectRscWorkerProcessMetrics(metrics: AkanMetricsReport): AkanMetricsReport {
  const {
    role: _role,
    pid: _pid,
    trace: _trace,
    reportedAt,
    rssBytes,
    heapTotalBytes,
    heapUsedBytes,
    externalBytes,
    arrayBuffersBytes,
    cpuUserMicros,
    cpuSystemMicros,
    maxRssKb,
    jscHeapSizeBytes,
    jscHeapCapacityBytes,
    jscExtraMemorySizeBytes,
    jscObjectCount,
    jscProtectedObjectCount,
    eventLoopLagMeanMs,
    eventLoopLagP99Ms,
    eventLoopLagMaxMs,
    gcDurationMs,
    ...renderMetrics
  } = metrics;
  return {
    ...renderMetrics,
    rscWorkerReportedAt: reportedAt,
    rscWorkerRssBytes: rssBytes,
    rscWorkerHeapTotalBytes: heapTotalBytes,
    rscWorkerHeapUsedBytes: heapUsedBytes,
    rscWorkerExternalBytes: externalBytes,
    rscWorkerArrayBuffersBytes: arrayBuffersBytes,
    rscWorkerCpuUserMicros: cpuUserMicros,
    rscWorkerCpuSystemMicros: cpuSystemMicros,
    rscWorkerMaxRssKb: maxRssKb,
    rscWorkerJscHeapSizeBytes: jscHeapSizeBytes,
    rscWorkerJscHeapCapacityBytes: jscHeapCapacityBytes,
    rscWorkerJscExtraMemorySizeBytes: jscExtraMemorySizeBytes,
    rscWorkerJscObjectCount: jscObjectCount,
    rscWorkerJscProtectedObjectCount: jscProtectedObjectCount,
    rscWorkerEventLoopLagMeanMs: eventLoopLagMeanMs,
    rscWorkerEventLoopLagP99Ms: eventLoopLagP99Ms,
    rscWorkerEventLoopLagMaxMs: eventLoopLagMaxMs,
    rscWorkerGcDurationMs: gcDurationMs,
  };
}

export function createRscHostRenderStream(input: {
  setPending: (pending: RscPending) => void;
  deletePending: () => void;
  sendRenderOrQueue: () => void;
  cancelRender: (reason?: unknown) => void;
  maxPendingChunks?: number;
  signal?: AbortSignal;
  onPendingChunkOverflow?: () => void;
}): Promise<RscRenderResult> {
  let settled = false;
  let stream!: ReadableStream<Uint8Array>;
  let theme: AkanTheme | undefined;
  let status: number | undefined;
  let trace: RscTraceMetadata | undefined;
  let resolveLateControl!: (control: SsrLateControl | null) => void;
  let resolveCacheState!: (state: RouteCacheRenderState) => void;
  const lateControl = new Promise<SsrLateControl | null>((resolve) => {
    resolveLateControl = resolve;
  });
  const cacheState = new Promise<RouteCacheRenderState>((resolve) => {
    resolveCacheState = resolve;
  });
  let lateControlSettled = false;
  let cacheStateSettled = false;
  const settleLateControl = (control: SsrLateControl | null) => {
    if (lateControlSettled) return;
    lateControlSettled = true;
    resolveLateControl(control);
  };
  const settleCacheState = (state: RouteCacheRenderState) => {
    if (cacheStateSettled) return;
    cacheStateSettled = true;
    resolveCacheState(state);
  };
  const maxPendingChunks = input.maxPendingChunks ?? getRscHostMaxPendingChunks();
  let pendingChunks = 0;
  let removeAbortListener: (() => void) | undefined;
  const cleanupAbortListener = () => {
    removeAbortListener?.();
    removeAbortListener = undefined;
  };
  const cancelRender = createIdempotentRscRenderCancel((reason) => {
    input.deletePending();
    settleLateControl(null);
    settleCacheState({ cacheable: false, reason: "cancelled" });
    input.cancelRender(reason);
    cleanupAbortListener();
  });

  return new Promise<RscRenderResult>((resolve, reject) => {
    stream = new ReadableStream<Uint8Array>({
      start: (controller) => {
        const abortRender = () => {
          const error = createRscRenderAbortError(input.signal?.reason);
          cancelRender(error);
          if (!settled) {
            settled = true;
            reject(error);
            return;
          }
          controller.error(error);
        };
        const settleStream = () => {
          if (settled) return;
          settled = true;
          resolve({
            type: "stream",
            stream,
            get theme() {
              return theme;
            },
            status,
            trace,
            lateControl,
            cacheState,
            cancel: cancelRender,
          });
        };
        input.setPending({
          onMeta: (meta) => {
            theme = meta.theme;
            status = meta.status;
            trace = meta.trace;
            settleStream();
          },
          onTheme: (next) => {
            theme = next;
          },
          onChunk: (data) => {
            settleStream();
            pendingChunks = nextRscHostPendingChunkCount(pendingChunks, controller.desiredSize);
            if (isRscHostPendingChunkOverflow(pendingChunks, maxPendingChunks)) {
              const error = new Error(`rsc worker host queue exceeded ${maxPendingChunks} pending chunks`);
              input.onPendingChunkOverflow?.();
              cancelRender(error);
              controller.error(error);
              return;
            }
            controller.enqueue(data);
          },
          onEnd: () => {
            settleLateControl(null);
            settleCacheState({ cacheable: false, reason: "missing-cache-state" });
            cleanupAbortListener();
            settleStream();
            controller.close();
          },
          onError: (msg) => {
            settleLateControl(null);
            settleCacheState({ cacheable: false, reason: "error" });
            cleanupAbortListener();
            if (!settled) {
              settled = true;
              reject(new Error(msg));
              return;
            }
            controller.error(new Error(msg));
          },
          onRedirect: (location, method, status) => {
            settleLateControl(null);
            settleCacheState({ cacheable: false, reason: "redirect" });
            cleanupAbortListener();
            if (!settled) {
              settled = true;
              resolve({ type: "redirect", location, method, status });
              controller.close();
              return;
            }
            controller.error(new Error(`redirect after stream started: ${location}`));
          },
          onLateRedirect: (location, method, status) =>
            settleLateControl({ type: "redirect", location, method, status }),
          onLateNotFound: () => settleLateControl({ type: "not-found" }),
          onCacheState: settleCacheState,
          onNotFound: () => {
            settleLateControl(null);
            settleCacheState({ cacheable: false, reason: "not-found" });
            cleanupAbortListener();
            if (!settled) {
              settled = true;
              resolve({ type: "not-found" });
              controller.close();
              return;
            }
            controller.error(new Error("not-found after stream started"));
          },
        });
        if (input.signal) {
          if (input.signal.aborted) {
            abortRender();
            return;
          }
          input.signal.addEventListener("abort", abortRender, { once: true });
          removeAbortListener = () => input.signal?.removeEventListener("abort", abortRender);
        }
        input.sendRenderOrQueue();
      },
      cancel: cancelRender,
      pull: () => {
        pendingChunks = Math.max(0, pendingChunks - 1);
      },
    });
  });
}

type RscInMsg =
  | { type: "hello" }
  | { type: "ready" }
  | { type: "reloaded"; buildId: number; reloadId?: number; pagesBundlePath?: string }
  | { type: "meta"; requestId: string; theme?: AkanTheme; status?: number; trace?: RscTraceMetadata }
  | { type: "theme"; requestId: string; theme?: AkanTheme }
  | { type: "cache-state"; requestId: string; state: RouteCacheRenderState }
  | { type: "chunk"; requestId: string; data: Uint8Array }
  | { type: "end"; requestId: string }
  | { type: "redirect"; requestId: string; location: string; method?: RscRedirectMethod; status?: RscRedirectStatus }
  | {
      type: "late-redirect";
      requestId: string;
      location: string;
      method?: RscRedirectMethod;
      status?: RscRedirectStatus;
    }
  | { type: "late-not-found"; requestId: string }
  | { type: "not-found"; requestId: string }
  | { type: "metrics"; metrics: AkanMetricsReport }
  | { type: "log.records"; records: LogRecord[]; dropped?: number }
  | { type: "page-prompts.result"; requestId: string; result: PagePromptEntry[] }
  | { type: "page-prompt.result"; requestId: string; result: PagePromptRun }
  | {
      type: "error";
      requestId: string;
      message: string;
      buildId?: number;
      reloadId?: number;
      running?: RscAdoptedBundle;
    };

export interface RscWorkerReloadInput {
  clientManifest: ClientManifest;
  cssAssets?: Record<string, CssAsset>;
  buildId: number;
  /** Undefined keeps the latest bundle a reload named (e.g. a client-manifest-only reload after a lazy route build). */
  pagesBundlePath?: string;
}

export interface RscAdoptedBundle {
  pagesBundlePath: string;
  buildId: number;
}

interface RscReloadWaiter {
  resolve: (adopted: RscAdoptedBundle) => void;
  reject: (err: RscReloadFailure) => void;
}

/** A reload the worker did not take: what it runs instead, and whether a later reload failed in this one's place. */
export interface RscReloadFailure extends Error {
  /** What the worker runs now. */
  adopted: RscAdoptedBundle;
  /** The latest state it was asked to take, which a later reload may have moved past the caller's own. */
  failed: RscAdoptedBundle;
}

type WorkerStatus = "starting" | "ready" | "restarting" | "stopped";
type RscProcess = Bun.Subprocess;

export class RscWorker {
  static readonly #devMaxReloads = 10;
  static readonly #devMaxRssBytes = 768 * 1024 * 1024;
  readonly ready: Promise<void>;
  #logger = new Logger("RscWorker");

  #proc: RscProcess;
  readonly #pending = new Map<string, RscPending>();
  readonly #calls = new Map<string, RscCall>();
  #clientManifest: ClientManifest;
  #pagesBundlePath: string;
  #pagesBundleBuildId: number;
  #cssAssets: Record<string, CssAsset>;
  #basePaths: string[];
  #i18n: AkanI18nConfig;
  #resolveReady!: () => void;
  #rejectReady!: (err: Error) => void;
  #readyResolved = false;
  //? The newest reload state and everyone waiting on it: sent to a ready worker under `reloadId`, or left for the next
  //? worker to become ready (a respawn, a rolling recycle), whose init reply or next reload carries it.
  #pendingReload: {
    waiters: RscReloadWaiter[];
    reloadState: number;
    reloadId: number | null;
    pagesBundlePath: string;
    buildId: number;
  } | null = null;
  #nextReloadId = 1;
  #answeredReloadId = 0;
  //? Sends a booting replacement could not take: a worker the host falls back to gets them again.
  #droppedWhileBooting = false;
  #reloadState = 0;
  #init: RscAdoptedBundle & { reloadState: number } = { pagesBundlePath: "", buildId: 0, reloadState: 0 };
  /** What the worker runs: a respawn falls back to it when the bundle a reload named failed to import. */
  #adopted: RscAdoptedBundle;

  #status: WorkerStatus = "starting";
  #killed = false;
  #queuedSends: { requestId: string; send: () => void }[] = [];
  #restartAttempts = 0;
  #restartCount = 0;
  #recycleCount = 0;
  #reloadsSinceSpawn = 0;
  #lastRecycleAtMono: number | null = null;
  #lastRecycleReason: string | undefined;
  #lastWorkerMetrics: AkanMetricsReport = {};
  onLogRecords: ((records: LogRecord[], dropped: number) => void) | null = null;
  #logLevel: number | null = null;
  #hostPendingChunkOverflowCount = 0;
  #restartTimer: ReturnType<typeof setTimeout> | null = null;
  #recycleTimer: ReturnType<typeof setTimeout> | null = null;
  #rollingRecycle: { oldProc: RscProcess; reason: string; reloadsSinceSpawn: number } | null = null;
  #booting: RscProcess | null = null;

  readonly #failBeforeReady: boolean;
  static readonly #queuedRespawns = 2;

  constructor(artifact: BaseBuildArtifact, { failBeforeReady = false }: { failBeforeReady?: boolean } = {}) {
    this.#failBeforeReady = failBeforeReady;
    this.#clientManifest = artifact.rscRuntimeClientManifest ?? {};
    this.#pagesBundlePath = artifact.pagesBundlePath;
    this.#pagesBundleBuildId = artifact.pagesBundleBuildId;
    this.#adopted = { pagesBundlePath: artifact.pagesBundlePath, buildId: artifact.pagesBundleBuildId };
    this.#cssAssets = artifact.cssAssets ?? {};
    this.#basePaths = artifact.basePaths ?? [];
    this.#i18n = artifact.i18n ?? DEFAULT_AKAN_I18N;
    this.ready = new Promise<void>((resolve, reject) => {
      this.#resolveReady = () => {
        if (this.#readyResolved) return;
        this.#readyResolved = true;
        resolve();
      };
      this.#rejectReady = (err) => {
        if (this.#readyResolved) return;
        this.#readyResolved = true;
        reject(err);
      };
    });

    this.#proc = this.#spawn();
  }

  renderWithMeta(
    req: Request,
    options: { clientManifest?: ClientManifest; signal?: AbortSignal; clientIp?: string | null } = {},
  ): Promise<RscRenderResult> {
    const requestId = crypto.randomUUID();
    return createRscHostRenderStream({
      setPending: (pending) => this.#pending.set(requestId, pending),
      deletePending: () => this.#pending.delete(requestId),
      sendRenderOrQueue: () => this.#sendRenderOrQueue(requestId, req, options.clientManifest, options.clientIp),
      cancelRender: () => this.#cancelRender(requestId),
      signal: options.signal,
      onPendingChunkOverflow: () => {
        this.#hostPendingChunkOverflowCount += 1;
      },
    });
  }

  listPagePrompts(): Promise<PagePromptEntry[]> {
    return this.#call<PagePromptEntry[]>((requestId) => ({ type: "page-prompts", requestId }));
  }

  runPagePrompt(input: PagePromptRunInput): Promise<PagePromptRun> {
    return this.#call<PagePromptRun>((requestId) => ({ type: "page-prompt.run", requestId, input }));
  }

  #call<T>(message: (requestId: string) => object): Promise<T> {
    const requestId = crypto.randomUUID();
    return new Promise<T>((resolve, reject) => {
      this.#calls.set(requestId, { resolve: resolve as (value: unknown) => void, reject });
      const send = () => {
        if (!this.#calls.has(requestId)) return;
        try {
          this.#proc.send(message(requestId));
        } catch (err) {
          this.#settleCall(requestId, (call) =>
            call.reject(new Error(`rsc worker send failed: ${err instanceof Error ? err.message : String(err)}`)),
          );
        }
      };
      if (this.#status === "ready") send();
      else if (this.#status === "stopped")
        this.#settleCall(requestId, (call) => call.reject(new Error("rsc worker is stopped")));
      else this.#queuedSends.push({ requestId, send });
    });
  }

  #settleCall(requestId: string, fn: (call: RscCall) => void): boolean {
    const call = this.#calls.get(requestId);
    if (!call) return false;
    this.#calls.delete(requestId);
    fn(call);
    return true;
  }

  invalidateRouteResultCache(invalidation?: string | RouteCacheInvalidation): void {
    if (this.#status !== "ready") {
      this.#droppedWhileBooting = true;
      return;
    }
    try {
      this.#proc.send(createRscWorkerInvalidateCacheMessage(invalidation));
    } catch (error) {
      this.#logger.warn(
        `rsc worker cache invalidate send failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  kill(): void {
    this.#killed = true;
    this.#status = "stopped";
    if (this.#restartTimer) clearTimeout(this.#restartTimer);
    if (this.#recycleTimer) clearTimeout(this.#recycleTimer);
    this.#restartTimer = null;
    this.#recycleTimer = null;
    this.#rollingRecycle?.oldProc.kill();
    this.#rollingRecycle = null;
    this.#proc.kill();
  }

  setLogLevel(minSev: number | null) {
    this.#logLevel = minSev;
    if (this.#status !== "ready") this.#droppedWhileBooting = true;
    this.#sendLogLevel();
  }

  #sendLogLevel() {
    if (this.#status !== "ready") return;
    try {
      this.#proc.send({ type: "log-level", minSev: this.#logLevel });
    } catch {
      // The worker is gone; the `ready` of its replacement re-sends the level.
    }
  }

  getMetrics(): AkanMetricsReport {
    return Object.assign(projectRscWorkerProcessMetrics(this.#lastWorkerMetrics), {
      rscWorkerPid: this.#proc.pid,
      rscWorkerStatus: this.#status,
      rscWorkerRestartCount: this.#restartCount,
      rscWorkerRecycleCount: this.#recycleCount,
      rscWorkerLastRecycleReason: this.#lastRecycleReason,
      rscPendingRenderCount: this.#pending.size,
      rscQueuedSendCount: this.#queuedSends.length,
      rscHostPendingChunkOverflowCount: this.#hostPendingChunkOverflowCount,
    });
  }

  restartWhenIdle(reason: string): boolean {
    if (this.#killed || this.#status === "stopped" || this.#status === "starting" || this.#status === "restarting") {
      return false;
    }
    if (this.#pending.size > 0 || this.#calls.size > 0 || this.#queuedSends.length > 0) {
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
    this.#logger.info(`[rsc] rolling recycle worker reason=${reason} oldPid=${this.#proc.pid}`);
    this.#status = "restarting";
    this.#rollingRecycle = { oldProc: this.#proc, reason, reloadsSinceSpawn: this.#reloadsSinceSpawn };
    this.#proc = this.#spawn();
    return true;
  }

  updateCssAssets(cssAssets: Record<string, CssAsset>): void {
    this.#cssAssets = cssAssets;
    if (this.#status !== "ready") {
      this.#droppedWhileBooting = true;
      return;
    }
    try {
      this.#proc.send({ type: "updateCssAssets", cssAssets });
    } catch {
      // A worker that died mid-send gets the new value from the init reply to its next hello.
    }
  }

  /** Resolves with the pages bundle the worker runs once it has taken this reload, or a later one. */
  reload(input: RscWorkerReloadInput): Promise<RscAdoptedBundle> {
    if (this.#killed) return Promise.reject(new Error("rsc worker is stopped"));
    this.#reloadState += 1;
    this.#clientManifest = input.clientManifest;
    this.#cssAssets = input.cssAssets ?? this.#cssAssets;
    this.#pagesBundleBuildId = input.buildId;
    if (input.pagesBundlePath) this.#pagesBundlePath = input.pagesBundlePath;
    return new Promise<RscAdoptedBundle>((resolve, reject) => {
      //? A superseded reload settles with the one that superseded it: the worker drops it unadopted, so resolving it
      //? at once let its caller refresh the tabs while the worker still ran the bundle before both.
      this.#pendingReload = {
        waiters: [...(this.#pendingReload?.waiters ?? []), { resolve, reject }],
        reloadState: this.#reloadState,
        reloadId: null,
        pagesBundlePath: this.#pagesBundlePath,
        buildId: this.#pagesBundleBuildId,
      };
      if (this.#status === "ready") this.#sendPendingReload();
    });
  }

  #sendPendingReload(): void {
    const pending = this.#pendingReload;
    if (!pending) return;
    // Bun's ESM registry never evicts an old `?v=<buildId>` import, so in-place reloads ratchet RSS; recycle (rolling)
    // past a threshold — recycling on every reload would throw away every lazily-warmed route module.
    //? Not while a reload sent to this worker is unanswered: it may still adopt that one after a replacement took over,
    //? unheard, so this one goes in place and a later reload recycles.
    const answering = this.#answeredReloadId < this.#nextReloadId - 1;
    if (!answering && this.#shouldRecycleForReloadAccumulation() && this.restartWhenIdle("pages-reload-accumulation"))
      return;
    this.#reloadsSinceSpawn += 1;
    pending.reloadId = this.#nextReloadId++;
    try {
      //? The latest bundle, never a request's own: one sent without a path made the worker fall back to the bundle it
      //? had adopted, while the reload it superseded was still importing the newer one.
      this.#proc.send({
        type: "reload",
        clientManifest: this.#clientManifest,
        cssAssets: this.#cssAssets,
        buildId: pending.buildId,
        pagesBundlePath: pending.pagesBundlePath,
        reloadId: pending.reloadId,
      });
    } catch {
      // A closed channel means the worker is exiting: its respawn's init reply carries this state.
      pending.reloadId = null;
    }
  }

  #resolveReload(adopted: RscAdoptedBundle): void {
    this.#adopted = adopted;
    const pending = this.#pendingReload;
    if (!pending) return;
    this.#pendingReload = null;
    for (const waiter of pending.waiters) waiter.resolve(adopted);
  }

  //? The worker did not take the latest state, so the host goes back to what it runs: the next respawn then boots a
  //? bundle that loads, and each caller learns what the worker serves.
  #rejectReload(message: string): void {
    this.#pagesBundlePath = this.#adopted.pagesBundlePath;
    this.#pagesBundleBuildId = this.#adopted.buildId;
    const pending = this.#pendingReload;
    if (!pending) return;
    this.#pendingReload = null;
    const failed = { pagesBundlePath: pending.pagesBundlePath, buildId: pending.buildId };
    for (const waiter of pending.waiters)
      waiter.reject(Object.assign(new Error(message), { adopted: this.#adopted, failed }));
  }

  #spawn(): RscProcess {
    this.#status = "starting";
    this.#reloadsSinceSpawn = 0;
    const workerPath = this.#resolveWorkerPath();
    let proc!: RscProcess;
    const earlyMessages: RscInMsg[] = [];
    // Piped only under ndjson, where an inherited stdout would put text lines into the JSON stream.
    const piped = Logger.isNdjson;
    proc = Bun.spawn(["bun", "--conditions", "react-server", workerPath], {
      ipc: (message: RscInMsg) => {
        if (!proc) {
          earlyMessages.push(message);
          return;
        }
        this.#handleMessage(message, proc);
      },
      stdio: ["ignore", piped ? "pipe" : "inherit", piped ? "pipe" : "inherit"],
      serialization: "advanced",
      env: { ...process.env },
    });
    if (piped) this.#readOutput(proc);
    if (earlyMessages.length > 0) {
      setTimeout(() => {
        for (const message of earlyMessages.splice(0)) this.#handleMessage(message, proc);
      }, 0);
    }
    proc.exited.then((code) => this.#handleExit(proc, code));
    return proc;
  }

  #readOutput(proc: RscProcess) {
    const replicaIdx = Number(process.env.AKAN_REPLICA_IDX);
    const record = (type: "stdout" | "stderr", text: string) =>
      this.onLogRecords?.(
        [
          ChildOutputReader.toRecord({
            type,
            text,
            name: "rsc-worker",
            role: "rsc-worker",
            replicaIdx: Number.isInteger(replicaIdx) ? replicaIdx : null,
            pid: proc.pid,
          }),
        ],
        0,
      );
    const reader = new ChildOutputReader({
      onLine: (line) => record("stdout", line),
      onBlock: (lines) => record("stderr", lines.join("")),
    });
    void reader.pipe(proc.stdout instanceof ReadableStream ? proc.stdout : null, "stdout");
    void reader.pipe(proc.stderr instanceof ReadableStream ? proc.stderr : null, "stderr");
  }

  #resolveWorkerPath(): string {
    if (process.env.AKAN_RSC_WORKER_PATH) return path.resolve(process.env.AKAN_RSC_WORKER_PATH);

    const distWorkerPath = path.join(process.cwd(), "rscWorker.js");
    if (fs.existsSync(distWorkerPath)) return distWorkerPath;

    try {
      return Bun.resolveSync("akanjs/server/rsc-worker", import.meta.dir);
    } catch {
      return fileURLToPath(new URL("./rscWorker.tsx", import.meta.url));
    }
  }

  #handleMessage(message: RscInMsg, proc: RscProcess): void {
    if (proc !== this.#proc) return;
    if (message.type === "cache-state") {
      this.#pending.get(message.requestId)?.onCacheState?.(message.state);
      return;
    }
    switch (message.type) {
      case "hello":
        // A respawned worker asks for config first; this is what carries the latest reload(...) state across a crash.
        this.#booting = proc;
        this.#init = {
          pagesBundlePath: this.#pagesBundlePath,
          buildId: this.#pagesBundleBuildId,
          reloadState: this.#reloadState,
        };
        this.#proc.send({
          type: "init",
          clientManifest: this.#clientManifest,
          pagesBundlePath: this.#pagesBundlePath,
          pagesBundleBuildId: this.#pagesBundleBuildId,
          cssAssets: this.#cssAssets,
          basePaths: this.#basePaths,
          i18n: this.#i18n,
        });
        return;
      case "ready":
        this.#booting = null;
        this.#status = "ready";
        this.#answeredReloadId = this.#nextReloadId - 1;
        this.#droppedWhileBooting = false;
        this.#restartAttempts = 0;
        this.#resolveReady();
        this.#finishRollingRecycle();
        this.#flushQueuedSends();
        if (this.#logLevel !== null) this.#sendLogLevel();
        //? A worker that booted from the init reply runs the reload state of its hello: a reload the crashed or recycled
        //? one never answered is taken by it, and one that came after that hello is sent to it now.
        this.#adopted = { pagesBundlePath: this.#init.pagesBundlePath, buildId: this.#init.buildId };
        if (this.#pendingReload && this.#pendingReload.reloadState <= this.#init.reloadState)
          this.#resolveReload(this.#adopted);
        else this.#sendPendingReload();
        return;
      case "reloaded": {
        const pending = this.#pendingReload;
        //? The worker adopts in the order it was sent, so its latest answer is what it runs, even one a newer reload
        //? overtook on the way here: a failure of that newer one goes back to it, not to the bundle before. With no
        //? reload waiting, the host's own state follows too, so a crash respawn boots it.
        if (proc === this.#proc && message.pagesBundlePath) {
          this.#adopted = { pagesBundlePath: message.pagesBundlePath, buildId: message.buildId };
          this.#answeredReloadId = Math.max(this.#answeredReloadId, message.reloadId ?? 0);
          if (!pending) {
            this.#pagesBundlePath = message.pagesBundlePath;
            this.#pagesBundleBuildId = message.buildId;
          }
        }
        if (pending && pending.reloadId !== null && pending.reloadId === message.reloadId)
          this.#resolveReload({ pagesBundlePath: pending.pagesBundlePath, buildId: pending.buildId });
        return;
      }
      case "chunk":
        this.#pending.get(message.requestId)?.onChunk(message.data);
        return;
      case "meta":
        this.#pending
          .get(message.requestId)
          ?.onMeta?.({ theme: message.theme, status: message.status, trace: message.trace });
        return;
      case "theme":
        this.#pending.get(message.requestId)?.onTheme?.(message.theme);
        return;
      case "end":
        this.#resolvePending(message.requestId, (p) => p.onEnd());
        return;
      case "redirect":
        this.#resolvePending(message.requestId, (p) =>
          p.onRedirect?.(message.location, message.method ?? "replace", message.status ?? 307),
        );
        return;
      case "late-redirect":
        this.#pending
          .get(message.requestId)
          ?.onLateRedirect?.(message.location, message.method ?? "replace", message.status ?? 307);
        return;
      case "late-not-found":
        this.#pending.get(message.requestId)?.onLateNotFound?.();
        return;
      case "not-found":
        this.#resolvePending(message.requestId, (p) => p.onNotFound?.());
        return;
      case "metrics":
        this.#lastWorkerMetrics = message.metrics;
        this.#maybeRecycleFromMetrics(message.metrics);
        return;
      case "log.records":
        this.onLogRecords?.(message.records, message.dropped ?? 0);
        return;
      case "page-prompts.result":
      case "page-prompt.result":
        this.#settleCall(message.requestId, (call) => call.resolve(message.result));
        return;
      case "error":
        if (message.requestId === "__init__") {
          if (!this.#readyResolved) {
            this.#rejectReload(String(message.message));
            this.#rejectReady(new Error(String(message.message)));
          } else {
            this.#bootFailed(proc, String(message.message));
            proc.kill();
          }
          return;
        }
        if (message.requestId === "__reload__") {
          if (proc === this.#proc) this.#answeredReloadId = Math.max(this.#answeredReloadId, message.reloadId ?? 0);
          if (proc === this.#proc && message.running) this.#adopted = message.running;
          const pending = this.#pendingReload;
          if (pending && pending.reloadId !== null && pending.reloadId === message.reloadId)
            this.#rejectReload(String(message.message));
          return;
        }
        if (this.#settleCall(message.requestId, (call) => call.reject(new Error(String(message.message))))) return;
        this.#resolvePending(message.requestId, (p) => p.onError(String(message.message)));
        return;
    }
  }

  #resolvePending(requestId: string, fn: (p: RscPending) => void): void {
    const p = this.#pending.get(requestId);
    if (!p) return;
    fn(p);
    this.#pending.delete(requestId);
  }

  /** The page request's headers as the worker sees them, `x-real-ip` being only the address the host resolved. */
  static workerHeaders(req: Request, clientIp: string | null | undefined): Record<string, string> {
    const headers: Record<string, string> = {};
    req.headers.forEach((value, key) => {
      headers[key] = value;
    });
    // Security: the worker's fetch hands `x-real-ip` to a loopback that trusts it, so a browser's own one never passes.
    delete headers["x-real-ip"];
    if (clientIp) headers["x-real-ip"] = clientIp;
    return headers;
  }

  #sendRenderOrQueue(requestId: string, req: Request, clientManifest?: ClientManifest, clientIp?: string | null): void {
    const send = () => {
      if (!this.#pending.has(requestId)) return;
      try {
        const headers = RscWorker.workerHeaders(req, clientIp);
        this.#proc.send({ type: "render", requestId, url: req.url, method: req.method, headers, clientManifest });
      } catch (err) {
        this.#resolvePending(requestId, (p) =>
          p.onError(`rsc worker send failed: ${err instanceof Error ? err.message : String(err)}`),
        );
      }
    };
    if (this.#status === "ready") send();
    else if (this.#status === "stopped") {
      this.#resolvePending(requestId, (p) => p.onError("rsc worker is stopped"));
    } else {
      this.#queuedSends.push({ requestId, send });
    }
  }

  #cancelRender(requestId: string): void {
    if (this.#status !== "ready") return;
    try {
      this.#proc.send({ type: "cancel", requestId });
    } catch {
      // A worker that died before this send is cleaned up by its exit path.
    }
  }

  #flushQueuedSends(): void {
    const queue = this.#queuedSends;
    this.#queuedSends = [];
    for (const { send } of queue) {
      try {
        send();
      } catch (err) {
        this.#logger.error(`[rsc] queued send failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  #failRequests(err: Error, which: (requestId: string) => boolean = () => true): void {
    for (const [requestId, pending] of this.#pending) {
      if (!which(requestId)) continue;
      this.#pending.delete(requestId);
      pending.onError(err.message);
    }
    for (const [requestId, call] of this.#calls) {
      if (!which(requestId)) continue;
      this.#calls.delete(requestId);
      call.reject(err);
    }
    this.#queuedSends = this.#queuedSends.filter((entry) => !which(entry.requestId));
  }

  //* A respawned or replacement worker that could not boot its hello's state. Covered (no reload came since), the host
  //* goes back to the bundle that runs; newer, the fix boots next. A replacement hands its queue back to the worker it
  //* was to replace while that one lives, which then takes the fix in place or recycles again; otherwise it is a crash.
  #bootFailed(proc: RscProcess, message: string): boolean {
    this.#booting = null;
    this.#logger.error(`[rsc] worker init error on restart: ${message}`);
    const covered = !this.#pendingReload || this.#pendingReload.reloadState <= this.#init.reloadState;
    if (covered) this.#rejectReload(message);
    const rolling = proc === this.#proc ? this.#rollingRecycle : null;
    this.#rollingRecycle = null;
    if (!rolling || !RscWorker.#isAlive(rolling.oldProc)) return false;
    this.#proc = rolling.oldProc;
    this.#status = "ready";
    this.#reloadsSinceSpawn = rolling.reloadsSinceSpawn;
    if (this.#droppedWhileBooting) {
      this.#droppedWhileBooting = false;
      this.updateCssAssets(this.#cssAssets);
      this.#sendLogLevel();
      this.invalidateRouteResultCache();
    }
    this.#flushQueuedSends();
    if (!covered) this.#sendPendingReload();
    return true;
  }

  static #isAlive(proc: RscProcess): boolean {
    return proc.exitCode === null && proc.signalCode === null && !proc.killed;
  }

  #finishRollingRecycle(): void {
    const recycle = this.#rollingRecycle;
    if (!recycle) return;
    this.#rollingRecycle = null;
    this.#logger.info(
      `[rsc] rolling recycle ready reason=${recycle.reason} oldPid=${recycle.oldProc.pid} newPid=${this.#proc.pid}`,
    );
    recycle.oldProc.kill();
    this.#lastWorkerMetrics = {};
  }

  #handleExit(proc: RscProcess, code: number | null): void {
    //? The worker a recycle was replacing died first: the replacement boots on, with nothing to fall back to.
    if (proc === this.#rollingRecycle?.oldProc) {
      this.#rollingRecycle = null;
      return;
    }
    // A replaced proc's late exit must not schedule a second restart.
    if (proc !== this.#proc) return;
    //? Exiting while it imports the pages bundle (a `process.exit` at a module's top level) fails the boot like a throw:
    //? a first boot rejects `ready`, as its init error would, instead of restarting into the same exit forever. A kill
    //? from outside (an OOM) is a crash, not the bundle's.
    if (proc === this.#booting && !this.#killed && proc.signalCode === null) {
      const message = `rsc worker exited with code ${code} while loading the pages bundle`;
      if (this.#readyResolved && this.#bootFailed(proc, message)) return;
      if (!this.#readyResolved) {
        this.#booting = null;
        this.#status = "stopped";
        this.#failRequests(new Error(message));
        this.#rejectReload(message);
        this.#rejectReady(new Error(message));
        return;
      }
    }

    const err = new Error(`rsc worker exited with code ${code}`);
    //? Only what this worker was sent: a request still queued never reached it, and the respawn takes it. That holds
    //? across a crash and a respawn that failed to boot, not a crash loop, where it would wait forever.
    const queued = new Set(this.#queuedSends.map((entry) => entry.requestId));
    const keepsQueue = this.#restartAttempts < RscWorker.#queuedRespawns;
    this.#failRequests(err, (requestId) => !keepsQueue || !queued.has(requestId));

    if (this.#killed) {
      this.#status = "stopped";
      this.#failRequests(err);
      this.#rejectReload(err.message);
      return;
    }
    if (this.#failBeforeReady && !this.#readyResolved) {
      this.#status = "stopped";
      this.#failRequests(err);
      this.#rejectReload(err.message);
      this.#rejectReady(err);
      return;
    }

    this.#scheduleRestart();
  }

  #scheduleRestart(): void {
    this.#status = "restarting";
    const delay = Math.min(200 * 2 ** this.#restartAttempts, 30_000);
    this.#restartAttempts += 1;
    this.#restartCount += 1;
    this.#logger.verbose(`[rsc] worker crashed, restarting in ${delay}ms (attempt ${this.#restartAttempts})`);
    this.#restartTimer = setTimeout(() => {
      this.#restartTimer = null;
      if (this.#killed) return;
      try {
        this.#proc = this.#spawn();
      } catch (err) {
        this.#logger.error(`[rsc] failed to spawn worker: ${err instanceof Error ? err.message : String(err)}`);
        this.#scheduleRestart();
      }
    }, delay);
  }

  #shouldRecycleForReloadAccumulation(): boolean {
    const maxReloads = RscWorker.#getRscMaxReloads();
    if (!maxReloads || this.#reloadsSinceSpawn < maxReloads) return false;
    // A save-on-keystroke burst reloads in place; the counter stays over the threshold, so the next reload recycles.
    if (this.#lastRecycleAtMono === null) return true;
    const minIntervalMs = MemoryLimit.parsePositiveIntEnv("AKAN_RSC_WORKER_MIN_RECYCLE_INTERVAL_MS") ?? 1_000;
    return performance.now() - this.#lastRecycleAtMono >= minIntervalMs;
  }

  #maybeRecycleFromMetrics(metrics: AkanMetricsReport): void {
    if (this.#pending.size > 0 || this.#calls.size > 0) return;
    const maxRssBytes = RscWorker.#getRscMaxRssBytes();
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
    return process.env.NODE_ENV === "production" ? null : RscWorker.#devMaxReloads;
  }

  static #getRscMaxRssBytes(): number | null {
    return MemoryLimit.resolveMaxRssBytes({
      megabytesEnv: "AKAN_RSC_WORKER_MAX_RSS_MB",
      bytesEnv: "AKAN_RSC_WORKER_MAX_RSS",
      limitFraction: 0.55,
      // Dev has no limit to derive from, yet should recycle before swapping; well above the ~142MB post-boot baseline.
      fallbackBytes: process.env.NODE_ENV === "production" ? null : RscWorker.#devMaxRssBytes,
    });
  }
}
