import path from "node:path";
import { Logger } from "akanjs/common";
import type { BuilderMessage, BuildPhase, DevBuildStatus, DevChangeRole } from "akanjs/server";
import type { App } from "../commandDecorators";
import { createTunnel } from "../createTunnel";
import { WorkspaceExecutor } from "../executors";
import { IncrementalBuilderHost } from "../incrementalBuilder";

const backendMsgTypeSet = new Set<BuilderMessage["type"]>(["build-route"]);
const BACKEND_RESTART_DEBOUNCE_MS = 120;
const BACKEND_GRACEFUL_TIMEOUT_MS = 3000;
const BACKEND_RECOVERY_BASE_DELAY_MS = 1_000;
const BACKEND_RECOVERY_MAX_DELAY_MS = 30_000;
const BUILDER_READY_TIMEOUT_MS = 150000;
const BUILDER_START_MAX_ATTEMPTS = 3;
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
  #backendLifecycleState: BackendLifecycleState = "stopped";
  #pendingRestartReason: BackendRestartReason | null = null;
  #backendStartStatus: { generation?: number; files: string[] } | null = null;
  #backendBuildStatusGeneration = 0;
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
    this.#setBackendLifecycleState("starting");
    this.#backendReady = false;
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
    if (shouldRestartBuilderByDevPlan(message)) {
      try {
        await this.#restartDevChildren(message);
      } catch (err) {
        this.#recordDevHostRestartFailure(message, err);
      }
      return;
    }
    if (shouldRestartDevHostByDevPlan(message)) {
      this.#recordDevHostRestartRequired(message);
      return;
    }
    if (await this.#shouldRestartBackend(message)) {
      this.#scheduleBackendRestart(backendRestartReasonFromMessage(message));
      return;
    }
    this.#sendToBackend(message);
  }
  async #restartDevChildren(message: Extract<BuilderMessage, { type: "invalidate" }>): Promise<void> {
    const generation = message.devPlan?.generation ?? message.generation;
    this.logger.warn(
      `[dev-host] recycling builder/backend for runtime metadata generation=${generation ?? "(unknown)"} files=${message.files.length}`,
    );
    if (this.#restartTimer) {
      clearTimeout(this.#restartTimer);
      this.#restartTimer = null;
    }
    if (this.#backendRecoveryTimer) {
      clearTimeout(this.#backendRecoveryTimer);
      this.#backendRecoveryTimer = null;
    }
    this.#pendingRestartReason = null;
    this.#lastGoodFrontend = {};
    this.#buildStatusByPhase.clear();
    this.#pendingBuildStatusReplay = [];
    await this.#stopBackend();
    this.#stopBuilder();
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
  #recordDevHostRestartRequired(message: Extract<BuilderMessage, { type: "invalidate" }>): void {
    const generation = message.devPlan?.generation ?? message.generation;
    const detail = `generation=${generation ?? "(unknown)"} files=${message.files.length}`;
    this.logger.warn(
      `[dev-host] config change requires a manual restart until controlled dev-host restart is implemented (${detail})`,
    );
    if (typeof generation === "number") {
      const status: DevBuildStatus = {
        generation,
        phase: "scan",
        ok: false,
        files: message.files,
        message: "Config change requires restarting `akan start` to apply.",
      };
      this.#recordBuildStatus(status);
      this.#sendOrQueueBuildStatus(status);
    }
  }
  #recordDevHostRestartFailure(message: Extract<BuilderMessage, { type: "invalidate" }>, err: unknown): void {
    const generation = message.devPlan?.generation ?? message.generation ?? this.#nextBackendBuildStatusGeneration();
    const detail = err instanceof Error ? err.message : String(err);
    this.logger.warn(`[dev-host] runtime metadata restart failed generation=${generation}: ${detail}`);
    const status: DevBuildStatus = {
      generation,
      phase: "scan",
      ok: false,
      files: message.files,
      message: `Runtime metadata change requires restarting \`akan start\` to apply: ${detail}`,
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
  async #shouldRestartBackend(message: Extract<BuilderMessage, { type: "invalidate" }>): Promise<boolean> {
    if (message.kinds.length === 1 && message.kinds[0] === "css") return false;
    if (message.devPlan) {
      const { generation, roles, actions, reasonByFile } = message.devPlan;
      this.logger.verbose(
        `[dev-plan] generation=${generation} roles=${roles.join(",") || "(none)"} actions=${actions.join(",") || "(none)"} reasons=${Object.keys(reasonByFile).length}`,
      );
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
