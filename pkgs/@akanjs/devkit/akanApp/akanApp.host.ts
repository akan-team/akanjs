import path from "node:path";
import { Logger } from "akanjs/common";
import type { BuilderMessage, BuildPhase, DevBuildStatus, DevChangePlan, DevChangeRole } from "akanjs/server";
import type { App } from "../commandDecorators";
import { createTunnel } from "../createTunnel";
import { WorkspaceExecutor } from "../executors";
import { IncrementalBuilderHost } from "../incrementalBuilder";

const backendMsgTypeSet = new Set<BuilderMessage["type"]>(["build-route"]);
const BACKEND_RESTART_DEBOUNCE_MS = 120;
// Must exceed the gateway's child-wait budget (AkanApp child shutdown, ~5s in dev) so the gateway
// is never SIGKILLed while its replicas are still shutting down — that's what strands orphans.
const BACKEND_GRACEFUL_TIMEOUT_MS = 8_000;
const BACKEND_RECOVERY_BASE_DELAY_MS = 1_000;
const BACKEND_RECOVERY_MAX_DELAY_MS = 30_000;
const BACKEND_RECOVERY_MAX_ATTEMPTS = 5;
const BACKEND_STDERR_TAIL_LIMIT = 40;
const BUILDER_READY_TIMEOUT_MS = 150000;
const BUILDER_START_MAX_ATTEMPTS = 3;
// The builder is the file watcher: while it is down no edit can trigger a retry, so unlike the
// backend the recovery loop never gives up — it only backs off.
const BUILDER_RECOVERY_BASE_DELAY_MS = 2_000;
const BUILDER_RECOVERY_MAX_DELAY_MS = 60_000;
const SOURCE_EXTS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);
const NON_SOURCE_EXT_RE =
  /\.(css|scss|sass|less|json|svg|png|jpe?g|webp|gif|avif|ico|woff2?|ttf|otf|mp3|mp4|wav|html)$/i;
const SERVER_SUFFIXES = [".service.ts", ".document.ts"];
const SHARED_SUFFIXES = [".constant.ts", ".dictionary.ts", ".signal.ts"];
const RUNTIME_METADATA_BASENAMES = new Set(["dict.ts", "sig.ts", "useClient.ts", "useServer.ts"]);
const GRAPH_IMPORT_KINDS = new Set<Bun.ImportKind>([
  "import-statement",
  "require-call",
  "require-resolve",
  "dynamic-import",
]);

export const shouldRestartBackendByDevPlan = (
  message: Extract<BuilderMessage, { type: "invalidate" }>,
): boolean | null => {
  if (!message.devPlan) return null;
  if (message.devPlan.actions.includes("report-error")) return false;
  if (message.devPlan.actions.includes("restart-builder")) return false;
  return message.devPlan.actions.includes("restart-backend");
};

export const shouldRestartBuilderByDevPlan = (message: Extract<BuilderMessage, { type: "invalidate" }>): boolean =>
  message.devPlan?.actions.includes("restart-builder") ?? false;

/**
 * A backend that keeps dying isn't going to heal by retrying the same code; after this many
 * consecutive attempts the host idles and the next server-side edit triggers a fresh restart.
 */
export const shouldAbandonBackendRecovery = (attempts: number, maxAttempts = BACKEND_RECOVERY_MAX_ATTEMPTS): boolean =>
  attempts >= maxAttempts;

/** The gateway reports backend failures with `generation: -1`; the host assigns its own counter then. */
export const normalizeBackendReportedGeneration = (generation: number): number | undefined =>
  generation >= 0 ? generation : undefined;

export const shouldRestartDevHostByDevPlan = (message: Extract<BuilderMessage, { type: "invalidate" }>): boolean =>
  message.devPlan?.actions.includes("restart-dev-host") ?? message.kinds.includes("config");

export type BackendLifecycleState = "starting" | "ready" | "restart-pending" | "stopping" | "recovering" | "stopped";

export interface BackendRestartReason {
  generation?: number;
  files: string[];
  roles: Extract<DevChangeRole, "server" | "shared" | "barrel" | "config">[];
}

interface LastGoodFrontendState {
  pages?: Extract<BuilderMessage, { type: "pages-updated" }>;
  css?: Extract<BuilderMessage, { type: "css-updated" }>;
}

const RESTART_ROLE_ORDER: BackendRestartReason["roles"] = ["server", "shared", "barrel", "config"];

const generationValue = (generation: number | undefined): number => generation ?? -1;

export const isLegacyBackendFallbackFile = (file: string, workspaceRoot: string): boolean => {
  const abs = path.resolve(file);
  const ext = path.extname(abs).toLowerCase();
  if (!SOURCE_EXTS.has(ext)) return false;
  const rel = path.relative(path.resolve(workspaceRoot), abs);
  if (!rel || rel.startsWith("..") || path.isAbsolute(rel)) return false;
  const parts = rel.split(path.sep).filter(Boolean);
  const [scope] = parts;
  if (scope !== "apps" && scope !== "libs" && scope !== "pkgs") return false;

  const base = path.basename(abs);
  return (
    parts.includes("srvkit") ||
    parts.includes("common") ||
    SERVER_SUFFIXES.some((suffix) => base.endsWith(suffix)) ||
    SHARED_SUFFIXES.some((suffix) => base.endsWith(suffix)) ||
    RUNTIME_METADATA_BASENAMES.has(base) ||
    base === "main.ts" ||
    base === "server.ts"
  );
};

export const shouldMarkBuildPhaseRecovered = (
  previousByPhase: ReadonlyMap<BuildPhase, DevBuildStatus>,
  status: DevBuildStatus,
): boolean => {
  const previous = previousByPhase.get(status.phase);
  return Boolean(previous && status.ok && !previous.ok && generationValue(status.generation) >= previous.generation);
};

export const createBackendBuildStatus = ({
  generation,
  ok,
  files = [],
  message,
}: {
  generation: number;
  ok: boolean;
  files?: string[];
  message?: string;
}): DevBuildStatus => ({
  generation,
  phase: "backend",
  ok,
  files,
  message,
});

export const backendRestartReasonFromMessage = (
  message: Extract<BuilderMessage, { type: "invalidate" }>,
): BackendRestartReason => {
  const roleSet = new Set<BackendRestartReason["roles"][number]>();
  for (const role of message.devPlan?.roles ?? []) {
    if (role === "server" || role === "shared" || role === "barrel" || role === "config") roleSet.add(role);
  }
  return {
    generation: message.devPlan?.generation ?? message.generation,
    files: [...new Set(message.files)].sort(),
    roles: RESTART_ROLE_ORDER.filter((role) => roleSet.has(role)),
  };
};

export const mergeBackendRestartReasons = (
  current: BackendRestartReason | null,
  next: BackendRestartReason,
): BackendRestartReason => ({
  generation:
    generationValue(next.generation) >= generationValue(current?.generation) ? next.generation : current?.generation,
  files: [...new Set([...(current?.files ?? []), ...next.files])].sort(),
  roles: RESTART_ROLE_ORDER.filter((role) => current?.roles.includes(role) || next.roles.includes(role)),
});

export const shouldReplaceLastGoodMessage = (
  current:
    | Extract<BuilderMessage, { type: "pages-updated" }>
    | Extract<BuilderMessage, { type: "css-updated" }>
    | undefined,
  next: Extract<BuilderMessage, { type: "pages-updated" }> | Extract<BuilderMessage, { type: "css-updated" }>,
): boolean => !current || generationValue(next.data.generation) >= generationValue(current.data.generation);

export const shouldQueueBuildStatusReplay = (backendReady: boolean, pendingReplayCount: number): boolean =>
  !backendReady || pendingReplayCount > 0;

/**
 * Recycling the builder/backend on a generation whose build already failed is guaranteed to strand
 * the dev server: the rebooted builder hits the same compile error and exits before builder-ready.
 * Failing phase statuses for a generation arrive over IPC before that generation's invalidate, so
 * the host can check them here and defer the recycle until a healthy batch lands.
 */
export const hasBuildFailureForGeneration = (
  statusByPhase: ReadonlyMap<BuildPhase, DevBuildStatus>,
  generation: number | undefined,
): boolean => {
  if (typeof generation !== "number") return false;
  for (const status of statusByPhase.values()) {
    if (!status.ok && status.generation === generation) return true;
  }
  return false;
};

const mergeDevPlans = (current?: DevChangePlan, next?: DevChangePlan): DevChangePlan | undefined => {
  if (!current) return next;
  if (!next) return current;
  const reasonByFile: Record<string, string[]> = { ...current.reasonByFile };
  for (const [file, reasons] of Object.entries(next.reasonByFile)) {
    reasonByFile[file] = [...new Set([...(reasonByFile[file] ?? []), ...reasons])].sort();
  }
  return {
    generation: Math.max(current.generation, next.generation),
    files: [...new Set([...current.files, ...next.files])].sort(),
    generatedFiles: [...new Set([...current.generatedFiles, ...next.generatedFiles])].sort(),
    roles: [...new Set([...current.roles, ...next.roles])].sort(),
    actions: [...new Set([...current.actions, ...next.actions])].sort(),
    reasonByFile,
  };
};

/** A deferred recycle accumulates every batch it skipped so the eventual restart covers them all. */
export const mergeInvalidateMessages = (
  current: Extract<BuilderMessage, { type: "invalidate" }>,
  next: Extract<BuilderMessage, { type: "invalidate" }>,
): Extract<BuilderMessage, { type: "invalidate" }> => {
  const generation = Math.max(generationValue(current.generation), generationValue(next.generation));
  return {
    type: "invalidate",
    kinds: [...new Set([...current.kinds, ...next.kinds])].sort(),
    files: [...new Set([...current.files, ...next.files])].sort(),
    generation: generation >= 0 ? generation : undefined,
    devPlan: mergeDevPlans(current.devPlan, next.devPlan),
  };
};

export const buildStatusReplaySequence = (
  pendingReplay: readonly DevBuildStatus[],
  latestByPhase: ReadonlyMap<BuildPhase, DevBuildStatus>,
): DevBuildStatus[] => [...pendingReplay, ...latestByPhase.values()];

class BackendImportGraph {
  readonly #app: App;
  readonly #logger: Logger;
  readonly #tsTranspiler = new Bun.Transpiler({ loader: "ts" });
  readonly #tsxTranspiler = new Bun.Transpiler({ loader: "tsx" });
  readonly #jsTranspiler = new Bun.Transpiler({ loader: "js" });
  readonly #jsxTranspiler = new Bun.Transpiler({ loader: "jsx" });
  #files = new Set<string>();
  #ready = false;
  #lastRefreshSucceeded = false;

  constructor(app: App, logger: Logger) {
    this.#app = app;
    this.#logger = logger;
  }

  get ready() {
    return this.#ready;
  }

  get lastRefreshSucceeded() {
    return this.#lastRefreshSucceeded;
  }

  has(file: string) {
    return this.#files.has(path.resolve(file));
  }

  async refresh(): Promise<boolean> {
    try {
      const files = await this.#build();
      this.#files = files;
      this.#ready = true;
      this.#lastRefreshSucceeded = true;
      this.#logger.verbose(`[backend-graph] scanned ${files.size} files`);
      return true;
    } catch (err) {
      this.#ready = this.#files.size > 0;
      this.#lastRefreshSucceeded = false;
      this.#logger.warn(
        `[backend-graph] scan failed; ${this.#ready ? "using previous graph" : "using fallback rules"}: ${err instanceof Error ? err.message : String(err)}`,
      );
      return this.#ready;
    }
  }

  async #build(): Promise<Set<string>> {
    const roots = await this.#entrypoints();
    const files = new Set<string>();
    const queue = [...roots];
    const workspaceRoot = path.resolve(this.#app.workspace.workspaceRoot);

    while (queue.length > 0) {
      const current = path.resolve(queue.pop() as string);
      if (files.has(current)) continue;
      if (!this.#isWorkspaceSource(current, workspaceRoot)) continue;
      if (!(await Bun.file(current).exists())) continue;

      files.add(current);
      const source = await Bun.file(current).text();
      const imports = this.#scanImports(current, source);
      const importerDir = path.dirname(current);
      for (const imp of imports) {
        if (!GRAPH_IMPORT_KINDS.has(imp.kind) || !imp.path || NON_SOURCE_EXT_RE.test(imp.path)) continue;
        const resolved = this.#resolve(imp.path, importerDir);
        if (!resolved || files.has(resolved)) continue;
        queue.push(resolved);
      }
    }
    return files;
  }

  async #entrypoints(): Promise<string[]> {
    const roots = [`${this.#app.cwdPath}/main.ts`, `${this.#app.cwdPath}/server.ts`];
    const existing: string[] = [];
    for (const root of roots) {
      const abs = path.resolve(root);
      if (await Bun.file(abs).exists()) existing.push(abs);
    }
    return existing;
  }

  #resolve(specifier: string, importerDir: string): string | null {
    try {
      const resolved = Bun.resolveSync(specifier, importerDir);
      if (!path.isAbsolute(resolved)) return null;
      if (!SOURCE_EXTS.has(path.extname(resolved).toLowerCase())) return null;
      return path.resolve(resolved);
    } catch {
      return null;
    }
  }

  #isWorkspaceSource(file: string, workspaceRoot: string): boolean {
    const rel = path.relative(workspaceRoot, file);
    if (rel.startsWith("..") || path.isAbsolute(rel)) return false;
    if (rel.includes(`${path.sep}node_modules${path.sep}`) || rel.includes(`${path.sep}.akan${path.sep}`)) return false;
    return SOURCE_EXTS.has(path.extname(file).toLowerCase());
  }

  #scanImports(file: string, source: string): Bun.Import[] {
    const ext = path.extname(file).toLowerCase();
    if (ext === ".tsx") return this.#tsxTranspiler.scanImports(source);
    if (ext === ".jsx") return this.#jsxTranspiler.scanImports(source);
    if (ext === ".js" || ext === ".mjs" || ext === ".cjs") return this.#jsTranspiler.scanImports(source);
    return this.#tsTranspiler.scanImports(source);
  }
}

export class AkanAppHost {
  logger = new Logger("AkanAppHost");
  readonly withInk: boolean;
  readonly env: Record<string, string>;
  #backend: Bun.Subprocess<"ignore", "inherit", "inherit"> | null = null;
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
  #buildStatusByPhase = new Map<BuildPhase, DevBuildStatus>();
  #pendingBuildStatusReplay: DevBuildStatus[] = [];
  #builderMessageQueue: Promise<void> = Promise.resolve();
  #backendGraph: BackendImportGraph;
  constructor(
    private readonly app: App,
    { env, withInk = false }: { env: Record<string, string>; withInk?: boolean },
  ) {
    this.env = env;
    this.withInk = withInk;
    this.#backendGraph = new BackendImportGraph(app, this.logger);
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
    return this;
  }
  async stop() {
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
    this.#backendStartStatus = startStatus;
    this.#backendGaveUp = false;
    this.#setBackendLifecycleState("starting");
    this.#backendReady = false;
    this.#backendStderrTail = [];
    const backend = Bun.spawn(["bun", `apps/${this.app.name}/main.ts`], {
      cwd: this.app.workspace.workspaceRoot,
      stdio: this.withInk ? ["ignore", "pipe", "pipe"] : ["inherit", "inherit", "inherit"],
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
    if (this.withInk) {
      // Ink mode pipes backend stdio to keep the TUI clean; drain the pipes and surface
      // them through the logger so runtime errors are not silently swallowed.
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
  async #forwardBackendStream(stream: ReadableStream<Uint8Array> | undefined | null, kind: "stdout" | "stderr") {
    if (!stream) return;
    const decoder = new TextDecoder();
    try {
      for await (const chunk of stream) {
        const text = decoder.decode(chunk, { stream: true });
        if (!text.trim()) continue;
        if (kind === "stderr") {
          this.#recordBackendStderr(text);
          this.logger.warn(`[backend] ${text.trimEnd()}`);
        } else {
          this.logger.verbose(`[backend] ${text.trimEnd()}`);
        }
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
    if (message.type === "build-status") {
      this.#recordBuildStatus(message.data);
      this.#sendOrQueueBuildStatus(message.data);
      this.#reviveBackendAfterGreenBuild(message.data);
      return;
    }
    if (message.type === "pages-updated") this.#recordLastGood(message);
    if (message.type === "css-updated") this.#recordLastGood(message);
    if (message.type === "invalidate") {
      await this.#handleInvalidate(message);
      return;
    }
    this.#sendToBackend(message);
  }
  async #handleInvalidate(message: Extract<BuilderMessage, { type: "invalidate" }>) {
    this.#logDevPlan(message);
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
  #recordLastGood(
    message: Extract<BuilderMessage, { type: "pages-updated" }> | Extract<BuilderMessage, { type: "css-updated" }>,
  ): void {
    if (message.type === "pages-updated") {
      if (!shouldReplaceLastGoodMessage(this.#lastGoodFrontend.pages, message)) return;
      this.#lastGoodFrontend.pages = message;
      this.logger.verbose(
        `[last-good] pages generation=${message.data.generation ?? "(unknown)"} buildId=${message.data.buildId}`,
      );
      return;
    }
    if (!shouldReplaceLastGoodMessage(this.#lastGoodFrontend.css, message)) return;
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
  async #startBuilder(): Promise<IncrementalBuilderHost> {
    const startTime = Date.now();
    this.app.verbose(`[cli] waiting for builder to complete initial base build…`);
    let lastError: unknown;
    for (let attempt = 1; attempt <= BUILDER_START_MAX_ATTEMPTS; attempt++) {
      this.#builder = await IncrementalBuilderHost.create(this.app, this.env, (msg) => {
        this.#enqueueBuilderMessage(msg);
      });
      try {
        await this.#waitForBuilderReady(attempt);
        this.app.verbose(`[cli] base build ready in ${Date.now() - startTime}ms — starting backend`);
        return this.#builder;
      } catch (err) {
        lastError = err;
        this.#stopBuilder();
        if (attempt >= BUILDER_START_MAX_ATTEMPTS) break;
        this.app.verbose(`[cli] builder failed before ready; retrying (${attempt + 1}/${BUILDER_START_MAX_ATTEMPTS})`);
      }
    }
    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  }
  #waitForBuilderReady(attempt: number): Promise<void> {
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
        onExit: () => {
          settle(() => reject(new Error(`[cli] builder exited before emitting builder-ready (attempt ${attempt})`)));
        },
        onReady: () => {
          settle(resolve);
        },
        onRestartReady: () => {
          this.logger.verbose("[builder-recovery] builder ready after restart; replaying latest state");
          this.#replayBuilderState();
        },
      });
    });
  }
  #sendToBuilder(message: BuilderMessage): void {
    if (this.#builder?.send(message)) return;
    if (message.type === "build-route") {
      this.#sendToBackend({
        type: "build-route-res",
        id: message.id,
        ok: false,
        error: `builder is ${this.#builder?.status ?? "stopped"}; reload after the builder is ready`,
      });
      return;
    }
    this.logger.warn("akanAppHost builder is not running");
  }
  #stopBuilder(): void {
    if (!this.#builder) return;
    this.#builder.stop();
    this.#builder = null;
  }
}
