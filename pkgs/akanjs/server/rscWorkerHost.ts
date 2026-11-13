import { AkanError } from "akanjs/base";
import { Logger, type LogRecord } from "akanjs/common";
import type { AkanTheme } from "akanjs/fetch";
import type { AkanMetricsReport } from "akanjs/service";
import type {
  PagePromptEntry,
  PagePromptRun,
  PagePromptRunInput,
  PagePromptVisibleInput,
} from "../signal/mcp/pagePrompt";
import type { RouteCacheInvalidation, RouteCacheRenderState } from "./cachePolicy";
import { type RscAdoptedBundle, RscHostReloads, type RscWorkerReloadInput } from "./rscHostReloads";
import type { RscRedirectMethod, RscRedirectStatus, RscRenderResult } from "./rscHostRenderStream";
import { RscHostRequests } from "./rscHostRequests";
import { type RscProcess, RscWorkerProcess, type RscWorkerStatus } from "./rscWorkerProcess";
import { RscWorkerRecycler } from "./rscWorkerRecycler";
import type { RscRenderOptions, RscTraceMetadata } from "./ssrTypes";
import type { BaseBuildArtifact, CssAsset } from "./types";

export type { RscAdoptedBundle, RscReloadFailure, RscWorkerReloadInput } from "./rscHostReloads";
export {
  createIdempotentRscRenderCancel,
  createRscHostRenderStream,
  getRscHostMaxPendingChunks,
  isRscHostPendingChunkOverflow,
  nextRscHostPendingChunkCount,
  type RscPending,
  type RscRedirectMethod,
  type RscRedirectStatus,
  type RscRenderResult,
} from "./rscHostRenderStream";
export type { RscWorkerStatus } from "./rscWorkerProcess";

export interface RscWorkerInvalidateCacheMessage {
  type: "invalidate-cache";
  reason?: string;
  tags?: string[];
  paths?: string[];
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
  | { type: "page-prompts.visible.result"; requestId: string; result: string[] }
  | { type: "web-manifest.result"; requestId: string; result: unknown }
  | {
      type: "error";
      requestId: string;
      message: string;
      buildId?: number;
      reloadId?: number;
      running?: RscAdoptedBundle;
    };

export class RscWorker {
  static readonly #queuedRespawns = 2;
  readonly ready: Promise<void>;
  #logger = new Logger("RscWorker");
  readonly #worker: RscWorkerProcess;
  readonly #requests: RscHostRequests;
  readonly #recycler: RscWorkerRecycler;
  readonly #reloads: RscHostReloads;
  //? Sends a booting replacement could not take: a worker the host falls back to gets them again.
  #droppedWhileBooting = false;
  onLogRecords: ((records: LogRecord[], dropped: number) => void) | null = null;
  #logLevel: number | null = null;
  readonly #failBeforeReady: boolean;

  constructor(artifact: BaseBuildArtifact, { failBeforeReady = false }: { failBeforeReady?: boolean } = {}) {
    this.#failBeforeReady = failBeforeReady;
    //? Before the spawn: an artifact that fails a read must leave no worker running.
    const read = RscHostReloads.readArtifact(artifact);
    const logger = this.#logger;
    const worker = new RscWorkerProcess(logger, {
      onMessage: (message, proc) => this.#handleMessage(message as RscInMsg, proc),
      onExit: (proc, code) => this.#handleExit(proc, code),
      logRecords: () => this.onLogRecords,
    });
    const requests = new RscHostRequests(worker, logger);
    const recycler = new RscWorkerRecycler(worker, requests, logger);
    this.#worker = worker;
    this.#requests = requests;
    this.#recycler = recycler;
    this.#reloads = new RscHostReloads(read, worker, recycler);
    this.ready = worker.ready;
  }

  renderWithMeta(req: Request, options: RscRenderOptions = {}): Promise<RscRenderResult> {
    return this.#requests.render(req, options);
  }

  listPagePrompts(): Promise<PagePromptEntry[]> {
    return this.#requests.call<PagePromptEntry[]>((requestId) => ({ type: "page-prompts", requestId }));
  }

  runPagePrompt(input: PagePromptRunInput): Promise<PagePromptRun> {
    return this.#requests.call<PagePromptRun>((requestId) => ({ type: "page-prompt.run", requestId, input }));
  }

  visiblePagePrompts(input: PagePromptVisibleInput): Promise<string[]> {
    return this.#requests.call<string[]>((requestId) => ({ type: "page-prompts.visible", requestId, input }));
  }

  /** The root layout's `.manifest()` for `basePath`, in the browser's keys; `null` when it declares none. */
  webManifest(basePath: string | null): Promise<unknown> {
    return this.#requests.call<unknown>((requestId) => ({ type: "web-manifest", requestId, basePath }));
  }

  invalidateRouteResultCache(invalidation?: string | RouteCacheInvalidation): void {
    if (this.#worker.status !== "ready") {
      this.#droppedWhileBooting = true;
      return;
    }
    try {
      this.#worker.proc.send(createRscWorkerInvalidateCacheMessage(invalidation));
    } catch (error) {
      this.#logger.warn(
        `rsc worker cache invalidate send failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  kill(): void {
    this.#worker.killed = true;
    this.#worker.status = "stopped";
    this.#worker.restart.cancel();
    this.#recycler.stop();
    this.#worker.proc.kill();
  }

  setLogLevel(minSev: number | null) {
    this.#logLevel = minSev;
    if (this.#worker.status !== "ready") this.#droppedWhileBooting = true;
    this.#sendLogLevel();
  }

  #sendLogLevel() {
    if (this.#worker.status !== "ready") return;
    try {
      this.#worker.proc.send({ type: "log-level", minSev: this.#logLevel });
    } catch {
      // The worker is gone; the `ready` of its replacement re-sends the level.
    }
  }

  get status(): RscWorkerStatus {
    return this.#worker.status;
  }

  getMetrics(): AkanMetricsReport {
    return Object.assign(projectRscWorkerProcessMetrics(this.#worker.lastWorkerMetrics), {
      rscWorkerPid: this.#worker.proc.pid,
      rscWorkerStatus: this.#worker.status,
      rscWorkerRestartCount: this.#worker.restartCount,
      rscWorkerRecycleCount: this.#recycler.recycleCount,
      rscWorkerLastRecycleReason: this.#recycler.lastRecycleReason,
      rscPendingRenderCount: this.#requests.pending.size,
      rscQueuedSendCount: this.#requests.queuedSends.length,
      rscHostPendingChunkOverflowCount: this.#requests.hostPendingChunkOverflowCount,
    });
  }

  restartWhenIdle(reason: string): boolean {
    return this.#recycler.restartWhenIdle(reason);
  }

  updateCssAssets(cssAssets: Record<string, CssAsset>): void {
    this.#reloads.cssAssets = cssAssets;
    if (this.#worker.status !== "ready") {
      this.#droppedWhileBooting = true;
      return;
    }
    try {
      this.#worker.proc.send({ type: "updateCssAssets", cssAssets });
    } catch {
      // A worker that died mid-send gets the new value from the init reply to its next hello.
    }
  }

  /** Resolves with the pages bundle the worker runs once it has taken this reload, or a later one. */
  reload(input: RscWorkerReloadInput): Promise<RscAdoptedBundle> {
    return this.#reloads.reload(input);
  }

  #handleMessage(message: RscInMsg, proc: RscProcess): void {
    if (proc !== this.#worker.proc) return;
    if (message.type === "cache-state") {
      this.#requests.pending.get(message.requestId)?.onCacheState?.(message.state);
      return;
    }
    switch (message.type) {
      case "hello":
        // A respawned worker asks for config first; this is what carries the latest reload(...) state across a crash.
        this.#worker.booting = proc;
        this.#reloads.sendInit();
        return;
      case "ready":
        this.#worker.booting = null;
        this.#worker.status = "ready";
        this.#reloads.answerSentReloads();
        this.#droppedWhileBooting = false;
        this.#worker.restart.reset();
        this.#worker.resolveReady();
        this.#recycler.finishRollingRecycle();
        //? A stylesheet update sent after its hello was held while it booted, and queued renders must not see the old one.
        if (this.#reloads.cssAssets !== this.#reloads.init.cssAssets) this.updateCssAssets(this.#reloads.cssAssets);
        this.#requests.flushQueuedSends();
        if (this.#logLevel !== null) this.#sendLogLevel();
        this.#reloads.adoptInit();
        return;
      case "reloaded":
        this.#reloads.onReloaded(message, proc);
        return;
      case "chunk":
        this.#requests.pending.get(message.requestId)?.onChunk(message.data);
        return;
      case "meta":
        this.#requests.pending
          .get(message.requestId)
          ?.onMeta?.({ theme: message.theme, status: message.status, trace: message.trace });
        return;
      case "theme":
        this.#requests.pending.get(message.requestId)?.onTheme?.(message.theme);
        return;
      case "end":
        this.#requests.resolvePending(message.requestId, (p) => p.onEnd());
        return;
      case "redirect":
        this.#requests.resolvePending(message.requestId, (p) =>
          p.onRedirect?.(message.location, message.method ?? "replace", message.status ?? 307),
        );
        return;
      case "late-redirect":
        this.#requests.pending
          .get(message.requestId)
          ?.onLateRedirect?.(message.location, message.method ?? "replace", message.status ?? 307);
        return;
      case "late-not-found":
        this.#requests.pending.get(message.requestId)?.onLateNotFound?.();
        return;
      case "not-found":
        this.#requests.resolvePending(message.requestId, (p) => p.onNotFound?.());
        return;
      case "metrics":
        this.#worker.lastWorkerMetrics = message.metrics;
        this.#recycler.maybeRecycleFromMetrics(message.metrics);
        return;
      case "log.records":
        this.onLogRecords?.(message.records, message.dropped ?? 0);
        return;
      case "page-prompts.result":
      case "page-prompt.result":
      case "page-prompts.visible.result":
      case "web-manifest.result":
        this.#requests.settleCall(message.requestId, (call) => call.resolve(message.result));
        return;
      case "error":
        if (message.requestId === "__init__") {
          if (!this.#worker.readyResolved) {
            this.#reloads.rejectReload(String(message.message));
            this.#worker.rejectReady(new AkanError("rscWorkerFailed", String(message.message)));
          } else {
            this.#bootFailed(proc, String(message.message));
            proc.kill();
          }
          return;
        }
        if (message.requestId === "__reload__") {
          this.#reloads.onReloadFailed(message, proc);
          return;
        }
        if (
          this.#requests.settleCall(message.requestId, (call) =>
            call.reject(new AkanError("rscWorkerFailed", String(message.message))),
          )
        )
          return;
        this.#requests.resolvePending(message.requestId, (p) => p.onError(String(message.message)));
        return;
    }
  }

  /** The page request's headers as the worker sees them, `x-real-ip` being only the address the host resolved. */
  static workerHeaders(req: Request, clientIp: string | null | undefined): Record<string, string> {
    return RscHostRequests.workerHeaders(req, clientIp);
  }

  //* A respawned or replacement worker that could not boot its hello's state. Covered (no reload came since), the host
  //* goes back to the bundle that runs; newer, the fix boots next. A replacement hands its queue back to the worker it
  //* was to replace while that one lives, which then takes the fix in place or recycles again; otherwise it is a crash.
  #bootFailed(proc: RscProcess, message: string): boolean {
    this.#worker.booting = null;
    this.#logger.error(`[rsc] worker init error on restart: ${message}`);
    const covered = this.#reloads.rejectIfCovered(message);
    const rolling = proc === this.#worker.proc ? this.#recycler.rollingRecycle : null;
    this.#recycler.rollingRecycle = null;
    if (!rolling || !RscWorkerProcess.isAlive(rolling.oldProc)) return false;
    this.#worker.proc = rolling.oldProc;
    this.#worker.status = "ready";
    this.#worker.reloadsSinceSpawn = rolling.reloadsSinceSpawn;
    if (this.#droppedWhileBooting) {
      this.#droppedWhileBooting = false;
      this.updateCssAssets(this.#reloads.cssAssets);
      this.#sendLogLevel();
      this.invalidateRouteResultCache();
    }
    this.#requests.flushQueuedSends();
    if (!covered) this.#reloads.sendPendingReload();
    return true;
  }

  #handleExit(proc: RscProcess, code: number | null): void {
    //? The worker a recycle was replacing died first: the replacement boots on, with nothing to fall back to.
    if (proc === this.#recycler.rollingRecycle?.oldProc) {
      this.#recycler.rollingRecycle = null;
      return;
    }
    // A replaced proc's late exit must not schedule a second restart.
    if (proc !== this.#worker.proc) return;
    //? Exiting while it imports the pages bundle (a `process.exit` at a module's top level) fails the boot like a throw:
    //? a first boot rejects `ready`, as its init error would, instead of restarting into the same exit forever. A kill
    //? from outside (an OOM) is a crash, not the bundle's.
    if (proc === this.#worker.booting && !this.#worker.killed && proc.signalCode === null) {
      const message = `rsc worker exited with code ${code} while loading the pages bundle`;
      if (this.#worker.readyResolved && this.#bootFailed(proc, message)) return;
      if (!this.#worker.readyResolved) {
        this.#worker.booting = null;
        this.#worker.status = "stopped";
        this.#requests.failRequests(new AkanError("rscWorkerFailed", message));
        this.#reloads.rejectReload(message);
        this.#worker.rejectReady(new AkanError("rscWorkerFailed", message));
        return;
      }
    }

    const err = new AkanError("rscWorkerStopped", `rsc worker exited with code ${code}`);
    //? Only what this worker was sent: a request still queued never reached it, and the respawn takes it. That holds
    //? across a crash and a respawn that failed to boot, not a crash loop, where it would wait forever.
    const queued = new Set(this.#requests.queuedSends.map((entry) => entry.requestId));
    const keepsQueue = this.#worker.restart.attempts < RscWorker.#queuedRespawns;
    this.#requests.failRequests(err, (requestId) => !keepsQueue || !queued.has(requestId));

    if (this.#worker.killed) {
      this.#worker.status = "stopped";
      this.#requests.failRequests(err);
      this.#reloads.rejectReload(err.message, err.code);
      return;
    }
    if (this.#failBeforeReady && !this.#worker.readyResolved) {
      this.#worker.status = "stopped";
      this.#requests.failRequests(err);
      this.#reloads.rejectReload(err.message, err.code);
      this.#worker.rejectReady(err);
      return;
    }

    this.#worker.scheduleRestart();
  }
}
