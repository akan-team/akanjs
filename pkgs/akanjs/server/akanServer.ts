import type { AkanWebConfig, AkanWebOption } from "akanjs";
import { type BackendEnv, type BaseEnv, getEnv } from "akanjs/base";
import { Logger, websocketBinaryFrameContract } from "akanjs/common";
import { DictionaryLookup } from "akanjs/dictionary";
import type {
  Adaptor,
  AdaptorCls,
  AkanIpcMessage,
  AkanMetricsReport,
  DatabaseConfig,
  Service,
  ServiceCls,
  SolidConfig,
} from "akanjs/service";
import type { ServerSignal, ServerSignalCls, WebsocketPublishData } from "akanjs/signal";
import { AgentRelayAccess } from "../signal/guards";
import { createOpenApiDocument } from "../signal/openapi";
import { FetchSerializer } from "../signal/serializer";
import { SignalContext } from "../signal/signalContext";
import type { AkanLib, AkanLibProps } from "./akanLib";
import type { BuilderRpc } from "./artifact";
import { BinaryPubsub } from "./binaryPubsub";
import { DevtoolsRouter } from "./devtools";
import { DiLifecycle } from "./di/diLifecycle";
import type { HmrWsData, HmrWsHub } from "./hmr/wsHub";
import { isPortInUseError } from "./lifecycle/portInUse";
import { resolveRuntimeDir } from "./lifecycle/runtimeDir";
import { ShutdownManager } from "./lifecycle/shutdownManager";
import { RotatingLogWriter } from "./logging/rotatingLogWriter";
import { type McpAuthOption, McpRouter } from "./mcp";
import { ProcessMetricsCollector } from "./processMetricsCollector";
import { WebProxyRunner } from "./proxy";
import { SignalResolver } from "./resolver";
import { ApiRouter } from "./routing/apiRouter";
import type { AppWsData } from "./routing/appWsData";
import { createSoloAppRoutes } from "./routing/soloAppRoutes";
import {
  getWebConfigFromEnv,
  type HttpRoutes,
  type LocalPublish,
  type SignalRoutes,
  type WebsocketRoutes,
} from "./types";
import type { WebRouter } from "./webRouter";

export interface AkanServerProps extends AkanLibProps {
  env?: BackendEnv;
  prefix?: string;
  websocketPrefix?: string;
  openapi?: boolean;
}

export interface AkanServerOptions {
  openapi?: boolean;
  /** `/mcp` is mounted by default; `false` takes it off, and the object form carries the rest of its settings. */
  mcp?: boolean | McpServerOption;
  /**
   * Boot only these modules and the ones they reach; every other module stays out of the container, so its
   * services, signals, routes and schedules do not exist. Omitted or empty mounts every enabled module.
   */
  modules?: string[];
}

export interface McpServerOption {
  enabled?: boolean;
  /**
   * Drops every mutation from the catalogue whatever its guards allow — for a deployment that must not be able to
   * write, such as a read replica or a demo. Off by default, and reported per endpoint in the boot log, because a
   * switch that silently unlists a published endpoint cannot tell its author why it vanished.
   */
  readOnly?: boolean;
  /**
   * Mount path, `/mcp` by default. The published OAuth resource identifier follows it, so changing it changes
   * the `aud` a token has to carry.
   */
  path?: string;
  /** Reported as `serverInfo.version`. Defaults to `0.0.0`, the same placeholder the OpenAPI document uses. */
  version?: string;
  /**
   * Free-text usage guidance handed to the model alongside the tool list — the one place to say what this app
   * is for and which tool to reach for first. Defaults to a bare one-liner naming the app.
   */
  instructions?: string;
  /**
   * Extra origins allowed past the DNS-rebinding check, beyond the server's own host. Needed only for a
   * browser-hosted MCP client; native ones send no `Origin` at all.
   */
  allowedOrigins?: string[];
  /** Entries per catalogue page. A client that wants the whole list follows `nextCursor` until it stops. */
  pageSize?: number;
  /**
   * The one language the catalogue and its error text are written in, `en` by default. Server-wide on purpose:
   * the document is built once at boot and cached by clients, and it is read by a model rather than by a person.
   */
  language?: string;
  /**
   * Whether a structured result also ships as serialized JSON in the text block, `true` by default because that
   * is what the spec asks of a server for clients that predate `structuredContent`. It is also a flat doubling:
   * every model-returning tool sends its whole payload twice, so a deployment whose clients read the structured
   * half turns this off and halves what each of those calls costs the model. `AKAN_MCP_LEGACY_TEXT=false`.
   */
  legacyTextBlock?: boolean;
  /** OAuth resource-server identity: which issuers a client may authenticate with, and the scopes to demand. */
  auth?: McpAuthOption;
}

interface AkanAppPrepared {
  routes: SignalRoutes["routes"];
  routeOptions: SignalRoutes["routeOptions"];
  wsRoutes: WebsocketRoutes;
  builtinRoutes: HttpRoutes;
  renderEnvRoutes: HttpRoutes;
  hmrHub: HmrWsHub | null;
  builderRpc: BuilderRpc | null;
  webRouter: WebRouter | null;
  webProxyRunner: WebProxyRunner | null;
}

export interface AkanServerConsoleInfo {
  name: string;
  status: AkanServer["status"];
  serverMode: AkanServer["serverMode"];
  env: Pick<BaseEnv, "appName" | "environment" | "operationMode" | "repoName" | "serveDomain" | "databaseMode">;
  services: string[];
  signals: string[];
  adaptors: string[];
  uses: string[];
  serviceStages: string[][];
  adaptorStages: string[][];
}

export class AkanServer {
  status: "stopped" | "initializing" | "initialized" | "starting" | "running" | "stopping" = "stopped";
  // Union the app-signal data shape with the HMR channel's data shape so
  // `server.upgrade(...)` type-checks for both.
  #server: Bun.Server<AppWsData | HmrWsData> | null = null;
  #wsServer: Bun.Server<AppWsData | HmrWsData> | null = null;
  #prepared: AkanAppPrepared | null = null;
  readonly logger: Logger;
  readonly name: string;
  readonly libs: AkanLib[];
  readonly env: BackendEnv;
  prefix = "/api";
  websocketPrefix = "/ws";
  openapi = AkanServer.#isOpenApiEnvEnabled();
  mcp = AkanServer.#isEnvOn("AKAN_MCP", "AKAN_PUBLIC_MCP");
  mcpReadOnly = AkanServer.#isEnvEnabled("AKAN_MCP_READONLY", "AKAN_PUBLIC_MCP_READONLY");
  mcpAuth: McpAuthOption = AkanServer.#mcpAuthFromEnv();
  mcpOption: Omit<McpServerOption, "enabled" | "readOnly" | "auth"> = AkanServer.#mcpOptionFromEnv();
  serverMode: "federation" | "batch" | "all";
  /** Resolved at `init`: what this process actually serves, after env and artifact availability. */
  web: AkanWebConfig = getWebConfigFromEnv();
  modules: string[];
  shutdownTimeoutMs = AkanServer.#defaultShutdownTimeoutMs();

  #di: DiLifecycle;
  #localPublish: LocalPublish | null = null;
  readonly #binaryPubsub = new BinaryPubsub();
  #metricsTimer: Timer | null = null;
  /**
   * No gateway socket means nothing is proxying this process, so it owns the whole surface: the
   * `/_akan/app/*` observability routes the gateway would have answered, and the rotating log file the
   * gateway would have written. Derived rather than declared — a spawned child always carries the socket,
   * so the two modes cannot disagree about which one this is.
   */
  readonly #solo = !process.env.AKAN_CHILD_SOCKET;
  #logWriter: RotatingLogWriter | null = null;
  #removeLogSink: (() => void) | null = null;
  #lastMetrics: AkanMetricsReport = {};
  constructor(
    name = "AkanServer",
    env: BackendEnv = {},
    serverMode: "federation" | "batch" | "all" = (process.env.SERVER_MODE as
      | "federation"
      | "batch"
      | "all"
      | undefined) ?? "all",
    ...libsOrOptions: (AkanLib | AkanServerOptions)[]
  ) {
    const { libs, options } = AkanServer.#splitLibsAndOptions(libsOrOptions);
    this.name = name;
    this.logger = new Logger(name);
    this.libs = libs;
    this.env = { ...env };
    this.openapi = options?.openapi ?? this.openapi;
    // Each lib's `option.ts` in mount order, the app's last, and an option passed here over all of them.
    libs.forEach((lib) => {
      const mcp = lib.option.getMcp();
      if (mcp !== undefined) this.setMcp(mcp);
      const agentAccess = lib.option.getAgentAccess();
      if (agentAccess !== undefined) AgentRelayAccess.use(agentAccess);
    });
    this.setMcp(options?.mcp ?? this.mcp);
    this.serverMode = serverMode;
    // `AKAN_MODULES` is how a gateway hands its own `modules` option to the child that mounts the container.
    this.modules = options?.modules ?? AkanServer.#envList("AKAN_MODULES") ?? [];
    this.#di = new DiLifecycle({ env: this.env, modules: this.modules }, ...libs);
  }
  setPrefix(prefix: string) {
    this.prefix = prefix;
    return this;
  }
  setWebsocketPrefix(websocketPrefix: string) {
    this.websocketPrefix = websocketPrefix;
    return this;
  }
  setOpenApi(openapi = true) {
    if (this.status !== "stopped") throw new Error("OpenAPI config must be set before app initialization.");
    this.openapi = openapi;
    return this;
  }
  /** Narrows the web surface this process serves. Never widens it past what the build produced. */
  setWeb(web: AkanWebOption = true) {
    if (this.status !== "stopped") throw new Error("Web config must be set before app initialization.");
    this.web = AkanServer.#narrowWeb(this.web, web);
    return this;
  }
  setMcp(mcp: boolean | McpServerOption = true) {
    if (this.status !== "stopped") throw new Error("MCP config must be set before app initialization.");
    this.mcp = typeof mcp === "boolean" ? mcp : (mcp.enabled ?? true);
    if (typeof mcp === "boolean") return this;
    const { enabled: _enabled, readOnly, auth, ...rest } = mcp;
    if (readOnly !== undefined) this.mcpReadOnly = readOnly;
    if (auth) this.mcpAuth = { ...this.mcpAuth, ...AkanServer.#defined(auth) };
    this.mcpOption = { ...this.mcpOption, ...AkanServer.#defined(rest) };
    return this;
  }
  setDatabaseConfig(database: DatabaseConfig) {
    if (this.status !== "stopped") throw new Error("Database config must be set before app initialization.");
    this.env.database = database;
    return this;
  }
  setSolidConfig(solid: SolidConfig) {
    if (this.status !== "stopped") throw new Error("Solid config must be set before app initialization.");
    this.env.solid = solid;
    return this;
  }
  setShutdownTimeout(timeoutMs: number) {
    this.shutdownTimeoutMs = timeoutMs;
    return this;
  }

  get<Srv extends ServiceCls>(cls: Srv): InstanceType<Srv>;
  get<Sig extends ServerSignalCls>(cls: Sig): InstanceType<Sig>;
  get<Adp extends AdaptorCls>(cls: Adp): InstanceType<Adp>;
  get(cls: ServiceCls | ServerSignalCls | AdaptorCls): Service | ServerSignal | Adaptor {
    this.#assertCanGet();
    return this.#di.getByClass(cls);
  }

  getService<T = Service>(refName: string): T {
    this.#assertCanGet("Service", refName);
    return this.#di.getService<T>(refName);
  }

  getSignal<T = ServerSignal>(refName: string): T {
    this.#assertCanGet("Server signal", refName);
    return this.#di.getSignal<T>(refName);
  }

  getAdaptor<T = Adaptor>(refName: string): T {
    this.#assertCanGet("Adaptor", refName);
    return this.#di.getAdaptor<T>(refName);
  }

  inspectConsole(): AkanServerConsoleInfo {
    this.#assertCanGet();
    const env = getEnv();
    return {
      name: this.name,
      status: this.status,
      serverMode: this.serverMode,
      env: {
        appName: env.appName,
        environment: env.environment,
        operationMode: env.operationMode,
        repoName: env.repoName,
        serveDomain: env.serveDomain,
        databaseMode: env.databaseMode,
      },
      services: [...this.#di.registry.serviceCls.keys()].sort((a, b) => a.localeCompare(b)),
      signals: [...this.#di.registry.serverSignalCls.keys()].sort((a, b) => a.localeCompare(b)),
      adaptors: [...this.#di.registry.adaptorCls.keys()].sort((a, b) => a.localeCompare(b)),
      uses: [...this.#di.registry.uses.keys()].sort((a, b) => a.localeCompare(b)),
      serviceStages: this.#di.hierarchy.serviceStages.map((stage) => [...stage]),
      adaptorStages: this.#di.hierarchy.adaptorStages.map((stage) => [...stage]),
    };
  }

  async init({ routes: initRoutes = true, web }: { routes?: boolean; web?: AkanWebOption } = {}) {
    if (this.status !== "stopped") throw new Error("AkanServer is not able to init. It is already running.");
    this.status = "initializing";
    const { routes, wsRoutes, routeOptions } = await this.#di.initializeAll();
    if (!initRoutes) {
      this.#prepared = null;
      this.status = "initialized";
      return this;
    }
    const requestedWeb = AkanServer.#narrowWeb(this.web, web);
    const noWeb = () => {
      this.#prepared = {
        routes,
        routeOptions,
        wsRoutes,
        builtinRoutes: this.#createBuiltinRoutes(),
        renderEnvRoutes: {},
        hmrHub: null,
        builderRpc: null,
        webRouter: null,
        webProxyRunner: null,
      };
      this.status = "initialized";
      return this;
    };
    if (!requestedWeb.ssr) {
      this.web = requestedWeb;
      this.logger.info("web off: serving api only (AKAN_SSR=false, or a build with `web: false`)");
      return noWeb();
    }
    const { WebRouter } = await import("./webRouter");
    const webRouter = await WebRouter.create({
      web: requestedWeb,
      upgradeHmrWs: (req, data) => this.#server?.upgrade(req, { data }) ?? false,
    });
    // A build that excluded the web artifacts leaves nothing to serve. Boot the api rather than crashing on
    // the missing artifact, and say so once — the alternative is a replica that restart-loops for a reason
    // only the build log carries.
    if (!webRouter) {
      this.web = { ssr: false, csr: false };
      this.logger.warn("web off: no build artifact under .akan/artifact; serving api only");
      return noWeb();
    }
    this.web = webRouter.web;
    this.logger.verbose(`web on: ssr=${this.web.ssr} csr=${this.web.csr}`);
    const { renderEnvRoutes, hmrHub, builderRpc } = await webRouter.initializeRoute();
    const webProxyRunner = WebProxyRunner.create(this.#di.webProxies);
    this.#prepared = {
      routes,
      routeOptions,
      wsRoutes,
      builtinRoutes: this.#createBuiltinRoutes(),
      renderEnvRoutes,
      hmrHub,
      builderRpc,
      webRouter,
      webProxyRunner,
    };
    this.status = "initialized";
    return this;
  }

  async listen() {
    if (this.status !== "initialized" || !this.#prepared) {
      throw new Error("AkanServer is not able to listen. Call `init` first.");
    }
    this.status = "starting";
    this.#startFileLogging();
    const port = process.env.AKAN_CHILD_SOCKET
      ? undefined
      : Number(process.env.AKAN_CHILD_WS_PORT || process.env.PORT || 8282);
    const unix = process.env.AKAN_CHILD_SOCKET || undefined;
    this.logger.verbose(`${this.name} is serving on ${unix ? `unix://${unix}` : `port ${port}`}`);
    const { routes, routeOptions, wsRoutes, builtinRoutes, renderEnvRoutes, hmrHub, webRouter, webProxyRunner } =
      this.#prepared;
    const websocketHandlers = {
      ...ApiRouter.buildWebsocketHandlers({
        wsRoutes,
        registry: this.#di.registry,
        hmrHub,
        hmrState: webRouter ? { state: webRouter.renderState } : null,
        logger: this.logger,
        onDrain: () => this.#binaryPubsub.flush(),
      }),
      // `data` is typed by the upgrade call site; the runtime default is unused.
      data: {},
    } as Bun.WebSocketHandler<AppWsData | HmrWsData>;
    // `builderRpc` lives in `#prepared` only so `stop()` can dispose it.
    this.#server = Bun.serve({
      idleTimeout: 0,
      ...(unix ? { unix } : { port }),
      routes: ApiRouter.buildRoutes({
        prefix: this.prefix,
        websocketPrefix: this.websocketPrefix,
        routes,
        builtinRoutes,
        routeOptions,
        renderEnvRoutes,
        upgradeAppWs: (req, data) => this.#server?.upgrade(req, { data }) ?? false,
        webProxyRunner,
      }),
      websocket: websocketHandlers,
    } as Parameters<typeof Bun.serve>[0]);
    if (unix && process.env.AKAN_CHILD_WS_PORT) {
      const preferredWsPort = Number(process.env.AKAN_CHILD_WS_PORT);
      const wsServeOptions = (port: number) => ({
        idleTimeout: 0,
        port,
        routes: ApiRouter.buildRoutes({
          prefix: this.prefix,
          websocketPrefix: this.websocketPrefix,
          routes,
          builtinRoutes,
          routeOptions,
          renderEnvRoutes,
          upgradeAppWs: (req: Request, data: AppWsData) => this.#wsServer?.upgrade(req, { data }) ?? false,
          webProxyRunner,
        }),
        websocket: websocketHandlers,
      });
      try {
        this.#wsServer = Bun.serve(wsServeOptions(preferredWsPort));
      } catch (error) {
        if (!isPortInUseError(error)) throw error;
        // A stale replica from a killed run may still hold the preferred port; an ephemeral port keeps
        // this child bootable and the gateway routes via the actual port reported in the ready message.
        this.logger.warn(`ws port ${preferredWsPort} is in use; falling back to an ephemeral port`);
        this.#wsServer = Bun.serve(wsServeOptions(0));
      }
      this.logger.verbose(`${this.name} websocket fallback is serving on port ${this.#wsServer.port}`);
    }

    const server = this.#server;
    const wsServer = this.#wsServer;
    // Only the listening server can answer `requestIP`, and behind the gateway `x-real-ip` beats it anyway,
    // so this is what gives a solo process the caller instead of `null`.
    SignalContext.setHttpPeerResolver((req) => server?.requestIP(req as Bun.BunRequest) ?? null);
    hmrHub?.setPublisher((topic, payload) => {
      server?.publish(topic, payload);
      wsServer?.publish(topic, payload);
    });

    const websocket = this.#di.getWebsocketAdaptor();
    if (!websocket) throw new Error("WebSocket Redis adaptor is not registered");
    this.#binaryPubsub.setServers(server, wsServer);
    const localPublish: LocalPublish = (roomId, data) => {
      if (data instanceof Uint8Array) {
        this.#binaryPubsub.publish(roomId, websocketBinaryFrameContract.encode({ roomId, payload: data }), {
          coalesce: SignalResolver.coalescesRoom(roomId),
        });
        return;
      }
      const publishData: WebsocketPublishData = { type: "pub", roomId, data };
      server?.publish(roomId, JSON.stringify(publishData));
      wsServer?.publish(roomId, JSON.stringify(publishData));
    };
    SignalResolver.setLocalPublish(localPublish, websocket);
    this.#localPublish = localPublish;

    this.status = "running";
    this.#startMetricsReporting();
    this.#di.registerSchedule(this.serverMode);
    this.logger.verbose(`🚀 ${this.name} is running on ${unix ? `unix://${unix}` : `port ${port}`}`);
    const wsPort = this.#wsServer?.port;
    process.send?.({
      type: "ready",
      pid: process.pid,
      replicaIdx: Number(process.env.AKAN_REPLICA_IDX ?? 0),
      role: this.serverMode,
      upstream: unix ? { type: "unix", socketPath: unix } : { type: "tcp", host: "127.0.0.1", port: Number(port) },
      wsUpstream: typeof wsPort === "number" ? { type: "tcp", host: "127.0.0.1", port: wsPort } : undefined,
      healthPath: "/_akan/app/child-health",
    } satisfies AkanIpcMessage);
    await this.#di.runSchedulerInit();
    ShutdownManager.register(this.logger, () => this.stop());
    return this;
  }

  async start({ listen, web }: { listen?: boolean; web?: AkanWebOption } = {}) {
    const isNoListenCommand = process.env.AKAN_COMMAND_TYPE === "script" || process.env.AKAN_COMMAND_TYPE === "console";
    const shouldListen = (listen ?? !isNoListenCommand) && this.serverMode !== "batch";
    await this.init({ routes: shouldListen, web });
    if (!shouldListen) {
      const websocket = this.#di.getWebsocketAdaptor();
      if (websocket) SignalResolver.setLocalPublish((roomId, data) => this.#localPublish?.(roomId, data), websocket);
      this.status = "running";
      if (!isNoListenCommand) {
        this.#startMetricsReporting();
        this.#di.registerSchedule(this.serverMode);
        this.#registerParentIpc();
        process.send?.({
          type: "ready",
          pid: process.pid,
          replicaIdx: Number(process.env.AKAN_REPLICA_IDX ?? 0),
          role: this.serverMode,
        } satisfies AkanIpcMessage);
        await this.#di.runSchedulerInit();
        ShutdownManager.register(this.logger, () => this.stop());
      }
      return this;
    }
    this.#registerParentIpc();
    return this.listen();
  }
  async stop() {
    if (this.status !== "running") {
      this.logger.warn("AkanServer is not running. Cannot stop.");
      return;
    }

    try {
      const now = Date.now();
      this.logger.info("Shutting down gracefully...");
      this.status = "stopping";
      this.#stopMetricsReporting();
      this.#di.getWebsocketAdaptor()?.clearEventHandler();
      this.#server?.stop(true);
      this.#wsServer?.stop(true);
      this.#server = null;
      this.#wsServer = null;
      SignalContext.setHttpPeerResolver(null);

      this.#prepared?.webRouter?.dispose();
      await this.#withShutdownTimeout(this.#di.destroyAll());
      await this.#stopFileLogging();
      this.#prepared = null;
      this.status = "stopped";
      this.logger.info(`Shutdown completed successfully in ${Date.now() - now}ms`);
    } catch (error) {
      this.logger.error(`Error during shutdown: ${error instanceof Error ? error.message : String(error)}`);
      this.status = "stopped";
      throw error;
    }
  }

  #registerParentIpc() {
    process.on("message", (message) => this.#handleIpcMessage(message as AkanIpcMessage));
    process.on("disconnect", () => this.#handleParentDisconnect());
  }

  /**
   * The IPC channel closes when the parent gateway dies (including SIGKILL). Exiting here keeps a
   * killed dev/gateway run from stranding replicas that would hold ports and break the next boot.
   */
  #handleParentDisconnect() {
    this.logger.warn("Parent IPC channel closed; shutting down to avoid an orphaned replica");
    setTimeout(() => process.exit(1), this.shutdownTimeoutMs + 1_000);
    void this.stop()
      .then(() => process.exit(0))
      .catch(() => process.exit(1));
  }

  #handleIpcMessage(message: AkanIpcMessage) {
    if (!message || typeof message !== "object") return;
    if (message.type === "pubsub.deliver")
      this.#localPublish?.(message.roomId, message.data as object | object[] | Uint8Array);
    else if (message.type === "health.ping")
      process.send?.({
        type: "health.pong",
        nonce: message.nonce,
        sentAt: message.sentAt,
        pid: process.pid,
      } satisfies AkanIpcMessage);
    else if (message.type === "shutdown") {
      void this.stop()
        .then(() => process.exit(0))
        .catch(() => process.exit(1));
    }
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
    const metrics = await ProcessMetricsCollector.collect({
      role: this.serverMode,
      pubsubCoalesceCount: this.#binaryPubsub.coalescedCount,
      ...(this.#prepared?.webRouter?.getMetrics() ?? {}),
    });
    this.#lastMetrics = metrics;
    process.send?.({ type: "metrics.report", pid: process.pid, metrics } satisfies AkanIpcMessage);
    if (process.env.AKAN_MEMORY_LOG === "1") {
      this.logger.info(`memory role=${this.serverMode} ${ProcessMetricsCollector.format(metrics)}`);
    }
  }

  #stopMetricsReporting() {
    if (!this.#metricsTimer) return;
    clearInterval(this.#metricsTimer);
    this.#metricsTimer = null;
  }

  #assertCanGet(type = "Dependency", refName?: string) {
    if (this.status === "initialized" || this.status === "running") return;
    const target = refName ? `${type} "${refName}"` : type;
    throw new Error(
      `${target} is not initialized while AkanServer status is "${this.status}". ` +
        "Call server.start() or server.init() first.",
    );
  }

  #createBuiltinRoutes(): HttpRoutes {
    const { appName } = getEnv();
    const openapiRoutes: HttpRoutes = this.openapi
      ? {
          "/openapi.json": {
            GET: () =>
              Response.json(
                createOpenApiDocument(FetchSerializer.serializeRegistry(this.#di.live).signal, {
                  title: `${appName} API`,
                  version: "0.0.0",
                  servers: this.#getOpenApiServers(),
                  resolveDescription: AkanServer.#createDescriptionResolver(),
                }),
              ),
          },
        }
      : {};
    // Mounted at the root, not under `this.prefix`: the canonical resource URI a client authenticates against
    // is the endpoint's own URL, and `https://<host>/mcp` is the one worth publishing.
    const mcpRouter =
      this.mcp && this.serverMode !== "batch"
        ? new McpRouter({
            registry: this.#di.registry,
            env: this.env,
            live: this.#di.live,
            middleware: new Map(this.#di.modules.middleware),
            instructions: `Domain tools for the ${appName} app.`,
            ...this.mcpOption,
            readOnly: this.mcpReadOnly,
            auth: this.mcpAuth,
          })
        : null;
    const mcpRoutes: HttpRoutes = mcpRouter?.createRoutes() ?? {};
    const soloRoutes: HttpRoutes = this.#solo
      ? createSoloAppRoutes(() => ({
          role: this.serverMode,
          running: this.status === "running",
          status: this.status,
          port: this.#server?.port ?? null,
          metrics: this.#lastMetrics,
        }))
      : {};
    // Builds the catalogue here rather than on the first agent request, so what MCP published — and what it
    // refused despite an author opting in — is in the boot log of the process that decided it.
    mcpRouter?.report();
    // Registered only when the gate passes, so outside `local` the paths do not exist at all and fall
    // through to the SSR catch-all as a natural 404 rather than a handler that answers "forbidden".
    const devtoolsRoutes = new DevtoolsRouter({
      di: this.#di,
      env: getEnv(),
      name: this.name,
      serverMode: this.serverMode,
      prefix: this.prefix,
      websocketPrefix: this.websocketPrefix,
      openapi: this.openapi,
      getStatus: () => this.status,
    }).createRoutes();
    return { ...openapiRoutes, ...mcpRoutes, ...devtoolsRoutes, ...soloRoutes };
  }

  #startFileLogging() {
    if (!this.#solo || this.#logWriter) return;
    this.#logWriter = RotatingLogWriter.fromRuntimeDir(resolveRuntimeDir());
    if (!this.#logWriter) return;
    this.#removeLogSink = Logger.addSink((entry) => {
      this.#logWriter?.write(this.serverMode, entry.plainMessage);
    });
  }

  async #stopFileLogging() {
    this.#removeLogSink?.();
    this.#removeLogSink = null;
    const writer = this.#logWriter;
    this.#logWriter = null;
    await writer?.close();
  }

  /**
   * Rebuilt per request rather than cached on the instance: libs register their dictionaries at module-evaluation
   * time, and the document itself is already re-serialized per request, so a stale snapshot would be the only
   * thing here that could disagree with the rest of the response.
   */
  static #createDescriptionResolver() {
    const lookup = new DictionaryLookup();
    return (key: string) => lookup.text(key);
  }

  #getOpenApiServers() {
    const serverHttpUri = (this.env as { serverHttpUri?: string }).serverHttpUri;
    if (!serverHttpUri) return undefined;
    return [{ url: serverHttpUri.replace(/\/api\/?$/, "") }];
  }

  static #splitLibsAndOptions(libsOrOptions: (AkanLib | AkanServerOptions)[]) {
    const last = libsOrOptions.at(-1);
    const options = AkanServer.#isServerOptions(last) ? last : undefined;
    const libs = (options ? libsOrOptions.slice(0, -1) : libsOrOptions) as AkanLib[];
    return { libs, options };
  }

  static #isServerOptions(value: AkanLib | AkanServerOptions | undefined): value is AkanServerOptions {
    return Boolean(
      value &&
        !("database" in value) &&
        !("service" in value) &&
        !("scalar" in value) &&
        ("openapi" in value || "mcp" in value || "modules" in value),
    );
  }

  static #isOpenApiEnvEnabled() {
    return AkanServer.#isEnvEnabled("AKAN_OPENAPI", "AKAN_PUBLIC_OPENAPI");
  }

  static #isEnvEnabled(...names: string[]) {
    return names.some((name) => process.env[name] === "true" || process.env[name] === "1");
  }

  /**
   * On unless the env says otherwise, which is the opposite of `#isEnvEnabled`.
   *
   * MCP exposure follows an endpoint's guards rather than an opt-in, so there is nothing an app has to declare for
   * its catalogue to be right — and a switch that must be found before anything works is a switch most deployments
   * never find. `AKAN_MCP=false` is the way off.
   */
  static #isEnvOn(...names: string[]) {
    return !names.some((name) => process.env[name] === "false" || process.env[name] === "0");
  }

  /** Narrows only — a surface the build or the env left out cannot be switched back on here. */
  static #narrowWeb(current: AkanWebConfig, web: AkanWebOption | undefined): AkanWebConfig {
    if (web === undefined || web === true) return current;
    if (web === false) return { ssr: false, csr: false };
    return { ssr: current.ssr, csr: web.csr && current.csr };
  }

  /** Named rather than defaulted: an absent env must leave the option unset so a value written in code still wins. */
  static #isEnvOff(...names: string[]) {
    return names.some((name) => process.env[name] === "false" || process.env[name] === "0");
  }

  /** Both differ per environment, so they belong in env rather than in the app's source alongside the switch. */
  static #mcpAuthFromEnv(): McpAuthOption {
    const authorizationServers = AkanServer.#envList("AKAN_MCP_AUTH_SERVERS");
    const scopes = AkanServer.#envList("AKAN_MCP_SCOPES");
    return {
      ...(authorizationServers?.length ? { authorizationServers } : {}),
      ...(scopes?.length ? { scopes } : {}),
      ...(process.env.AKAN_MCP_RESOURCE ? { resource: process.env.AKAN_MCP_RESOURCE } : {}),
    };
  }

  /**
   * The rest of `McpServerOption`, spelled as environment — the channel a deployment configures what the source
   * does not through, and the only one a child of the gateway is handed. An app writes these in its `option.ts`,
   * which merges over this: a value written in code wins over the env of the same name.
   */
  /**
   * Keys whose value is `undefined` are dropped before the merge. "An option written in code wins over the env of
   * the same name" is the contract, and a spread reads an explicitly-`undefined` property as a value — so
   * `{ path: undefined }` from a caller assembling options conditionally erased what the environment supplied.
   */
  static #defined<T extends object>(source: T): Partial<T> {
    return Object.fromEntries(Object.entries(source).filter(([, value]) => value !== undefined)) as Partial<T>;
  }

  static #mcpOptionFromEnv(): Omit<McpServerOption, "enabled" | "readOnly" | "auth"> {
    const allowedOrigins = AkanServer.#envList("AKAN_MCP_ALLOWED_ORIGINS");
    const pageSize = Number(process.env.AKAN_MCP_PAGE_SIZE);
    return {
      ...AkanServer.#mcpPathFromEnv(),
      ...(process.env.AKAN_MCP_VERSION ? { version: process.env.AKAN_MCP_VERSION } : {}),
      ...(process.env.AKAN_MCP_INSTRUCTIONS ? { instructions: process.env.AKAN_MCP_INSTRUCTIONS } : {}),
      ...(allowedOrigins?.length ? { allowedOrigins } : {}),
      ...(Number.isInteger(pageSize) && pageSize > 0 ? { pageSize } : {}),
      ...(process.env.AKAN_MCP_LANGUAGE ? { language: process.env.AKAN_MCP_LANGUAGE } : {}),
      ...(AkanServer.#isEnvOff("AKAN_MCP_LEGACY_TEXT") ? { legacyTextBlock: false } : {}),
    };
  }

  /**
   * Both consumers build their path by concatenation — the route key, and the RFC 9728 metadata path the resource
   * identifier is inserted into — so `AKAN_MCP_PATH=mcp` served a route named `mcp` and published its metadata at
   * `/.well-known/oauth-protected-resourcemcp`, which no client would ever look for. Normalized rather than
   * rejected: the intent is unambiguous, and a server that refuses to boot over a missing slash is worse.
   */
  static #mcpPathFromEnv() {
    const path = process.env.AKAN_MCP_PATH?.trim();
    if (!path) return {};
    return { path: path.startsWith("/") ? path : `/${path}` };
  }

  static #envList(name: string) {
    return process.env[name]
      ?.split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);
  }

  /**
   * Shutdown must finish inside the gateway's child-wait budget or the layer above SIGKILLs this
   * process and strands its resources; dev (`akan start`) keeps it short so edit-restarts stay snappy.
   */
  static #defaultShutdownTimeoutMs() {
    const configured = Number(process.env.AKAN_SHUTDOWN_TIMEOUT_MS);
    if (Number.isFinite(configured) && configured > 0) return configured;
    return process.env.AKAN_COMMAND_TYPE === "start" ? 3_000 : 30_000;
  }

  async #withShutdownTimeout<T>(promise: Promise<T>) {
    let timeout: Timer | null = null;
    try {
      return await Promise.race([
        promise,
        new Promise<T>((_, reject) => {
          timeout = setTimeout(
            () => reject(new Error(`Shutdown timed out after ${this.shutdownTimeoutMs}ms`)),
            this.shutdownTimeoutMs,
          );
        }),
      ]);
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }
}
