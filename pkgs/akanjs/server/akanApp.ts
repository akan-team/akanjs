//? First: the modules below may read the env as they load, so the build's defaults must be in it by then.
import "./lifecycle/loadBuildEnv";
import { Logger, TrustedProxy } from "akanjs/common";
import type { AkanIpcMessage } from "akanjs/service";
import { resetEnvCache } from "../base/baseEnv";
import type { BuilderMessage } from "./artifact";
import { ChildSupervisor } from "./gateway/childSupervisor";
import { DevHostChannel } from "./gateway/devHostChannel";
import { GatewayChildren } from "./gateway/gatewayChildren";
import { type AkanAppOptions, GatewayConfig } from "./gateway/gatewayConfig";
import { GatewayHttpProxy } from "./gateway/gatewayHttpProxy";
import { GatewayLogging } from "./gateway/gatewayLogging";
import { GatewayRooms } from "./gateway/gatewayRooms";
import { GatewayStatus } from "./gateway/gatewayStatus";
import { GatewayWebSocketRelay, type GatewayWsData } from "./gateway/gatewayWebSocketRelay";
import { isPortInUseError } from "./lifecycle/portInUse";
import { LogStreamRoute } from "./logging/logStreamRoute";
import { AppInfo } from "./ops/appInfo";
import type { OpsHost } from "./ops/opsCommand";
import type { OpsRoute } from "./ops/opsRoute";
import { StatusAccess } from "./ops/statusAccess";
import { ProcessMetricsCollector } from "./processMetricsCollector";
import { HostAllowlist } from "./routing/hostAllowlist";
import { RouteHosts } from "./routing/routeHosts";
import { ServerLimits } from "./routing/serverLimits";
import { SelfExec } from "./selfExec";

export type { AkanAppOptions } from "./gateway/gatewayConfig";

interface SoloServer {
  start: (options: { listen: boolean }) => Promise<unknown>;
}

export class AkanApp {
  readonly logger = new Logger("AkanApp");
  readonly #config: GatewayConfig;
  readonly #children: GatewayChildren;
  readonly #logging: GatewayLogging;
  readonly #rooms: GatewayRooms;
  readonly #host: DevHostChannel;
  readonly #supervisor: ChildSupervisor;
  readonly #status: GatewayStatus;
  readonly #proxy: GatewayHttpProxy;
  readonly #ws: GatewayWebSocketRelay;
  #server: Bun.Server<GatewayWsData> | null = null;
  #snapshotTimer: Timer | null = null;
  #healthTimer: Timer | null = null;
  #metricsTimer: Timer | null = null;
  #ops: OpsRoute | null = null;
  #hostAllowlist = HostAllowlist.fromEnv();
  readonly #limits = new ServerLimits();
  readonly #statusAccess = StatusAccess.fromEnv();
  #resolveStopped: (() => void) | null = null;
  #exitAfterStop = false;

  constructor(serverPathOrOptions: string | AkanAppOptions = "./server", options: AkanAppOptions = {}) {
    SelfExec.adopt();
    const resolvedOptions = typeof serverPathOrOptions === "string" ? options : serverPathOrOptions;
    const serverPath = typeof serverPathOrOptions === "string" ? serverPathOrOptions : "./server";
    const logger = this.logger;
    const config = new GatewayConfig(serverPath, resolvedOptions);
    const children = new GatewayChildren(logger);
    const logging = new GatewayLogging(config, children, logger);
    const rooms = new GatewayRooms(children, logger);
    const host = new DevHostChannel(children, logger);
    const supervisor = new ChildSupervisor({
      config,
      children,
      rooms,
      logging,
      host,
      logger,
      onMessage: (idx, message, proc) => this.#handleMessage(idx, message, proc),
    });
    const status = new GatewayStatus(config, children, rooms, logger);
    this.#config = config;
    this.#children = children;
    this.#logging = logging;
    this.#rooms = rooms;
    this.#host = host;
    this.#supervisor = supervisor;
    this.#status = status;
    this.#proxy = new GatewayHttpProxy({ config, children, supervisor, status, limits: this.#limits, logger });
    this.#ws = new GatewayWebSocketRelay(config, children);
  }

  async start() {
    if (process.argv[2] === "ops") {
      const { OpsCommand } = await import("./ops/opsCommand");
      process.exit(
        await OpsCommand.run(process.argv.slice(3), { importServer: async () => await this.#importServer() }),
      );
    }
    if (this.#config.solo) return await this.#startSolo();
    if (SelfExec.carried)
      throw new Error(
        "A desktop app's server runs in one process, and this one was asked for a gateway and replicas, which would start with the `bun` on the user's PATH: by `replica` or `solo: false` in main.ts, or by AKAN_SOLO=false, an AKAN_REPLICA other than one traffic replica, or AKAN_COMMAND_TYPE=start in its env. Leave them out of the app the desktop build carries.",
      );
    Logger.role = "gateway";
    await this.#supervisor.prepareRuntimeDir();
    await this.#logging.start();
    await this.#startOps();
    for (let idx = 0; idx < this.#config.replica.total; idx++) this.#supervisor.spawn(idx);
    try {
      this.#listen();
    } catch (error) {
      if (isPortInUseError(error)) {
        const message = `Port ${this.#config.port} is already in use — another \`akan start\` or an orphaned gateway may still be running (try: lsof -ti :${this.#config.port}).`;
        this.logger.error(message);
        this.#host.reportBackendBuildStatus({ ok: false, message });
      }
      await this.stop("listen-failed");
      throw error;
    }
    this.#snapshotTimer = setInterval(() => this.#rooms.requestRoomSnapshots(), 30_000);
    this.#healthTimer = setInterval(() => this.#supervisor.checkHealth(), 2_000);
    this.#metricsTimer ??= ProcessMetricsCollector.startReporting(() => this.#status.reportMetrics());
    process.on("message", (message) => this.#handleHostMessage(message as BuilderMessage));
    process.on("disconnect", () => this.#handleHostDisconnect());
    process.on("SIGINT", () => this.#handleShutdownSignal("SIGINT"));
    process.on("SIGTERM", () => this.#handleShutdownSignal("SIGTERM"));
    await new Promise<void>((resolve) => {
      this.#resolveStopped = resolve;
    });
  }

  // A script boot: replica 0's env, no listener and no parent socket, beside whatever server already serves the app.
  async #importServer() {
    Object.assign(process.env, this.#config.childEnv(0, this.#config.roleOf(0)), { AKAN_COMMAND_TYPE: "script" });
    resetEnvCache();
    return (await import(this.#config.serverPath)) as Awaited<ReturnType<OpsHost["importServer"]>>;
  }

  async #startSolo() {
    const role = this.#config.roleOf(0);
    // A child's env minus `AKAN_CHILD_SOCKET`, whose absence makes `AkanServer` bind `PORT` and own `/_akan/app/*`.
    Object.assign(process.env, this.#config.childEnv(0, role));
    // Anything that read the env before the assignment above cached the prefix it just changed.
    resetEnvCache();
    this.logger.info(`Starting ${role} replica in this process (solo); set AKAN_SOLO=false for the gateway`);
    const mod = (await import(this.#config.serverPath)) as { server?: SoloServer; app?: SoloServer };
    const server = mod.server ?? mod.app;
    if (!server?.start) throw new Error("server.ts must export server or app with start()");
    await server.start({ listen: true });
  }

  async stop(signal = "SIGTERM") {
    if (this.#children.stopping) return;
    this.#children.markStopping();
    for (const timer of [this.#snapshotTimer, this.#healthTimer, this.#metricsTimer]) if (timer) clearInterval(timer);
    this.#snapshotTimer = null;
    this.#healthTimer = null;
    this.#metricsTimer = null;
    this.#server?.stop(true);
    this.#server = null;
    await this.#supervisor.stopAll(signal);
    await this.#logging.stop();
    this.#resolveStopped?.();
    this.#resolveStopped = null;
    if (this.#exitAfterStop) process.exit(0);
  }

  #handleShutdownSignal(signal: NodeJS.Signals) {
    if (this.#children.stopping) process.exit(1);
    this.#exitAfterStop = true;
    void this.stop(signal).catch((error) => {
      this.logger.error(`Failed to shutdown gateway: ${error instanceof Error ? error.message : String(error)}`);
      process.exit(1);
    });
  }

  // Fires when the dev host dies, even by SIGKILL; exiting keeps a stranded tree from blocking the next `akan start`.
  #handleHostDisconnect() {
    if (this.#children.stopping) return;
    this.logger.warn("Host IPC channel closed; shutting down gateway and children");
    this.#exitAfterStop = true;
    setTimeout(() => process.exit(1), GatewayConfig.childShutdownWaitMs() + 5_000);
    void this.stop("ipc-disconnect").catch(() => process.exit(1));
  }

  //* Loaded only when the key is set, so a gateway without an ops channel never evaluates the snapshot code.
  async #startOps() {
    if (!process.env.AKAN_OPS_PUBLIC_KEY?.trim()) return;
    const { OpsRoute } = await import("./ops/opsRoute");
    this.#ops = OpsRoute.fromEnv({
      detail: () => AppInfo.detail({ serverMode: "gateway", solo: false, replicaIdx: null }),
    });
  }

  #listen() {
    //? Replicas declare the route hosts in their own processes, and here, ahead of them, is where Host is checked.
    if (this.#hostAllowlist?.devDefault) RouteHosts.declare(this.#config.artifactDir);
    this.#server = Bun.serve({
      idleTimeout: this.#limits.idleTimeout,
      maxRequestBodySize: this.#limits.uploadBodyBytes,
      port: this.#config.port,
      hostname: ServerLimits.listenHostname(),
      fetch: (req, server) =>
        ServerLimits.holdOpen(server, req, this.#limits.idleTimeout, () => this.#handleFetch(req, server)),
      websocket: {
        idleTimeout: this.#limits.wsIdleTimeout,
        maxPayloadLength: 16 * 1024 * 1024,
        backpressureLimit: 1024 * 1024,
        closeOnBackpressureLimit: true,
        open: (ws) => this.#ws.open(ws),
        message: (ws, message) => this.#ws.message(ws, message),
        close: (ws, code, reason) => this.#ws.close(ws, code, reason),
        data: {} as GatewayWsData,
      },
    });
    this.logger.info(`AkanApp gateway is running on port http://localhost:${this.#config.port}`);
  }

  async #handleFetch(req: Request, server: Bun.Server<GatewayWsData>): Promise<Response | undefined> {
    if (this.#hostAllowlist && !this.#hostAllowlist.allows(req)) return this.#hostAllowlist.refuse();
    const oversized = this.#limits.refuseDeclared(req);
    if (oversized) return oversized;
    const url = new URL(req.url);
    if (url.pathname === "/_akan/app/health")
      return this.#statusAccess.health(req, () => this.#status.healthStatus(), AkanApp.#clientOf(req, server));
    if (url.pathname === "/_akan/app/ready")
      return this.#statusAccess.ready(req, () => this.#status.readyStatus(), AkanApp.#clientOf(req, server));
    if (url.pathname === "/_akan/app/metrics")
      return this.#statusAccess.metrics(req, () => this.#status.metricsStatus(), AkanApp.#clientOf(req, server));
    const logStream = this.#logging.stream;
    if (url.pathname === LogStreamRoute.path && logStream) return logStream.handle(req, AkanApp.#clientOf(req, server));
    if (url.pathname === "/_akan/bench/ping") return new Response("ok");
    if (url.pathname === AppInfo.publicPath) return AppInfo.handlePublic();
    if (this.#ops?.matches(url.pathname)) return await this.#ops.handle(req, AkanApp.#clientOf(req, server));
    if (this.#config.isWebSocketPath(url.pathname)) return this.#ws.upgrade(req, server);
    const assetResponse = await this.#proxy.serveImmutableArtifact(req, url);
    if (assetResponse) return assetResponse;
    return await this.#proxy.proxyHttp(req, server);
  }

  //? The gateway listens on TCP only, so a missing peer is unknown, never the unix-socket hop whose headers count.
  static #clientOf(req: Request, server: Bun.Server<GatewayWsData>) {
    return TrustedProxy.clientAddress(req.headers, server.requestIP(req)?.address);
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
        this.#supervisor.markReady(idx, message);
        return;
      case "pubsub.publish":
        this.#rooms.deliverPubsub(idx, message);
        return;
      case "pubsub.subscribe":
        this.#rooms.addRoomMembership(idx, message.roomId, message.socketId);
        return;
      case "pubsub.unsubscribe":
        this.#rooms.removeRoomMembership(idx, message.roomId, message.socketId);
        return;
      case "pubsub.snapshot":
        this.#rooms.replaceRoomSnapshot(idx, message.rooms);
        if (message.liveModels) this.#rooms.setLiveModels(idx, message.liveModels);
        return;
      case "live.change":
        this.#rooms.fanoutLiveChange(idx, message);
        return;
      case "live.models":
        this.#rooms.setLiveModels(idx, message.models);
        return;
      case "metrics.report":
        this.#children.updateMetrics(idx, message.metrics);
        return;
      case "log.records":
        this.#logging.hub?.ingestMany(message.records);
        if (message.dropped) this.logger.warn(`Child ${idx} dropped ${message.dropped} log records (ipc backpressure)`);
        return;
      case "health.pong":
        this.#supervisor.markHealthy(idx);
        return;
      case "queue.enqueued":
        this.#children.fanoutToBatch({ type: "queue.wake", queue: message.queue, name: message.name });
        return;
      case "error":
        this.logger.error(message.message);
        if (child) child.lastErrorMessage = message.message;
        if (child && proc) void this.#supervisor.scheduleRestart(child, proc, "child-error");
        return;
      case "build-route":
      case "build-csr":
      case "build-graph":
        this.#host.forwardBuilderReq(idx, message);
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
        this.#children.fanoutToFederation(message);
        return;
      case "build-route-res":
      case "build-csr-res":
      case "build-graph-res":
        this.#host.forwardBuilderRes(message);
        return;
    }
  }
}
