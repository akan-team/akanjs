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
import type { RscTraceMetadata, SsrLateRedirect } from "./ssrTypes";
import type { BaseBuildArtifact, CssAsset } from "./types";

// A bounded queue guard, not backpressure: a host that cannot drain IPC chunks fails the render instead of buffering.
const DEFAULT_RSC_HOST_MAX_PENDING_CHUNKS = 256;

export interface RscPending {
  onChunk: (data: Uint8Array) => void;
  onEnd: () => void;
  onError: (message: string) => void;
  onMeta?: (meta: { theme?: AkanTheme; status?: number; trace?: RscTraceMetadata }) => void;
  onCacheState?: (state: RouteCacheRenderState) => void;
  onRedirect?: (location: string, method: RscRedirectMethod, status: RscRedirectStatus) => void;
  onLateRedirect?: (location: string, method: RscRedirectMethod, status: RscRedirectStatus) => void;
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
      lateControl: Promise<SsrLateRedirect | null>;
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
  let resolveLateControl!: (control: SsrLateRedirect | null) => void;
  let resolveCacheState!: (state: RouteCacheRenderState) => void;
  const lateControl = new Promise<SsrLateRedirect | null>((resolve) => {
    resolveLateControl = resolve;
  });
  const cacheState = new Promise<RouteCacheRenderState>((resolve) => {
    resolveCacheState = resolve;
  });
  let lateControlSettled = false;
  let cacheStateSettled = false;
  const settleLateControl = (control: SsrLateRedirect | null) => {
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
          resolve({ type: "stream", stream, theme, status, trace, lateControl, cacheState, cancel: cancelRender });
        };
        input.setPending({
          onMeta: (meta) => {
            theme = meta.theme;
            status = meta.status;
            trace = meta.trace;
            settleStream();
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
  | { type: "reloaded"; buildId: number; reloadId?: number }
  | { type: "meta"; requestId: string; theme?: AkanTheme; status?: number; trace?: RscTraceMetadata }
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
  | { type: "not-found"; requestId: string }
  | { type: "metrics"; metrics: AkanMetricsReport }
  | { type: "log.records"; records: LogRecord[]; dropped?: number }
  | { type: "page-prompts.result"; requestId: string; result: PagePromptEntry[] }
  | { type: "page-prompt.result"; requestId: string; result: PagePromptRun }
  | { type: "error"; requestId: string; message: string; buildId?: number; reloadId?: number };

export interface RscWorkerReloadInput {
  clientManifest: ClientManifest;
  cssAssets?: Record<string, CssAsset>;
  buildId: number;
  /** Undefined keeps the latest bundle a reload named (e.g. a client-manifest-only reload after a lazy route build). */
  pagesBundlePath?: string;
}

interface RscAdoptedBundle {
  pagesBundlePath: string;
  buildId: number;
}

interface RscReloadWaiter {
  resolve: (pagesBundlePath: string) => void;
  reject: (err: Error) => void;
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
  #pendingReload: {
    waiters: RscReloadWaiter[];
    reloadId: number;
    pagesBundlePath: string;
    buildId: number;
  } | null = null;
  #nextReloadId = 1;
  #reloadState = 0;
  #init: RscAdoptedBundle & { reloadState: number } = { pagesBundlePath: "", buildId: 0, reloadState: 0 };
  /** What the worker runs: a respawn falls back to it when the bundle a reload named failed to import. */
  #adopted: RscAdoptedBundle;

  #status: WorkerStatus = "starting";
  #killed = false;
  #queuedSends: Array<() => void> = [];
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
  #rollingRecycle: { oldProc: RscProcess; reason: string } | null = null;

  readonly #failBeforeReady: boolean;

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
    options: { clientManifest?: ClientManifest; signal?: AbortSignal } = {},
  ): Promise<RscRenderResult> {
    const requestId = crypto.randomUUID();
    return createRscHostRenderStream({
      setPending: (pending) => this.#pending.set(requestId, pending),
      deletePending: () => this.#pending.delete(requestId),
      sendRenderOrQueue: () => this.#sendRenderOrQueue(requestId, req, options.clientManifest),
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
      else this.#queuedSends.push(send);
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
    if (this.#status !== "ready") return;
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
    if (this.#pending.size > 0 || this.#queuedSends.length > 0) {
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
    this.#rollingRecycle = { oldProc: this.#proc, reason };
    this.#proc = this.#spawn();
    return true;
  }

  updateCssAssets(cssAssets: Record<string, CssAsset>): void {
    this.#cssAssets = cssAssets;
    if (this.#status !== "ready") return;
    try {
      this.#proc.send({ type: "updateCssAssets", cssAssets });
    } catch {
      // A worker that died mid-send gets the new value from the init reply to its next hello.
    }
  }

  /** Resolves with the pages bundle the worker runs once it has taken this reload, or a later one. */
  reload(input: RscWorkerReloadInput): Promise<string> {
    this.#reloadState += 1;
    this.#clientManifest = input.clientManifest;
    this.#cssAssets = input.cssAssets ?? this.#cssAssets;
    this.#pagesBundleBuildId = input.buildId;
    if (input.pagesBundlePath) this.#pagesBundlePath = input.pagesBundlePath;
    const pagesBundlePath = this.#pagesBundlePath;
    // A starting worker receives all of this through the init reply to its hello; there is no reloaded ack to await.
    if (this.#status !== "ready") return Promise.resolve(pagesBundlePath);
    // Bun's ESM registry never evicts an old `?v=<buildId>` import, so in-place reloads ratchet RSS; recycle (rolling)
    // past a threshold — recycling on every reload would throw away every lazily-warmed route module.
    if (this.#shouldRecycleForReloadAccumulation() && this.restartWhenIdle("pages-reload-accumulation")) {
      return Promise.resolve(pagesBundlePath);
    }
    this.#reloadsSinceSpawn += 1;
    return new Promise<string>((resolve, reject) => {
      //? A superseded reload settles with the one that superseded it: the worker drops it unadopted, so resolving it
      //? at once let its caller refresh the tabs while the worker still ran the bundle before both.
      const waiters = [...(this.#pendingReload?.waiters ?? []), { resolve, reject }];
      const reloadId = this.#nextReloadId++;
      this.#pendingReload = { waiters, reloadId, pagesBundlePath, buildId: input.buildId };
      try {
        //? The latest bundle, never the request's own: one sent without a path made the worker fall back to the
        //? bundle it had adopted, while the reload it superseded was still importing the newer one.
        this.#proc.send({
          type: "reload",
          clientManifest: input.clientManifest,
          cssAssets: this.#cssAssets,
          buildId: input.buildId,
          pagesBundlePath,
          reloadId,
        });
      } catch (err) {
        this.#settleReload({ error: err instanceof Error ? err : new Error(String(err)) });
      }
    });
  }

  //? Without a reload id the outcome is the worker's as a whole: a respawn that booted from the init reply, or one
  //? that failed to. A failure puts the host back on what the worker ran, so the next respawn boots a bundle that loads.
  #settleReload(outcome: { adopted: RscAdoptedBundle } | { error: Error }, reloadId?: number): void {
    const pending = this.#pendingReload;
    if (reloadId !== undefined && pending?.reloadId !== reloadId) return;
    if ("adopted" in outcome) this.#adopted = outcome.adopted;
    else {
      this.#pagesBundlePath = this.#adopted.pagesBundlePath;
      this.#pagesBundleBuildId = this.#adopted.buildId;
    }
    if (!pending) return;
    this.#pendingReload = null;
    for (const waiter of pending.waiters) {
      if ("error" in outcome) waiter.reject(outcome.error);
      else waiter.resolve(outcome.adopted.pagesBundlePath);
    }
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
        this.#status = "ready";
        this.#restartAttempts = 0;
        this.#resolveReady();
        //? A worker that booted from the init reply runs the reload state of its hello, so a reload the crashed or
        //? recycled one never answered is taken; one that came between that hello and now is sent again.
        this.#settleReload({ adopted: { pagesBundlePath: this.#init.pagesBundlePath, buildId: this.#init.buildId } });
        this.#finishRollingRecycle();
        this.#flushQueuedSends();
        if (this.#logLevel !== null) this.#sendLogLevel();
        if (this.#init.reloadState !== this.#reloadState)
          void this.reload({ clientManifest: this.#clientManifest, buildId: this.#pagesBundleBuildId }).catch(
            (err: unknown) => this.#logger.error(`[rsc] reload after restart failed: ${String(err)}`),
          );
        return;
      case "reloaded":
        if (this.#pendingReload)
          this.#settleReload(
            {
              adopted: { pagesBundlePath: this.#pendingReload.pagesBundlePath, buildId: this.#pendingReload.buildId },
            },
            message.reloadId,
          );
        return;
      case "chunk":
        this.#pending.get(message.requestId)?.onChunk(message.data);
        return;
      case "meta":
        this.#pending
          .get(message.requestId)
          ?.onMeta?.({ theme: message.theme, status: message.status, trace: message.trace });
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
          if (!this.#readyResolved) this.#rejectReady(new Error(String(message.message)));
          else {
            this.#logger.error(`[rsc] worker init error on restart: ${message.message}`);
            this.#settleReload({ error: new Error(String(message.message)) });
            proc.kill();
          }
          return;
        }
        if (message.requestId === "__reload__") {
          this.#settleReload({ error: new Error(String(message.message)) }, message.reloadId);
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

  #sendRenderOrQueue(requestId: string, req: Request, clientManifest?: ClientManifest): void {
    const send = () => {
      if (!this.#pending.has(requestId)) return;
      try {
        const headers: Record<string, string> = {};
        req.headers.forEach((value, key) => {
          headers[key] = value;
        });
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
      this.#queuedSends.push(send);
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
    for (const send of queue) {
      try {
        send();
      } catch (err) {
        this.#logger.error(`[rsc] queued send failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
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
    // A replaced proc's late exit must not schedule a second restart.
    if (proc !== this.#proc) return;

    const err = new Error(`rsc worker exited with code ${code}`);
    for (const [, p] of this.#pending) p.onError(err.message);
    this.#pending.clear();
    for (const [, call] of this.#calls) call.reject(err);
    this.#calls.clear();
    this.#queuedSends = [];

    if (this.#killed) {
      this.#status = "stopped";
      this.#settleReload({ error: err });
      return;
    }
    if (this.#failBeforeReady && !this.#readyResolved) {
      this.#status = "stopped";
      this.#settleReload({ error: err });
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
    if (this.#pending.size > 0) return;
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
