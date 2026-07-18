import { type BaseEnv, getEnv } from "akanjs/base";
import { Logger } from "akanjs/common";
import type {
  Adaptor,
  AdaptorCls,
  AkanIpcMessage,
  DatabaseConfig,
  Service,
  ServiceCls,
  SolidConfig,
} from "akanjs/service";
import type { ServerSignal, ServerSignalCls, WebsocketPublishData } from "akanjs/signal";
import { createOpenApiDocument } from "../signal/openapi";
import { FetchSerializer } from "../signal/serializer";
import type { AkanLib, AkanLibProps } from "./akanLib";
import type { BuilderRpc } from "./artifact";
import { DiLifecycle } from "./di/diLifecycle";
import type { HmrWsData, HmrWsHub } from "./hmr/wsHub";
import { ShutdownManager } from "./lifecycle/shutdownManager";
import { ProcessMetricsCollector } from "./processMetricsCollector";
import { WebProxyRunner } from "./proxy";
import { SignalResolver } from "./resolver";
import { ApiRouter } from "./routing/apiRouter";
import type { HttpRoutes, SignalRoutes, WebsocketRoutes } from "./types";
import type { WebRouter } from "./webRouter";

export interface AkanServerProps extends AkanLibProps {
  env?: BaseEnv;
  prefix?: string;
  websocketPrefix?: string;
  openapi?: boolean;
}

export interface AkanServerOptions {
  openapi?: boolean;
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
  #server: Bun.Server<{ createdAt: number } | HmrWsData> | null = null;
  #wsServer: Bun.Server<{ createdAt: number } | HmrWsData> | null = null;
  #prepared: AkanAppPrepared | null = null;
  readonly logger: Logger;
  readonly name: string;
  readonly libs: AkanLib[];
  readonly env: BaseEnv & { database?: DatabaseConfig; solid?: SolidConfig };
  prefix = "/api";
  websocketPrefix = "/ws";
  openapi = AkanServer.#isOpenApiEnvEnabled();
  serverMode: "federation" | "batch" | "all";
  shutdownTimeoutMs = 30_000;

  #di: DiLifecycle;
  #localPublish: ((roomId: string, data: object | object[]) => void) | null = null;
  #metricsTimer: Timer | null = null;
  constructor(
    name = "AkanServer",
    env: BaseEnv = getEnv(),
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
    this.serverMode = serverMode;
    this.#di = new DiLifecycle(this.env, serverMode, ...libs);
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
    return {
      name: this.name,
      status: this.status,
      serverMode: this.serverMode,
      env: {
        appName: this.env.appName,
        environment: this.env.environment,
        operationMode: this.env.operationMode,
        repoName: this.env.repoName,
        serveDomain: this.env.serveDomain,
        databaseMode: this.env.databaseMode,
      },
      services: [...this.#di.registry.serviceCls.keys()].sort((a, b) => a.localeCompare(b)),
      signals: [...this.#di.registry.serverSignalCls.keys()].sort((a, b) => a.localeCompare(b)),
      adaptors: [...this.#di.registry.adaptorCls.keys()].sort((a, b) => a.localeCompare(b)),
      uses: [...this.#di.registry.uses.keys()].sort((a, b) => a.localeCompare(b)),
      serviceStages: this.#di.hierarchy.serviceStages.map((stage) => [...stage]),
      adaptorStages: this.#di.hierarchy.adaptorStages.map((stage) => [...stage]),
    };
  }

  async init({ routes: initRoutes = true, web = true }: { routes?: boolean; web?: boolean } = {}) {
    if (this.status !== "stopped") throw new Error("AkanServer is not able to init. It is already running.");
    this.status = "initializing";
    const { routes, wsRoutes, routeOptions } = await this.#di.initializeAll();
    if (!initRoutes) {
      this.#prepared = null;
      this.status = "initialized";
      return this;
    }
    if (!web) {
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
    }
    const { WebRouter } = await import("./webRouter");
    const webRouter = await WebRouter.create({
      upgradeHmrWs: (req, data) => this.#server?.upgrade(req, { data }) ?? false,
    });
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
      }),
      // `data` is typed by the upgrade call site; the runtime default is unused.
      data: {},
    } as Bun.WebSocketHandler<{ createdAt: number } | HmrWsData>;
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
      const wsPort = Number(process.env.AKAN_CHILD_WS_PORT);
      this.#wsServer = Bun.serve({
        idleTimeout: 0,
        port: wsPort,
        routes: ApiRouter.buildRoutes({
          prefix: this.prefix,
          websocketPrefix: this.websocketPrefix,
          routes,
          builtinRoutes,
          routeOptions,
          renderEnvRoutes,
          upgradeAppWs: (req, data) => this.#wsServer?.upgrade(req, { data }) ?? false,
          webProxyRunner,
        }),
        websocket: websocketHandlers,
      });
      this.logger.verbose(`${this.name} websocket fallback is serving on port ${wsPort}`);
    }

    const server = this.#server;
    const wsServer = this.#wsServer;
    hmrHub?.setPublisher((topic, payload) => {
      server?.publish(topic, payload);
      wsServer?.publish(topic, payload);
    });

    const websocket = this.#di.getWebsocketAdaptor();
    if (!websocket) throw new Error("WebSocket Redis adaptor is not registered");
    SignalResolver.setLocalPublish((roomId, data) => {
      const publishData: WebsocketPublishData = { type: "pub", roomId, data };
      server?.publish(roomId, JSON.stringify(publishData));
      wsServer?.publish(roomId, JSON.stringify(publishData));
    }, websocket);
    this.#localPublish = (roomId, data) => {
      const publishData: WebsocketPublishData = { type: "pub", roomId, data };
      server?.publish(roomId, JSON.stringify(publishData));
      wsServer?.publish(roomId, JSON.stringify(publishData));
    };

    this.status = "running";
    this.#startMetricsReporting();
    this.#di.registerSchedule(this.serverMode);
    this.logger.verbose(`🚀 ${this.name} is running on ${unix ? `unix://${unix}` : `port ${port}`}`);
    process.send?.({
      type: "ready",
      pid: process.pid,
      replicaIdx: Number(process.env.AKAN_REPLICA_IDX ?? 0),
      role: this.serverMode,
      upstream: unix ? { type: "unix", socketPath: unix } : { type: "tcp", host: "127.0.0.1", port: Number(port) },
      healthPath: "/_akan/app/child-health",
    } satisfies AkanIpcMessage);
    await this.#di.runSchedulerInit();
    ShutdownManager.register(this.logger, () => this.stop());
    return this;
  }

  async start({ listen, web = true }: { listen?: boolean; web?: boolean } = {}) {
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
        process.on("message", (message) => this.#handleIpcMessage(message as AkanIpcMessage));
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
    process.on("message", (message) => this.#handleIpcMessage(message as AkanIpcMessage));
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

      this.#prepared?.webRouter?.dispose();
      await this.#withShutdownTimeout(this.#di.destroyAll());
      this.#prepared = null;
      this.status = "stopped";
      this.logger.info(`Shutdown completed successfully in ${Date.now() - now}ms`);
    } catch (error) {
      this.logger.error(`Error during shutdown: ${error instanceof Error ? error.message : String(error)}`);
      this.status = "stopped";
      throw error;
    }
  }

  #handleIpcMessage(message: AkanIpcMessage) {
    if (!message || typeof message !== "object") return;
    if (message.type === "pubsub.deliver") this.#localPublish?.(message.roomId, message.data as object | object[]);
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
      ...(this.#prepared?.webRouter?.getMetrics() ?? {}),
    });
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
    if (!this.openapi) return {};
    return {
      "/openapi.json": {
        GET: () =>
          Response.json(
            createOpenApiDocument(FetchSerializer.serializeRegistry(this.#di.live).signal, {
              title: `${this.env.appName} API`,
              version: "0.0.0",
              servers: this.#getOpenApiServers(),
            }),
          ),
      },
    };
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
      value && !("database" in value) && !("service" in value) && !("scalar" in value) && "openapi" in value,
    );
  }

  static #isOpenApiEnvEnabled() {
    return [process.env.AKAN_OPENAPI, process.env.AKAN_PUBLIC_OPENAPI].some(
      (value) => value === "true" || value === "1",
    );
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
