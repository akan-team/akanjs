import { Logger } from "akanjs/common";
import type { BuilderMessage, BuilderMetrics, BuildPhase, ChangeBatch, DevBuildStatus } from "akanjs/server";
import type { App } from "../commandDecorators";
import { createTunnel } from "../createTunnel";
import { WorkspaceExecutor } from "../executors";
// Imported by module path, not through `../frontendBuild`: that barrel pulls in `typescript` and the
// tailwind stack, which is exactly what a suspended dev host must not be holding.
import { HmrWatcher } from "../frontendBuild/hmrWatcher";
import { WatchRootResolver } from "../frontendBuild/watchRootResolver";
import { type DevStdioMode, IncrementalBuilderHost } from "../incrementalBuilder";
import { BuilderRequestRouter } from "../incrementalBuilder/builderRequestRouter";
import { BackendImportGraph } from "./BackendImportGraph";
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

const BACKEND_RESTART_DEBOUNCE_MS = 120;

// Must exceed the gateway's child-wait budget (AkanApp child shutdown, ~5s in dev) so the gateway
// is never SIGKILLed while its replicas are still shutting down — that's what strands orphans.
const BACKEND_GRACEFUL_TIMEOUT_MS = 8_000;

const BACKEND_RECOVERY_BASE_DELAY_MS = 1_000;

const BACKEND_RECOVERY_MAX_DELAY_MS = 30_000;

const BACKEND_STDERR_TAIL_LIMIT = 40;

const BUILDER_READY_TIMEOUT_MS = 150000;

const BUILDER_START_MAX_ATTEMPTS = 3;

// Save-on-keystroke arrives as a burst of batches. Recycling mid-burst would drop the watcher events
// still on their way to the builder, so an over-ceiling builder is replaced only once it goes quiet.
const BUILDER_RSS_RECYCLE_QUIET_MS = 750;

// Linux hands the bundler arenas back on its own after ~10-15s idle — measured at 46-59% of the
// builder's peak (`local/optimize-resource/09-linux-retention-measurement.md`) — while macOS returns
// none of it. The builder only reports RSS at work-completion points, so the sample a recycle is armed
// from is the peak. Waiting out the purge and re-reading before committing is what stops the host
// paying a cold boot build for memory the OS was about to return anyway. On macOS the re-read returns
// the same value, so this only ever costs the delay.
const BUILDER_RSS_SETTLE_MS = 20_000;

/** Reading one process's rss is a millisecond of work; anything near this is a `ps` that is stuck. */
const PS_RSS_TIMEOUT_MS = 2_000;

// The builder is the file watcher: while it is down no edit can trigger a retry, so unlike the
// backend the recovery loop never gives up — it only backs off.
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
  #backend: Bun.Subprocess<"ignore", "inherit" | "pipe", "inherit" | "pipe"> | null = null;
  #builder: IncrementalBuilderHost | null = null;
  #backendReady = false;
  #plannedBackendStops = new WeakSet<Bun.Subprocess<"ignore", "inherit", "inherit">>();
  #restartTimer: ReturnType<typeof setTimeout> | null = null;
  #backendRecoveryTimer: ReturnType<typeof setTimeout> | null = null;
  #backendRecoveryAttempts = 0;
  #backendGaveUp = false;
  #backendLifecycleState: BackendLifecycleState = "stopped";
  #pendingRestartReason: BackendRestartReason | null = null;
  #pendingRecycle: { message: Extract<BuilderMessage, { type: "invalidate" }>; refreshConfig: boolean } | null = null;
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
  /** Invalidates an in-flight settle check when anything else moves the builder underneath it. */
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
  /** The stat sweep taken when the builder went away, awaited by the take; see `#openBuilderGap`. */
  #builderGapStamp: Promise<SourceFingerprints | null> | null = null;
  /** Requests that arrived while suspended, answered by the builder that the wake brings up. */
  #pendingBuilderMessages: BuilderMessage[] = [];
  readonly #builderRequests = new BuilderRequestRouter();
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
    this.#cancelIdleSuspend();
    this.#stopIdleWatcher();
    if (this.#restartTimer) {
      clearTimeout(this.#restartTimer);
      this.#restartTimer = null;
    }
    if (this.#backendRecoveryTimer) {
      clearTimeout(this.#backendRecoveryTimer);
      this.#backendRecoveryTimer = null;
    }
    if (this.#builderRecoveryTimer) {
      clearTimeout(this.#builderRecoveryTimer);
      this.#builderRecoveryTimer = null;
    }
    // Before the backend goes away, while it can still receive the answer.
    this.#failPendingBuilderMessages("dev server is shutting down");
    await this.#stopBackend();
    this.#stopBuilder();
    return this;
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
    // Before the spawn: from here on, a builder answer for the departing backend must not be delivered to
    // this one, which numbers its requests from 1 all over again.
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
          this.#replayBuilderState();
          return;
        }
        if (msg.type === "build-status") {
          // The gateway reports replica boot failures (crash loops, port conflicts) this way so
          // they reach the build-status log and the HMR overlay like any other build failure.
          const status = this.#recordBackendBuildStatus({
            generation: normalizeBackendReportedGeneration(msg.data.generation),
            ok: msg.data.ok,
            files: msg.data.files,
            message: msg.data.message,
          });
          this.#sendOrQueueBuildStatus(status);
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
      // A piped backend writes to nobody unless the pipes are drained; surface them through the logger
      // so a runtime error is not silently swallowed, and so the tail kept for a boot failure still fills.
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
  /**
   * A piped child is written through verbatim rather than re-logged: a level floor here would swallow
   * what the runtime printed, and re-rendering would double the timestamp the child already wrote. So
   * `"pipe"` looks exactly like `"inherit"` to whoever owns this process's stdout — the only difference
   * is `#backendStderrTail`, which is what the crash-loop diagnostic reads.
   */
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
      const next = this.#pendingRestartReason;
      this.#pendingRestartReason = null;
      if (next) void this.#restartBackend(next);
    }, BACKEND_RESTART_DEBOUNCE_MS);
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
    this.#markDevActivity();
    if (message.type === "build-status") {
      this.#recordBuildStatus(message.data);
      this.#sendOrQueueBuildStatus(message.data);
      this.#reviveBackendAfterGreenBuild(message.data);
      return;
    }
    if (message.type === "builder-metrics") {
      this.#handleBuilderMetrics(message.data);
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
  /**
   * A recycled builder re-announces the artifact it booted with, because the backend read
   * `base-artifact.json` once and never re-reads it. Dropping the announcement when the hashes match
   * is what keeps the common case — a recycle with no concurrent edit — invisible to browsers.
   */
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
    const asMib = (bytes: number) => Math.round(bytes / 1024 / 1024);
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
      // Said once, and only as information: the builder is still being replaced, at most once per
      // interval, because that bound is the only thing standing between the bundler's arenas and the
      // sandbox's memory limit.
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
  /**
   * Ask the replacement, the moment it is ready, whether this ceiling is reachable at all.
   *
   * Read from the OS rather than from a metrics report, because the report the host would otherwise
   * judge on only arrives after the builder has built something — by which point what is being measured
   * is the work, not the floor. A floor over the ceiling means every replacement lands over it, so the
   * recycle loop can only ever cost boot builds.
   */
  async #checkRecycledBuilderFloor(): Promise<void> {
    if (this.#rssCeilingAbandoned || this.#lastRssRecycleAtMono === null) return;
    const ceilingBytes = IncrementalBuilderHost.maxRssBytes();
    const pid = this.#builder?.pid;
    if (!ceilingBytes || !pid) return;
    const freshRssBytes = await AkanAppHost.readProcessRssBytes(pid);
    if (!isRssCeilingUnreachable(freshRssBytes, ceilingBytes)) return;
    this.#rssCeilingAbandoned = true;
    const asMib = (bytes: number) => Math.round(bytes / 1024 / 1024);
    this.logger.error(
      `[builder-recycle] a freshly recycled builder is already at ${asMib(freshRssBytes ?? 0)}MiB with nothing built on demand, so the ${asMib(ceilingBytes)}MiB ceiling cannot be met for this app; no longer enforcing it this session. Raise AKAN_BUILDER_MAX_RSS_MB, or set it to 0 to leave the builder unbounded.`,
    );
  }
  /** Waits for the builder to go quiet, so a recycle never lands in the middle of a burst of saves. */
  #armRssRecycle(reason: string, over?: { rssBytes: number; ceilingBytes: number }): void {
    if (this.#rssRecycleReason !== reason)
      this.logger.verbose(`[builder-recycle] armed (${reason}); replacing the builder once it stays quiet`);
    this.#rssRecycleReason = reason;
    // Held in a field, not the closure: `#handleInvalidate` re-arms mid-burst with the reason alone, and
    // losing the sample there would silently skip the settle check for exactly the bursty case.
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
  /**
   * Confirms the builder is *still* over the ceiling before replacing it. The armed sample was taken
   * the instant the builder went idle, which is its peak; where the allocator returns arenas during
   * idle, that number is stale within seconds and recycling on it is pure cost.
   */
  async #recycleBuilderForRssWhenStillOver(
    reason: string,
    { rssBytes, ceilingBytes }: { rssBytes: number; ceilingBytes: number },
  ): Promise<void> {
    const asMib = (bytes: number) => Math.round(bytes / 1024 / 1024);
    if (decideBuilderRssSettle({ rssBytes, ceilingBytes }) === "recycle-now") {
      this.#recycleBuilderForRss(reason);
      return;
    }
    const pid = this.#builder?.pid;
    // Without a readable pid there is nothing to re-check, so keep the original behaviour.
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
    // Anything that touched the builder meanwhile — a new batch, a recycle, a suspend — invalidates this.
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
  /**
   * Another process's RSS, read from the OS rather than asked of the process. `tasklist` on Windows, `/proc`
   * where it exists, `ps` otherwise (macOS has no `/proc`). Null when it cannot be read, which callers treat
   * as "no new information" rather than as zero.
   */
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
  /**
   * `ps` or `tasklist`, bounded. An absent tool is already handled — it answers `null`, which callers read as
   * "no new information" — but a `ps` that never answers was not: the only caller awaits it after a 20s settle,
   * so the recycle it was about to commit simply never happened, silently. The harness has hit exactly
   * this hang while shelling out to `ps` under load.
   */
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
  /** `Mem Usage` is the working set — what `process.memoryUsage.rss()` reports on Windows — in locale-grouped KB. */
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
  /**
   * How long the dev server may sit unused before its build capacity is dropped. Set
   * `AKAN_DEV_IDLE_SUSPEND_MS=0` to keep the builder resident for the whole session.
   */
  static idleSuspendMs(): number | null {
    return resolveIdleSuspendMs(process.env.AKAN_DEV_IDLE_SUSPEND_MS);
  }
  /** Every builder message and every request for one counts as the dev server being in use. */
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
    // Watch before stopping, never after: an edit landing in the gap would be lost, and nothing
    // would wake the dev server until the next one.
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
      // Awaited so the mtime baseline exists before the first edit: `#recordSuspendedChange` replays this
      // batch's file list to the woken builder, and a file missing from it is never rebuilt at all.
      await watcher.start();
      this.#idleWatcher = watcher;
      return true;
    } catch (err) {
      // Better to keep paying for the builder than to suspend into a dev server that cannot notice edits.
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
  /**
   * Bring build capacity back. Reuses the paths an ordinary change would take, so a change made while
   * suspended lands the same way it would have while awake.
   */
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
      // Never leave the dev server without a builder: fall back to the ordinary recovery loop, which
      // keeps retrying, rather than sitting suspended with no watcher.
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
      // A wake often leaves the backend's own state untouched, so nothing else would report that the
      // app came back and a supervisor would show it suspended for the rest of the session.
      this.#emitDevEvent(devHostStateOf(this.#backendLifecycleState, this.#backendGaveUp));
    }
  }
  async #applyIdleWake(batch: ChangeBatch | null): Promise<void> {
    const files = batch?.files ?? [];
    if (shouldRefreshConfigOnIdleWake(batch)) {
      this.logger.verbose("[idle-suspend] config changed while suspended; restarting the dev host");
      // This replaces the backend along with the builder, so whatever moved during the suspend is
      // already covered — and a baseline carried past its own gap costs a restart at the next one.
      this.#discardBuilderGap("config change replaces the backend anyway");
      await this.#recycleDevChildren(
        { type: "invalidate", kinds: [...(batch?.kinds ?? [])], files },
        {
          refreshConfig: true,
        },
      );
      return;
    }
    // Refresh before deciding: a file created while suspended is not in the graph yet.
    if (files.length > 0) await this.#backendGraph.refresh();
    await this.#startBuilder({ announceBootState: true });
    // Merged rather than restarted for separately: the batch is what the watcher managed to report, the
    // stamps are what actually moved, and they overlap on the ordinary case of one save during a suspend.
    const missed = await this.#takeBuilderGapChanges();
    const backendFiles = [...new Set([...files.filter((file) => this.#isBackendFile(file)), ...missed])];
    if (backendFiles.length === 0) return;
    this.logger.verbose(`[idle-suspend] ${backendFiles.length} backend file(s) changed while suspended`);
    this.#scheduleBackendRestart({ files: backendFiles, roles: [] });
  }
  /**
   * Remember what the backend is running, because from here until a builder is back nothing is watching.
   *
   * The suspend path installs its own watcher and the restart path has none at all, but neither is a
   * complete answer: Bun's recursive `fs.watch` reports roughly one path per window
   * (`local/optimize-resource/06-watcher-dropped-event.md`), and a replacement builder primes its index
   * from the disk it finds, so anything saved in between looks original to it. A stat taken now and
   * compared when the builder is back does not depend on an event arriving.
   *
   * Scoped to the import graph — the files the backend actually runs. A backend-shaped file outside it
   * changes nothing about the running server, so missing it costs nothing, and enumerating candidates
   * by path role instead would mean walking the tree.
   *
   * The earliest open wins: a baseline from further back can only over-report, and over-reporting costs
   * a backend restart while under-reporting costs a server running code the developer already deleted.
   *
   * Held as the in-flight sweep rather than as its result, so a take cannot read a baseline that is
   * still being written — the sweep is milliseconds and the gap it covers is a boot build, but "usually
   * finishes first" is the kind of guarantee this whole mechanism exists to replace.
   */
  #openBuilderGap(reason: string): void {
    if (this.#builderGapStamp) return;
    if (!this.#backendGraph.ready) {
      // No graph means no stamps at all: the host is on path-role fallback rules and does not know which
      // files the backend runs. Said out loud, because a hole nobody can see reads like coverage.
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
  /** Which backend files moved while the builder was away. Consumes the baseline. */
  async #takeBuilderGapChanges(): Promise<string[]> {
    const stamping = this.#builderGapStamp;
    this.#builderGapStamp = null;
    const before = stamping ? await stamping : null;
    if (!before) return [];
    const moved = filesChangedSince(before, await this.#backendGraph.fingerprint());
    if (moved.length === 0) {
      // Said out loud even when the answer is "nothing", because the alternative — silence — is also
      // what a stamp that was never taken looks like.
      this.logger.verbose(`[builder-gap] none of the ${before.size} stamped backend file(s) moved`);
      return moved;
    }
    this.logger.info(
      `[builder-gap] ${moved.length} backend file(s) changed while the builder was away; the backend is running the old ones`,
    );
    return moved;
  }
  /**
   * Drop the stamps without acting on them, for a path that is replacing the backend anyway.
   *
   * Not merely tidy: a baseline left open outlives the gap it was taken for and is compared against the
   * *next* one, where everything saved in between reads as changed — one backend restart for work that
   * has already been done.
   */
  #discardBuilderGap(reason: string): void {
    if (!this.#builderGapStamp) return;
    this.#builderGapStamp = null;
    this.logger.verbose(`[builder-gap] stamps dropped (${reason})`);
  }
  /** The restart path's half of the above: the wake path merges its own file list in instead. */
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

  #holdUntilBuilderReady(message: BuilderMessage): void {
    this.#pendingBuilderMessages.push(message);
    this.logger.verbose(
      `[builder] holding ${message.type} until the builder is ready (${this.#pendingBuilderMessages.length} waiting)`,
    );
  }

  /**
   * Drop everything held for a backend generation that has been replaced, answering nobody.
   *
   * A held request carries the id the *departing* backend gave it, and `startGeneration` only clears the
   * router — so a replay after the restart would issue that id under the new generation and settle the
   * builder's answer to an id the new backend is itself handing out from 1. That is exactly the
   * misdelivery `BuilderRequestRouter` exists to prevent, reached through the hold queue instead: the
   * new backend gets another route's manifest delta, and its real answer is dropped as unclaimed.
   *
   * Nothing is answered because every caller of `#startBackend` has already stopped the old backend, so
   * a failure reply would only be dropped as undeliverable.
   */
  #discardPendingBuilderMessages(reason: string): void {
    const held = this.#pendingBuilderMessages.splice(0);
    if (held.length === 0) return;
    this.logger.verbose(`[builder] dropped ${held.length} held builder request(s): ${reason}`);
  }
  /**
   * Answer everything still waiting on a builder that is not coming back. Held requests are otherwise
   * invisible to the backend, which would sit on them until its own timeout with no reason given.
   */
  #failPendingBuilderMessages(reason: string): void {
    const held = this.#pendingBuilderMessages.splice(0);
    if (held.length === 0) return;
    this.logger.warn(`failing ${held.length} held builder request(s): ${reason}`);
    for (const message of held) {
      if (message.type === "build-route")
        this.#sendToBackend({ type: "build-route-res", id: message.id, ok: false, error: reason });
      else if (message.type === "build-csr")
        this.#sendToBackend({ type: "build-csr-res", id: message.id, ok: false, error: reason });
    }
  }
  #recycleBuilderForRss(reason: string): void {
    // A config or runtime-metadata change already replaces the builder along with the backend, and a
    // pending backend restart is disruption enough on its own; either way, dropping the recycle here
    // costs nothing — the next build re-reports an over-ceiling rss and arms it again.
    if (this.#pendingRecycle || this.#restartTimer) {
      this.logger.verbose(`[builder-recycle] skipped (${reason}); a dev restart is already pending`);
      return;
    }
    if (!this.#builder?.recycle(reason)) return;
    this.#lastRssRecycleAtMono = performance.now();
    // Stamped at the request rather than at the exit, because a builder that is draining has already
    // stopped taking work: whether its watcher still gets an event out is not something to rely on.
    this.#openBuilderGap("builder recycle");
  }
  async #handleInvalidate(message: Extract<BuilderMessage, { type: "invalidate" }>) {
    this.#logDevPlan(message);
    // More batches are on the way, so push the recycle out until the dev server settles.
    if (this.#rssRecycleReason) this.#armRssRecycle(this.#rssRecycleReason);
    // Config changes subsume builder restarts: the dev-host restart recycles builder and backend
    // AND re-runs the prepare step, so check it first when a batch carries both actions.
    const wantsDevHostRestart = shouldRestartDevHostByDevPlan(message);
    const pending = this.#pendingRecycle;
    // A pending (deferred) recycle rides along on the next code batch — that batch is where the
    // fix lands; css-only batches cannot heal a compile error, so they never resume it.
    if (wantsDevHostRestart || shouldRestartBuilderByDevPlan(message) || (pending && message.kinds.includes("code"))) {
      const refreshConfig = wantsDevHostRestart || (pending?.refreshConfig ?? false);
      const merged = pending ? mergeInvalidateMessages(pending.message, message) : message;
      const generation = message.devPlan?.generation ?? message.generation;
      if (hasBuildFailureForGeneration(this.#buildStatusByPhase, generation)) {
        this.#deferRecycle(merged, { refreshConfig, generation });
        return;
      }
      this.#pendingRecycle = null;
      try {
        if (refreshConfig) await this.#restartDevHost(merged);
        else await this.#restartDevChildren(merged);
      } catch (err) {
        this.#recordDevHostRestartFailure(merged, err, refreshConfig ? "Config" : "Runtime metadata");
        this.#resurrectDevChildren(merged);
      }
      return;
    }
    if (await this.#shouldRestartBackend(message)) {
      this.#scheduleBackendRestart(backendRestartReasonFromMessage(message));
      return;
    }
    this.#sendToBackend(message);
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
  /**
   * A failed recycle must never leave the dev server dead: bring the backend back up on the
   * last-good artifact so the error overlay stays reachable, and keep retrying the builder —
   * the builder is the file watcher, so without it no edit could ever trigger a recovery.
   */
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
    // The other way a builder comes back: a wake that failed, or a start that had to be retried. Either
    // way the tree went unwatched, and this is the first moment there is something to act on it.
    void this.#restartBackendForGapChanges();
    const status: DevBuildStatus = {
      generation: reason.generation ?? this.#nextBackendBuildStatusGeneration(),
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
  /** A backend that gave up recovering on broken code gets one fresh chance whenever a build goes green. */
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
  /**
   * Controlled dev-host restart for config changes (akan.config.ts, tsconfig, package.json):
   * re-runs the prepare step so env and codegen reflect the new config, then recycles the builder
   * and backend. The config module is re-imported with a cache-busting query; modules it imports
   * keep their cached instances, so a change inside an imported plugin file still needs a manual
   * `akan start` restart.
   */
  async #restartDevHost(message: Extract<BuilderMessage, { type: "invalidate" }>): Promise<void> {
    const generation = message.devPlan?.generation ?? message.generation;
    this.logger.warn(
      `[dev-host] config change detected; restarting dev host generation=${generation ?? "(unknown)"} files=${message.files.length}`,
    );
    await this.#recycleDevChildren(message, { refreshConfig: true });
  }
  async #recycleDevChildren(
    message: Extract<BuilderMessage, { type: "invalidate" }>,
    { refreshConfig = false }: { refreshConfig?: boolean } = {},
  ): Promise<void> {
    const generation = message.devPlan?.generation ?? message.generation;
    if (this.#restartTimer) {
      clearTimeout(this.#restartTimer);
      this.#restartTimer = null;
    }
    if (this.#backendRecoveryTimer) {
      clearTimeout(this.#backendRecoveryTimer);
      this.#backendRecoveryTimer = null;
    }
    if (this.#builderRecoveryTimer) {
      clearTimeout(this.#builderRecoveryTimer);
      this.#builderRecoveryTimer = null;
    }
    this.#builderRecoveryAttempts = 0;
    this.#pendingRestartReason = null;
    this.#lastGoodFrontend = {};
    this.#buildStatusByPhase.clear();
    this.#pendingBuildStatusReplay = [];
    await this.#stopBackend();
    this.#stopBuilder();
    if (refreshConfig) {
      await this.app.getConfig({ refresh: true });
      // Merge instead of replace: start() enriched this.env with values prepare doesn't produce
      // (e.g. REDIS_HOST from the tunnel), and the spawned children must keep seeing them.
      const { env } = await this.app.prepareCommand("start");
      Object.assign(this.env, env);
    }
    await this.#backendGraph.refresh();
    await this.#startBuilder();
    this.#startBackend({ generation, files: message.files });
  }
  /**
   * `supersede` bypasses the generation check for a builder that just replaced another one. Its
   * generation counter restarts at 0, so its announcement looks stale to `shouldReplaceLastGoodMessage`
   * — and leaving the old payload cached would make the next backend restart replay an artifact the
   * builder that produced it no longer serves.
   */
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
  ): void {
    const generation = message.devPlan?.generation ?? message.generation ?? this.#nextBackendBuildStatusGeneration();
    const detail = err instanceof Error ? err.message : String(err);
    this.logger.warn(`[dev-host] ${kind.toLowerCase()} restart failed generation=${generation}: ${detail}`);
    const status: DevBuildStatus = {
      generation,
      phase: "scan",
      ok: false,
      files: message.files,
      message: `${kind} change failed to apply; recovering the dev server automatically: ${detail}`,
    };
    this.#recordBuildStatus(status);
    this.#sendOrQueueBuildStatus(status);
  }
  #recordBuildStatus(status: DevBuildStatus): void {
    const recovered = shouldMarkBuildPhaseRecovered(this.#buildStatusByPhase, status);
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
  #replayBuilderState(): void {
    if (!this.#backendReady) return;
    if (this.#lastGoodFrontend.css) this.#sendToBackend(this.#lastGoodFrontend.css);
    if (this.#lastGoodFrontend.pages) this.#sendToBackend(this.#lastGoodFrontend.pages);
    const queuedStatuses = this.#pendingBuildStatusReplay.splice(0);
    for (const status of buildStatusReplaySequence(queuedStatuses, this.#buildStatusByPhase)) {
      this.#sendToBackend({ type: "build-status", data: status });
    }
  }
  /** One log line per planned generation, regardless of which action branch handles it. */
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
    if (message.files.some((file) => this.#isBackendFile(file))) return true;
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
  #isBackendFile(file: string): boolean {
    return this.#backendGraph.has(file);
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
    // Out of attempts: no builder is coming, so anything held for one is waiting on nothing.
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
      // A navigation must not fail just because the sandbox was idle — hold the request and let the
      // builder the wake brings up answer it.
      this.#pendingBuilderMessages.push(message);
      void this.#wakeFromIdle(`${message.type} arrived while suspended`);
      return;
    }
    // The builder skips dev CSR artifacts until a `?csr=true` request needs one. Remember that this
    // session armed it and pass the flag through `env`, which is re-read on every builder spawn, so a
    // builder restart re-arms itself instead of silently breaking an in-progress mobile dev session.
    if (message.type === "build-csr" && this.env.AKAN_DEV_CSR_REBUILD !== "1") {
      Object.assign(this.env, { AKAN_DEV_CSR_REBUILD: "1" });
      this.logger.verbose(`[csr] armed dev CSR rebuilds (${message.reason})`);
    }
    // Renumbered on the way out so a builder answer can be matched back to the backend generation that
    // asked; the failure replies below still use `message.id`, which is that backend's own.
    if (message.type === "build-route" || message.type === "build-csr") {
      const outgoing = this.#builderRequests.issue(message);
      if (this.#builder?.send(outgoing)) return;
      this.#builderRequests.withdraw(outgoing.id);
    } else if (this.#builder?.send(message)) return;
    const status = this.#builder?.status ?? "stopped";
    // A recycle or a crash-restart is a gap, not a failure: the builder is on its way back, and the
    // request that landed in that window is the page a developer is waiting on. Failing it here is what
    // produced a dead tab telling the reader to reload, with nothing retrying on its own — while the
    // suspend path a few lines up has always held requests for exactly this reason. `BuilderRpc`'s own
    // timeout still bounds the wait, so holding cannot hang a request forever.
    if (shouldHoldForReturningBuilder({ status, heldCount: this.#pendingBuilderMessages.length })) {
      this.#holdUntilBuilderReady(message);
      return;
    }
    if (message.type === "build-route") {
      this.#sendToBackend({
        type: "build-route-res",
        id: message.id,
        ok: false,
        error: `builder is ${status}; reload after the builder is ready`,
      });
      return;
    }
    if (message.type === "build-csr") {
      this.#sendToBackend({
        type: "build-csr-res",
        id: message.id,
        ok: false,
        error: `builder is ${status}; reload after the builder is ready`,
      });
      return;
    }
    this.logger.warn("akanAppHost builder is not running");
  }
  #stopBuilder(): void {
    this.#cancelRssRecycle();
    if (!this.#builder) return;
    this.#builder.stop();
    this.#builder = null;
  }
}
