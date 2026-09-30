import path from "node:path";
import { Logger } from "akanjs/common";
import type { BuilderMessage, BuilderMetrics, BuildPhase, ChangeBatch, DevBuildStatus } from "akanjs/server";
import type { App } from "../commandDecorators";
import { createTunnel } from "../createTunnel";
import { WorkspaceExecutor } from "../executors";
// Not via `../frontendBuild`: that barrel loads typescript and tailwind, which a suspended dev host must not hold.
import { HmrWatcher } from "../frontendBuild/hmrWatcher";
import { WatchRootResolver } from "../frontendBuild/watchRootResolver";
import { type DevStdioMode, IncrementalBuilderHost } from "../incrementalBuilder";
import { BuilderRequestRouter } from "../incrementalBuilder/builderRequestRouter";
import { BackendImportGraph } from "./BackendImportGraph";
import { DevBootLatch } from "./devBootLatch";
import {
  type BackendLifecycleState,
  type BackendRestartReason,
  BUILDER_MIN_RSS_RECYCLE_INTERVAL_MS,
  backendRestartReasonFromMessage,
  buildStatusReplaySequence,
  createBackendBuildStatus,
  type DevHostEvent,
  type DevHostState,
  decideBuilderRssRecycle,
  decideBuilderRssSettle,
  decideIdleSuspend,
  devHostStateOf,
  filesChangedSince,
  hasAnyBuildFailure,
  hasBuildFailureForGeneration,
  isLegacyBackendFallbackFile,
  isRssCeilingUnreachable,
  mergeBackendRestartReasons,
  mergeInvalidateMessages,
  normalizeBackendReportedGeneration,
  resolveIdleSuspendMs,
  type SourceFingerprints,
  shouldAbandonBackendRecovery,
  shouldHoldForReturningBuilder,
  shouldKeepBuildFailure,
  shouldMarkBuildPhaseRecovered,
  shouldQueueBuildStatusReplay,
  shouldRefreshConfigOnIdleWake,
  shouldRelayRecycledFrontendState,
  shouldReplaceLastGoodMessage,
  shouldRestartBackendByDevPlan,
  shouldRestartBuilderByDevPlan,
  shouldRestartDevHostByDevPlan,
  shouldWarnBuilderRssCeilingTight,
} from "./devHostPolicy";

const backendMsgTypeSet = new Set<BuilderMessage["type"]>(["build-route", "build-csr"]);

const asMib = (bytes: number) => Math.round(bytes / 1024 / 1024);

const BACKEND_RESTART_DEBOUNCE_MS = 120;

// Above the gateway's ~5s child-shutdown wait: a gateway SIGKILLed mid-shutdown strands orphan replicas.
const BACKEND_GRACEFUL_TIMEOUT_MS = 8_000;

const BACKEND_RECOVERY_BASE_DELAY_MS = 1_000;

const BACKEND_RECOVERY_MAX_DELAY_MS = 30_000;

const BACKEND_STDERR_TAIL_LIMIT = 40;

const BUILDER_READY_TIMEOUT_MS = 150000;

const BUILDER_START_MAX_ATTEMPTS = 3;

// Recycling mid-burst of saves would drop watcher events still on their way to the builder.
const BUILDER_RSS_RECYCLE_QUIET_MS = 750;

// Linux returns about half of the bundler arenas after ~10-15s idle (macOS none), so re-read the peak before recycling.
const BUILDER_RSS_SETTLE_MS = 20_000;

const PS_RSS_TIMEOUT_MS = 2_000;

// The builder is the file watcher, so unlike the backend its recovery never gives up; it only backs off.
const BUILDER_RECOVERY_BASE_DELAY_MS = 2_000;

const BUILDER_RECOVERY_MAX_DELAY_MS = 60_000;

interface LastGoodFrontendState {
  pages?: Extract<BuilderMessage, { type: "pages-updated" }>;
  css?: Extract<BuilderMessage, { type: "css-updated" }>;
}

export class AkanAppHost {
  logger = new Logger("AkanAppHost");
  readonly stdio: DevStdioMode;
  readonly env: Record<string, string>;
  readonly #onDevEvent: ((event: DevHostEvent) => void) | null;
  #lastDevState: DevHostState | null = null;
  readonly #bootLatch = new DevBootLatch(() => this.#onDevEvent?.({ app: this.app.name, booted: true }));
  #backend: Bun.Subprocess<"ignore", "inherit" | "pipe", "inherit" | "pipe"> | null = null;
  #builder: IncrementalBuilderHost | null = null;
  //? Outlives the builder host, which idle wake and recovery replace; a config or metadata restart clears it.
  #patcherOff = false;
  #backendReady = false;
  #plannedBackendStops = new WeakSet<Bun.Subprocess<"ignore", "inherit", "inherit">>();
  #restartTimer: ReturnType<typeof setTimeout> | null = null;
  #backendRecoveryTimer: ReturnType<typeof setTimeout> | null = null;
  #backendRecoveryAttempts = 0;
  #backendGaveUp = false;
  #backendLifecycleState: BackendLifecycleState = "stopped";
  #pendingRestartReason: BackendRestartReason | null = null;
  //? One replacement at a time: `#stopBackend` clears `#backend` only once the old process exits, so a second restart
  //? inside that wait signals the same pid and spawns a second backend, and the one the host stops tracking keeps the port.
  #backendRestart: Promise<void> | null = null;
  #pendingRecycle: {
    message: Extract<BuilderMessage, { type: "invalidate" }>;
    refreshConfig: boolean;
    failed?: boolean;
    failedGeneration?: number;
  } | null = null;
  //? A restart that failed after its change applied (the builder or backend did not come up): the builder's return is
  //? its recovery, reported past the failure's generation so the scan overlay clears.
  #restartFailedAfterApply: number | null = null;
  #stopping = false;
  #builderRecoveryTimer: ReturnType<typeof setTimeout> | null = null;
  #builderRecoveryAttempts = 0;
  #backendStartStatus: { generation?: number; files: string[] } | null = null;
  #backendBuildStatusGeneration = 0;
  #backendStderrTail: string[] = [];
  #lastGoodFrontend: LastGoodFrontendState = {};
  #rssRecycleTimer: ReturnType<typeof setTimeout> | null = null;
  #rssRecycleReason: string | null = null;
  #lastRssRecycleAtMono: number | null = null;
  #rssCeilingTightReports = 0;
  #rssCeilingTightWarned = false;
  #rssSettleToken = 0;
  #rssRecycleOver: { rssBytes: number; ceilingBytes: number } | null = null;
  #rssCeilingAbandoned = false;
  #buildStatusByPhase = new Map<BuildPhase, DevBuildStatus>();
  #pendingBuildStatusReplay: DevBuildStatus[] = [];
  #builderMessageQueue: Promise<void> = Promise.resolve();
  #backendGraph: BackendImportGraph;
  #idleSuspendTimer: ReturnType<typeof setTimeout> | null = null;
  #suspended: boolean = false;
  #waking: boolean = false;
  #wokeAtMono: number | null = null;
  #idleWatcher: HmrWatcher | null = null;
  #suspendedChanges: ChangeBatch | null = null;
  #builderGapStamp: Promise<SourceFingerprints | null> | null = null;
  #pendingBuilderMessages: BuilderMessage[] = [];
  readonly #builderRequests = new BuilderRequestRouter();
  #builderGeneration = 0;
  constructor(
    private readonly app: App,
    {
      env,
      stdio = "inherit",
      onDevEvent,
    }: { env: Record<string, string>; stdio?: DevStdioMode; onDevEvent?: (event: DevHostEvent) => void },
  ) {
    this.env = env;
    this.stdio = stdio;
    this.#onDevEvent = onDevEvent ?? null;
    this.#backendGraph = new BackendImportGraph(app, this.logger);
  }
  #emitDevEvent(state: DevHostState, detail?: string) {
    if (!this.#onDevEvent || state === this.#lastDevState) return;
    this.#lastDevState = state;
    this.#onDevEvent({ app: this.app.name, state, ...(detail ? { detail } : {}) });
    if (state === "ready") this.#bootLatch.ready();
  }
  async start() {
    if (this.#backend) await this.#stopBackend();
    if (this.#builder) this.#stopBuilder();
    const [redisHost] = await Promise.all([
      this.#prepareDatabase("redis"),
      this.#backendGraph.refresh(),
      this.#startBuilder(),
    ]);
    Object.assign(this.env, { REDIS_HOST: redisHost });
    this.#startBackend();
    this.#armIdleSuspend();
    return this;
  }
  async stop() {
    //? Nothing reapplies once it stops: a pages ok received meanwhile would bring children back after it.
    this.#stopping = true;
    this.#pendingRecycle = null;
    this.#cancelIdleSuspend();
    this.#stopIdleWatcher();
    this.#clearRestartTimers();
    this.#pendingRestartReason = null;
    // Before the backend goes away, while it can still receive the answer.
    this.#failPendingBuilderMessages("dev server is shutting down");
    await this.#backendRestart;
    await this.#stopBackend();
    this.#stopBuilder();
    return this;
  }
  #clearRestartTimers() {
    for (const timer of [this.#restartTimer, this.#backendRecoveryTimer, this.#builderRecoveryTimer])
      if (timer) clearTimeout(timer);
    this.#restartTimer = this.#backendRecoveryTimer = this.#builderRecoveryTimer = null;
  }
  kill() {
    void this.stop();
  }

  async #prepareDatabase(type: "redis") {
    const environment = WorkspaceExecutor.getBaseDevEnv().env;
    if (environment === "local") return "localhost";
    return await createTunnel(type, { app: this.app, environment });
  }
  #startBackend(startStatus: { generation?: number; files: string[] } | null = null) {
    if (this.#stopping) return;
    if (this.#backend) {
      this.logger.warn(`backend pid=${this.#backend.pid} is still running; not starting a second one`);
      return;
    }
    // Before the spawn: the new backend numbers its requests from 1 again, so old answers must not reach it.
    this.#builderRequests.startGeneration();
    this.#discardPendingBuilderMessages("the backend restarted while the builder was away");
    this.#backendStartStatus = startStatus;
    this.#backendGaveUp = false;
    this.#setBackendLifecycleState("starting");
    this.#backendReady = false;
    this.#backendStderrTail = [];
    const backend = Bun.spawn(["bun", `apps/${this.app.name}/main.ts`], {
      cwd: this.app.workspace.workspaceRoot,
      stdio: this.stdio === "pipe" ? ["ignore", "pipe", "pipe"] : ["inherit", "inherit", "inherit"],
      env: this.env,
      ipc: (msg: BuilderMessage) => {
        if (!msg || typeof msg !== "object") return;
        if (msg.type === "backend-ready") {
          this.#backendReady = true;
          this.#backendRecoveryAttempts = 0;
          this.#setBackendLifecycleState("ready", `pid=${msg.pid}`);
          this.#recordBackendReadyStatus();
          this.logger.verbose(`backend ready pid=${msg.pid}`);
          this.#forgetRouteBuildStatus();
          this.#replayBuilderState();
          return;
        }
        if (msg.type === "build-status") {
          // The gateway reports replica boot failures (crash loops, port conflicts) as build-status.
          const status = this.#recordBackendBuildStatus({
            generation: normalizeBackendReportedGeneration(msg.data.generation),
            ok: msg.data.ok,
            files: msg.data.files,
            message: msg.data.message,
          });
          this.#sendOrQueueBuildStatus(status);
          //? A replica crash loop leaves the gateway up, waiting for an edit: no exit reaches the host's own give-up.
          if (!status.ok) this.#emitDevEvent("failed", status.message);
          return;
        }
        if (backendMsgTypeSet.has(msg.type)) this.#sendToBuilder(msg);
      },
      serialization: "advanced",
      onExit: () => {
        this.#backendReady = false;
        if (this.#backend === backend) this.#backend = null;
        if (this.#plannedBackendStops.has(backend)) {
          this.#plannedBackendStops.delete(backend);
          return;
        }
        this.#scheduleBackendRecovery("backend-exit");
      },
    });
    this.#backend = backend;
    this.logger.verbose(`backend spawned pid=${backend.pid}`);
    if (this.stdio === "pipe") {
      // Undrained pipes swallow runtime errors and leave the crash-loop stderr tail empty.
      void this.#forwardBackendStream(backend.stderr as unknown as ReadableStream<Uint8Array> | undefined, "stderr");
      void this.#forwardBackendStream(backend.stdout as unknown as ReadableStream<Uint8Array> | undefined, "stdout");
    }
  }
  #recordBackendStderr(chunk: string) {
    const lines = chunk.split(/\r?\n/).filter((line) => line.length > 0);
    if (lines.length === 0) return;
    this.#backendStderrTail.push(...lines);
    if (this.#backendStderrTail.length > BACKEND_STDERR_TAIL_LIMIT) {
      this.#backendStderrTail.splice(0, this.#backendStderrTail.length - BACKEND_STDERR_TAIL_LIMIT);
    }
  }
  // Verbatim, not re-logged: a level floor would swallow runtime output and re-rendering doubles the timestamp.
  async #forwardBackendStream(stream: ReadableStream<Uint8Array> | undefined | null, kind: "stdout" | "stderr") {
    if (!stream) return;
    const decoder = new TextDecoder();
    try {
      for await (const chunk of stream) {
        const text = decoder.decode(chunk, { stream: true });
        if (!text) continue;
        if (kind === "stderr") {
          this.#recordBackendStderr(text);
          process.stderr.write(text);
        } else process.stdout.write(text);
      }
    } catch {
      // The stream closes when the backend exits; nothing further to surface here.
    }
  }
  #nextBackendBuildStatusGeneration(generation?: number): number {
    if (typeof generation === "number") {
      this.#backendBuildStatusGeneration = Math.max(this.#backendBuildStatusGeneration, generation);
      return generation;
    }
    this.#backendBuildStatusGeneration += 1;
    return this.#backendBuildStatusGeneration;
  }
  #recordBackendBuildStatus({
    generation,
    ok,
    files,
    message,
  }: {
    generation?: number;
    ok: boolean;
    files?: string[];
    message?: string;
  }): DevBuildStatus {
    const status = createBackendBuildStatus({
      generation: this.#nextBackendBuildStatusGeneration(generation),
      ok,
      files,
      message,
    });
    this.#recordBuildStatus(status);
    return status;
  }
  #recordBackendReadyStatus(): void {
    const previous = this.#buildStatusByPhase.get("backend");
    const startStatus = this.#backendStartStatus;
    if (startStatus || previous?.ok === false) {
      const status = this.#recordBackendBuildStatus({
        generation: startStatus?.generation ?? previous?.generation,
        ok: true,
        files: startStatus?.files ?? previous?.files ?? [],
        message: "Backend ready",
      });
      this.#sendOrQueueBuildStatus(status);
    }
    this.#backendStartStatus = null;
  }
  #setBackendLifecycleState(next: BackendLifecycleState, detail?: string): void {
    if (this.#backendLifecycleState === next && !detail) return;
    const prev = this.#backendLifecycleState;
    this.#backendLifecycleState = next;
    this.logger.verbose(`[backend-lifecycle] ${prev} -> ${next}${detail ? ` ${detail}` : ""}`);
    this.#emitDevEvent(devHostStateOf(next, this.#backendGaveUp), detail);
  }
  #sendToBackend(message: BuilderMessage) {
    if (!this.#backend || !this.#backendReady) {
      if (message.type === "css-updated" || message.type === "pages-updated" || message.type === "build-status") {
        this.logger.verbose(`backend is not ready; will replay ${message.type}`);
        return;
      }
      if (message.type !== "builder-ready") this.logger.warn(`backend is not ready; dropping ${message.type}`);
      return;
    }
    try {
      this.#backend.send(message);
    } catch (err) {
      this.logger.warn(
        `failed to send ${message.type} to backend: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
  async #stopBackend() {
    if (!this.#backend) return;
    const backend = this.#backend;
    this.#plannedBackendStops.add(backend);
    this.#backendReady = false;
    this.#setBackendLifecycleState("stopping", `pid=${backend.pid}`);
    this.logger.verbose(`stopping backend pid=${backend.pid}`);
    try {
      backend.kill("SIGTERM");
      const timeout = new Promise<"timeout">((resolve) =>
        setTimeout(() => resolve("timeout"), BACKEND_GRACEFUL_TIMEOUT_MS),
      );
      const result = await Promise.race([backend.exited, timeout]);
      if (result === "timeout") {
        this.logger.warn(`backend pid=${backend.pid} did not exit in ${BACKEND_GRACEFUL_TIMEOUT_MS}ms; force killing`);
        backend.kill("SIGKILL");
        await backend.exited.catch(() => undefined);
      }
    } finally {
      if (this.#backend === backend) this.#backend = null;
      this.#setBackendLifecycleState("stopped", `pid=${backend.pid}`);
    }
  }
  #scheduleBackendRestart(reason: BackendRestartReason) {
    this.#pendingRestartReason = mergeBackendRestartReasons(this.#pendingRestartReason, reason);
    const pending = this.#pendingRestartReason;
    this.#setBackendLifecycleState(
      "restart-pending",
      `generation=${pending.generation ?? "(unknown)"} files=${pending.files.length} roles=${pending.roles.join(",") || "(none)"}`,
    );
    if (this.#backendRecoveryTimer) {
      clearTimeout(this.#backendRecoveryTimer);
      this.#backendRecoveryTimer = null;
    }
    if (this.#restartTimer) clearTimeout(this.#restartTimer);
    this.#restartTimer = setTimeout(() => {
      this.#restartTimer = null;
      this.#backendRestart ??= this.#drainBackendRestarts().finally(() => {
        this.#backendRestart = null;
      });
    }, BACKEND_RESTART_DEBOUNCE_MS);
  }
  //? A reason that arrived during a restart runs after it; one whose debounce is still pending waits for its timer.
  async #drainBackendRestarts() {
    while (this.#pendingRestartReason && !this.#restartTimer && !this.#stopping) {
      const next = this.#pendingRestartReason;
      this.#pendingRestartReason = null;
      await this.#restartBackend(next);
    }
  }
  async #restartBackend(reason: BackendRestartReason) {
    this.logger.verbose(
      `[backend-reload] restarting backend generation=${reason.generation ?? "(unknown)"} files=${reason.files.length} roles=${reason.roles.join(",") || "(none)"}`,
    );
    this.#backendRecoveryAttempts = 0;
    await Promise.all([this.#stopBackend(), this.#backendGraph.refresh()]);
    this.#startBackend({ generation: reason.generation, files: reason.files });
  }
  #scheduleBackendRecovery(reason: string) {
    if (this.#backendRecoveryTimer || this.#backend) return;
    if (shouldAbandonBackendRecovery(this.#backendRecoveryAttempts)) {
      const message = `Backend exited ${this.#backendRecoveryAttempts} times in a row (${reason}); waiting for an edit or a green build to retry.`;
      this.#backendGaveUp = true;
      this.#setBackendLifecycleState("stopped", `gave up after ${this.#backendRecoveryAttempts} recovery attempts`);
      this.logger.error(`[backend-recovery] ${message}`);
      if (this.#backendStderrTail.length > 0) {
        this.logger.error(`[backend-recovery] recent backend stderr:\n${this.#backendStderrTail.join("\n")}`);
      }
      const abandonedStatus = this.#recordBackendBuildStatus({ ok: false, files: [], message });
      this.#sendOrQueueBuildStatus(abandonedStatus);
      return;
    }
    this.#setBackendLifecycleState("recovering", reason);
    const attempt = this.#backendRecoveryAttempts;
    const delay = Math.min(BACKEND_RECOVERY_BASE_DELAY_MS * 2 ** attempt, BACKEND_RECOVERY_MAX_DELAY_MS);
    this.#backendRecoveryAttempts = attempt + 1;
    const failureStatus = this.#recordBackendBuildStatus({
      ok: false,
      files: [],
      message: `Backend exited unexpectedly (${reason}); restarting in ${delay}ms`,
    });
    this.#sendOrQueueBuildStatus(failureStatus);
    this.logger.warn(
      `[backend-recovery] backend exited unexpectedly (${reason}); restarting in ${delay}ms (attempt ${this.#backendRecoveryAttempts})`,
    );
    if (this.#backendStderrTail.length > 0) {
      this.logger.warn(`[backend-recovery] recent backend stderr:\n${this.#backendStderrTail.join("\n")}`);
    }
    this.#backendRecoveryTimer = setTimeout(() => {
      this.#backendRecoveryTimer = null;
      if (this.#backend) return;
      void this.#backendGraph.refresh().finally(() => {
        if (!this.#backend) this.#startBackend({ generation: failureStatus.generation, files: failureStatus.files });
      });
    }, delay);
  }
  #enqueueBuilderMessage(message: BuilderMessage) {
    this.#builderMessageQueue = this.#builderMessageQueue
      .then(() => this.#handleBuilderMessage(message))
      .catch((err) => {
        this.logger.warn(`failed to handle builder message: ${err instanceof Error ? err.message : String(err)}`);
      });
  }
  async #handleBuilderMessage(message: BuilderMessage) {
    if (this.#stopping) return;
    this.#markDevActivity();
    this.#trackBuilderGeneration(message);
    if (message.type === "build-status") {
      this.#recordBuildStatus(message.data);
      this.#sendOrQueueBuildStatus(message.data);
      this.#reviveBackendAfterGreenBuild(message.data);
      await this.#resumeFailedRecycle(message.data);
      return;
    }
    if (message.type === "builder-metrics") {
      this.#handleBuilderMetrics(message.data);
      return;
    }
    if (message.type === "boot-armed") {
      this.logger.verbose("[builder] boot builds settled");
      this.#bootLatch.armed();
      return;
    }
    if (message.type === "pages-updated" || message.type === "css-updated") {
      const recycled = message.data.reason === "builder-recycle";
      if (recycled && !this.#shouldRelayRecycledState(message)) return;
      this.#recordLastGood(message, { supersede: recycled });
    }
    if (message.type === "invalidate") {
      await this.#handleInvalidate(message);
      return;
    }
    if (message.type === "build-route-res" || message.type === "build-csr-res") {
      const answer = this.#builderRequests.settle(message);
      if (!answer) {
        this.logger.verbose(`[builder] dropped a ${message.type} no live backend is waiting for (id=${message.id})`);
        return;
      }
      this.#sendToBackend(answer);
      return;
    }
    this.#sendToBackend(message);
  }
  // In `env`, which every builder spawn re-reads: a replacement (recycled, crashed, restarted) continues from here.
  #trackBuilderGeneration(message: BuilderMessage): void {
    const generation = AkanAppHost.#builderGenerationOf(message);
    if (generation === undefined || generation <= this.#builderGeneration) return;
    this.#builderGeneration = generation;
    Object.assign(this.env, { AKAN_BUILDER_INITIAL_GENERATION: String(generation) });
  }
  // Not `csr-updated` / `ssr-updated`: their generation is the registry's.
  static #builderGenerationOf(message: BuilderMessage): number | undefined {
    if (message.type === "invalidate") return message.generation;
    if (message.type === "build-status" || message.type === "builder-metrics") return message.data.generation;
    if (message.type === "pages-updated" || message.type === "css-updated") return message.data.generation;
    return undefined;
  }
  // The backend reads `base-artifact.json` once, so a recycled builder re-announces it; unchanged hashes are dropped.
  #shouldRelayRecycledState(
    message: Extract<BuilderMessage, { type: "pages-updated" }> | Extract<BuilderMessage, { type: "css-updated" }>,
  ): boolean {
    const current = message.type === "pages-updated" ? this.#lastGoodFrontend.pages : this.#lastGoodFrontend.css;
    if (shouldRelayRecycledFrontendState(current, message)) {
      this.logger.verbose(`[builder-recycle] ${message.type} moved during the recycle; pushing it to the backend`);
      return true;
    }
    this.logger.verbose(`[builder-recycle] ${message.type} unchanged after the recycle; backend left as is`);
    return false;
  }
  #handleBuilderMetrics(metrics: BuilderMetrics): void {
    if (this.#rssCeilingAbandoned) return;
    const ceilingBytes = IncrementalBuilderHost.maxRssBytes();
    const decision = decideBuilderRssRecycle({
      rssBytes: metrics.rssBytes,
      ceilingBytes,
      buildFailed: hasBuildFailureForGeneration(this.#buildStatusByPhase, metrics.generation),
      msSinceLastRecycle: this.#lastRssRecycleAtMono === null ? null : performance.now() - this.#lastRssRecycleAtMono,
    });
    if (decision === "below-ceiling") {
      this.#rssCeilingTightReports = 0;
      return;
    }
    if (decision === "unbounded") return;
    if (decision === "build-failed") {
      this.logger.verbose(
        `[builder-recycle] deferred: generation=${metrics.generation} has a failing build, so a replacement would hit the same error`,
      );
      return;
    }
    if (decision === "too-soon") {
      this.#rssCeilingTightReports += 1;
      if (this.#rssCeilingTightWarned || !shouldWarnBuilderRssCeilingTight(this.#rssCeilingTightReports)) return;
      this.#rssCeilingTightWarned = true;
      // Warn only: the per-interval recycle is the one bound between the bundler's arenas and the sandbox limit.
      this.logger.warn(
        `[builder-recycle] the builder is back at ${asMib(metrics.rssBytes)}MiB within ${Math.round(BUILDER_MIN_RSS_RECYCLE_INTERVAL_MS / 1000)}s of a recycle, so the ${asMib(ceilingBytes ?? 0)}MiB ceiling costs about one boot build per interval while you keep building. Raise AKAN_BUILDER_MAX_RSS_MB if that trade is wrong for this app, or set it to 0 to leave the builder unbounded.`,
      );
      return;
    }
    this.#armRssRecycle(
      `rss=${asMib(metrics.rssBytes)}MiB>=${asMib(ceilingBytes ?? 0)}MiB after ${metrics.workCount} build(s)`,
      { rssBytes: metrics.rssBytes, ceilingBytes: ceilingBytes ?? 0 },
    );
  }
  // Read from the OS at ready: a metrics report arrives only after a build, measuring the work, not the floor.
  async #checkRecycledBuilderFloor(): Promise<void> {
    if (this.#rssCeilingAbandoned || this.#lastRssRecycleAtMono === null) return;
    const ceilingBytes = IncrementalBuilderHost.maxRssBytes();
    const pid = this.#builder?.pid;
    if (!ceilingBytes || !pid) return;
    const freshRssBytes = await AkanAppHost.readProcessRssBytes(pid);
    if (!isRssCeilingUnreachable(freshRssBytes, ceilingBytes)) return;
    this.#rssCeilingAbandoned = true;
    this.logger.error(
      `[builder-recycle] a freshly recycled builder is already at ${asMib(freshRssBytes ?? 0)}MiB with nothing built on demand, so the ${asMib(ceilingBytes)}MiB ceiling cannot be met for this app; no longer enforcing it this session. Raise AKAN_BUILDER_MAX_RSS_MB, or set it to 0 to leave the builder unbounded.`,
    );
  }
  #armRssRecycle(reason: string, over?: { rssBytes: number; ceilingBytes: number }): void {
    if (this.#rssRecycleReason !== reason)
      this.logger.verbose(`[builder-recycle] armed (${reason}); replacing the builder once it stays quiet`);
    this.#rssRecycleReason = reason;
    // A field, not the closure: `#handleInvalidate` re-arms with the reason alone and must keep the sample.
    if (over) this.#rssRecycleOver = over;
    if (this.#rssRecycleTimer) clearTimeout(this.#rssRecycleTimer);
    this.#rssRecycleTimer = setTimeout(() => {
      this.#rssRecycleTimer = null;
      const pendingReason = this.#rssRecycleReason;
      const pendingOver = this.#rssRecycleOver;
      this.#rssRecycleReason = null;
      this.#rssRecycleOver = null;
      if (!pendingReason) return;
      if (!pendingOver) {
        this.#recycleBuilderForRss(pendingReason);
        return;
      }
      void this.#recycleBuilderForRssWhenStillOver(pendingReason, pendingOver);
    }, BUILDER_RSS_RECYCLE_QUIET_MS);
  }
  async #recycleBuilderForRssWhenStillOver(
    reason: string,
    { rssBytes, ceilingBytes }: { rssBytes: number; ceilingBytes: number },
  ): Promise<void> {
    if (decideBuilderRssSettle({ rssBytes, ceilingBytes }) === "recycle-now") {
      this.#recycleBuilderForRss(reason);
      return;
    }
    const pid = this.#builder?.pid;
    if (!pid) {
      this.#recycleBuilderForRss(reason);
      return;
    }
    this.#rssSettleToken += 1;
    const token = this.#rssSettleToken;
    this.logger.verbose(
      `[builder-recycle] holding ${Math.round(BUILDER_RSS_SETTLE_MS / 1000)}s to see whether the allocator returns it (${reason})`,
    );
    await Bun.sleep(BUILDER_RSS_SETTLE_MS);
    if (token !== this.#rssSettleToken || this.#builder?.pid !== pid || this.#suspended || this.#waking) {
      this.logger.verbose("[builder-recycle] settle check abandoned; the builder moved on");
      return;
    }
    const settledBytes = await AkanAppHost.readProcessRssBytes(pid);
    if (settledBytes !== null && settledBytes < ceilingBytes) {
      this.logger.info(
        `[builder-recycle] skipped: the builder fell to ${asMib(settledBytes)}MiB (ceiling ${asMib(ceilingBytes)}MiB) on its own, so a recycle would have cost a boot build for nothing`,
      );
      return;
    }
    this.#recycleBuilderForRss(
      settledBytes === null ? reason : `${reason}; still ${asMib(settledBytes)}MiB after settling`,
    );
  }
  /** Null when unreadable, meaning "no new information", never zero. */
  static async readProcessRssBytes(pid: number): Promise<number | null> {
    if (process.platform === "win32")
      return await AkanAppHost.#readRssKbVia(
        ["tasklist", "/FI", `PID eq ${pid}`, "/FO", "CSV", "/NH"],
        AkanAppHost.#tasklistRssKb,
      );
    const status = await Bun.file(`/proc/${pid}/status`)
      .text()
      .catch(() => null);
    const vmRssKb = status === null ? null : /VmRSS:\s+(\d+) kB/.exec(status)?.[1];
    if (vmRssKb) return Number(vmRssKb) * 1024;
    return await AkanAppHost.#readRssKbVia(["ps", "-o", "rss=", "-p", String(pid)], (output) => Number(output.trim()));
  }
  // Bounded: a `ps` that hangs under load would silently cancel the recycle awaiting it.
  static async #readRssKbVia(
    command: string[],
    parseKb: (output: string) => number,
    timeoutMs = PS_RSS_TIMEOUT_MS,
  ): Promise<number | null> {
    let proc: Bun.Subprocess<"ignore", "pipe", "ignore">;
    try {
      proc = Bun.spawn(command, { stdio: ["ignore", "pipe", "ignore"] });
    } catch {
      return null;
    }
    const killer = setTimeout(() => proc.kill("SIGKILL"), timeoutMs);
    try {
      const output = await new Response(proc.stdout).text();
      await proc.exited;
      const rssKb = parseKb(output);
      return Number.isFinite(rssKb) && rssKb > 0 ? rssKb * 1024 : null;
    } catch {
      return null;
    } finally {
      clearTimeout(killer);
    }
  }
  // `Mem Usage` is the working set (what `process.memoryUsage.rss()` reports on Windows) in locale-grouped KB.
  static #tasklistRssKb(output: string): number {
    const memUsage = /"([^"]*)"\s*$/m.exec(output)?.[1];
    return memUsage ? Number(memUsage.replace(/\D/g, "")) : Number.NaN;
  }
  #cancelRssRecycle(): void {
    this.#rssRecycleReason = null;
    this.#rssRecycleOver = null;
    // Also drops any settle check already waiting, which would otherwise recycle after the cancel.
    this.#rssSettleToken += 1;
    if (!this.#rssRecycleTimer) return;
    clearTimeout(this.#rssRecycleTimer);
    this.#rssRecycleTimer = null;
  }
  /** `AKAN_DEV_IDLE_SUSPEND_MS=0` keeps the builder resident for the whole session. */
  static idleSuspendMs(): number | null {
    return resolveIdleSuspendMs(process.env.AKAN_DEV_IDLE_SUSPEND_MS);
  }
  #markDevActivity(): void {
    if (this.#suspended || this.#waking) return;
    this.#armIdleSuspend();
  }
  #armIdleSuspend(): void {
    const idleMs = AkanAppHost.idleSuspendMs();
    this.#cancelIdleSuspend();
    if (idleMs === null) return;
    this.#idleSuspendTimer = setTimeout(() => {
      this.#idleSuspendTimer = null;
      void this.#suspendWhenIdle(idleMs);
    }, idleMs);
  }
  #cancelIdleSuspend(): void {
    if (!this.#idleSuspendTimer) return;
    clearTimeout(this.#idleSuspendTimer);
    this.#idleSuspendTimer = null;
  }
  async #suspendWhenIdle(idleMs: number): Promise<void> {
    const decision = decideIdleSuspend({
      enabled: true,
      suspended: this.#suspended,
      builderReady: this.#builder?.status === "ready",
      backendReady: this.#backendReady,
      buildFailed: hasAnyBuildFailure(this.#buildStatusByPhase),
      restartPending: this.#restartPending,
      msSinceWake: this.#wokeAtMono === null ? null : performance.now() - this.#wokeAtMono,
    });
    if (decision !== "suspend") {
      this.logger.verbose(`[idle-suspend] skipped (${decision}); re-arming`);
      this.#armIdleSuspend();
      return;
    }
    // Watch before stopping: an edit in the gap would be lost, and nothing would wake the dev server.
    if (!(await this.#startIdleWatcher())) {
      this.#armIdleSuspend();
      return;
    }
    this.#suspended = true;
    this.#emitDevEvent("suspended", `idle ${Math.round(idleMs / 1000)}s`);
    this.#stopBuilder();
    this.#openBuilderGap("idle suspend");
    this.logger.info(
      `[idle-suspend] no build activity for ${Math.round(idleMs / 1000)}s; released the builder — the next edit or route request brings it back`,
    );
  }
  get #restartPending(): boolean {
    return !!(
      this.#pendingRecycle ||
      this.#restartTimer ||
      this.#backendRestart ||
      this.#backendRecoveryTimer ||
      this.#builderRecoveryTimer ||
      this.#rssRecycleReason
    );
  }
  async #startIdleWatcher(): Promise<boolean> {
    try {
      const roots = await new WatchRootResolver(this.app).resolve();
      const watcher = new HmrWatcher({
        roots,
        logger: this.logger,
        onBatch: (batch) => {
          this.#recordSuspendedChange(batch);
          void this.#wakeFromIdle(`${batch.files.length} file(s) changed`);
        },
      });
      // Awaited so the mtime baseline exists before the first edit; a file missing from the batch is never rebuilt.
      await watcher.start();
      this.#idleWatcher = watcher;
      return true;
    } catch (err) {
      this.logger.warn(
        `[idle-suspend] could not install the idle watcher; staying awake: ${err instanceof Error ? err.message : String(err)}`,
      );
      this.#stopIdleWatcher();
      return false;
    }
  }
  #stopIdleWatcher(): void {
    this.#idleWatcher?.stop();
    this.#idleWatcher = null;
  }
  #recordSuspendedChange(batch: ChangeBatch): void {
    const current = this.#suspendedChanges;
    if (!current) {
      this.#suspendedChanges = { files: [...batch.files], kinds: new Set(batch.kinds) };
      return;
    }
    this.#suspendedChanges = {
      files: [...new Set([...current.files, ...batch.files])],
      kinds: new Set([...current.kinds, ...batch.kinds]),
    };
  }
  async #wakeFromIdle(reason: string): Promise<void> {
    if (!this.#suspended || this.#waking) return;
    this.#waking = true;
    this.#cancelIdleSuspend();
    this.#stopIdleWatcher();
    const batch = this.#suspendedChanges;
    this.#suspendedChanges = null;
    const startedAtMono = performance.now();
    this.logger.info(`[idle-suspend] waking (${reason})`);
    try {
      await this.#applyIdleWake(batch);
      this.logger.info(`[idle-suspend] awake in ${Math.round(performance.now() - startedAtMono)}ms`);
    } catch (err) {
      this.logger.error(
        `[idle-suspend] wake failed; recovering the builder: ${err instanceof Error ? err.message : String(err)}`,
      );
      this.#scheduleBuilderRecovery({ files: batch?.files ?? [] });
    } finally {
      this.#suspended = false;
      this.#waking = false;
      this.#wokeAtMono = performance.now();
      this.#flushPendingBuilderMessages();
      this.#armIdleSuspend();
      // A wake often leaves the backend state untouched, so nothing else would tell a supervisor it came back.
      this.#emitDevEvent(devHostStateOf(this.#backendLifecycleState, this.#backendGaveUp));
    }
  }
  async #applyIdleWake(batch: ChangeBatch | null): Promise<void> {
    const files = batch?.files ?? [];
    if (shouldRefreshConfigOnIdleWake(batch)) {
      this.logger.verbose("[idle-suspend] config changed while suspended; restarting the dev host");
      // Replaces the backend too, and a baseline kept past its own gap costs a restart at the next one.
      this.#discardBuilderGap("config change replaces the backend anyway");
      //? Through the same path as a save's: a failure is reported and stays pending, as one would be awake.
      await this.#applyRecycle({ type: "invalidate", kinds: [...(batch?.kinds ?? [])], files }, true);
      return;
    }
    // Refresh before deciding: a file created while suspended is not in the graph yet.
    if (files.length > 0) await this.#backendGraph.refresh();
    await this.#startBuilder({ announceBootState: true });
    // Merged: the watcher's batch and the stamps overlap on the ordinary one-save-during-suspend case.
    const missed = await this.#takeBuilderGapChanges();
    const backendFiles = [...new Set([...files.filter((file) => this.#backendGraph.has(file)), ...missed])];
    if (backendFiles.length === 0) return;
    this.logger.verbose(`[idle-suspend] ${backendFiles.length} backend file(s) changed while suspended`);
    this.#scheduleBackendRestart({ files: backendFiles, roles: [] });
  }
  // Until a builder is back nothing watches (Bun's `fs.watch` drops events, a new builder primes from disk), so
  // stamp the backend graph now. Earliest open wins: over-reporting costs a restart, under-reporting stale code.
  #openBuilderGap(reason: string): void {
    if (this.#builderGapStamp) return;
    if (!this.#backendGraph.ready) {
      this.logger.verbose(`[builder-gap] no backend graph yet; a save during this ${reason} goes unnoticed`);
      return;
    }
    this.#builderGapStamp = this.#backendGraph
      .fingerprint()
      .then((stamps) => {
        this.logger.verbose(`[builder-gap] stamped ${stamps.size} backend file(s) (${reason})`);
        return stamps;
      })
      .catch((err) => {
        this.logger.warn(
          `[builder-gap] could not stamp the backend files: ${err instanceof Error ? err.message : String(err)}`,
        );
        return null;
      });
  }
  async #takeBuilderGapChanges(): Promise<string[]> {
    const stamping = this.#builderGapStamp;
    this.#builderGapStamp = null;
    const before = stamping ? await stamping : null;
    if (!before) return [];
    const moved = filesChangedSince(before, await this.#backendGraph.fingerprint());
    if (moved.length === 0) {
      this.logger.verbose(`[builder-gap] none of the ${before.size} stamped backend file(s) moved`);
      return moved;
    }
    this.logger.info(
      `[builder-gap] ${moved.length} backend file(s) changed while the builder was away; the backend is running the old ones`,
    );
    return moved;
  }
  // A baseline left open is compared against the next gap, where everything saved since reads as changed.
  #discardBuilderGap(reason: string): void {
    if (!this.#builderGapStamp) return;
    this.#builderGapStamp = null;
    this.logger.verbose(`[builder-gap] stamps dropped (${reason})`);
  }
  async #restartBackendForGapChanges(): Promise<void> {
    const moved = await this.#takeBuilderGapChanges();
    if (moved.length === 0) return;
    this.#scheduleBackendRestart({ files: moved, roles: [] });
  }
  #flushPendingBuilderMessages(): void {
    const pending = this.#pendingBuilderMessages.splice(0);
    if (pending.length === 0) return;
    this.logger.verbose(`[builder] replaying ${pending.length} request(s) held while the builder was away`);
    for (const message of pending) this.#sendToBuilder(message);
  }

  // Held requests carry the departing backend's ids, which the new one reissues from 1, so a replay would
  // misdeliver answers; nothing is answered because the old backend is already stopped.
  #discardPendingBuilderMessages(reason: string): void {
    const held = this.#pendingBuilderMessages.splice(0);
    if (held.length === 0) return;
    this.logger.verbose(`[builder] dropped ${held.length} held builder request(s): ${reason}`);
  }
  #failPendingBuilderMessages(reason: string): void {
    const held = this.#pendingBuilderMessages.splice(0);
    if (held.length === 0) return;
    this.logger.warn(`failing ${held.length} held builder request(s): ${reason}`);
    for (const message of held) this.#failBuilderRequest(message, reason);
  }
  #failBuilderRequest(message: BuilderMessage, error: string): boolean {
    if (message.type === "build-route")
      this.#sendToBackend({ type: "build-route-res", id: message.id, ok: false, error });
    else if (message.type === "build-csr")
      this.#sendToBackend({ type: "build-csr-res", id: message.id, ok: false, error });
    else return false;
    return true;
  }
  #recycleBuilderForRss(reason: string): void {
    // Dropping the recycle costs nothing: the next build re-reports an over-ceiling rss and re-arms it.
    if (this.#pendingRecycle || this.#restartTimer) {
      this.logger.verbose(`[builder-recycle] skipped (${reason}); a dev restart is already pending`);
      return;
    }
    if (!this.#builder?.recycle(reason)) return;
    this.#lastRssRecycleAtMono = performance.now();
    // Stamped at the request, not the exit: a draining builder has already stopped taking work.
    this.#openBuilderGap("builder recycle");
  }
  async #handleInvalidate(message: Extract<BuilderMessage, { type: "invalidate" }>) {
    this.#logDevPlan(message);
    if (this.#rssRecycleReason) this.#armRssRecycle(this.#rssRecycleReason);
    // Checked first: a dev-host restart also recycles the builder and backend.
    const wantsDevHostRestart = shouldRestartDevHostByDevPlan(message);
    const pending = this.#pendingRecycle;
    // A deferred recycle resumes on the next code batch; a css-only batch cannot heal a compile error.
    const resumes = !!pending && message.kinds.includes("code") && this.#touchesFailedRecycle(message.files);
    if (wantsDevHostRestart || shouldRestartBuilderByDevPlan(message) || resumes) {
      const refreshConfig = wantsDevHostRestart || (pending?.refreshConfig ?? false);
      const merged = pending ? mergeInvalidateMessages(pending.message, message) : message;
      const generation = message.devPlan?.generation ?? message.generation;
      if (hasBuildFailureForGeneration(this.#buildStatusByPhase, generation)) {
        this.#deferRecycle(merged, { refreshConfig, generation });
        return;
      }
      await this.#applyRecycle(merged, refreshConfig);
      return;
    }
    if (await this.#shouldRestartBackend(message)) {
      this.#scheduleBackendRestart(backendRestartReasonFromMessage(message));
      return;
    }
    this.#sendToBackend(message);
  }
  async #applyRecycle(message: Extract<BuilderMessage, { type: "invalidate" }>, refreshConfig: boolean): Promise<void> {
    if (this.#stopping) return;
    this.#pendingRecycle = null;
    const progress = { applied: !refreshConfig };
    try {
      if (refreshConfig) await this.#restartDevHost(message, progress);
      else await this.#restartDevChildren(message);
    } catch (err) {
      const kind = refreshConfig ? "Config" : "Runtime metadata";
      const generation = this.#recordDevHostRestartFailure(message, err, kind, { applied: progress.applied });
      //? Kept only when the change itself did not apply: a builder that booted degraded (a broken akan.config.ts)
      //? takes the fixing save itself and sends no invalidate, so without this the old config would keep running.
      if (progress.applied) this.#restartFailedAfterApply = generation;
      else this.#pendingRecycle = { message, refreshConfig, failed: true, failedGeneration: generation };
      this.#resurrectDevChildren(message);
    }
  }
  //? The first green pages build after a failed restart that touches its change is the fix: the change applies then. A
  //? cause no save fixes (an env value) waits for the next change of those files, not for every green save.
  async #resumeFailedRecycle(status: DevBuildStatus): Promise<void> {
    const pending = this.#pendingRecycle;
    if (!pending?.failed || !status.ok || status.phase !== "pages" || !this.#touchesFailedRecycle(status.files)) return;
    //? Newer than the failure: the batch that carried the change reports its own pages ok while the restart runs.
    if (status.generation <= (pending.failedGeneration ?? -1)) return;
    await this.#applyRecycle(pending.message, pending.refreshConfig);
  }
  #touchesFailedRecycle(files: string[]): boolean {
    const pending = this.#pendingRecycle;
    if (!pending?.failed) return true;
    const changed = new Set(pending.message.files);
    return files.some((file) => changed.has(file));
  }
  #deferRecycle(
    message: Extract<BuilderMessage, { type: "invalidate" }>,
    { refreshConfig, generation }: { refreshConfig: boolean; generation?: number },
  ): void {
    this.#pendingRecycle = { message, refreshConfig };
    const kind = refreshConfig ? "Config" : "Runtime metadata";
    this.logger.warn(
      `[dev-host] ${kind.toLowerCase()} restart deferred generation=${generation ?? "(unknown)"}; keeping the running dev server until the build error is fixed`,
    );
    const status: DevBuildStatus = {
      generation: generation ?? this.#nextBackendBuildStatusGeneration(),
      phase: "scan",
      ok: false,
      files: message.files,
      message: `${kind} change is on hold while the build is failing; it will apply automatically once the error is fixed.`,
    };
    this.#recordBuildStatus(status);
    this.#sendOrQueueBuildStatus(status);
  }
  // The backend returns on the last-good artifact so the error overlay stays reachable.
  #resurrectDevChildren(message: Extract<BuilderMessage, { type: "invalidate" }>): void {
    const generation = message.devPlan?.generation ?? message.generation;
    if (!this.#backend) this.#startBackend({ generation, files: message.files });
    this.#scheduleBuilderRecovery({ generation, files: message.files });
  }
  #scheduleBuilderRecovery(reason: { generation?: number; files: string[] }): void {
    if (this.#builderRecoveryTimer || this.#builder) return;
    const attempt = this.#builderRecoveryAttempts;
    const delay = Math.min(BUILDER_RECOVERY_BASE_DELAY_MS * 2 ** attempt, BUILDER_RECOVERY_MAX_DELAY_MS);
    this.#builderRecoveryAttempts = attempt + 1;
    this.logger.warn(
      `[builder-recovery] builder is down; retrying start in ${delay}ms (attempt ${this.#builderRecoveryAttempts})`,
    );
    this.#builderRecoveryTimer = setTimeout(() => {
      this.#builderRecoveryTimer = null;
      if (this.#builder) return;
      void this.#recoverBuilder(reason);
    }, delay);
  }
  async #recoverBuilder(reason: { generation?: number; files: string[] }): Promise<void> {
    try {
      await this.#startBuilder();
    } catch (err) {
      this.logger.warn(`[builder-recovery] builder start failed: ${err instanceof Error ? err.message : String(err)}`);
      this.#scheduleBuilderRecovery(reason);
      return;
    }
    this.#builderRecoveryAttempts = 0;
    this.logger.info("[builder-recovery] builder recovered");
    void this.#restartBackendForGapChanges();
    const failedAfterApply = this.#restartFailedAfterApply;
    this.#restartFailedAfterApply = null;
    const status: DevBuildStatus = {
      generation:
        failedAfterApply !== null
          ? this.#nextBackendBuildStatusGeneration(failedAfterApply + 1)
          : (reason.generation ?? this.#nextBackendBuildStatusGeneration()),
      phase: "scan",
      ok: true,
      files: reason.files,
      message: "Builder recovered",
    };
    this.#recordBuildStatus(status);
    this.#sendOrQueueBuildStatus(status);
    if (!this.#backend && !this.#backendRecoveryTimer) {
      this.#startBackend({ generation: reason.generation, files: reason.files });
    }
  }
  #reviveBackendAfterGreenBuild(status: DevBuildStatus): void {
    if (!status.ok || !this.#backendGaveUp || this.#backend || this.#backendRecoveryTimer) return;
    this.logger.info(`[backend-recovery] build went green (generation=${status.generation}); retrying backend`);
    this.#backendRecoveryAttempts = 0;
    this.#startBackend({ generation: status.generation, files: status.files });
  }
  async #restartDevChildren(message: Extract<BuilderMessage, { type: "invalidate" }>): Promise<void> {
    const generation = message.devPlan?.generation ?? message.generation;
    this.logger.warn(
      `[dev-host] recycling builder/backend for runtime metadata generation=${generation ?? "(unknown)"} files=${message.files.length}`,
    );
    await this.#recycleDevChildren(message);
  }
  // The config is re-imported with a cache-busting query, but modules it imports stay cached: a change inside an
  // imported plugin file still needs a manual `akan start` restart.
  async #restartDevHost(
    message: Extract<BuilderMessage, { type: "invalidate" }>,
    progress?: { applied: boolean },
  ): Promise<void> {
    const generation = message.devPlan?.generation ?? message.generation;
    this.logger.warn(
      `[dev-host] config change detected; restarting dev host generation=${generation ?? "(unknown)"} files=${message.files.length}`,
    );
    await this.#recycleDevChildren(message, { refreshConfig: true, progress });
  }
  async #recycleDevChildren(
    message: Extract<BuilderMessage, { type: "invalidate" }>,
    { refreshConfig = false, progress }: { refreshConfig?: boolean; progress?: { applied: boolean } } = {},
  ): Promise<void> {
    const generation = message.devPlan?.generation ?? message.generation;
    this.#clearRestartTimers();
    this.#builderRecoveryAttempts = 0;
    this.#pendingRestartReason = null;
    await this.#backendRestart;
    this.#lastGoodFrontend = {};
    this.#buildStatusByPhase.clear();
    this.#pendingBuildStatusReplay = [];
    await this.#stopBackend();
    this.#stopBuilder();
    this.#patcherOff = false;
    if (refreshConfig) {
      await this.app.getConfig({ refresh: true });
      // Merge, not replace: `start()` added values prepare does not produce (REDIS_HOST from the tunnel).
      const { env } = await this.app.prepareCommand("start");
      Object.assign(this.env, env);
      if (progress) progress.applied = true;
    }
    await this.#backendGraph.refresh();
    await this.#startBuilder();
    this.#startBackend({ generation, files: message.files });
  }
  // `supersede`: a recycled builder's re-announcement is what is on disk now, whatever generation it carries.
  #recordLastGood(
    message: Extract<BuilderMessage, { type: "pages-updated" }> | Extract<BuilderMessage, { type: "css-updated" }>,
    { supersede = false }: { supersede?: boolean } = {},
  ): void {
    if (message.type === "pages-updated") {
      if (!supersede && !shouldReplaceLastGoodMessage(this.#lastGoodFrontend.pages, message)) return;
      this.#lastGoodFrontend.pages = message;
      this.logger.verbose(
        `[last-good] pages generation=${message.data.generation ?? "(unknown)"} buildId=${message.data.buildId}`,
      );
      return;
    }
    if (!supersede && !shouldReplaceLastGoodMessage(this.#lastGoodFrontend.css, message)) return;
    this.#lastGoodFrontend.css = message;
    this.logger.verbose(
      `[last-good] css generation=${message.data.generation ?? "(unknown)"} assets=${Object.keys(message.data.cssAssets).length}`,
    );
  }
  #recordDevHostRestartFailure(
    message: Extract<BuilderMessage, { type: "invalidate" }>,
    err: unknown,
    kind: "Config" | "Runtime metadata",
    { applied }: { applied: boolean },
  ): number {
    const generation = message.devPlan?.generation ?? message.generation ?? this.#nextBackendBuildStatusGeneration();
    const detail = err instanceof Error ? err.message : String(err);
    this.logger.warn(`[dev-host] ${kind.toLowerCase()} restart failed generation=${generation}: ${detail}`);
    const names = message.files.slice(0, 3).map((file) => path.basename(file));
    const saved = names.length > 0 ? names.join(", ") : "the changed file";
    const status: DevBuildStatus = {
      generation,
      phase: "scan",
      ok: false,
      files: message.files,
      message: applied
        ? `${kind} change applied, but the dev server failed to restart: ${detail}. It is recovering on its own.`
        : `${kind} change failed to apply: ${detail}. The dev server keeps running on the previous ${kind.toLowerCase()}; once it is fixed, save ${saved} again or restart the dev server to apply it.`,
    };
    this.#recordBuildStatus(status);
    this.#sendOrQueueBuildStatus(status);
    return generation;
  }
  #recordBuildStatus(status: DevBuildStatus): void {
    const recovered = shouldMarkBuildPhaseRecovered(this.#buildStatusByPhase, status);
    if (shouldKeepBuildFailure(this.#buildStatusByPhase, status)) return;
    this.#buildStatusByPhase.set(status.phase, status);
    const label = `[build-status] generation=${status.generation} phase=${status.phase} ok=${status.ok} files=${status.files.length}`;
    if (status.ok) this.logger.verbose(`${label}${recovered ? " recovered=1" : ""}`);
    else this.logger.warn(`${label}${status.message ? ` message=${status.message}` : ""}`);
  }
  #sendOrQueueBuildStatus(status: DevBuildStatus): void {
    if (!this.#backend || shouldQueueBuildStatusReplay(this.#backendReady, this.#pendingBuildStatusReplay.length)) {
      this.#pendingBuildStatusReplay.push(status);
      this.logger.verbose(
        `backend is not ready; will replay build-status generation=${status.generation} phase=${status.phase}`,
      );
      return;
    }
    this.#sendToBackend({ type: "build-status", data: status });
  }
  //? A route status belongs to the route cache of the backend that asked for the build: a new backend builds its routes
  //? again, and reports each one itself.
  #forgetRouteBuildStatus(): void {
    this.#buildStatusByPhase.delete("route");
    this.#pendingBuildStatusReplay = this.#pendingBuildStatusReplay.filter((status) => status.phase !== "route");
  }
  #replayBuilderState(): void {
    if (!this.#backendReady) return;
    if (this.#lastGoodFrontend.css) this.#sendToBackend(this.#lastGoodFrontend.css);
    if (this.#lastGoodFrontend.pages) this.#sendToBackend(this.#lastGoodFrontend.pages);
    const queuedStatuses = this.#pendingBuildStatusReplay.splice(0);
    for (const status of buildStatusReplaySequence(queuedStatuses, this.#buildStatusByPhase)) {
      this.#sendToBackend({ type: "build-status", data: status });
    }
  }
  #logDevPlan(message: Extract<BuilderMessage, { type: "invalidate" }>): void {
    if (!message.devPlan) return;
    const { generation, roles, actions, reasonByFile } = message.devPlan;
    this.logger.verbose(
      `[dev-plan] generation=${generation} roles=${roles.join(",") || "(none)"} actions=${actions.join(",") || "(none)"} reasons=${Object.keys(reasonByFile).length}`,
    );
  }

  async #shouldRestartBackend(message: Extract<BuilderMessage, { type: "invalidate" }>): Promise<boolean> {
    if (message.kinds.length === 1 && message.kinds[0] === "css") return false;
    if (message.devPlan) {
      const shouldRestart = shouldRestartBackendByDevPlan(message) ?? false;
      if (shouldRestart && message.kinds.includes("code")) await this.#backendGraph.refresh();
      return shouldRestart;
    }
    if (message.kinds.includes("code")) await this.#backendGraph.refresh();
    if (message.files.some((file) => this.#backendGraph.has(file))) return true;
    if (!this.#backendGraph.lastRefreshSucceeded) {
      const fallbackFiles = message.files.filter((file) =>
        isLegacyBackendFallbackFile(file, this.app.workspace.workspaceRoot),
      );
      if (fallbackFiles.length > 0) {
        this.logger.warn(
          `[backend-graph] using path-role fallback for legacy invalidate; restart files=${fallbackFiles.length}`,
        );
        return true;
      }
    }
    return false;
  }
  async #startBuilder({
    announceBootState = false,
  }: {
    announceBootState?: boolean;
  } = {}): Promise<IncrementalBuilderHost> {
    const startTime = Date.now();
    this.app.verbose(`[cli] waiting for builder to complete initial base build…`);
    let lastError: unknown;
    for (let attempt = 1; attempt <= BUILDER_START_MAX_ATTEMPTS; attempt++) {
      this.#builder = await IncrementalBuilderHost.create(
        this.app,
        this.env,
        (msg) => {
          this.#enqueueBuilderMessage(msg);
        },
        {
          stdio: this.stdio,
          onOutput: (kind, text) => void (kind === "stderr" ? process.stderr : process.stdout).write(text),
          patcherOff: this.#patcherOff,
        },
      );
      try {
        await this.#waitForBuilderReady(attempt, { announceBootState });
        this.app.verbose(`[cli] base build ready in ${Date.now() - startTime}ms — starting backend`);
        return this.#builder;
      } catch (err) {
        lastError = err;
        this.#stopBuilder();
        if (attempt >= BUILDER_START_MAX_ATTEMPTS) break;
        this.app.verbose(`[cli] builder failed before ready; retrying (${attempt + 1}/${BUILDER_START_MAX_ATTEMPTS})`);
      }
    }
    this.#failPendingBuilderMessages("builder failed to start");
    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  }
  #waitForBuilderReady(
    attempt: number,
    { announceBootState = false }: { announceBootState?: boolean } = {},
  ): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      if (!this.#builder) throw new Error("Builder Not Found");
      let settled = false;
      const settle = (fn: () => void) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        fn();
      };
      const timeout = setTimeout(() => {
        settle(() => reject(new Error("[cli] builder timed out before emitting builder-ready")));
      }, BUILDER_READY_TIMEOUT_MS);
      this.#builder.start({
        announceBootState,
        onExit: () => {
          settle(() => reject(new Error(`[cli] builder exited before emitting builder-ready (attempt ${attempt})`)));
        },
        onAway: () => {
          this.#openBuilderGap("builder replacement");
        },
        onReady: () => {
          settle(resolve);
          this.#flushPendingBuilderMessages();
        },
        onRestartReady: () => {
          this.logger.verbose("[builder-recovery] builder ready after restart; replaying latest state");
          this.#replayBuilderState();
          this.#flushPendingBuilderMessages();
          void this.#restartBackendForGapChanges();
          void this.#checkRecycledBuilderFloor();
        },
      });
    });
  }
  #sendToBuilder(message: BuilderMessage): void {
    this.#markDevActivity();
    if (this.#suspended || this.#waking) {
      this.#pendingBuilderMessages.push(message);
      void this.#wakeFromIdle(`${message.type} arrived while suspended`);
      return;
    }
    // In `env`, which every builder spawn re-reads, so a restarted builder stays armed for a mobile dev session.
    if (message.type === "build-csr" && this.env.AKAN_DEV_CSR_REBUILD !== "1") {
      Object.assign(this.env, { AKAN_DEV_CSR_REBUILD: "1" });
      this.logger.verbose(`[csr] armed dev CSR rebuilds (${message.reason})`);
    }
    // Renumbered per backend generation; the failure replies below use that backend's own `message.id`.
    if (message.type === "build-route" || message.type === "build-csr") {
      const outgoing = this.#builderRequests.issue(message);
      if (this.#builder?.send(outgoing)) return;
      this.#builderRequests.withdraw(outgoing.id);
    } else if (this.#builder?.send(message)) return;
    const status = this.#builder?.status ?? "stopped";
    // A returning builder is a gap, not a failure: hold the request (`BuilderRpc`'s timeout still bounds it).
    if (shouldHoldForReturningBuilder({ status, heldCount: this.#pendingBuilderMessages.length })) {
      this.#pendingBuilderMessages.push(message);
      this.logger.verbose(
        `[builder] holding ${message.type} until the builder is ready (${this.#pendingBuilderMessages.length} waiting)`,
      );
      return;
    }
    if (this.#failBuilderRequest(message, `builder is ${status}; reload after the builder is ready`)) return;
    this.logger.warn("akanAppHost builder is not running");
  }
  #stopBuilder(): void {
    this.#cancelRssRecycle();
    if (!this.#builder) return;
    if (this.#builder.patcherOff) this.#patcherOff = true;
    this.#builder.stop();
    this.#builder = null;
  }
}
