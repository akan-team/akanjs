import type { AkanWebConfig, AkanWebOption } from "akanjs";
import { AkanError, type BackendEnv, type BaseEnv, getApiPrefix, getEnv, getWsPrefix } from "akanjs/base";
import { Logger } from "akanjs/common";
import type { Adaptor, AdaptorCls, DatabaseConfig, Service, ServiceCls, SolidConfig } from "akanjs/service";
import type { ServerSignal, ServerSignalCls } from "akanjs/signal";
import { CrossSiteGuard } from "../signal/CrossSiteGuard";
import { EndpointRateLimit } from "../signal/endpointRateLimit";
import { AgentHooks } from "./agentHooks";
import type { AkanLib, AkanLibProps } from "./akanLib";
import { DiLifecycle } from "./di/diLifecycle";
import { ParentChannel } from "./lifecycle/parentChannel";
import { ShutdownManager } from "./lifecycle/shutdownManager";
import { StartGuard } from "./lifecycle/startGuard";
import { ServerLogging } from "./logging/serverLogging";
import { AgentTools, type McpAuthOption, type McpRateLimitOption, type McpRouter } from "./mcp";
import { WebProxyRunner } from "./proxy";
import { SignalResolver } from "./resolver";
import { BuiltinRoutes } from "./routing/builtinRoutes";
import { RouteHosts } from "./routing/routeHosts";
import { type AkanAppPrepared, ServerListener } from "./routing/serverListener";
import { ServerConfig } from "./serverConfig";
import { ServerMetrics } from "./serverMetrics";
import { SessionRefresh } from "./sessionRefresh";
import { getWebConfigFromEnv } from "./types";
import type { WebRouter } from "./webRouter";

export interface AkanServerProps extends AkanLibProps {
  env?: BackendEnv;
  prefix?: string;
  websocketPrefix?: string;
  openapi?: boolean;
}

export interface AkanServerOptions {
  openapi?: boolean;
  /**
   * `/mcp` is mounted by default, on an edge server only when asked for here or by `AKAN_MCP=true`; `false` takes it
   * off, and the object form carries the rest of its settings.
   */
  mcp?: boolean | McpServerOption;
  /** Boot only these modules and what they reach; omitted or empty mounts every enabled module. */
  modules?: string[];
  /** Mount all but these and whatever reaches them; applied after `modules`, so one named by both stays out. */
  disableModules?: string[];
  /** Like `disableModules`, by owning lib, so it does not drift as the lib gains modules. */
  disableLibs?: string[];
}

export interface McpServerOption {
  enabled?: boolean;
  /** Drops every mutation from the catalogue whatever its guards allow; off by default, reported per endpoint. */
  readOnly?: boolean;
  /**
   * Signals (`refName`) whose every entry stays off `/mcp`, such as a mounted lib's; HTTP still serves them. Each
   * `setMcp` adds to the list rather than replacing it, so an app cannot drop a lib's exclusion by naming another.
   */
  excludeSignals?: string[];
  /** Entry names kept off `/mcp` the same way, generated ones (`createUser`, `userListInOrg`) included. */
  excludeEndpoints?: string[];
  /** Mount path, `/mcp` by default; the OAuth resource id (the `aud` a token must carry) follows it. */
  path?: string;
  /** Reported as `serverInfo.version`; `0.0.0` by default. */
  version?: string;
  /** Guidance handed to the model with the tool list; defaults to a one-liner naming the app. */
  instructions?: string;
  /** Origins let past the DNS-rebinding check beyond the server's own host (only browser-hosted clients send one). */
  allowedOrigins?: string[];
  pageSize?: number;
  /** Language of the catalogue and its error text, `en` by default; server-wide because clients cache the document. */
  language?: string;
  /** Repeat structured results as JSON in the text block, per spec; `true` by default. `AKAN_MCP_LEGACY_TEXT`. */
  legacyTextBlock?: boolean;
  /**
   * `shallow` (default) names nested models, `full` inlines the whole closure, `none` publishes no `outputSchema` and
   * keeps the text block on. `AKAN_MCP_OUTPUT_SCHEMA`.
   */
  outputSchema?: "full" | "shallow" | "none";
  auth?: McpAuthOption;
  /**
   * Per-caller budget for tools/call, resources/read and prompts/get: 120/min and 8 in flight per process by default;
   * `false` disables. `AKAN_MCP_RATE_LIMIT` (`<calls>[/<seconds>]` or `off`), `AKAN_MCP_CONCURRENT`.
   */
  rateLimit?: McpRateLimitOption | false;
  /** Characters a page prompt may attach before its lists are cut; 60,000 by default. `AKAN_MCP_PROMPT_BUDGET`. */
  promptBudget?: number;
  /**
   * MCP Apps: each `.app()` is a read-only tool whose result a host speaking the extension draws with that app's own
   * view, and a `.prompt()` page a text tool; an endpoint kept off the shelf by `mcp: false` stays callable by a view.
   * `false` publishes no page tools. `true` by default. `AKAN_MCP_APPS`.
   */
  apps?: boolean;
  /**
   * Speak the modern `2026-07-28` revision (`server/discover`) beside the legacy ones. On unless the build serves views
   * and a page declares `.app()`, since claude.ai renders a view only for a server it reached through `initialize`.
   * `AKAN_MCP_MODERN`.
   */
  modern?: boolean;
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
  #prepared: AkanAppPrepared | null = null;
  #webRouter: WebRouter | null = null;
  readonly logger: Logger;
  readonly name: string;
  readonly libs: AkanLib[];
  readonly env: BackendEnv;
  prefix = getApiPrefix();
  websocketPrefix = getWsPrefix();
  openapi = ServerConfig.isEnvEnabled("AKAN_OPENAPI", "AKAN_PUBLIC_OPENAPI");
  // Default-on: MCP exposure follows guards, and an opt-in switch is one most deployments would never find.
  mcp = !ServerConfig.isEnvOff("AKAN_MCP", "AKAN_PUBLIC_MCP");
  mcpReadOnly = ServerConfig.isEnvEnabled("AKAN_MCP_READONLY", "AKAN_PUBLIC_MCP_READONLY");
  mcpAuth: McpAuthOption = ServerConfig.mcpAuthFromEnv();
  mcpOption: Omit<McpServerOption, "enabled" | "readOnly" | "auth"> = ServerConfig.mcpOptionFromEnv();
  serverMode: "federation" | "batch" | "all";
  /** Resolved at `init`: what this process actually serves, after env and artifact availability. */
  web: AkanWebConfig = getWebConfigFromEnv();
  modules: string[];
  disableModules: string[];
  disableLibs: string[];
  shutdownTimeoutMs = ServerConfig.defaultShutdownTimeoutMs();

  #di: DiLifecycle;
  readonly #initTimings = new Map<string, number>();
  readonly #logging: ServerLogging;
  readonly #listener: ServerListener;
  readonly #metrics: ServerMetrics;
  readonly #parent: ParentChannel;
  readonly #builtinRoutes: BuiltinRoutes;
  readonly #start: StartGuard;
  #schedules = true;
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
    const { libs, options } = ServerConfig.splitLibsAndOptions(libsOrOptions);
    // No gateway socket: this process owns `/_akan/app/*` and the rotating log the gateway would have handled.
    const solo = !process.env.AKAN_CHILD_SOCKET;
    this.name = name;
    this.logger = new Logger(name);
    this.#logging = new ServerLogging(solo, this.logger);
    this.#start = new StartGuard(this.logger, () => this.#teardown());
    this.libs = libs;
    this.env = libs.reduce((current, lib) => lib.option.resolveEnv(current), { ...env });
    //? An edge server runs on premises for its own screens and machines: no agent there is one to serve unasked.
    if (ServerConfig.isEdge(this.env) && !ServerConfig.isEnvEnabled("AKAN_MCP", "AKAN_PUBLIC_MCP")) this.mcp = false;
    this.openapi = options?.openapi ?? this.openapi;
    // Each lib's `option.ts` in mount order, the app's last, and an option passed here over all of them.
    EndpointRateLimit.reset();
    SessionRefresh.use(null);
    libs.forEach((lib) => {
      const mcp = lib.option.getMcp(this.env);
      if (mcp !== undefined) this.setMcp(mcp);
      AgentHooks.apply(lib.option);
      const crossSite = lib.option.getCrossSite();
      if (crossSite !== undefined) CrossSiteGuard.configure(crossSite);
      const rateLimit = lib.option.getRateLimit(this.env);
      if (rateLimit !== undefined) EndpointRateLimit.configure(rateLimit);
      const sessionRefresh = lib.option.getSessionRefresh();
      if (sessionRefresh !== undefined) SessionRefresh.use(sessionRefresh);
    });
    EndpointRateLimit.applyEnv(process.env.AKAN_RATE_LIMIT, getEnv().environment);
    this.setMcp(options?.mcp ?? this.mcp);
    this.serverMode = serverMode;
    // `AKAN_MODULES` is how a gateway hands its own `modules` option to the child that mounts the container.
    this.modules = options?.modules ?? ServerConfig.envList("AKAN_MODULES") ?? [];
    this.disableModules = options?.disableModules ?? ServerConfig.envList("AKAN_DISABLE_MODULES") ?? [];
    this.disableLibs = options?.disableLibs ?? ServerConfig.envList("AKAN_DISABLE_LIBS") ?? [];
    this.#di = new DiLifecycle(
      { env: this.env, modules: this.modules, disableModules: this.disableModules, disableLibs: this.disableLibs },
      ...libs,
    );
    const webRouter = () => this.#webRouter;
    this.#listener = new ServerListener(this, this.#di, solo);
    this.#metrics = new ServerMetrics(this, this.#listener, webRouter);
    this.#parent = new ParentChannel(this, this.#logging, webRouter);
    this.#builtinRoutes = new BuiltinRoutes({
      owner: this,
      di: this.#di,
      solo,
      listener: this.#listener,
      metrics: this.#metrics,
      logging: this.#logging,
    });
  }
  setPrefix(prefix: string) {
    if (this.status !== "stopped")
      throw new AkanError("alreadyInitialized", "Route prefix must be set before app initialization.");
    this.prefix = ServerConfig.requireRoutePrefix(prefix, "prefix");
    return this;
  }
  setWebsocketPrefix(websocketPrefix: string) {
    if (this.status !== "stopped")
      throw new AkanError("alreadyInitialized", "Websocket prefix must be set before app initialization.");
    this.websocketPrefix = ServerConfig.requireRoutePrefix(websocketPrefix, "websocketPrefix");
    return this;
  }
  setOpenApi(openapi = true) {
    if (this.status !== "stopped")
      throw new AkanError("alreadyInitialized", "OpenAPI config must be set before app initialization.");
    this.openapi = openapi;
    return this;
  }
  /** Narrows the web surface; never widens it past what the build produced. */
  setWeb(web: AkanWebOption = true) {
    if (this.status !== "stopped")
      throw new AkanError("alreadyInitialized", "Web config must be set before app initialization.");
    this.web = ServerConfig.narrowWeb(this.web, web);
    return this;
  }
  setMcp(mcp: boolean | McpServerOption = true) {
    if (this.status !== "stopped")
      throw new AkanError("alreadyInitialized", "MCP config must be set before app initialization.");
    // An object without `enabled` only configures the surface, and the env switch can only narrow.
    const requested = typeof mcp === "boolean" ? mcp : (mcp.enabled ?? this.mcp);
    this.mcp = requested && !ServerConfig.isEnvOff("AKAN_MCP", "AKAN_PUBLIC_MCP");
    if (typeof mcp === "boolean") return this;
    const { enabled: _enabled, readOnly, auth, excludeSignals, excludeEndpoints, ...rest } = mcp;
    if (readOnly !== undefined) this.mcpReadOnly = readOnly;
    if (auth) this.mcpAuth = { ...this.mcpAuth, ...ServerConfig.defined(auth) };
    const added = (current: string[] | undefined, names: string[] | undefined) =>
      names ? [...new Set([...(current ?? []), ...names])] : current;
    this.mcpOption = ServerConfig.defined({
      ...this.mcpOption,
      ...ServerConfig.defined(rest),
      excludeSignals: added(this.mcpOption.excludeSignals, excludeSignals),
      excludeEndpoints: added(this.mcpOption.excludeEndpoints, excludeEndpoints),
    });
    return this;
  }
  /** The router `/mcp` is served by once routes are built; `null` before, or when MCP is off. */
  get mcpRouter(): McpRouter | null {
    return this.#builtinRoutes.mcpRouter;
  }
  setDatabaseConfig(database: DatabaseConfig) {
    if (this.status !== "stopped")
      throw new AkanError("alreadyInitialized", "Database config must be set before app initialization.");
    this.env.database = database;
    return this;
  }
  setSolidConfig(solid: SolidConfig) {
    if (this.status !== "stopped")
      throw new AkanError("alreadyInitialized", "Solid config must be set before app initialization.");
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
    assertCanGet(this.status);
    return this.#di.getByClass(cls);
  }

  getService<T = Service>(refName: string): T {
    assertCanGet(this.status, "Service", refName);
    return this.#di.getService<T>(refName);
  }

  getSignal<T = ServerSignal>(refName: string): T {
    assertCanGet(this.status, "Server signal", refName);
    return this.#di.getSignal<T>(refName);
  }

  getAdaptor<T = Adaptor>(refName: string): T {
    assertCanGet(this.status, "Adaptor", refName);
    return this.#di.getAdaptor<T>(refName);
  }

  inspectConsole(): AkanServerConsoleInfo {
    assertCanGet(this.status);
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

  async init(option: { routes?: boolean; web?: AkanWebOption } = {}) {
    if (this.status !== "stopped")
      throw new AkanError("alreadyInitialized", "AkanServer is not able to init. It is already running.");
    ServerConfig.assertPrefixClearsBasePaths(this.prefix);
    const start = performance.now();
    this.#initTimings.clear();
    if (await this.#start.unwound(() => this.#start.stoppedDuring(() => this.#init(option)))) return this;
    const stages = [...this.#di.initTimings, ...this.#initTimings].map(([stage, ms]) => `${stage} ${ms.toFixed(1)}`);
    this.logger.debug(`Initialized in ${(performance.now() - start).toFixed(1)}ms (${stages.join(" · ")})`);
    return this;
  }

  async #init({ routes: initRoutes = true, web }: { routes?: boolean; web?: AkanWebOption }) {
    this.status = "initializing";
    AgentTools.provide(this.#di, this);
    const { routes, wsRoutes, routeOptions } = await this.#di.initializeAll().catch((error: unknown) => {
      //? The container unwinds a failed init itself, so no teardown after it may destroy it a second time.
      this.status = "stopped";
      throw error;
    });
    if (this.#start.stopHeld) return this;
    if (!initRoutes) {
      this.#prepared = null;
      this.status = "initialized";
      return this;
    }
    RouteHosts.declare();
    const requestedWeb = ServerConfig.narrowWeb(this.web, web);
    const noWeb = () => {
      this.#prepared = {
        routes,
        routeOptions,
        wsRoutes,
        builtinRoutes: this.#builtinRoutes.timed(null, this.#initTimings),
        renderEnvRoutes: {},
        hmrHub: null,
        webProxyRunner: null,
      };
      this.status = "initialized";
      return this;
    };
    if (!requestedWeb.ssr) {
      this.web = requestedWeb;
      this.logger.debug("web off: serving api only (AKAN_SSR=false, or a build with `web: false`)");
      return noWeb();
    }
    const webStart = performance.now();
    const { WebRouter } = await import("./webRouter");
    if (this.#start.stopHeld) return this;
    const webRouter = await WebRouter.create({
      web: requestedWeb,
      upgradeHmrWs: (req, data) => this.#listener.upgradeHmrWs(req, data),
    });
    // A build without web artifacts boots the api and warns once rather than restart-looping on the missing file.
    if (!webRouter) {
      this.web = { ssr: false, csr: false };
      this.logger.warn("web off: no build artifact under .akan/artifact; serving api only");
      return noWeb();
    }
    this.#webRouter = webRouter;
    this.web = webRouter.web;
    this.logger.verbose(`web on: ssr=${this.web.ssr} csr=${this.web.csr}`);
    const { renderEnvRoutes, hmrHub } = await webRouter.initializeRoute();
    this.#initTimings.set("web", performance.now() - webStart);
    const webProxyRunner = WebProxyRunner.create(this.#di.webProxies);
    this.#prepared = {
      routes,
      routeOptions,
      wsRoutes,
      builtinRoutes: this.#builtinRoutes.timed(webRouter, this.#initTimings),
      renderEnvRoutes,
      hmrHub,
      webProxyRunner,
    };
    this.status = "initialized";
    return this;
  }

  async listen() {
    const prepared = this.#prepared;
    if (this.status !== "initialized" || !prepared)
      throw new AkanError("notInitialized", "AkanServer is not able to listen. Call `init` first.");
    this.status = "starting";
    Logger.role = this.serverMode;
    return await this.#start.unwound(() => this.#listen(prepared));
  }

  async #listen(prepared: AkanAppPrepared) {
    if (await this.#start.stoppedDuring(() => this.#logging.startTransport(this.#webRouter))) return this;
    this.#logging.startFileLogging(this.serverMode);
    const { unix, port } = this.#listener.listen(prepared, this.#webRouter);
    this.status = "running";
    this.#metrics.start();
    if (this.#schedules) this.#di.registerSchedule(this.serverMode);
    this.logger.verbose(`🚀 ${this.name} is running on ${unix ? `unix://${unix}` : `port ${port}`}`);
    const wsPort = this.#listener.wsPort;
    this.#parent.sendReady({
      type: "ready",
      pid: process.pid,
      replicaIdx: Number(process.env.AKAN_REPLICA_IDX ?? 0),
      role: this.serverMode,
      upstream: unix ? { type: "unix", socketPath: unix } : { type: "tcp", host: "127.0.0.1", port: Number(port) },
      wsUpstream: typeof wsPort === "number" ? { type: "tcp", host: "127.0.0.1", port: wsPort } : undefined,
      healthPath: "/_akan/app/child-health",
      crossSite: CrossSiteGuard.option(),
      rscWorker: this.#webRouter?.rscWorkerStatus ?? null,
    });
    if (this.#schedules && this.status === "running") await this.#di.runSchedulerInit();
    ShutdownManager.register(this.logger, () => this.stop());
    return this;
  }

  /**
   * `listen: false` serves no HTTP and still runs the internals, as a batch replica does; `schedules: false` runs
   * none of them (init, interval, cron, queue workers), as a test or a script wants.
   */
  async start({ listen, web, schedules }: { listen?: boolean; web?: AkanWebOption; schedules?: boolean } = {}) {
    this.#schedules = schedules ?? true;
    const isNoListenCommand = process.env.AKAN_COMMAND_TYPE === "script" || process.env.AKAN_COMMAND_TYPE === "console";
    const shouldListen = (listen ?? !isNoListenCommand) && this.serverMode !== "batch";
    //? Before init: once an adaptor listens for `message`, Bun emits `disconnect` at the close only to listeners there.
    if (shouldListen || !isNoListenCommand) this.#parent.register();
    await this.init({ routes: shouldListen, web });
    if (this.#parent.gone || this.status !== "initialized") return this;
    if (shouldListen) return this.listen();
    return await this.#start.unwound(async () => {
      const websocket = this.#di.getWebsocketAdaptor();
      if (websocket)
        SignalResolver.setLocalPublish(
          (roomId, data) => this.#listener.publishLocal(roomId, data),
          websocket,
          this.#di.live,
        );
      this.status = "running";
      if (isNoListenCommand) return this;
      Logger.role = this.serverMode;
      this.#metrics.start();
      if (this.#schedules) this.#di.registerSchedule(this.serverMode);
      if (await this.#start.stoppedDuring(() => this.#logging.startTransport())) return this;
      this.#parent.sendReady({
        type: "ready",
        pid: process.pid,
        replicaIdx: Number(process.env.AKAN_REPLICA_IDX ?? 0),
        role: this.serverMode,
      });
      if (this.#schedules && this.status === "running") await this.#di.runSchedulerInit();
      ShutdownManager.register(this.logger, () => this.stop());
      return this;
    });
  }
  stop(): Promise<void> {
    return this.#start.stop(() => this.status === "running" || this.status === "initialized");
  }

  async #teardown() {
    if (this.status === "stopped") return;
    try {
      const now = Date.now();
      this.logger.info("Shutting down gracefully...");
      this.status = "stopping";
      this.#metrics.stop();
      this.#di.getWebsocketAdaptor()?.clearEventHandler();
      this.#listener.close();

      this.#webRouter?.dispose();
      this.#webRouter = null;
      await withShutdownTimeout(this.#di.destroyAll(), this.shutdownTimeoutMs);
      this.#prepared = null;
      this.status = "stopped";
      this.logger.info(`Shutdown completed successfully in ${Date.now() - now}ms`);
    } catch (error) {
      //? The failure line that reaches the gateway: logging closes below, before a caller could log its own.
      this.logger.error(`Error during shutdown: ${error instanceof Error ? error.message : String(error)}`);
      this.status = "stopped";
      throw error;
    } finally {
      // Last, so the lines above still have a hub — and in ndjson mode a stdout — to reach.
      await this.#logging.stop();
    }
  }
}

const assertCanGet = (status: AkanServer["status"], type = "Dependency", refName?: string) => {
  if (status === "initialized" || status === "running") return;
  const target = refName ? `${type} "${refName}"` : type;
  throw new AkanError(
    "notInitialized",
    `${target} is not initialized while AkanServer status is "${status}". ` +
      "Call server.start() or server.init() first.",
  );
};

const withShutdownTimeout = async <T>(promise: Promise<T>, timeoutMs: number) => {
  let timeout: Timer | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeout = setTimeout(
          () => reject(new AkanError("shutdownTimeout", `Shutdown timed out after ${timeoutMs}ms`)),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
};
