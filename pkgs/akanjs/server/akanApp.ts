import { mkdir, readdir, rm } from "node:fs/promises";
import path from "node:path";
import { Logger } from "akanjs/common";
import type { AkanChildRole, AkanChildStatus, AkanIpcMessage, AkanMetricsReport, AkanUpstream } from "akanjs/service";
import { isTraceEnabled } from "akanjs/signal";
import { makeAkanChildProxyHeaders } from "./akanAppHeaders";
import type { BuilderCsrReq, BuilderCsrRes, BuilderMessage, BuilderReq, BuilderRes } from "./artifact";
import { isPortInUseError } from "./lifecycle/portInUse";
import { RotatingLogWriter } from "./logging/rotatingLogWriter";
import { ProcessMetricsCollector } from "./processMetricsCollector";

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

interface GatewayWsData {
  childIdx: number;
  socketId: string;
  upstream: WebSocket;
}

type GatewayUpstream = {
  http: Extract<AkanUpstream, { type: "unix" }>;
  ws?: Extract<AkanUpstream, { type: "tcp" }>;
};

/**
 * Received-only close codes cannot be sent in a close frame. The gateway deliberately normalizes
 * every unsendable code, including semantically distinct 1005 and 1006 events, to 1001 in both
 * relay directions. In particular, Bun's global client `WebSocket.close()` throws an
 * InvalidAccessError for these codes at the client-to-upstream relay; normalization at the
 * upstream-to-client `Bun.ServerWebSocket.close()` relay is defensive and keeps behavior symmetric.
 */
const relayableCloseCode = (code: number): number => {
  if (code >= 3000 && code <= 4999) return code;
  if (code >= 1000 && code <= 1014 && code !== 1004 && code !== 1005 && code !== 1006) return code;
  return 1001;
};

/** Options for the Akan gateway that launches child server replicas and listens for traffic. */
export interface AkanAppOptions {
  replica?: number | string;
  serverPath?: string;
  runtimeDir?: string;
  port?: number;
  wsBasePort?: number;
  openapi?: boolean;
}

interface AkanReplicaConfig {
  federation: number;
  batch: number;
  all: number;
  total: number;
  value: string;
}

/** Gateway/orchestrator that starts Akan child servers and proxies HTTP/WebSocket traffic. */
export class AkanApp {
  static readonly #childRestartBaseDelayMs = 1_000;
  static readonly #childRestartMaxDelayMs = 30_000;
  static readonly #childRestartGraceMs = 5_000;
  /** In dev, stop restarting a replica that never boots after this many consecutive failures. */
  static readonly #devMaxChildBootFailures = 3;

  readonly logger = new Logger("AkanApp");
  /** Hosted by `akan start`: crash loops should yield to the dev host, which restarts on file edits. */
  readonly #devHosted = process.env.AKAN_COMMAND_TYPE === "start";
  readonly #healthTimeoutMs = AkanApp.#parseHealthTimeoutMs();
  readonly #serverPath: string;
  readonly #artifactDir: string;
  readonly #replica: AkanReplicaConfig;
  readonly #runtimeDir: string;
  readonly #socketRunId = `${process.pid}-${Date.now().toString(36)}`;
  readonly #port: number;
  readonly #wsBasePort: number;
  readonly #openapi?: boolean;
  readonly #children = new Map<number, ChildState>();
  readonly #roomChildren = new Map<string, Set<number>>();
  readonly #childRooms = new Map<number, Set<string>>();
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
  #removeLogSink: (() => void) | null = null;
  readonly #childOutputBuffers = new Map<string, string>();
  readonly #childStderrBlockBuffers = new Map<string, string[]>();
  readonly #childStderrBlockTimers = new Map<string, ReturnType<typeof setTimeout>>();
  static readonly #ansiPattern = new RegExp(`${String.fromCharCode(27)}\\[[0-?]*[ -/]*[@-~]`, "g");
  #gatewayMetrics: AkanMetricsReport = {};
  #proxyHopCount = 0;
  #proxyHopSumMs = 0;
  #proxyHopMaxMs = 0;
  #resolveStopped: (() => void) | null = null;
  #exitAfterStop = false;
  #stopping = false;

  constructor(serverPath = "./server", options: AkanAppOptions = {}) {
    const resolvedOptions = options;
    this.#serverPath = AkanApp.#resolveServerPath(resolvedOptions.serverPath ?? serverPath);
    this.#artifactDir = path.resolve(path.dirname(this.#serverPath), ".akan", "artifact");
    this.#replica = AkanApp.#parseReplicaConfig(resolvedOptions.replica);
    this.#runtimeDir = path.resolve(
      resolvedOptions.runtimeDir ??
        process.env.AKAN_RUNTIME_DIR ??
        (process.env.NODE_ENV === "production"
          ? path.resolve(process.cwd(), "runtime")
          : path.resolve(process.cwd(), "local", "apps", process.env.AKAN_PUBLIC_APP_NAME ?? "unknown", "runtime")),
    );
    this.#port = Number(resolvedOptions.port ?? process.env.PORT ?? 8282);
    this.#wsBasePort = Number(resolvedOptions.wsBasePort ?? process.env.AKAN_WS_BASE_PORT ?? this.#port + 10_000);
    this.#openapi = resolvedOptions.openapi;
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
    const federation = AkanApp.#parseReplicaCount(federationRaw, configured == null ? 0 : 0, 0);
    const batch = AkanApp.#parseReplicaCount(batchRaw, configured == null ? 0 : 0, 0);
    const all = AkanApp.#parseReplicaCount(allRaw, configured == null ? 1 : 0, 0);
    const normalizedAll = federation + batch + all > 0 ? all : 1;
    return {
      federation,
      batch,
      all: normalizedAll,
      total: federation + batch + normalizedAll,
      value: `${federation},${batch},${normalizedAll}`,
    };
  }

  static #parseReplicaCount(value: string | undefined, fallback: number, min: number) {
    const parsed = Number.parseInt(value ?? "", 10);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.max(min, parsed);
  }

  static #defaultChildNodeEnv() {
    if (process.env.NODE_ENV) return process.env.NODE_ENV;
    if (process.env.AKAN_COMMAND_TYPE === "start") return "development";
    if (process.env.AKAN_COMMAND_TYPE === "build") return "production";
    return Bun.main.endsWith(".js") ? "production" : "development";
  }

  /**
   * Dev builds and first-touch transpiles can stall a child's event loop well past the production
   * pong budget, so `akan start` runs with a wider timeout to avoid restarting healthy replicas.
   */
  static #parseHealthTimeoutMs() {
    const configured = Number(process.env.AKAN_HEALTH_TIMEOUT_MS);
    if (Number.isFinite(configured) && configured > 0) return configured;
    return process.env.AKAN_COMMAND_TYPE === "start" ? 15_000 : 5_000;
  }

  /**
   * Must exceed the child's own shutdown timeout (see `AkanServer.#defaultShutdownTimeoutMs`) so
   * children always get to exit on their own before this gateway stops waiting.
   */
  static #childShutdownWaitMs() {
    const configured = Number(process.env.AKAN_CHILD_SHUTDOWN_WAIT_MS);
    if (Number.isFinite(configured) && configured > 0) return configured;
    return process.env.AKAN_COMMAND_TYPE === "start" ? 5_000 : 30_000;
  }

  async start() {
    await this.#prepareRuntimeDir();
    this.#startFileLogging();
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
    this.#startMetricsReporting();
    process.on("message", (message) => this.#handleHostMessage(message as BuilderMessage));
    process.on("disconnect", () => this.#handleHostDisconnect());
    process.on("SIGINT", () => this.#handleShutdownSignal("SIGINT"));
    process.on("SIGTERM", () => this.#handleShutdownSignal("SIGTERM"));
    await new Promise<void>((resolve) => {
      // Keep the orchestrator alive while child processes run.
      this.#resolveStopped = resolve;
    });
  }

  async stop(signal = "SIGTERM") {
    if (this.#stopping) return;
    this.#stopping = true;
    if (this.#snapshotTimer) {
      clearInterval(this.#snapshotTimer);
      this.#snapshotTimer = null;
    }
    if (this.#healthTimer) {
      clearInterval(this.#healthTimer);
      this.#healthTimer = null;
    }
    if (this.#metricsTimer) {
      clearInterval(this.#metricsTimer);
      this.#metricsTimer = null;
    }
    this.#server?.stop(true);
    this.#server = null;
    for (const child of this.#children.values()) {
      if (child.restartTimer) {
        clearTimeout(child.restartTimer);
        child.restartTimer = null;
      }
      this.#sendToChild(child, { type: "shutdown", signal } satisfies AkanIpcMessage);
    }
    await Promise.race([
      Promise.all([...this.#children.values()].map((child) => child.proc.exited.catch(() => undefined))),
      new Promise((resolve) => setTimeout(resolve, AkanApp.#childShutdownWaitMs())),
    ]);
    // The graceful path was the shutdown IPC message above; anything still alive after the full
    // budget is stuck (or trapping SIGTERM), so escalate straight to SIGKILL and wait it out.
    const stragglers = [...this.#children.values()].filter((child) => !child.proc.killed);
    for (const child of stragglers) child.proc.kill("SIGKILL");
    await Promise.all(stragglers.map((child) => child.proc.exited.catch(() => undefined)));
    this.#children.clear();
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

  /**
   * The IPC channel closes when the dev host dies (including SIGKILL). Exiting takes the children
   * down too, so a dead host never strands a gateway tree that would block the next `akan start`.
   */
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
    const childCode = `import(${JSON.stringify(path.resolve(this.#serverPath))}).then((mod)=>{ const server = mod.server ?? mod.app; if (!server?.start) throw new Error("server.ts must export server or app with start()"); return server.start({ listen: process.env.SERVER_MODE !== "batch" }); }).catch((error)=>{ process.send?.({ type: "error", message: error instanceof Error ? error.message : String(error), stack: error instanceof Error ? error.stack : undefined, pid: process.pid }); process.exit(1); });`;
    let proc!: Bun.Subprocess<"ignore", "pipe", "pipe">;
    proc = Bun.spawn(["bun", "-e", childCode], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        NODE_ENV: AkanApp.#defaultChildNodeEnv(),
        AKAN_REPLICA: this.#replica.value,
        AKAN_REPLICA_IDX: String(idx),
        AKAN_APP_DIR: path.dirname(this.#serverPath),
        SERVER_MODE: role,
        AKAN_CHILD_SOCKET: upstream.http.socketPath,
        AKAN_CHILD_WS_PORT: upstream.ws ? String(upstream.ws.port) : "",
        ...(this.#openapi === undefined ? {} : { AKAN_OPENAPI: this.#openapi ? "true" : "false" }),
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
    this.#invalidateFederationChildCache();
    this.#pipeOutput(idx, role, proc.stdout, "stdout");
    this.#pipeOutput(idx, role, proc.stderr, "stderr");
    proc.exited.then((code) => this.#handleChildExit(idx, proc, code));
  }

  #handleChildExit(idx: number, proc: Bun.Subprocess<"ignore", "pipe", "pipe">, code: number | null) {
    const child = this.#children.get(idx);
    if (!child || child.proc !== proc) return;
    if (child.status === "crashed") return;
    child.status = "exited";
    child.lastExitCode = code;
    this.#invalidateFederationChildCache();
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
    this.#invalidateFederationChildCache();
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

  /**
   * Dev-only terminal state: the same broken code fails every boot, so retrying is pure churn.
   * The dev host replaces this whole gateway on the next server-side edit, which clears the state.
   */
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
    this.#invalidateFederationChildCache();
    this.#removeChildRooms(child.idx);
    const attempts = child.restartAttempts + 1;
    const detail = child.lastErrorMessage ?? reason;
    const message = `Backend replica ${child.idx}/${child.role} failed ${attempts} consecutive boots; waiting for a code change to retry: ${detail}`;
    this.logger.error(`[child-crash-loop] ${message}`);
    this.#reportBackendBuildStatus({ ok: false, message });
  }

  /** Forwards a backend-phase build status to the dev host so failures reach the HMR overlay. */
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
    if (!proc.killed) {
      this.#sendToChild(child, { type: "shutdown", signal: reason } satisfies AkanIpcMessage);
    }
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
    // Socket names are run-scoped, so leftovers from crashed runs never conflict — but they also
    // never get reused; sweep them all instead of only this run's paths.
    const entries = await readdir(this.#runtimeDir).catch(() => []);
    await Promise.all(
      entries
        .filter((name) => /^akan-child-.*\.sock$/.test(name))
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
    if (!this.#logWriter) return;
    this.#removeLogSink = Logger.addSink((entry) => {
      this.#logWriter?.write("gateway", entry.plainMessage);
    });
  }

  async #stopFileLogging() {
    this.#removeLogSink?.();
    this.#removeLogSink = null;
    const writer = this.#logWriter;
    this.#logWriter = null;
    await writer?.close();
  }

  #listen() {
    this.#server = Bun.serve({
      idleTimeout: 0,
      port: this.#port,
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
    const url = new URL(req.url);
    if (url.pathname === "/_akan/app/health") return Response.json(this.#getHealthStatus());
    if (url.pathname === "/_akan/app/metrics") return Response.json(this.#getMetricsStatus());
    if (url.pathname === "/_akan/bench/ping") return new Response("ok");
    if (this.#isWebSocketPath(url.pathname)) return this.#upgradeWebSocket(req, server);
    const assetResponse = await this.#serveImmutableArtifact(req, url);
    if (assetResponse) return assetResponse;
    return await this.#proxyHttp(req);
  }

  #isWebSocketPath(pathname: string) {
    return pathname === "/api/ws" || pathname === "/_akan/hmr";
  }

  async #serveImmutableArtifact(req: Request, url: URL): Promise<Response | null> {
    const clientPrefix = "/_akan/client/";
    if (url.pathname.startsWith(clientPrefix)) {
      const filePath = this.#safeResolve(
        path.join(this.#artifactDir, "client"),
        url.pathname.slice(clientPrefix.length),
      );
      if (!filePath) return new Response("Not Found", { status: 404 });
      const file = Bun.file(filePath);
      if (!(await file.exists())) return new Response("Not Found", { status: 404 });
      return this.#fileResponse(req, filePath, {
        contentType: file.type || "application/javascript",
        cacheControl: "public, max-age=31536000, immutable",
      });
    }

    for (const prefix of ["/_akan/styles/", "/_akan/fonts/"]) {
      if (!url.pathname.startsWith(prefix)) continue;
      const filePath = this.#safeResolve(this.#artifactDir, url.pathname.slice("/_akan/".length));
      if (!filePath) return new Response("Not Found", { status: 404 });
      const file = Bun.file(filePath);
      if (!(await file.exists())) return new Response("Not Found", { status: 404 });
      return this.#fileResponse(req, filePath, {
        contentType: file.type || (prefix === "/_akan/styles/" ? "text/css; charset=utf-8" : "font/woff2"),
        cacheControl: "public, max-age=31536000, immutable",
      });
    }

    return null;
  }

  #upgradeWebSocket(req: Request, server: Bun.Server<GatewayWsData>): Response | undefined {
    const child = this.#pickFederationChild();
    // Prefer the ws upstream the child actually bound (it may have fallen back from the preferred
    // port); the computed port is only a fallback for children that predate wsUpstream reporting.
    const upstream = child?.upstream ? (child.wsUpstream ?? this.#getChildUpstream(child.idx, child.role).ws) : null;
    if (!child || !upstream) return new Response("No websocket upstream is ready", { status: 503 });
    const url = new URL(req.url);
    const upstreamWs = new WebSocket(`ws://${upstream.host}:${upstream.port}${url.pathname}${url.search}`, {
      headers: this.#makeProxyHeaders(req, child.idx),
    } as unknown as string[]);
    const socketId = crypto.randomUUID();
    const upgraded = server.upgrade(req, { data: { childIdx: child.idx, socketId, upstream: upstreamWs } });
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
    upstream.addEventListener("close", (event) => ws.close(relayableCloseCode(event.code), event.reason));
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

  async #proxyHttp(req: Request): Promise<Response> {
    const child = this.#pickFederationChild();
    if (!child?.upstream || child.upstream.type !== "unix") {
      return this.#respondWithCrashPage(req) ?? new Response("No healthy federation child is ready", { status: 503 });
    }
    const url = new URL(req.url);
    const upstreamUrl = `http://akan-child${url.pathname}${url.search}`;
    const headers = this.#makeProxyHeaders(req, child.idx);
    child.metrics.activeRequests = (child.metrics.activeRequests ?? 0) + 1;
    child.metrics.totalRequests = (child.metrics.totalRequests ?? 0) + 1;
    const traced = isTraceEnabled();
    const hopStart = traced ? performance.now() : 0;
    try {
      const upstreamRes = await fetch(upstreamUrl, {
        unix: child.upstream.socketPath,
        method: req.method,
        headers,
        body: req.method === "GET" || req.method === "HEAD" ? undefined : req.body,
        signal: req.signal,
        redirect: "manual",
      });
      return this.#proxyResponse(upstreamRes);
    } catch (error) {
      if (AkanApp.#isUpstreamOpenFailure(error)) {
        this.logger.error(
          `Child ${child.idx}/${child.role} upstream is unreachable (${child.upstream.socketPath}); restarting`,
        );
        this.#scheduleChildRestart(child, child.proc, "upstream-open-failed");
        return new Response("Federation child upstream is unreachable; restarting", { status: 503 });
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

  /**
   * Dev-only: every traffic replica is in the crashed terminal state, so a bare 503 would hide the
   * boot error from the browser. Surface it, and reload once a fixed gateway takes over the port.
   */
  #respondWithCrashPage(req: Request): Response | null {
    if (!this.#devHosted) return null;
    const trafficChildren = [...this.#children.values()].filter((child) => child.role !== "batch");
    if (trafficChildren.length === 0) return null;
    if (!trafficChildren.every((child) => child.status === "crashed")) return null;
    const detail =
      trafficChildren.map((child) => child.lastErrorMessage ?? child.lastRestartReason).find(Boolean) ??
      "unknown boot error";
    const message = `Backend failed to start after ${AkanApp.#devMaxChildBootFailures} boot attempts: ${detail}`;
    if (!req.headers.get("accept")?.includes("text/html")) {
      return new Response(message, { status: 503, headers: { "cache-control": "no-store" } });
    }
    const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>Backend failed to start</title>
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
<h1>Backend failed to start</h1>
<pre>${AkanApp.#escapeHtml(detail)}</pre>
<p>The dev server stopped retrying after ${AkanApp.#devMaxChildBootFailures} failed boots. Fix the error and save &mdash; this page reloads automatically.</p>
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
    return new Response(html, {
      status: 503,
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
    });
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

  /**
   * Gateway-observed upstream round-trip time. The pure proxy overhead is this value
   * minus the child handler time captured in the per-request trace.
   */
  #recordProxyHop(durationMs: number) {
    this.#proxyHopCount += 1;
    this.#proxyHopSumMs += durationMs;
    this.#proxyHopMaxMs = Math.max(this.#proxyHopMaxMs, durationMs);
  }

  #proxyResponse(upstreamRes: Response): Response {
    const headers = new Headers(upstreamRes.headers);
    // Bun fetch transparently decompresses upstream bodies but keeps these
    // headers, which makes browsers try to decode an already-decoded payload.
    headers.delete("content-encoding");
    headers.delete("content-length");
    this.#rewriteInternalLocation(headers);
    return new Response(upstreamRes.body, {
      status: upstreamRes.status,
      statusText: upstreamRes.statusText,
      headers,
    });
  }

  #rewriteInternalLocation(headers: Headers) {
    const location = headers.get("location");
    if (!location) return;
    try {
      const parsed = new URL(location);
      if (parsed.hostname === "akan-child") headers.set("location", `${parsed.pathname}${parsed.search}${parsed.hash}`);
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

    const gzipPath = `${filePath}.gz`;
    if (this.#acceptsGzip(req) && this.#isCompressible(options.contentType)) {
      const gzipFile = Bun.file(gzipPath);
      if (await gzipFile.exists()) {
        const gzipBytes = await gzipFile.bytes();
        headers.set("Content-Encoding", "gzip");
        headers.set("Content-Length", String(gzipBytes.byteLength));
        headers.set("Vary", "Accept-Encoding");
        return new Response(this.#toArrayBuffer(gzipBytes), { headers });
      }
    }

    return new Response(Bun.file(filePath).stream(), { headers });
  }

  #acceptsGzip(req: Request): boolean {
    const acceptEncoding = req.headers.get("accept-encoding") ?? "";
    return /\bgzip\b/.test(acceptEncoding);
  }

  #isCompressible(contentType: string): boolean {
    const type = contentType.split(";")[0]?.trim().toLowerCase() ?? "";
    return (
      type.startsWith("text/") ||
      type === "application/javascript" ||
      type === "application/json" ||
      type === "application/manifest+json" ||
      type === "image/svg+xml"
    );
  }

  #toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  }

  #safeResolve(baseDir: string, urlPath: string): string | null {
    let decoded: string;
    try {
      decoded = decodeURIComponent(urlPath);
    } catch {
      return null;
    }
    if (decoded.includes("\0")) return null;
    const normalizedBase = path.resolve(baseDir);
    const rel = decoded.replace(/^[/\\]+/, "");
    const resolved = path.resolve(normalizedBase, rel);
    if (resolved === normalizedBase) return resolved;
    const baseWithSep = normalizedBase.endsWith(path.sep) ? normalizedBase : `${normalizedBase}${path.sep}`;
    if (!resolved.startsWith(baseWithSep)) return null;
    return resolved;
  }

  #makeProxyHeaders(req: Request, childIdx: number) {
    return makeAkanChildProxyHeaders(req, childIdx);
  }

  #invalidateFederationChildCache() {
    this.#federationChildCache = null;
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
      case "metrics.report":
        this.#updateMetrics(idx, message.metrics);
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
    child.lastPongAtMono = performance.now();
    child.restartAttempts = 0;
    child.restartPending = false;
    child.lastErrorMessage = undefined;
    this.#invalidateFederationChildCache();
    // Batch children serve no HTTP/HMR traffic, so they must not gate frontend readiness.
    const trafficChildren = [...this.#children.values()].filter((item) => item.role !== "batch");
    if (child.role !== "batch" && trafficChildren.every((item) => item.ready)) {
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
    this.#invalidateFederationChildCache();
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

    const childRooms = this.#childRooms.get(childIdx) ?? new Set<string>();
    childRooms.add(roomId);
    this.#childRooms.set(childIdx, childRooms);

    if (socketId) {
      const socketRooms = this.#socketRooms.get(socketId) ?? { childIdx, rooms: new Set<string>() };
      socketRooms.rooms.add(roomId);
      this.#socketRooms.set(socketId, socketRooms);
    }
  }

  #removeRoomMembership(childIdx: number, roomId: string, socketId?: string) {
    const roomChildren = this.#roomChildren.get(roomId);
    roomChildren?.delete(childIdx);
    if (roomChildren?.size === 0) this.#roomChildren.delete(roomId);

    const childRooms = this.#childRooms.get(childIdx);
    childRooms?.delete(roomId);
    if (childRooms?.size === 0) this.#childRooms.delete(childIdx);

    if (socketId) {
      const socketRooms = this.#socketRooms.get(socketId);
      socketRooms?.rooms.delete(roomId);
      if (!socketRooms || socketRooms.rooms.size === 0) this.#socketRooms.delete(socketId);
    }
  }

  #replaceRoomSnapshot(childIdx: number, rooms: string[]) {
    for (const roomId of this.#childRooms.get(childIdx) ?? []) {
      const roomChildren = this.#roomChildren.get(roomId);
      roomChildren?.delete(childIdx);
      if (roomChildren?.size === 0) this.#roomChildren.delete(roomId);
    }
    this.#childRooms.set(childIdx, new Set());
    for (const roomId of rooms) this.#addRoomMembership(childIdx, roomId);
  }

  #removeChildRooms(childIdx: number) {
    for (const roomId of this.#childRooms.get(childIdx) ?? []) {
      const roomChildren = this.#roomChildren.get(roomId);
      roomChildren?.delete(childIdx);
      if (roomChildren?.size === 0) this.#roomChildren.delete(roomId);
    }
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

  #startMetricsReporting() {
    if (this.#metricsTimer) return;
    const report = () => {
      void this.#reportMetrics();
    };
    report();
    this.#metricsTimer = setInterval(report, ProcessMetricsCollector.parseMemoryLogIntervalMs());
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
        this.#invalidateFederationChildCache();
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
        this.#invalidateFederationChildCache();
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

  async #pipeOutput(
    idx: number,
    role: AkanChildRole,
    stream: ReadableStream<Uint8Array> | null,
    type: "stdout" | "stderr",
  ) {
    if (!stream) return;
    const bufferKey = `${idx}:${type}`;
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        const text = decoder.decode(value, { stream: true });
        this.#writeChildOutput(idx, role, type, bufferKey, text);
      }
      const remaining = decoder.decode();
      if (remaining) this.#writeChildOutput(idx, role, type, bufferKey, remaining);
    } finally {
      this.#flushChildOutput(idx, role, type, bufferKey);
      if (type === "stderr") this.#flushChildStderrBlock(idx, role, AkanApp.#childStderrBlockKey(idx, role));
    }
  }

  #writeChildOutput(idx: number, role: AkanChildRole, type: "stdout" | "stderr", bufferKey: string, text: string) {
    let buffered = `${this.#childOutputBuffers.get(bufferKey) ?? ""}${text}`;
    for (;;) {
      const newlineIdx = buffered.indexOf("\n");
      if (newlineIdx === -1) break;
      const line = buffered.slice(0, newlineIdx + 1);
      buffered = buffered.slice(newlineIdx + 1);
      this.#writeChildOutputLine(idx, role, type, line);
    }
    if (buffered) this.#childOutputBuffers.set(bufferKey, buffered);
    else this.#childOutputBuffers.delete(bufferKey);
  }

  #flushChildOutput(idx: number, role: AkanChildRole, type: "stdout" | "stderr", bufferKey: string) {
    const buffered = this.#childOutputBuffers.get(bufferKey);
    if (!buffered) return;
    this.#childOutputBuffers.delete(bufferKey);
    this.#writeChildOutputLine(idx, role, type, `${buffered}\n`);
  }

  #writeChildOutputLine(idx: number, role: AkanChildRole, type: "stdout" | "stderr", line: string) {
    if (type === "stderr" && this.#bufferChildStderrLine(idx, role, line)) return;
    this.#writeChildOutputLineRaw(idx, role, type, line);
  }

  #writeChildOutputLineRaw(idx: number, role: AkanChildRole, type: "stdout" | "stderr", line: string) {
    const prefixedLine = `[child:${idx} ${role}] [${type}] ${line}`;
    process[type].write(prefixedLine);
    this.#logWriter?.write(`${idx}-${role}`, AkanApp.#stripAnsi(prefixedLine));
  }

  #bufferChildStderrLine(idx: number, role: AkanChildRole, line: string): boolean {
    const key = AkanApp.#childStderrBlockKey(idx, role);
    const block = this.#childStderrBlockBuffers.get(key) ?? [];
    block.push(line);
    this.#childStderrBlockBuffers.set(key, block);

    const existingTimer = this.#childStderrBlockTimers.get(key);
    if (existingTimer) clearTimeout(existingTimer);

    if (line.trim() === "" || block.length >= 64) {
      this.#flushChildStderrBlock(idx, role, key);
      return true;
    }

    this.#childStderrBlockTimers.set(
      key,
      setTimeout(() => this.#flushChildStderrBlock(idx, role, key), 50),
    );
    return true;
  }

  #flushChildStderrBlock(idx: number, role: AkanChildRole, key: string) {
    const timer = this.#childStderrBlockTimers.get(key);
    if (timer) clearTimeout(timer);
    this.#childStderrBlockTimers.delete(key);

    const block = this.#childStderrBlockBuffers.get(key);
    if (!block?.length) return;
    this.#childStderrBlockBuffers.delete(key);

    const text = block.join("");
    if (AkanApp.#isBenignRsdwConnectionClosedBlock(text)) return;
    for (const blockLine of block) this.#writeChildOutputLineRaw(idx, role, "stderr", blockLine);
  }

  static #childStderrBlockKey(idx: number, role: AkanChildRole): string {
    return `${idx}:${role}:stderr`;
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
