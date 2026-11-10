import { type Logger, RestartSchedule } from "akanjs/common";
import type { BuilderMessage, DevBuildStatus } from "akanjs/server";
import type { App } from "../commandDecorators";
import type { DevStdioMode } from "../incrementalBuilder";
import type { BackendImportGraph } from "./BackendImportGraph";
import type { DevBuildStatusBoard } from "./devBuildStatusBoard";
import {
  type BackendLifecycleState,
  type BackendRestartReason,
  backendRecoveryPolicy,
  type DevHostState,
  devHostStateOf,
  mergeBackendRestartReasons,
  normalizeBackendReportedGeneration,
  shouldQueueBuildStatusReplay,
} from "./devHostPolicy";

const backendMsgTypeSet = new Set<BuilderMessage["type"]>(["build-route", "build-csr", "build-graph"]);

const BACKEND_RESTART_DEBOUNCE_MS = 120;

// Above the gateway's ~5s child-shutdown wait: a gateway SIGKILLed mid-shutdown strands orphan replicas.
const BACKEND_GRACEFUL_TIMEOUT_MS = 8_000;

const BACKEND_STDERR_TAIL_LIMIT = 40;

type BackendProcess = Bun.Subprocess<"ignore", "inherit" | "pipe", "inherit" | "pipe">;

interface DevBackendLinks {
  isStopping: () => boolean;
  emit: (state: DevHostState, detail?: string) => void;
  beforeSpawn: () => void;
  toBuilder: (message: BuilderMessage) => void;
}

export class DevBackend {
  readonly #app: App;
  readonly #env: Record<string, string>;
  readonly #stdio: DevStdioMode;
  readonly #logger: Logger;
  readonly #statuses: DevBuildStatusBoard;
  readonly #graph: BackendImportGraph;
  readonly #links: DevBackendLinks;
  #process: BackendProcess | null = null;
  #ready = false;
  #plannedStops = new WeakSet<Bun.Subprocess<"ignore", "inherit", "inherit">>();
  #restartTimer: ReturnType<typeof setTimeout> | null = null;
  readonly #recovery = new RestartSchedule(backendRecoveryPolicy);
  #gaveUp = false;
  #lifecycleState: BackendLifecycleState = "stopped";
  #pendingRestartReason: BackendRestartReason | null = null;
  //? One replacement at a time: `stop()` clears `#process` only once the old process exits, so a second restart inside
  //? that wait signals the same pid and spawns a second backend, and the one the host stops tracking keeps the port.
  #restart: Promise<void> | null = null;
  #startStatus: { generation?: number; files: string[] } | null = null;
  #stderrTail: string[] = [];
  #queuedStatuses: DevBuildStatus[] = [];

  constructor(
    app: App,
    {
      env,
      stdio,
      logger,
      statuses,
      graph,
    }: {
      env: Record<string, string>;
      stdio: DevStdioMode;
      logger: Logger;
      statuses: DevBuildStatusBoard;
      graph: BackendImportGraph;
    },
    links: DevBackendLinks,
  ) {
    this.#app = app;
    this.#env = env;
    this.#stdio = stdio;
    this.#logger = logger;
    this.#statuses = statuses;
    this.#graph = graph;
    this.#links = links;
  }

  get running(): boolean {
    return !!this.#process;
  }

  get ready(): boolean {
    return this.#ready;
  }

  get gaveUp(): boolean {
    return this.#gaveUp;
  }

  get lifecycleState(): BackendLifecycleState {
    return this.#lifecycleState;
  }

  get restartScheduled(): boolean {
    return !!this.#restartTimer;
  }

  get recovering(): boolean {
    return this.#recovery.pending;
  }

  get restartPending(): boolean {
    return !!(this.#restartTimer || this.#restart || this.#recovery.pending);
  }

  get restarting(): Promise<void> | null {
    return this.#restart;
  }

  start(startStatus: { generation?: number; files: string[] } | null = null) {
    if (this.#links.isStopping()) return;
    if (this.#process) {
      this.#logger.warn(`backend pid=${this.#process.pid} is still running; not starting a second one`);
      return;
    }
    this.#links.beforeSpawn();
    this.#startStatus = startStatus;
    this.#gaveUp = false;
    this.#setLifecycleState("starting");
    this.#ready = false;
    this.#stderrTail = [];
    const backend = Bun.spawn(["bun", `apps/${this.#app.name}/main.ts`], {
      cwd: this.#app.workspace.workspaceRoot,
      stdio: this.#stdio === "pipe" ? ["ignore", "pipe", "pipe"] : ["inherit", "inherit", "inherit"],
      env: this.#env,
      ipc: (msg: BuilderMessage) => {
        if (!msg || typeof msg !== "object") return;
        if (msg.type === "backend-ready") {
          this.#ready = true;
          this.#recovery.reset();
          this.#setLifecycleState("ready", `pid=${msg.pid}`);
          this.#recordReadyStatus();
          this.#logger.verbose(`backend ready pid=${msg.pid}`);
          this.#forgetRouteBuildStatus();
          this.replay();
          return;
        }
        if (msg.type === "build-status") {
          // The gateway reports replica boot failures (crash loops, port conflicts) as build-status.
          const status = this.#statuses.recordBackend({
            generation: normalizeBackendReportedGeneration(msg.data.generation),
            ok: msg.data.ok,
            files: msg.data.files,
            message: msg.data.message,
          });
          this.sendOrQueueStatus(status);
          //? A replica crash loop leaves the gateway up, waiting for an edit: no exit reaches the host's own give-up.
          if (!status.ok) this.#links.emit("failed", status.message);
          return;
        }
        if (backendMsgTypeSet.has(msg.type)) this.#links.toBuilder(msg);
      },
      serialization: "advanced",
      onExit: () => {
        this.#ready = false;
        if (this.#process === backend) this.#process = null;
        if (this.#plannedStops.has(backend)) {
          this.#plannedStops.delete(backend);
          return;
        }
        this.#scheduleRecovery("backend-exit");
      },
    });
    this.#process = backend;
    this.#logger.verbose(`backend spawned pid=${backend.pid}`);
    if (this.#stdio === "pipe") {
      // Undrained pipes swallow runtime errors and leave the crash-loop stderr tail empty.
      void this.#forwardStream(backend.stderr as unknown as ReadableStream<Uint8Array> | undefined, "stderr");
      void this.#forwardStream(backend.stdout as unknown as ReadableStream<Uint8Array> | undefined, "stdout");
    }
  }

  send(message: BuilderMessage) {
    if (!this.#process || !this.#ready) {
      if (message.type === "css-updated" || message.type === "pages-updated" || message.type === "build-status") {
        this.#logger.verbose(`backend is not ready; will replay ${message.type}`);
        return;
      }
      if (message.type !== "builder-ready") this.#logger.warn(`backend is not ready; dropping ${message.type}`);
      return;
    }
    try {
      this.#process.send(message);
    } catch (err) {
      this.#logger.warn(
        `failed to send ${message.type} to backend: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  sendOrQueueStatus(status: DevBuildStatus): void {
    if (!this.#process || shouldQueueBuildStatusReplay(this.#ready, this.#queuedStatuses.length)) {
      this.#queuedStatuses.push(status);
      this.#logger.verbose(
        `backend is not ready; will replay build-status generation=${status.generation} phase=${status.phase}`,
      );
      return;
    }
    this.send({ type: "build-status", data: status });
  }

  replay(): void {
    if (!this.#ready) return;
    const { css, pages } = this.#statuses.lastGood;
    if (css) this.send(css);
    if (pages) this.send(pages);
    const queuedStatuses = this.#queuedStatuses.splice(0);
    for (const status of this.#statuses.replaySequence(queuedStatuses)) {
      this.send({ type: "build-status", data: status });
    }
  }

  dropQueuedStatuses(): void {
    this.#queuedStatuses = [];
  }

  async stop() {
    if (!this.#process) return;
    const backend = this.#process;
    this.#plannedStops.add(backend);
    this.#ready = false;
    this.#setLifecycleState("stopping", `pid=${backend.pid}`);
    this.#logger.verbose(`stopping backend pid=${backend.pid}`);
    try {
      backend.kill("SIGTERM");
      const timeout = new Promise<"timeout">((resolve) =>
        setTimeout(() => resolve("timeout"), BACKEND_GRACEFUL_TIMEOUT_MS),
      );
      const result = await Promise.race([backend.exited, timeout]);
      if (result === "timeout") {
        this.#logger.warn(`backend pid=${backend.pid} did not exit in ${BACKEND_GRACEFUL_TIMEOUT_MS}ms; force killing`);
        backend.kill("SIGKILL");
        await backend.exited.catch(() => undefined);
      }
    } finally {
      if (this.#process === backend) this.#process = null;
      this.#setLifecycleState("stopped", `pid=${backend.pid}`);
    }
  }

  cancelTimers(): void {
    if (this.#restartTimer) clearTimeout(this.#restartTimer);
    this.#restartTimer = null;
    this.#recovery.cancel();
  }

  dropPendingRestart(): void {
    this.#pendingRestartReason = null;
  }

  scheduleRestart(reason: BackendRestartReason) {
    this.#pendingRestartReason = mergeBackendRestartReasons(this.#pendingRestartReason, reason);
    const pending = this.#pendingRestartReason;
    this.#setLifecycleState(
      "restart-pending",
      `generation=${pending.generation ?? "(unknown)"} files=${pending.files.length} roles=${pending.roles.join(",") || "(none)"}`,
    );
    this.#recovery.cancel();
    if (this.#restartTimer) clearTimeout(this.#restartTimer);
    this.#restartTimer = setTimeout(() => {
      this.#restartTimer = null;
      this.#restart ??= this.#drainRestarts().finally(() => {
        this.#restart = null;
      });
    }, BACKEND_RESTART_DEBOUNCE_MS);
  }

  reviveAfterGreenBuild(status: DevBuildStatus): void {
    if (!status.ok || !this.#gaveUp || this.#process || this.#recovery.pending) return;
    this.#logger.info(`[backend-recovery] build went green (generation=${status.generation}); retrying backend`);
    this.#recovery.reset();
    this.start({ generation: status.generation, files: status.files });
  }

  #recordStderr(chunk: string) {
    const lines = chunk.split(/\r?\n/).filter((line) => line.length > 0);
    if (lines.length === 0) return;
    this.#stderrTail.push(...lines);
    if (this.#stderrTail.length > BACKEND_STDERR_TAIL_LIMIT) {
      this.#stderrTail.splice(0, this.#stderrTail.length - BACKEND_STDERR_TAIL_LIMIT);
    }
  }

  // Verbatim, not re-logged: a level floor would swallow runtime output and re-rendering doubles the timestamp.
  async #forwardStream(stream: ReadableStream<Uint8Array> | undefined | null, kind: "stdout" | "stderr") {
    if (!stream) return;
    const decoder = new TextDecoder();
    try {
      for await (const chunk of stream) {
        const text = decoder.decode(chunk, { stream: true });
        if (!text) continue;
        if (kind === "stderr") {
          this.#recordStderr(text);
          process.stderr.write(text);
        } else process.stdout.write(text);
      }
    } catch {
      // The stream closes when the backend exits; nothing further to surface here.
    }
  }

  #recordReadyStatus(): void {
    const previous = this.#statuses.phase("backend");
    const startStatus = this.#startStatus;
    if (startStatus || previous?.ok === false) {
      const status = this.#statuses.recordBackend({
        generation: startStatus?.generation ?? previous?.generation,
        ok: true,
        files: startStatus?.files ?? previous?.files ?? [],
        message: "Backend ready",
      });
      this.sendOrQueueStatus(status);
    }
    this.#startStatus = null;
  }

  //? A route status belongs to the route cache of the backend that asked for the build: a new backend builds its routes
  //? again, and reports each one itself.
  #forgetRouteBuildStatus(): void {
    this.#statuses.forgetRoute();
    this.#queuedStatuses = this.#queuedStatuses.filter((status) => status.phase !== "route");
  }

  #setLifecycleState(next: BackendLifecycleState, detail?: string): void {
    if (this.#lifecycleState === next && !detail) return;
    const prev = this.#lifecycleState;
    this.#lifecycleState = next;
    this.#logger.verbose(`[backend-lifecycle] ${prev} -> ${next}${detail ? ` ${detail}` : ""}`);
    this.#links.emit(devHostStateOf(next, this.#gaveUp), detail);
  }

  //? A reason that arrived during a restart runs after it; one whose debounce is still pending waits for its timer.
  async #drainRestarts() {
    while (this.#pendingRestartReason && !this.#restartTimer && !this.#links.isStopping()) {
      const next = this.#pendingRestartReason;
      this.#pendingRestartReason = null;
      await this.#restartWith(next);
    }
  }

  async #restartWith(reason: BackendRestartReason) {
    this.#logger.verbose(
      `[backend-reload] restarting backend generation=${reason.generation ?? "(unknown)"} files=${reason.files.length} roles=${reason.roles.join(",") || "(none)"}`,
    );
    this.#recovery.reset();
    await Promise.all([this.stop(), this.#graph.refresh()]);
    this.start({ generation: reason.generation, files: reason.files });
  }

  #scheduleRecovery(reason: string) {
    if (this.#recovery.pending || this.#process) return;
    if (this.#recovery.exhausted) {
      const message = `Backend exited ${this.#recovery.attempts} times in a row (${reason}); waiting for an edit or a green build to retry.`;
      this.#gaveUp = true;
      this.#setLifecycleState("stopped", `gave up after ${this.#recovery.attempts} recovery attempts`);
      this.#logger.error(`[backend-recovery] ${message}`);
      if (this.#stderrTail.length > 0) {
        this.#logger.error(`[backend-recovery] recent backend stderr:\n${this.#stderrTail.join("\n")}`);
      }
      const abandonedStatus = this.#statuses.recordBackend({ ok: false, files: [], message });
      this.sendOrQueueStatus(abandonedStatus);
      return;
    }
    this.#setLifecycleState("recovering", reason);
    const delay = this.#recovery.next();
    const failureStatus = this.#statuses.recordBackend({
      ok: false,
      files: [],
      message: `Backend exited unexpectedly (${reason}); restarting in ${delay}ms`,
    });
    this.sendOrQueueStatus(failureStatus);
    this.#logger.warn(
      `[backend-recovery] backend exited unexpectedly (${reason}); restarting in ${delay}ms (attempt ${this.#recovery.attempts})`,
    );
    if (this.#stderrTail.length > 0) {
      this.#logger.warn(`[backend-recovery] recent backend stderr:\n${this.#stderrTail.join("\n")}`);
    }
    this.#recovery.arm(delay, () => {
      if (this.#process) return;
      void this.#graph.refresh().finally(() => {
        if (!this.#process) this.start({ generation: failureStatus.generation, files: failureStatus.files });
      });
    });
  }
}
