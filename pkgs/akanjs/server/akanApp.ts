// styleguard-disable inline-color — the standalone status page renders before any theme CSS exists.
import { mkdir, readdir, rm } from "node:fs/promises";
import path from "node:path";
import { Logger } from "akanjs/common";
import type { AkanChildRole, AkanChildStatus, AkanIpcMessage, AkanMetricsReport, AkanUpstream } from "akanjs/service";
import { getApiPrefix, getWsPrefix, normalizeRoutePrefix, resetEnvCache } from "../base/baseEnv";
import { CrossSiteGuard } from "../signal/CrossSiteGuard";
import { isTraceEnabled } from "../signal/trace";
import { AKAN_CHILD_HOST, makeAkanChildProxyHeaders } from "./akanAppHeaders";
import type { BuilderCsrReq, BuilderCsrRes, BuilderMessage, BuilderReq, BuilderRes } from "./artifact";
import { compressResponse, encodedFileResponse } from "./contentEncoding";
import { isPortInUseError } from "./lifecycle/portInUse";
import { resolveRuntimeDir } from "./lifecycle/runtimeDir";
import { ChildOutputReader } from "./logging/childOutputReader";
import { HubFileSink } from "./logging/hubFileSink";
import { LogControlSocket } from "./logging/logControlSocket";
import { LogHub } from "./logging/logHub";
import { LogStreamRoute } from "./logging/logStreamRoute";
import { RotatingLogWriter } from "./logging/rotatingLogWriter";
import { AppInfo } from "./ops/appInfo";
import type { OpsRoute } from "./ops/opsRoute";
import { ProcessMetricsCollector } from "./processMetricsCollector";
import { HostAllowlist } from "./routing/hostAllowlist";
import { SelfExec } from "./selfExec";
import { resolveStaticPath } from "./staticPath";
import { getWebConfigFromEnv } from "./types";

interface ChildState {
  idx: number;
  role: AkanChildRole;
  proc: Bun.Subprocess<"ignore", "pipe", "pipe">;
  ready: boolean;
  status: AkanChildStatus;
  pid?: number;
  upstream?: AkanUpstream;
  wsUpstream?: Extract<AkanUpstream, { type: "tcp" }>;
  healthPath?: string;
  metrics: AkanMetricsReport;
  /** Monotonic (`performance.now()`) so sleep/wake wall-clock jumps cannot fake a health timeout. */
  lastPongAtMono?: number;
  restartAttempts: number;
  restartCount: number;
  restartTimer: Timer | null;
  restartPending: boolean;
  lastExitCode?: number | null;
  lastRestartAt?: number;
  lastRestartReason?: string;
  lastErrorMessage?: string;
}

interface SoloServer {
  start: (options: { listen: boolean }) => Promise<unknown>;
}

interface GatewayWsData {
  childIdx: number;
  upstream: WebSocket;
}

type GatewayUpstream = {
  http: Extract<AkanUpstream, { type: "unix" }>;
  ws?: Extract<AkanUpstream, { type: "tcp" }>;
};

// Bun's `WebSocket.close()` throws on receive-only codes (1004-1006), so every unsendable code is relayed as 1001.
const relayableCloseCode = (code: number): number => {
  if (code >= 3000 && code <= 4999) return code;
  if (code >= 1000 && code <= 1014 && code !== 1004 && code !== 1005 && code !== 1006) return code;
  return 1001;
};

export interface AkanAppOptions {
  replica?: number | string;
  serverPath?: string;
  runtimeDir?: string;
  port?: number;
  wsBasePort?: number;
  openapi?: boolean;
  /** Signal endpoint mount, `/api` by default; handed down as `AKAN_API_PREFIX` (CSR/mobile follow akan.config.ts). */
  prefix?: string;
  /** Where the websocket upgrade sits under `prefix`, `/ws` by default. Handed down as `AKAN_WS_PREFIX`. */
  websocketPrefix?: string;
  /** Boot only these modules and what they reach; omitted or empty mounts every enabled one. `AKAN_MODULES`. */
  modules?: string[];
  /** Mount all but these and whatever reaches them, applied after `modules`. `AKAN_DISABLE_MODULES`. */
  disableModules?: string[];
  /** Like `disableModules`, by owning lib. `AKAN_DISABLE_LIBS`. */
  disableLibs?: string[];
  /** In-process replica; default on for one env-set traffic replica, off if `replica` is passed or AKAN_SOLO=false. */
  solo?: boolean;
}

interface AkanReplicaConfig {
  federation: number;
  batch: number;
  all: number;
  total: number;
  value: string;
}

export class AkanApp {
  static readonly #childRestartBaseDelayMs = 1_000;
  static readonly #childRestartMaxDelayMs = 30_000;
  static readonly #childRestartGraceMs = 5_000;
  static readonly #devMaxChildBootFailures = 3;

  readonly logger = new Logger("AkanApp");
  readonly #devHosted = process.env.AKAN_COMMAND_TYPE === "start";
  readonly #healthTimeoutMs = AkanApp.#parseHealthTimeoutMs();
  readonly #upstreamWaitMs = AkanApp.#parseUpstreamWaitMs();
  /** Child stderr is bundler/runtime noise the gateway cannot act on; it still reaches the rotating log file. */
  readonly #printChildStderr = process.env.AKAN_CHILD_STDERR === "1";
  readonly #serverPath: string;
  readonly #artifactDir: string;
  readonly #replica: AkanReplicaConfig;
  readonly #runtimeDir: string;
  readonly #socketRunId = `${process.pid}-${Date.now().toString(36)}`;
  readonly #port: number;
  readonly #wsBasePort: number;
  readonly #openapi?: boolean;
  readonly #prefix: string;
  readonly #websocketPrefix: string;
  readonly #web = getWebConfigFromEnv();
  readonly #modules: string[];
  readonly #disableModules: string[];
  readonly #disableLibs: string[];
  readonly #solo: boolean;
  readonly #children = new Map<number, ChildState>();
  readonly #roomChildren = new Map<string, Set<number>>();
  readonly #childRooms = new Map<number, Map<string, Set<string>>>();
  readonly #socketRooms = new Map<string, { childIdx: number; rooms: Set<string> }>();
  #nextBuilderReqId = 1;
  readonly #builderReqMap = new Map<number, { childIdx: number; childLocalId: number }>();
  #server: Bun.Server<GatewayWsData> | null = null;
  #rrIdx = 0;
  #federationChildCache: ChildState[] | null = null;
  #snapshotTimer: Timer | null = null;
  #healthTimer: Timer | null = null;
  #metricsTimer: Timer | null = null;
  #logWriter: RotatingLogWriter | null = null;
  #detachFileLog: (() => void) | null = null;
  #logHub: LogHub | null = null;
  #logControl: LogControlSocket | null = null;
  #logStream: LogStreamRoute | null = null;
  #ops: OpsRoute | null = null;
  #hostAllowlist = HostAllowlist.fromEnv();
  static readonly #ansiPattern = new RegExp(`${String.fromCharCode(27)}\\[[0-?]*[ -/]*[@-~]`, "g");
  #gatewayMetrics: AkanMetricsReport = {};
  #proxyHopCount = 0;
  #proxyHopSumMs = 0;
  #proxyHopMaxMs = 0;
  #resolveStopped: (() => void) | null = null;
  #exitAfterStop = false;
  #stopping = false;

  constructor(serverPathOrOptions: string | AkanAppOptions = "./server", options: AkanAppOptions = {}) {
    SelfExec.adopt();
    const resolvedOptions = typeof serverPathOrOptions === "string" ? options : serverPathOrOptions;
    const serverPath = typeof serverPathOrOptions === "string" ? serverPathOrOptions : "./server";
    this.#serverPath = AkanApp.#resolveServerPath(resolvedOptions.serverPath ?? serverPath);
    this.#artifactDir = path.resolve(path.dirname(this.#serverPath), ".akan", "artifact");
    this.#replica = AkanApp.#parseReplicaConfig(resolvedOptions.replica);
    this.#runtimeDir = resolveRuntimeDir(resolvedOptions.runtimeDir);
    this.#port = Number(resolvedOptions.port ?? process.env.PORT ?? 8282);
    this.#wsBasePort = Number(resolvedOptions.wsBasePort ?? process.env.AKAN_WS_BASE_PORT ?? this.#port + 10_000);
    this.#openapi = resolvedOptions.openapi;
    this.#prefix = normalizeRoutePrefix(resolvedOptions.prefix) ?? getApiPrefix();
    this.#websocketPrefix = normalizeRoutePrefix(resolvedOptions.websocketPrefix) ?? getWsPrefix();
    this.#modules = resolvedOptions.modules ?? [];
    this.#disableModules = resolvedOptions.disableModules ?? [];
    this.#disableLibs = resolvedOptions.disableLibs ?? [];
    this.#solo = AkanApp.#resolveSolo(resolvedOptions, this.#replica);
    this.#logHub = LogHub.attach();
  }

  // Batch-only never listens (the gateway answers health); `akan start` needs the gateway as builder relay and port holder.
  static #resolveSolo(options: AkanAppOptions, replica: AkanReplicaConfig) {
    if (options.solo !== undefined) return options.solo;
    if (process.env.AKAN_SOLO === "false" || process.env.AKAN_SOLO === "0") return false;
    if (process.env.AKAN_COMMAND_TYPE === "start") return false;
    if (options.replica !== undefined) return false;
    return replica.total === 1 && replica.batch === 0;
  }

  static #resolveServerPath(serverPath: string) {
    const baseDir = path.dirname(Bun.main);
    const resolved = path.isAbsolute(serverPath) ? serverPath : path.resolve(baseDir, serverPath);
    if (path.extname(resolved)) return resolved;
    return Bun.main.endsWith(".js") ? `${resolved}.js` : `${resolved}.ts`;
  }

  static #parseReplicaConfig(value?: number | string): AkanReplicaConfig {
    const configured = value ?? process.env.AKAN_REPLICA;
    const raw = String(configured ?? "0,0,1").trim();
    const [federationRaw, batchRaw, allRaw] = raw.split(",");
    const federation = AkanApp.#parseReplicaCount(federationRaw, 0);
    const batch = AkanApp.#parseReplicaCount(batchRaw, 0);
    const all = AkanApp.#parseReplicaCount(allRaw, configured == null ? 1 : 0);
    const normalizedAll = federation + batch + all > 0 ? all : 1;
    return {
      federation,
      batch,
      all: normalizedAll,
      total: federation + batch + normalizedAll,
      value: `${federation},${batch},${normalizedAll}`,
    };
  }

  static #parseReplicaCount(value: string | undefined, fallback: number) {
    const parsed = Number.parseInt(value ?? "", 10);
    return Number.isFinite(parsed) ? Math.max(0, parsed) : fallback;
  }

  // The command outranks NODE_ENV: a dev child told `production` expects the manifest only `akan build` writes.
  static #defaultChildNodeEnv() {
    if (process.env.AKAN_COMMAND_TYPE === "start") return "development";
    if (process.env.AKAN_COMMAND_TYPE === "build") return "production";
    if (process.env.NODE_ENV) return process.env.NODE_ENV;
    return Bun.main.endsWith(".js") ? "production" : "development";
  }

  // Dev builds and first-touch transpiles stall a child's event loop well past the production pong budget.
  static #parseHealthTimeoutMs() {
    const configured = Number(process.env.AKAN_HEALTH_TIMEOUT_MS);
    if (Number.isFinite(configured) && configured > 0) return configured;
    return process.env.AKAN_COMMAND_TYPE === "start" ? 15_000 : 5_000;
  }

  static #parseUpstreamWaitMs() {
    const configured = Number(process.env.AKAN_UPSTREAM_WAIT_MS);
    if (Number.isFinite(configured) && configured >= 0) return configured;
    return process.env.AKAN_COMMAND_TYPE === "start" ? 15_000 : 5_000;
  }

  // Must exceed `AkanServer.#defaultShutdownTimeoutMs` so children exit on their own before the gateway stops waiting.
  static #childShutdownWaitMs() {
    const configured = Number(process.env.AKAN_CHILD_SHUTDOWN_WAIT_MS);
    if (Number.isFinite(configured) && configured > 0) return configured;
    return process.env.AKAN_COMMAND_TYPE === "start" ? 5_000 : 30_000;
  }

  async start() {
    if (process.argv[2] === "ops") {
      const { OpsCommand } = await import("./ops/opsCommand");
      process.exit(await OpsCommand.run(process.argv.slice(3)));
    }
    if (this.#solo) return await this.#startSolo();
    if (SelfExec.carried)
      throw new Error(
        "A desktop app's server runs in one process, and this one was asked for a gateway and replicas, which would start with the `bun` on the user's PATH: by `replica` or `solo: false` in main.ts, or by AKAN_SOLO=false, an AKAN_REPLICA other than one traffic replica, or AKAN_COMMAND_TYPE=start in its env. Leave them out of the app the desktop build carries.",
      );
    Logger.role = "gateway";
    await this.#prepareRuntimeDir();
    await this.#startLogHub();
    this.#startFileLogging();
    await this.#startOps();
    for (let idx = 0; idx < this.#replica.total; idx++) this.#spawn(idx);
    try {
      this.#listen();
    } catch (error) {
      if (isPortInUseError(error)) {
        const message = `Port ${this.#port} is already in use — another \`akan start\` or an orphaned gateway may still be running (try: lsof -ti :${this.#port}).`;
        this.logger.error(message);
        this.#reportBackendBuildStatus({ ok: false, message });
      }
      await this.stop("listen-failed");
      throw error;
    }
    this.#snapshotTimer = setInterval(() => this.#requestRoomSnapshots(), 30_000);
    this.#healthTimer = setInterval(() => this.#checkHealth(), 2_000);
    this.#metricsTimer ??= ProcessMetricsCollector.startReporting(() => this.#reportMetrics());
    process.on("message", (message) => this.#handleHostMessage(message as BuilderMessage));
    process.on("disconnect", () => this.#handleHostDisconnect());
    process.on("SIGINT", () => this.#handleShutdownSignal("SIGINT"));
    process.on("SIGTERM", () => this.#handleShutdownSignal("SIGTERM"));
    await new Promise<void>((resolve) => {
      this.#resolveStopped = resolve;
    });
  }

  async #startSolo() {
    const role = this.#getRole(0);
    // A child's env minus `AKAN_CHILD_SOCKET`, whose absence makes `AkanServer` bind `PORT` and own `/_akan/app/*`.
    Object.assign(process.env, this.#childEnv(0, role));
    // Anything that read the env before the assignment above cached the prefix it just changed.
    resetEnvCache();
    this.logger.info(`Starting ${role} replica in this process (solo); set AKAN_SOLO=false for the gateway`);
    const mod = (await import(this.#serverPath)) as { server?: SoloServer; app?: SoloServer };
    const server = mod.server ?? mod.app;
    if (!server?.start) throw new Error("server.ts must export server or app with start()");
    await server.start({ listen: true });
  }

  async stop(signal = "SIGTERM") {
    if (this.#stopping) return;
    this.#stopping = true;
    for (const timer of [this.#snapshotTimer, this.#healthTimer, this.#metricsTimer]) if (timer) clearInterval(timer);
    this.#snapshotTimer = null;
    this.#healthTimer = null;
    this.#metricsTimer = null;
    this.#server?.stop(true);
    this.#server = null;
    for (const child of this.#children.values()) {
      if (child.restartTimer) clearTimeout(child.restartTimer);
      child.restartTimer = null;
      this.#sendToChild(child, { type: "shutdown", signal } satisfies AkanIpcMessage);
    }
    await Promise.race([
      Promise.all([...this.#children.values()].map((child) => child.proc.exited.catch(() => undefined))),
      new Promise((resolve) => setTimeout(resolve, AkanApp.#childShutdownWaitMs())),
    ]);
    // Anything alive after the full budget is stuck or trapping SIGTERM, so escalate straight to SIGKILL.
    const stragglers = [...this.#children.values()].filter((child) => !child.proc.killed);
    for (const child of stragglers) child.proc.kill("SIGKILL");
    await Promise.all(stragglers.map((child) => child.proc.exited.catch(() => undefined)));
    this.#children.clear();
    await this.#stopLogHub();
    await this.#stopFileLogging();
    this.#resolveStopped?.();
    this.#resolveStopped = null;
    if (this.#exitAfterStop) process.exit(0);
  }

  #handleShutdownSignal(signal: NodeJS.Signals) {
    if (this.#stopping) process.exit(1);
    this.#exitAfterStop = true;
    void this.stop(signal).catch((error) => {
      this.logger.error(`Failed to shutdown gateway: ${error instanceof Error ? error.message : String(error)}`);
      process.exit(1);
    });
  }

  // Fires when the dev host dies, even by SIGKILL; exiting keeps a stranded tree from blocking the next `akan start`.
  #handleHostDisconnect() {
    if (this.#stopping) return;
    this.logger.warn("Host IPC channel closed; shutting down gateway and children");
    this.#exitAfterStop = true;
    setTimeout(() => process.exit(1), AkanApp.#childShutdownWaitMs() + 5_000);
    void this.stop("ipc-disconnect").catch(() => process.exit(1));
  }

  #spawn(idx: number) {
    const role = this.#getRole(idx);
    const upstream = this.#getChildUpstream(idx, role);
    //? Windows drops an ipc message sent right before `process.exit`; exit from its send callback.
    const childCode = `import(${JSON.stringify(path.resolve(this.#serverPath))}).then((mod)=>{ const server = mod.server ?? mod.app; if (!server?.start) throw new Error("server.ts must export server or app with start()"); return server.start({ listen: process.env.SERVER_MODE !== "batch" }); }).catch((error)=>{ const exit = () => process.exit(1); setTimeout(exit, 2000); if (!process.send) return exit(); process.send({ type: "error", message: error instanceof Error ? error.message : String(error), stack: error instanceof Error ? error.stack : undefined, pid: process.pid }, undefined, undefined, exit); });`;
    const proc: Bun.Subprocess<"ignore", "pipe", "pipe"> = Bun.spawn(["bun", "-e", childCode], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        // PORT included: its loopback fetches (SSR, its RSC worker) come back through this gateway.
        ...this.#childEnv(idx, role),
        AKAN_CHILD_SOCKET: upstream.http.socketPath,
        AKAN_CHILD_WS_PORT: upstream.ws ? String(upstream.ws.port) : "",
      },
      ipc: (message) => this.#handleMessage(idx, message as AkanIpcMessage, proc),
      stdout: "pipe",
      stderr: "pipe",
      stdin: "ignore",
    });
    const previous = this.#children.get(idx);
    this.#children.set(idx, {
      idx,
      role,
      proc,
      ready: false,
      status: "starting",
      metrics: {},
      restartAttempts: previous?.restartAttempts ?? 0,
      restartCount: previous?.restartCount ?? 0,
      restartTimer: null,
      restartPending: false,
      lastExitCode: previous?.lastExitCode,
      lastRestartAt: previous?.lastRestartAt,
      lastRestartReason: previous?.lastRestartReason,
    });
    this.#federationChildCache = null;
    const output = new ChildOutputReader({
      onLine: (line) => this.#writeChildLine(idx, role, proc.pid, "stdout", line),
      onBlock: (lines) => this.#writeChildStderrBlock(idx, role, proc.pid, lines),
    });
    void output.pipe(proc.stdout, "stdout");
    void output.pipe(proc.stderr, "stderr");
    proc.exited.then((code) => this.#handleChildExit(idx, proc, code));
  }

  #childEnv(idx: number, role: AkanChildRole) {
    return {
      PORT: String(this.#port),
      NODE_ENV: AkanApp.#defaultChildNodeEnv(),
      AKAN_REPLICA: this.#replica.value,
      AKAN_REPLICA_IDX: String(idx),
      AKAN_APP_DIR: path.dirname(this.#serverPath),
      SERVER_MODE: role,
      AKAN_API_PREFIX: this.#prefix,
      AKAN_WS_PREFIX: this.#websocketPrefix,
      ...(this.#openapi === undefined ? {} : { AKAN_OPENAPI: this.#openapi ? "true" : "false" }),
      ...(this.#modules.length ? { AKAN_MODULES: this.#modules.join(",") } : {}),
      ...(this.#disableModules.length ? { AKAN_DISABLE_MODULES: this.#disableModules.join(",") } : {}),
      ...(this.#disableLibs.length ? { AKAN_DISABLE_LIBS: this.#disableLibs.join(",") } : {}),
    };
  }

  #handleChildExit(idx: number, proc: Bun.Subprocess<"ignore", "pipe", "pipe">, code: number | null) {
    const child = this.#children.get(idx);
    if (!child || child.proc !== proc) return;
    if (child.status === "crashed") return;
    child.status = "exited";
    child.lastExitCode = code;
    this.#federationChildCache = null;
    this.#removeChildRooms(idx);
    if (this.#stopping) return;
    void this.#scheduleChildRestart(child, proc, `exit:${code ?? "unknown"}`);
  }

  #scheduleChildRestart(child: ChildState, proc: Bun.Subprocess<"ignore", "pipe", "pipe">, reason: string): void {
    if (this.#stopping) return;
    if (child.proc !== proc) return;
    if (child.restartPending || child.restartTimer) {
      child.lastRestartReason = reason;
      return;
    }
    if (this.#devHosted && child.restartAttempts >= AkanApp.#devMaxChildBootFailures - 1 && !child.ready) {
      this.#markChildCrashed(child, reason);
      return;
    }

    child.restartPending = true;
    child.ready = false;
    child.status = reason === "health-timeout" || reason === "upstream-open-failed" ? "unhealthy" : "exited";
    child.upstream = undefined;
    child.wsUpstream = undefined;
    child.healthPath = undefined;
    this.#federationChildCache = null;
    child.lastRestartReason = reason;
    child.lastRestartAt = Date.now();
    this.#removeChildRooms(child.idx);

    const attempt = child.restartAttempts;
    const delay = Math.min(AkanApp.#childRestartBaseDelayMs * 2 ** attempt, AkanApp.#childRestartMaxDelayMs);
    child.restartAttempts = attempt + 1;
    child.restartCount += 1;
    this.logger.error(
      `Child ${child.idx}/${child.role} failed (${reason}); restarting in ${delay}ms (attempt ${child.restartAttempts})`,
    );

    void this.#restartChildAfterDelay(child.idx, proc, reason, delay).catch((error) => {
      const current = this.#children.get(child.idx);
      if (!current || current.proc !== proc || this.#stopping) return;
      current.restartPending = false;
      this.logger.error(
        `Failed to restart child ${child.idx}/${child.role}: ${error instanceof Error ? error.message : String(error)}`,
      );
      this.#scheduleChildRestart(current, proc, "restart-failed");
    });
  }

  async #restartChildAfterDelay(
    idx: number,
    proc: Bun.Subprocess<"ignore", "pipe", "pipe">,
    reason: string,
    delay: number,
  ) {
    const child = this.#children.get(idx);
    if (!child || child.proc !== proc || this.#stopping) return;
    await this.#stopChildForRestart(child, proc, reason);
    if (this.#stopping) return;
    const current = this.#children.get(idx);
    if (!current || current.proc !== proc) return;
    current.restartTimer = setTimeout(() => {
      current.restartTimer = null;
      void this.#respawnChild(idx, proc).catch((error) => {
        const latest = this.#children.get(idx);
        if (!latest || latest.proc !== proc || this.#stopping) return;
        latest.restartPending = false;
        this.logger.error(
          `Failed to respawn child ${idx}/${latest.role}: ${error instanceof Error ? error.message : String(error)}`,
        );
        this.#scheduleChildRestart(latest, proc, "respawn-failed");
      });
    }, delay);
  }

  async #respawnChild(idx: number, proc: Bun.Subprocess<"ignore", "pipe", "pipe">) {
    if (this.#stopping) return;
    const current = this.#children.get(idx);
    if (!current || current.proc !== proc) return;
    await this.#removeChildSocket(idx, current.role);
    current.restartPending = false;
    this.#spawn(idx);
  }

  // Dev-only terminal state, cleared when the dev host replaces this gateway on the next server-side edit.
  #markChildCrashed(child: ChildState, reason: string) {
    // The child's `error` IPC and its exit event both funnel here; report only once.
    if (child.status === "crashed") return;
    child.ready = false;
    child.status = "crashed";
    child.restartPending = false;
    child.upstream = undefined;
    child.wsUpstream = undefined;
    child.healthPath = undefined;
    child.lastRestartReason = reason;
    this.#federationChildCache = null;
    this.#removeChildRooms(child.idx);
    const attempts = child.restartAttempts + 1;
    const detail = child.lastErrorMessage ?? reason;
    const message = `Backend replica ${child.idx}/${child.role} failed ${attempts} consecutive boots; waiting for a code change to retry: ${detail}`;
    this.logger.error(`[child-crash-loop] ${message}`);
    this.#reportBackendBuildStatus({ ok: false, message });
  }

  #reportBackendBuildStatus({ ok, message }: { ok: boolean; message: string }) {
    process.send?.({
      type: "build-status",
      data: { generation: -1, phase: "backend", ok, files: [], message },
    } satisfies BuilderMessage);
  }

  #isChildUnavailable(child: ChildState): boolean {
    return child.proc.killed || child.status === "exited" || child.status === "crashed";
  }

  async #stopChildForRestart(child: ChildState, proc: Bun.Subprocess<"ignore", "pipe", "pipe">, reason: string) {
    if (reason.startsWith("exit:") || proc.killed) return;
    this.#sendToChild(child, { type: "shutdown", signal: reason } satisfies AkanIpcMessage);
    const result = await Promise.race([
      proc.exited.then(() => "exited" as const).catch(() => "exited" as const),
      new Promise<"timeout">((resolve) => setTimeout(() => resolve("timeout"), AkanApp.#childRestartGraceMs)),
    ]);
    if (result === "timeout" && !proc.killed) {
      this.logger.warn(`Child ${child.idx}/${child.role} did not stop in ${AkanApp.#childRestartGraceMs}ms; killing`);
      proc.kill();
      await proc.exited.catch(() => undefined);
    }
  }

  async #prepareRuntimeDir() {
    await mkdir(this.#runtimeDir, { recursive: true });
    // Run-scoped socket names never conflict but never get reused either, so sweep every leftover.
    const entries = await readdir(this.#runtimeDir).catch(() => []);
    await Promise.all(
      entries
        .filter((name) => /^akan-(child-.*|control)\.sock$/.test(name))
        .map((name) => rm(path.join(this.#runtimeDir, name), { force: true }).catch(() => undefined)),
    );
  }

  async #removeChildSocket(idx: number, role: AkanChildRole) {
    const socketPath = this.#getChildUpstream(idx, role).http.socketPath;
    try {
      await rm(socketPath, { force: true });
    } catch {
      // Best-effort cleanup for stale Unix sockets.
    }
  }

  #startFileLogging() {
    this.#logWriter = RotatingLogWriter.fromRuntimeDir(this.#runtimeDir);
    if (this.#logWriter) this.#detachFileLog = HubFileSink.attach(this.#logWriter, this.#logHub, "gateway");
  }

  async #stopFileLogging() {
    this.#detachFileLog?.();
    this.#detachFileLog = null;
    const writer = this.#logWriter;
    this.#logWriter = null;
    await writer?.close();
  }

  async #startLogHub() {
    const hub = LogHub.attach();
    this.#logHub = hub;
    hub.onFloorChange((minSev) => this.#fanoutToAll({ type: "log.level", minSev }));
    this.#logStream = LogStreamRoute.fromEnv(() => this.#logHub);
    this.#logControl = await LogControlSocket.open(hub, this.#runtimeDir, this.logger);
  }

  //* Loaded only when the key is set, so a gateway without an ops channel never evaluates the snapshot code.
  async #startOps() {
    if (!process.env.AKAN_OPS_PUBLIC_KEY?.trim()) return;
    const { OpsRoute } = await import("./ops/opsRoute");
    this.#ops = OpsRoute.fromEnv({
      detail: () => AppInfo.detail({ serverMode: "gateway", solo: false, replicaIdx: null }),
    });
  }

  async #stopLogHub() {
    await this.#logControl?.stop();
    this.#logControl = null;
    this.#logStream = null;
    this.#logHub?.close();
    this.#logHub = null;
  }

  #listen() {
    this.#server = Bun.serve({
      idleTimeout: 0,
      port: this.#port,
      hostname: process.env.AKAN_LISTEN_HOST || undefined,
      fetch: (req, server) => this.#handleFetch(req, server),
      websocket: {
        idleTimeout: 0,
        maxPayloadLength: 16 * 1024 * 1024,
        backpressureLimit: 1024 * 1024,
        closeOnBackpressureLimit: true,
        open: (ws) => this.#handleWsOpen(ws),
        message: (ws, message) => this.#handleWsMessage(ws, message),
        close: (ws, code, reason) => this.#handleWsClose(ws, code, reason),
        data: {} as GatewayWsData,
      },
    });
    this.logger.info(`AkanApp gateway is running on port http://localhost:${this.#port}`);
  }

  async #handleFetch(req: Request, server: Bun.Server<GatewayWsData>): Promise<Response | undefined> {
    if (this.#hostAllowlist && !this.#hostAllowlist.allows(req)) return this.#hostAllowlist.refuse();
    const url = new URL(req.url);
    if (url.pathname === "/_akan/app/health") return Response.json(this.#getHealthStatus());
    if (url.pathname === "/_akan/app/metrics") return Response.json(this.#getMetricsStatus());
    if (url.pathname === LogStreamRoute.path && this.#logStream) return this.#logStream.handle(req);
    if (url.pathname === "/_akan/bench/ping") return new Response("ok");
    if (url.pathname === AppInfo.publicPath) return AppInfo.handlePublic();
    if (this.#ops?.matches(url.pathname)) return await this.#ops.handle(req);
    if (this.#isWebSocketPath(url.pathname)) return this.#upgradeWebSocket(req, server);
    const assetResponse = await this.#serveImmutableArtifact(req, url);
    if (assetResponse) return assetResponse;
    return await this.#proxyHttp(req, server);
  }

  #isWebSocketPath(pathname: string) {
    return pathname === `${this.#prefix}${this.#websocketPrefix}` || pathname === "/_akan/hmr";
  }

  static readonly #immutableArtifacts = [
    { prefix: "/_akan/client/", root: "client", strip: "/_akan/client/".length, type: "application/javascript" },
    { prefix: "/_akan/styles/", root: "", strip: "/_akan/".length, type: "text/css; charset=utf-8" },
    { prefix: "/_akan/fonts/", root: "", strip: "/_akan/".length, type: "font/woff2" },
  ] as const;

  async #serveImmutableArtifact(req: Request, url: URL): Promise<Response | null> {
    if (!this.#web.ssr) return null;
    const artifact = AkanApp.#immutableArtifacts.find(({ prefix }) => url.pathname.startsWith(prefix));
    if (!artifact) return null;
    const filePath = resolveStaticPath(path.join(this.#artifactDir, artifact.root), url.pathname.slice(artifact.strip));
    if (!filePath) return new Response("Not Found", { status: 404 });
    const file = Bun.file(filePath);
    if (!(await file.exists())) return new Response("Not Found", { status: 404 });
    return this.#fileResponse(req, filePath, {
      contentType: file.type || artifact.type,
      cacheControl: "public, max-age=31536000, immutable",
    });
  }

  #upgradeWebSocket(req: Request, server: Bun.Server<GatewayWsData>): Response | undefined {
    const child = this.#pickFederationChild();
    // Prefer the ws port the child actually bound (it may have fallen back); the computed one covers older children.
    const upstream = child?.upstream ? (child.wsUpstream ?? this.#getChildUpstream(child.idx, child.role).ws) : null;
    if (!child || !upstream) return new Response("No websocket upstream is ready", { status: 503 });
    const url = new URL(req.url);
    //? Once upgraded here, a replica's refusal can only close the socket: the browser has to see the 403 from this hop.
    try {
      CrossSiteGuard.assertOrigin(req, url, url.pathname === "/_akan/hmr" ? "hmr" : "websocket");
    } catch {
      return new Response("Forbidden", { status: 403 });
    }
    const upstreamWs = new WebSocket(`ws://${upstream.host}:${upstream.port}${url.pathname}${url.search}`, {
      headers: makeAkanChildProxyHeaders(req, child.idx, server.requestIP(req)),
    } as unknown as string[]);
    // No socket id on this hop: the child mints the one its room bookkeeping and endpoints see.
    const upgraded = server.upgrade(req, { data: { childIdx: child.idx, upstream: upstreamWs } });
    if (!upgraded) {
      upstreamWs.close();
      return new Response("WebSocket upgrade failed", { status: 500 });
    }
    child.metrics.activeWebSockets = (child.metrics.activeWebSockets ?? 0) + 1;
    return undefined;
  }

  #handleWsOpen(ws: Bun.ServerWebSocket<GatewayWsData>) {
    const upstream = ws.data.upstream;
    const pending: (string | ArrayBuffer)[] = [];
    upstream.addEventListener("open", () => {
      for (const message of pending.splice(0)) upstream.send(message);
    });
    upstream.addEventListener("message", (event) => {
      const result = ws.send(event.data as string | ArrayBuffer);
      if (result === 0) upstream.close();
    });
    upstream.addEventListener("close", (event) => {
      ws.close(relayableCloseCode(event.code), event.reason);
    });
    upstream.addEventListener("error", () => ws.close(1011, "upstream websocket error"));
    Object.assign(ws.data, { pending });
  }

  #handleWsMessage(
    ws: Bun.ServerWebSocket<GatewayWsData & { pending?: (string | ArrayBuffer)[] }>,
    message: string | ArrayBuffer | Uint8Array,
  ) {
    const upstream = ws.data.upstream;
    const payload =
      typeof message === "string"
        ? message
        : message instanceof ArrayBuffer
          ? message
          : new Uint8Array(message).slice().buffer;
    if (upstream.readyState === WebSocket.OPEN) upstream.send(payload);
    else ws.data.pending?.push(payload as string | ArrayBuffer);
  }

  #handleWsClose(ws: Bun.ServerWebSocket<GatewayWsData>, code: number, reason: string) {
    ws.data.upstream.close(relayableCloseCode(code), reason);
    const child = this.#children.get(ws.data.childIdx);
    if (child) child.metrics.activeWebSockets = Math.max(0, (child.metrics.activeWebSockets ?? 1) - 1);
  }

  #getHealthStatus() {
    return {
      status: this.#stopping ? "stopping" : "running",
      pid: process.pid,
      children: [...this.#children.values()].map((child) => ({
        idx: child.idx,
        role: child.role,
        status: child.status,
        ready: child.ready,
        pid: child.pid,
        upstream: child.upstream,
        restartAttempts: child.restartAttempts,
        restartCount: child.restartCount,
        restartPending: child.restartPending,
        lastExitCode: child.lastExitCode,
        lastRestartAt: child.lastRestartAt,
        lastRestartReason: child.lastRestartReason,
        lastErrorMessage: child.lastErrorMessage,
      })),
    };
  }

  #getMetricsStatus() {
    return {
      rooms: this.#roomChildren.size,
      sockets: this.#socketRooms.size,
      gateway: this.#gatewayMetrics,
      proxyHop: this.#proxyHopCount
        ? {
            count: this.#proxyHopCount,
            meanMs: Math.round((this.#proxyHopSumMs / this.#proxyHopCount) * 1000) / 1000,
            maxMs: Math.round(this.#proxyHopMaxMs * 1000) / 1000,
          }
        : null,
      children: [...this.#children.values()].map((child) => ({
        idx: child.idx,
        role: child.role,
        metrics: child.metrics,
        rooms: this.#childRooms.get(child.idx)?.size ?? 0,
        restartAttempts: child.restartAttempts,
        restartCount: child.restartCount,
        restartPending: child.restartPending,
        lastExitCode: child.lastExitCode,
        lastRestartAt: child.lastRestartAt,
        lastRestartReason: child.lastRestartReason,
      })),
    };
  }

  async #proxyHttp(req: Request, server: Bun.Server<GatewayWsData>): Promise<Response> {
    const child = await this.#pickReadyFederationChild(req);
    if (!child?.upstream || child.upstream.type !== "unix") return this.#respondWithUnavailable(req);
    // Read once: a concurrent request's failure can clear `child.upstream` while this one awaits the child.
    const { socketPath } = child.upstream;
    const url = new URL(req.url);
    const upstreamUrl = `http://akan-child${url.pathname}${url.search}`;
    const headers = makeAkanChildProxyHeaders(req, child.idx, server.requestIP(req));
    child.metrics.activeRequests = (child.metrics.activeRequests ?? 0) + 1;
    child.metrics.totalRequests = (child.metrics.totalRequests ?? 0) + 1;
    const traced = isTraceEnabled();
    const hopStart = traced ? performance.now() : 0;
    try {
      const upstreamRes = await fetch(upstreamUrl, {
        unix: socketPath,
        method: req.method,
        headers,
        body: req.method === "GET" || req.method === "HEAD" ? undefined : req.body,
        signal: req.signal,
        redirect: "manual",
      });
      return await this.#proxyResponse(req, upstreamRes);
    } catch (error) {
      if (AkanApp.#isUpstreamOpenFailure(error)) {
        this.logger.error(`Child ${child.idx}/${child.role} upstream is unreachable (${socketPath}); restarting`);
        this.#scheduleChildRestart(child, child.proc, "upstream-open-failed");
        return AkanApp.#unavailableResponse(req, "Federation child upstream is unreachable; restarting");
      }
      if (req.signal.aborted) return AkanApp.#clientClosedResponse();
      if (AkanApp.#isUpstreamMidFlightClose(error)) {
        this.logger.warn(
          `Child ${child.idx}/${child.role} closed the connection mid-request (${req.method} ${new URL(req.url).pathname})`,
        );
        return AkanApp.#badGatewayResponse(req);
      }
      throw error;
    } finally {
      child.metrics.activeRequests = Math.max(0, (child.metrics.activeRequests ?? 1) - 1);
      if (traced) this.#recordProxyHop(performance.now() - hopStart);
    }
  }

  static #isUpstreamOpenFailure(error: unknown): boolean {
    if (!error || typeof error !== "object") return false;
    const candidate = error as { code?: unknown; message?: unknown };
    return candidate.code === "FailedToOpenSocket" || String(candidate.message ?? "").includes("FailedToOpenSocket");
  }

  // Child died mid-response: no restart from here, and a rethrow would be a raw 500 blamed on the in-flight URL.
  static #isUpstreamMidFlightClose(error: unknown): boolean {
    if (!error || typeof error !== "object") return false;
    const candidate = error as { code?: unknown; message?: unknown };
    if (candidate.code === "ECONNRESET" || candidate.code === "ConnectionClosed") return true;
    return String(candidate.message ?? "").includes("connection was closed");
  }

  static #clientClosedResponse(): Response {
    return new Response(null, { status: 499, headers: { "cache-control": "no-store" } });
  }

  static #badGatewayResponse(req: Request): Response {
    const detail = "The replica closed the connection before it finished answering.";
    if (req.headers.get("accept")?.includes("text/html")) {
      return new Response(
        AkanApp.#statusPageHtml({
          heading: "Backend dropped the connection",
          detail,
          note: "The replica is restarting — this page reloads itself as soon as it answers.",
        }),
        { status: 502, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } },
      );
    }
    return new Response(detail, {
      status: 502,
      headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
    });
  }

  // Waits rather than 503s at once: a restarting replica is back within seconds, but a browser stays on a 503 page.
  async #pickReadyFederationChild(req: Request): Promise<ChildState | null> {
    const ready = this.#pickFederationChild();
    if (ready?.upstream) return ready;
    const deadline = performance.now() + this.#upstreamWaitMs;
    while (performance.now() < deadline) {
      if (this.#stopping || req.signal.aborted || this.#getCrashLoopDetail()) return null;
      await Bun.sleep(50);
      const child = this.#pickFederationChild();
      if (child?.upstream) return child;
    }
    return null;
  }

  #getCrashLoopDetail(): string | null {
    if (!this.#devHosted) return null;
    const trafficChildren = [...this.#children.values()].filter((child) => child.role !== "batch");
    if (trafficChildren.length === 0) return null;
    if (!trafficChildren.every((child) => child.status === "crashed")) return null;
    return (
      trafficChildren.map((child) => child.lastErrorMessage ?? child.lastRestartReason).find(Boolean) ??
      "unknown boot error"
    );
  }

  // Stays a 503 for ingress/CDN; the self-reloading HTML is for browser navigations a bare 503 would strand.
  #respondWithUnavailable(req: Request): Response {
    const crashDetail = this.#getCrashLoopDetail();
    const page = crashDetail
      ? {
          heading: "Backend failed to start",
          detail: crashDetail,
          text: `Backend failed to start after ${AkanApp.#devMaxChildBootFailures} boot attempts: ${crashDetail}`,
          note: `The dev server stopped retrying after ${AkanApp.#devMaxChildBootFailures} failed boots. Fix the error and save — this page reloads automatically.`,
        }
      : {
          heading: "Backend is starting",
          detail: "No healthy federation child is ready",
          text: "No healthy federation child is ready",
          note: "A replica is booting or restarting — this page reloads itself as soon as it answers.",
        };
    if (req.headers.get("accept")?.includes("text/html")) {
      return new Response(AkanApp.#statusPageHtml(page), {
        status: 503,
        headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
      });
    }
    return AkanApp.#unavailableResponse(req, page.text);
  }

  // JSON callers get the payload `HttpClient` restores into an `Err`; bare text would surface as a JSON parse error.
  static #unavailableResponse(req: Request, detail: string): Response {
    const headers = { "cache-control": "no-store" };
    if (!req.headers.get("accept")?.includes("application/json")) return new Response(detail, { status: 503, headers });
    return Response.json(
      { error: "base.error.serverUnavailable", statusCode: 503, data: { status: 503 }, details: detail },
      { status: 503, headers },
    );
  }

  static #statusPageHtml({ heading, detail, note }: { heading: string; detail: string; note: string }) {
    return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>${AkanApp.#escapeHtml(heading)}</title>
<style>
  body { margin: 0; padding: 48px 24px; background: #111827; color: #e5e7eb; font-family: ui-sans-serif, system-ui, sans-serif; }
  main { max-width: 720px; margin: 0 auto; }
  h1 { font-size: 20px; color: #f87171; }
  pre { padding: 16px; border-radius: 8px; background: #1f2937; color: #fca5a5; white-space: pre-wrap; word-break: break-word; }
  p { color: #9ca3af; font-size: 14px; }
</style>
</head>
<body>
<main>
<h1>${AkanApp.#escapeHtml(heading)}</h1>
<pre>${AkanApp.#escapeHtml(detail)}</pre>
<p>${AkanApp.#escapeHtml(note)}</p>
</main>
<script>
  const poll = async () => {
    try {
      const res = await fetch(location.href, { cache: "no-store" });
      if (res.ok) { location.reload(); return; }
    } catch {}
    setTimeout(poll, 1000);
  };
  setTimeout(poll, 1000);
</script>
</body>
</html>`;
  }

  static #escapeHtml(text: string) {
    const replacements: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return text.replace(/[&<>"']/g, (ch) => replacements[ch] ?? ch);
  }

  // Upstream round trip as the gateway sees it; proxy overhead = this minus the child's traced handler time.
  #recordProxyHop(durationMs: number) {
    this.#proxyHopCount += 1;
    this.#proxyHopSumMs += durationMs;
    this.#proxyHopMaxMs = Math.max(this.#proxyHopMaxMs, durationMs);
  }

  async #proxyResponse(req: Request, upstreamRes: Response): Promise<Response> {
    const headers = new Headers(upstreamRes.headers);
    // Bun fetch decompresses upstream bodies but keeps these headers, so browsers would decode twice.
    if (headers.has("content-encoding")) {
      headers.delete("content-encoding");
      headers.delete("content-length");
    }
    this.#rewriteInternalLocation(headers);
    const proxied = new Response(upstreamRes.body, {
      status: upstreamRes.status,
      statusText: upstreamRes.statusText,
      headers,
    });
    // Only this hop sees the client's Accept-Encoding. JSON only: `compressResponse` buffers; HTML/RSC must stream.
    return AkanApp.#isProxiedJson(headers) ? await compressResponse(req, proxied) : proxied;
  }

  static #isProxiedJson(headers: Headers): boolean {
    return (headers.get("content-type") ?? "").split(";")[0]?.trim().toLowerCase() === "application/json";
  }

  #rewriteInternalLocation(headers: Headers) {
    const location = headers.get("location");
    if (!location) return;
    try {
      const parsed = new URL(location);
      if (parsed.hostname === AKAN_CHILD_HOST)
        headers.set("location", `${parsed.pathname}${parsed.search}${parsed.hash}`);
    } catch {
      // Relative redirects are already safe to pass through.
    }
  }

  async #fileResponse(
    req: Request,
    filePath: string,
    options: { contentType: string; cacheControl?: string },
  ): Promise<Response> {
    const headers = new Headers({ "Content-Type": options.contentType });
    if (options.cacheControl) headers.set("Cache-Control", options.cacheControl);
    headers.set("X-Content-Type-Options", "nosniff");
    headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
    return await encodedFileResponse(req, filePath, options.contentType, headers);
  }

  #pickFederationChild() {
    const candidates =
      this.#federationChildCache ??
      [...this.#children.values()].filter(
        (child) =>
          (child.role === "federation" || child.role === "all") &&
          child.ready &&
          child.status !== "unhealthy" &&
          !this.#isChildUnavailable(child),
      );
    this.#federationChildCache = candidates;
    if (candidates.length === 0) return null;
    const child = candidates[this.#rrIdx % candidates.length];
    this.#rrIdx++;
    return child;
  }

  #getRole(idx: number): AkanChildRole {
    if (idx < this.#replica.federation) return "federation";
    if (idx < this.#replica.federation + this.#replica.batch) return "batch";
    return "all";
  }

  #getChildUpstream(idx: number, role: AkanChildRole): GatewayUpstream {
    return {
      http: { type: "unix", socketPath: path.join(this.#runtimeDir, `akan-child-${this.#socketRunId}-${idx}.sock`) },
      ws: role === "batch" ? undefined : { type: "tcp", host: "127.0.0.1", port: this.#wsBasePort + idx },
    };
  }

  #handleMessage(
    idx: number,
    message: AkanIpcMessage | BuilderMessage,
    proc?: Bun.Subprocess<"ignore", "pipe", "pipe">,
  ) {
    const child = this.#children.get(idx);
    if (proc && (!child || child.proc !== proc)) return;
    if (!message || typeof message !== "object") return;
    switch (message.type) {
      case "ready":
        this.#markReady(idx, message);
        return;
      case "pubsub.publish":
        this.#deliverPubsub(idx, message);
        return;
      case "pubsub.subscribe":
        this.#addRoomMembership(idx, message.roomId, message.socketId);
        return;
      case "pubsub.unsubscribe":
        this.#removeRoomMembership(idx, message.roomId, message.socketId);
        return;
      case "pubsub.snapshot":
        this.#replaceRoomSnapshot(idx, message.rooms);
        return;
      case "live.change":
        this.#fanoutLiveChange(idx, message);
        return;
      case "metrics.report":
        this.#updateMetrics(idx, message.metrics);
        return;
      case "log.records":
        this.#logHub?.ingestMany(message.records);
        if (message.dropped) this.logger.warn(`Child ${idx} dropped ${message.dropped} log records (ipc backpressure)`);
        return;
      case "health.pong":
        this.#markHealthy(idx);
        return;
      case "queue.enqueued":
        this.#fanoutToBatch({ type: "queue.wake", queue: message.queue, name: message.name });
        return;
      case "error":
        this.logger.error(message.message);
        if (child) child.lastErrorMessage = message.message;
        if (child && proc) void this.#scheduleChildRestart(child, proc, "child-error");
        return;
      case "build-route":
      case "build-csr":
        this.#forwardBuilderReq(idx, message);
        return;
    }
  }

  #handleHostMessage(message: BuilderMessage) {
    if (!message || typeof message !== "object") return;
    switch (message.type) {
      case "builder-ready":
      case "invalidate":
      case "css-updated":
      case "pages-updated":
      case "csr-updated":
      case "ssr-updated":
      case "build-status":
        this.#fanoutToFederation(message);
        return;
      case "build-route-res":
      case "build-csr-res":
        this.#forwardBuilderRes(message);
        return;
    }
  }

  #markReady(idx: number, message: Extract<AkanIpcMessage, { type: "ready" }>) {
    const child = this.#children.get(idx);
    if (!child) return;
    child.ready = true;
    child.status = "ready";
    child.pid = message.pid;
    child.upstream = message.upstream;
    child.wsUpstream = message.wsUpstream;
    child.healthPath = message.healthPath;
    if (message.crossSite) CrossSiteGuard.configure(message.crossSite);
    child.lastPongAtMono = performance.now();
    child.restartAttempts = 0;
    // A child that (re)spawned after subscribers arrived has never heard the floor.
    if (this.#logHub && this.#logHub.floor !== null)
      this.#sendToChild(child, { type: "log.level", minSev: this.#logHub.floor });
    child.restartPending = false;
    child.lastErrorMessage = undefined;
    this.#federationChildCache = null;
    // Batch children serve no HTTP/HMR traffic, so they must not gate frontend readiness.
    const trafficChildren = [...this.#children.values()].filter((item) => item.role !== "batch");
    //? A gateway that lost its port stops only after its replicas exit, and one may boot in that wait.
    if (!this.#stopping && child.role !== "batch" && trafficChildren.every((item) => item.ready)) {
      process.send?.({ type: "backend-ready", pid: process.pid } satisfies AkanIpcMessage);
    }
    if ([...this.#children.values()].every((item) => item.ready)) {
      this.logger.verbose(`All ${this.#children.size} child process(es) are ready`);
    }
  }

  #markHealthy(idx: number) {
    const child = this.#children.get(idx);
    if (!child) return;
    child.status = "healthy";
    child.lastPongAtMono = performance.now();
    this.#federationChildCache = null;
  }

  #deliverPubsub(originIdx: number, message: Extract<AkanIpcMessage, { type: "pubsub.publish" }>) {
    const targets = this.#roomChildren.get(message.roomId);
    if (!targets?.size) {
      const child = this.#children.get(originIdx);
      if (child) child.metrics.pubsubDropCount = (child.metrics.pubsubDropCount ?? 0) + 1;
      this.logger.verbose(`Dropping pubsub ${message.roomId}; no subscribers`);
      return;
    }
    for (const childIdx of targets) {
      if (childIdx === originIdx) continue;
      const child = this.#children.get(childIdx);
      if (!child || this.#isChildUnavailable(child)) continue;
      if (
        !this.#sendToChild(child, {
          type: "pubsub.deliver",
          roomId: message.roomId,
          data: message.data,
          origin: message.origin,
        } satisfies AkanIpcMessage)
      )
        continue;
      child.metrics.pubsubDeliverCount = (child.metrics.pubsubDeliverCount ?? 0) + 1;
    }
  }

  #addRoomMembership(childIdx: number, roomId: string, socketId?: string) {
    const roomChildren = this.#roomChildren.get(roomId) ?? new Set<number>();
    roomChildren.add(childIdx);
    this.#roomChildren.set(roomId, roomChildren);

    const childRooms = this.#childRooms.get(childIdx) ?? new Map<string, Set<string>>();
    const roomSockets = childRooms.get(roomId) ?? new Set<string>();
    childRooms.set(roomId, roomSockets);
    this.#childRooms.set(childIdx, childRooms);

    if (socketId) {
      roomSockets.add(socketId);
      const socketRooms = this.#socketRooms.get(socketId) ?? { childIdx, rooms: new Set<string>() };
      socketRooms.rooms.add(roomId);
      this.#socketRooms.set(socketId, socketRooms);
    }
  }

  #leaveRoom(childIdx: number, roomId: string) {
    const roomChildren = this.#roomChildren.get(roomId);
    roomChildren?.delete(childIdx);
    if (roomChildren?.size === 0) this.#roomChildren.delete(roomId);
  }

  // Unsubscribes arrive per socket, delivery is per replica: a replica leaves with its last socket in the room.
  #removeRoomMembership(childIdx: number, roomId: string, socketId?: string) {
    const childRooms = this.#childRooms.get(childIdx);
    const roomSockets = childRooms?.get(roomId);
    if (socketId) {
      this.#forgetSocketRoom(socketId, roomId);
      roomSockets?.delete(socketId);
      if (roomSockets?.size) return;
    }

    for (const staleSocketId of roomSockets ?? []) this.#forgetSocketRoom(staleSocketId, roomId);
    this.#leaveRoom(childIdx, roomId);
    childRooms?.delete(roomId);
    if (childRooms?.size === 0) this.#childRooms.delete(childIdx);
  }

  #forgetSocketRoom(socketId: string, roomId: string) {
    const socketRooms = this.#socketRooms.get(socketId);
    socketRooms?.rooms.delete(roomId);
    if (!socketRooms || socketRooms.rooms.size === 0) this.#socketRooms.delete(socketId);
  }

  // Snapshots name rooms, not sockets: forgetting a kept room's sockets would drop the replica at its next unsubscribe.
  #replaceRoomSnapshot(childIdx: number, rooms: string[]) {
    const held = new Set(rooms);
    for (const roomId of [...(this.#childRooms.get(childIdx)?.keys() ?? [])])
      if (!held.has(roomId)) this.#removeRoomMembership(childIdx, roomId);
    for (const roomId of held) this.#addRoomMembership(childIdx, roomId);
  }

  #removeChildRooms(childIdx: number) {
    for (const roomId of this.#childRooms.get(childIdx)?.keys() ?? []) this.#leaveRoom(childIdx, roomId);
    this.#childRooms.delete(childIdx);
    for (const [socketId, socket] of this.#socketRooms.entries()) {
      if (socket.childIdx === childIdx) this.#socketRooms.delete(socketId);
    }
  }

  #updateMetrics(childIdx: number, metrics: AkanMetricsReport) {
    const child = this.#children.get(childIdx);
    if (!child) return;
    child.metrics = { ...child.metrics, pid: metrics.pid ?? child.pid, ...metrics };
  }

  async #reportMetrics() {
    this.#gatewayMetrics = await ProcessMetricsCollector.collect({ role: "gateway" });
    if (process.env.AKAN_MEMORY_LOG !== "1") return;
    this.logger.verbose(
      `memory role=gateway ${ProcessMetricsCollector.format(this.#gatewayMetrics)} children=${this.#children.size}`,
    );
    for (const child of this.#children.values()) {
      if (!child.metrics.rssBytes) continue;
      const rooms = this.#childRooms.get(child.idx)?.size ?? 0;
      this.logger.verbose(
        `memory role=${child.role} idx=${child.idx} ${ProcessMetricsCollector.format({
          ...child.metrics,
          pid: child.metrics.pid ?? child.pid,
        })} activeRequests=${child.metrics.activeRequests ?? 0} activeWebSockets=${
          child.metrics.activeWebSockets ?? 0
        } rooms=${rooms} rscPending=${child.metrics.rscPendingRenderCount ?? 0} rscModules=${
          child.metrics.rscLoadedRouteModuleCount ?? 0
        }`,
      );
    }
  }

  #requestRoomSnapshots() {
    for (const child of this.#children.values()) {
      if (this.#isChildUnavailable(child)) continue;
      this.#sendToChild(child, { type: "pubsub.snapshot.request" } satisfies AkanIpcMessage);
    }
  }

  #checkHealth() {
    const nowMono = performance.now();
    for (const child of this.#children.values()) {
      if (this.#isChildUnavailable(child)) continue;
      if (child.lastPongAtMono && nowMono - child.lastPongAtMono > this.#healthTimeoutMs) {
        child.status = "unhealthy";
        this.#federationChildCache = null;
        void this.#scheduleChildRestart(child, child.proc, "health-timeout");
        continue;
      }
      const sent = this.#sendToChild(child, {
        type: "health.ping",
        nonce: crypto.randomUUID(),
        sentAt: Date.now(),
      } satisfies AkanIpcMessage);
      if (!sent) {
        child.status = "unhealthy";
        this.#federationChildCache = null;
        void this.#scheduleChildRestart(child, child.proc, "health-send-failed");
      }
    }
  }

  #forwardBuilderReq(childIdx: number, message: BuilderReq | BuilderCsrReq) {
    const gatewayReqId = this.#nextBuilderReqId++;
    this.#builderReqMap.set(gatewayReqId, { childIdx, childLocalId: message.id });
    process.send?.({ ...message, id: gatewayReqId } satisfies BuilderReq | BuilderCsrReq);
  }

  #forwardBuilderRes(message: BuilderRes | BuilderCsrRes) {
    const request = this.#builderReqMap.get(message.id);
    if (!request) {
      this.logger.warn(`No child found for ${message.type} id=${message.id}`);
      return;
    }
    this.#builderReqMap.delete(message.id);
    const child = this.#children.get(request.childIdx);
    if (!child || child.proc.killed) return;
    this.#sendToChild(child, { ...message, id: request.childLocalId } satisfies BuilderRes | BuilderCsrRes);
  }

  #fanoutToFederation(message: AkanIpcMessage | BuilderMessage, exceptIdx?: number) {
    for (const child of this.#children.values()) {
      if (child.idx === exceptIdx) continue;
      if (child.role === "federation" || child.role === "all") this.#sendToChild(child, message);
    }
  }

  #fanoutToAll(message: AkanIpcMessage) {
    for (const child of this.#children.values()) this.#sendToChild(child, message);
  }

  // Every replica that serves sockets routes a write to the live rooms it holds; the writer has routed its own.
  #fanoutLiveChange(originIdx: number, message: Extract<AkanIpcMessage, { type: "live.change" }>) {
    for (const child of this.#children.values())
      if (child.idx !== originIdx && child.role !== "batch") this.#sendToChild(child, message);
  }

  #fanoutToBatch(message: AkanIpcMessage) {
    for (const child of this.#children.values()) {
      if (child.role === "batch" || child.role === "all") {
        if (this.#sendToChild(child, message) && message.type === "queue.wake") {
          child.metrics.queueWakeCount = (child.metrics.queueWakeCount ?? 0) + 1;
        }
      }
    }
  }

  #sendToChild(child: ChildState, message: AkanIpcMessage | BuilderMessage): boolean {
    if (this.#isChildUnavailable(child)) return false;
    try {
      child.proc.send(message);
      return true;
    } catch (error) {
      this.logger.warn(
        `Failed to send ${message.type} to child ${child.idx}/${child.role}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return false;
    }
  }

  #writeChildLine(idx: number, role: AkanChildRole, pid: number | null, type: "stdout" | "stderr", line: string) {
    if (Logger.isNdjson) {
      this.#logHub?.ingest(ChildOutputReader.toRecord({ type, text: line, name: "child", role, replicaIdx: idx, pid }));
      return;
    }
    const prefixedLine = `[child:${idx} ${role}] [${type}] ${line}`;
    if (type === "stdout" || this.#printChildStderr) process[type].write(prefixedLine);
    this.#logWriter?.write(`${idx}-${role}`, AkanApp.#stripAnsi(prefixedLine));
  }

  // ndjson ignores `AKAN_CHILD_STDERR`: the stack that killed a child is the one record a collector must not miss.
  #writeChildStderrBlock(idx: number, role: AkanChildRole, pid: number | null, lines: string[]) {
    const text = lines.join("");
    if (AkanApp.#isBenignRsdwConnectionClosedBlock(text)) return;
    if (Logger.isNdjson) {
      this.#logHub?.ingest(
        ChildOutputReader.toRecord({ type: "stderr", text, name: "child", role, replicaIdx: idx, pid }),
      );
      return;
    }
    for (const line of lines) this.#writeChildLine(idx, role, pid, "stderr", line);
  }

  static #isBenignRsdwConnectionClosedBlock(text: string): boolean {
    return (
      text.includes('reportGlobalError(weakResponse, Error("Connection closed."))') &&
      text.includes("error: Connection closed.") &&
      text.includes("react-server-dom-webpack")
    );
  }

  static #stripAnsi(msg: string) {
    return msg.replace(AkanApp.#ansiPattern, "");
  }
}
