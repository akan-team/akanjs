import type { BaseEnv } from "akanjs/base";
import { Logger } from "akanjs/common";
import {
  type Adaptor,
  type AdaptorCls,
  getDefaultInjectRegistry,
  getDefaultLiveRegistry,
  InjectInfo,
  type Scheduler,
  type Service,
  type ServiceCls,
  srv,
  type WebsocketAdaptor,
} from "akanjs/service";
import { Base, BaseEndpoint, BaseInternal } from "../../signal/base.signal";
import type { Endpoint } from "../../signal/endpoint";
import type { Internal } from "../../signal/internal";
import { Logging, type MiddlewareCls } from "../../signal/middleware";
import type { ServerSignal, ServerSignalCls } from "../../signal/serverSignal";
import { SignalRegistry } from "../../signal/signalRegistry";
import type { AkanLib, DatabaseModule, ScalarModule, ServiceModule } from "../akanLib";
import { createDefaultAkanOption } from "../akanOption";
import type { WebProxyRegistration } from "../proxy";
import { DatabaseResolver, ServiceResolver, SignalResolver } from "../resolver";
import type { SignalRoutes, WebsocketRoutes } from "../types";
import { getPredefinedAdaptor, predefinedAdaptorRole } from "./predefinedAdaptor";
import { collectAdaptors, resolveAdaptorHierarchy } from "./resolveAdaptorHierarchy";
import { resolveServiceHierarchy } from "./resolveServiceHierarchy";
import {
  type DiModuleCandidate,
  getModuleDependencyRefNames,
  isDestroyableUse,
  normalizeAdaptorRefName,
  normalizeServiceRefName,
  normalizeSignalRefName,
  reasonMessage,
  runStage,
  toError,
} from "./utils";

/**
 * Owns the app's DI container state (registry + live maps + init order) and
 * encapsulates every init / destroy step. `AkanServer` delegates to this so the
 * top-level class can focus on HTTP / WS wiring and process lifecycle.
 */
export class DiLifecycle {
  readonly logger: Logger = new Logger("DiLifecycle");
  readonly registry = getDefaultInjectRegistry();
  readonly live = getDefaultLiveRegistry();
  readonly hierarchy = {
    adaptorStages: [] as string[][],
    serviceStages: [] as string[][],
  };
  readonly #env: BaseEnv;
  readonly #libs: AkanLib[];
  readonly #database = new Map<string, DatabaseModule>();
  readonly #service = new Map<string, ServiceModule>();
  readonly #scalar = new Map<string, ScalarModule>();
  readonly #adaptor = new Map<string, AdaptorCls>();
  readonly #middleware = new Map<string, MiddlewareCls>();
  readonly webProxies: WebProxyRegistration[] = [];
  /** refName → why the module was dropped at construction time. Kept for introspection, not control flow. */
  readonly disabledModules = new Map<string, string>();
  readonly #predefinedAdaptor;
  readonly #predefinedAdaptorRole = predefinedAdaptorRole;

  /** Read-only view of the resolved module maps, for tooling that needs to describe the container. */
  get modules(): {
    database: ReadonlyMap<string, DatabaseModule>;
    service: ReadonlyMap<string, ServiceModule>;
    scalar: ReadonlyMap<string, ScalarModule>;
    adaptor: ReadonlyMap<string, AdaptorCls>;
    middleware: ReadonlyMap<string, MiddlewareCls>;
  } {
    return {
      database: this.#database,
      service: this.#service,
      scalar: this.#scalar,
      adaptor: this.#adaptor,
      middleware: this.#middleware,
    };
  }

  constructor(env: BaseEnv, serverMode: "federation" | "batch" | "all", ...libs: AkanLib[]) {
    this.#env = env;
    this.#predefinedAdaptor = getPredefinedAdaptor(env.databaseMode ?? "single");
    this.#libs = libs;
    this.#service.set("base", {
      service: srv.base,
      signal: SignalRegistry.registerService("base" as const, BaseInternal, BaseEndpoint, Base),
    });
    this.#middleware.set(Logging.refName, Logging);
    const defaultOption = createDefaultAkanOption();
    defaultOption.getMiddlewares().forEach((middleware) => {
      this.#middleware.set(middleware.refName, middleware);
    });
    this.webProxies.push(...defaultOption.getWebProxies());
    const databaseCandidates = new Map<string, DiModuleCandidate>();
    const serviceCandidates = new Map<string, DiModuleCandidate>();
    libs.forEach((lib) => {
      lib.option.getMiddlewares().forEach((middleware) => {
        this.#middleware.set(middleware.refName, middleware);
      });
      this.webProxies.push(...lib.option.getWebProxies());
      lib.database.forEach((mod) => {
        databaseCandidates.set(mod.constant.refName, { refName: mod.constant.refName, module: mod });
      });
      lib.service.forEach((mod) => {
        serviceCandidates.set(mod.service.srv.refName, { refName: mod.service.srv.refName, module: mod });
      });
      lib.scalar.forEach((mod) => {
        this.#scalar.set(mod.constant.refName, mod);
      });
    });
    const disabledModules = this.#resolveDisabledModules(databaseCandidates, serviceCandidates);
    databaseCandidates.forEach(({ refName, module }) => {
      if (disabledModules.has(refName)) return;
      this.#database.set(refName, module as DatabaseModule);
    });
    serviceCandidates.forEach(({ refName, module }) => {
      if (disabledModules.has(refName)) return;
      this.#service.set(refName, module as ServiceModule);
    });
    this.#database.forEach((mod) => {
      const databaseAdaptor = DatabaseResolver.resolveDatabase(mod.constant, mod.database);
      this.#adaptor.set(databaseAdaptor.refName, databaseAdaptor);
    });
    const services = [
      ...[...this.#service.values()].map((mod) => mod.service.srv),
      ...[...this.#database.values()].map((mod) => mod.service.srv),
    ];
    for (const adaptor of collectAdaptors(services)) {
      this.#adaptor.set(adaptor.refName, adaptor);
    }
  }

  #resolveDisabledModules(
    databaseCandidates: Map<string, DiModuleCandidate>,
    serviceCandidates: Map<string, DiModuleCandidate>,
  ) {
    const candidates = new Map<string, DiModuleCandidate>([...databaseCandidates, ...serviceCandidates]);
    const disabledReasons = new Map<string, string>();

    candidates.forEach(({ refName, module }) => {
      if (!module.service.srv.enabled) disabledReasons.set(refName, "service disabled");
    });

    let changed = true;
    while (changed) {
      changed = false;
      candidates.forEach(({ refName, module }) => {
        if (disabledReasons.has(refName)) return;
        for (const dependencyRefName of getModuleDependencyRefNames(module)) {
          if (dependencyRefName === refName) continue;
          const dependencyReason = disabledReasons.get(dependencyRefName);
          if (!dependencyReason) continue;
          disabledReasons.set(refName, `depends on disabled module "${dependencyRefName}"`);
          changed = true;
          break;
        }
      });
    }

    disabledReasons.forEach((reason, refName) => {
      this.disabledModules.set(refName, reason);
      this.logger.verbose(`Skipping disabled module "${refName}": ${reason}`);
    });
    return new Set(disabledReasons.keys());
  }

  /** Run every init stage in dependency order and collect the generated routes. */
  async initializeAll(): Promise<SignalRoutes> {
    await this.#initializeUses();
    await this.#initializeAdaptor();
    await this.#initializeServerSignal();
    await this.#initializeService();
    await this.#initializeInternal();
    const {
      routes: sliceRoutes,
      wsRoutes: sliceWsRoutes,
      routeOptions: sliceRouteOptions,
    } = await this.#initializeSlice();
    const {
      routes: endpointRoutes,
      wsRoutes: endpointWsRoutes,
      routeOptions: endpointRouteOptions,
    } = await this.#initializeEndpoint();
    return {
      routes: { ...sliceRoutes, ...endpointRoutes },
      wsRoutes: { ...sliceWsRoutes, ...endpointWsRoutes },
      routeOptions: { ...(sliceRouteOptions ?? {}), ...(endpointRouteOptions ?? {}) },
    };
  }
  async destroyAll() {
    // 1. Run destroy internals (scheduled jobs, etc.)
    const internalNow = Date.now();
    this.logger.verbose("Running destroy internals...");
    try {
      await this.runSchedulerDestroy();
    } catch (error) {
      this.logger.warn(`Error in destroy internals: ${error instanceof Error ? error.message : String(error)}`);
    }
    this.logger.verbose(`Destroy internals in ${Date.now() - internalNow}ms`);

    // 2. Destroy services (reverse order)
    const serviceNow = Date.now();
    this.logger.verbose("Destroying services...");
    await this.destroyServices();
    this.logger.verbose(`Destroy services in ${Date.now() - serviceNow}ms`);

    // 3. Destroy adaptors (reverse order)
    const adaptorNow = Date.now();
    this.logger.verbose("Destroying adaptors...");
    await this.destroyAdaptors();
    this.logger.verbose(`Destroy adaptors in ${Date.now() - adaptorNow}ms`);

    // 4. Destroy external uses (SDK clients, API wrappers, etc.)
    const usesNow = Date.now();
    this.logger.verbose("Destroying uses...");
    await this.destroyUses();
    this.logger.verbose(`Destroy uses in ${Date.now() - usesNow}ms`);
  }

  /** Register scheduled jobs declared on internal signals. */
  registerSchedule(serverMode: "federation" | "batch" | "all") {
    const internals = [...this.#service.values(), ...this.#database.values()].map((mod) => mod.signal.internal);
    const failures: { label: string; reason: unknown }[] = [];
    for (const internalCls of internals) {
      try {
        const internal = this.registry.internal.get(internalCls);
        if (!internal) throw new Error(`Internal "${internalCls.refName}" is not registered`);
        SignalResolver.resolveSchedule(internalCls, internal as Internal, serverMode);
      } catch (err) {
        failures.push({ label: `schedule:${internalCls.refName}`, reason: err });
      }
    }
    if (failures.length === 0) return;
    const summary = failures.map((f) => `  • ${f.label}: ${reasonMessage(f.reason)}`).join("\n");
    throw new AggregateError(
      failures.map((f) => toError(f.reason)),
      `[DI:schedule] ${failures.length}/${internals.length} task(s) failed:\n${summary}`,
    );
  }

  /** Run the framework-level scheduler's onInit hooks after routes come up. */
  async runSchedulerInit() {
    const scheduler = this.#getScheduler();
    await scheduler._runInit();
  }

  /** Run the framework-level scheduler's onDestroy hooks during shutdown. */
  async runSchedulerDestroy() {
    const scheduler = this.#getScheduler();
    await scheduler._runDestroy();
  }

  /** Destroy services in reverse init order. Errors are logged, not thrown. */
  async destroyServices(): Promise<void> {
    const reversedStages = [...this.hierarchy.serviceStages].reverse();
    for (const stage of reversedStages) {
      await Promise.allSettled(
        stage.map(async (refName) => {
          const service = this.live.service.get(refName);
          if (!service) return;
          try {
            const now = Date.now();
            service.logger.verbose(`${refName} service destroying...`);
            await service._libsOnDestroy();
            service.logger.verbose(`${refName} service destroyed in ${Date.now() - now}ms`);
          } catch (error) {
            service.logger.warn(`Failed to destroy ${refName} service: ${reasonMessage(error)}`);
          }
        }),
      );
    }
  }

  /** Destroy adaptors in reverse init order. Errors are logged, not thrown. */
  async destroyAdaptors(): Promise<void> {
    const reversedStages = [...this.hierarchy.adaptorStages].reverse();
    for (const stage of reversedStages) {
      await Promise.allSettled(
        stage.map(async (refName) => {
          const adaptor = this.live.adaptor.get(refName);
          if (!adaptor) return;
          try {
            const now = Date.now();
            adaptor.logger.verbose(`${refName} adaptor destroying...`);
            await adaptor.onDestroy();
            adaptor.logger.verbose(`${refName} adaptor destroyed in ${Date.now() - now}ms`);
          } catch (error) {
            adaptor.logger.warn(`Failed to destroy ${refName} adaptor: ${reasonMessage(error)}`);
          }
        }),
      );
    }
  }

  async destroyUses(): Promise<void> {
    await Promise.allSettled(
      [...this.registry.uses.entries()].map(async ([key, value]) => {
        if (!isDestroyableUse(value)) return;
        try {
          await value.onDestroy();
        } catch (error) {
          this.logger.warn(`Failed to destroy ${key} use: ${reasonMessage(error)}`);
        }
      }),
    );
  }

  getWebsocketAdaptor(): WebsocketAdaptor | undefined {
    const adaptorCls = this.registry.adaptorRole.get(this.#predefinedAdaptorRole.websocket);
    return adaptorCls ? (this.registry.adaptor.get(adaptorCls) as WebsocketAdaptor | undefined) : undefined;
  }

  getByClass(cls: ServiceCls): Service;
  getByClass(cls: ServerSignalCls): ServerSignal;
  getByClass(cls: AdaptorCls): Adaptor;
  getByClass(cls: ServiceCls | ServerSignalCls | AdaptorCls): Service | ServerSignal | Adaptor {
    const service = this.registry.service.get(cls as ServiceCls);
    if (service) return service;

    const serverSignal = this.registry.serverSignal.get(cls as ServerSignalCls);
    if (serverSignal) return serverSignal;

    const adaptorCls = this.registry.adaptorRole.get(cls as AdaptorCls) ?? (cls as AdaptorCls);
    const adaptor = this.registry.adaptor.get(adaptorCls);
    if (adaptor) return adaptor;

    throw new Error(`Dependency "${cls.refName}" is not initialized.`);
  }

  getService<T = Service>(refName: string): T {
    const serviceRefName = normalizeServiceRefName(refName);
    const serviceCls = this.registry.serviceCls.get(serviceRefName);
    if (!serviceCls) throw new Error(`Service "${serviceRefName}" is not registered.`);
    const service = this.registry.service.get(serviceCls);
    if (!service) throw new Error(`Service "${serviceRefName}" is not initialized.`);
    return service as T;
  }

  getSignal<T = ServerSignal>(refName: string): T {
    const signalRefName = normalizeSignalRefName(refName);
    const serverSignalCls = this.registry.serverSignalCls.get(signalRefName);
    if (!serverSignalCls) throw new Error(`Server signal "${signalRefName}" is not registered.`);
    const serverSignal = this.registry.serverSignal.get(serverSignalCls);
    if (!serverSignal) throw new Error(`Server signal "${signalRefName}" is not initialized.`);
    return serverSignal as T;
  }

  getAdaptor<T = Adaptor>(refName: string): T {
    const adaptorRefName = normalizeAdaptorRefName(refName);
    const adaptorCls = this.registry.adaptorCls.get(adaptorRefName);
    if (!adaptorCls) throw new Error(`Adaptor "${adaptorRefName}" is not registered.`);
    const adaptor = this.registry.adaptor.get(adaptorCls);
    if (!adaptor) throw new Error(`Adaptor "${adaptorRefName}" is not initialized.`);
    return adaptor as T;
  }

  #getScheduler(): Scheduler {
    const adaptorCls = this.registry.adaptorRole.get(this.#predefinedAdaptorRole.schedule);
    const scheduler = adaptorCls ? this.registry.adaptor.get(adaptorCls) : undefined;
    if (!scheduler) throw new Error("Scheduler is not registered");
    return scheduler as Scheduler;
  }

  async #initializeUses() {
    const uses = Object.assign({}, ...this.#libs.map((lib) => lib.option.getUses(this.#env)));
    const entries = Object.entries(uses);
    await runStage(
      "uses",
      entries.map(([key, value]) => ({
        label: `uses:${key}`,
        run: async () => {
          const useValue = value instanceof Promise ? await value : value;
          this.registry.uses.set(key, useValue);
        },
      })),
    );
  }

  async #initializeAdaptor() {
    const adaptorMap = new Map<string, AdaptorCls>([
      ...Object.entries(this.#predefinedAdaptor).map(([, adaptorCls]) => [adaptorCls.refName, adaptorCls] as const),
      ...this.#adaptor.entries(),
    ]);
    for (const [role, adaptorCls] of Object.entries(this.#predefinedAdaptor)) {
      const roleCls = this.#predefinedAdaptorRole[role as keyof typeof predefinedAdaptorRole];
      this.registry.adaptorRole.set(roleCls, adaptorCls);
      this.registry.adaptorCls.set(roleCls.refName, roleCls);
    }
    const { stages: adaptorStages } = resolveAdaptorHierarchy(adaptorMap, this.registry.adaptorRole);
    this.hierarchy.adaptorStages = adaptorStages;

    for (const [stageIdx, stage] of adaptorStages.entries()) {
      await runStage(
        `adaptor[stage=${stageIdx}]`,
        stage.map((refName) => ({
          label: `adaptor:${refName}`,
          run: async () => {
            const adaptorCls = adaptorMap.get(refName);
            if (!adaptorCls) throw new Error(`Adaptor "${refName}" is not registered`);
            const adaptor = new adaptorCls();
            await InjectInfo.resolveInjection(adaptor, adaptorCls, this.registry, this.#env);
            const start = Date.now();
            adaptor.logger.verbose(`${refName} adaptor initializing...`);
            await adaptor.onInit?.();
            this.live.adaptor.set(refName, adaptor);
            this.registry.adaptorCls.set(refName, adaptorCls);
            this.registry.adaptor.set(adaptorCls, adaptor);
            for (const [role, roleAdaptorCls] of Object.entries(this.#predefinedAdaptorRole)) {
              if (this.#predefinedAdaptor[role as keyof typeof predefinedAdaptorRole] === adaptorCls) {
                this.registry.adaptor.set(roleAdaptorCls, adaptor);
              }
            }
            adaptor.logger.verbose(`${refName} adaptor initialized in ${Date.now() - start}ms`);
          },
        })),
      );
    }
  }

  async #initializeServerSignal() {
    const serverSignalClsEntries = [
      ...[...this.#service.values()].map((mod) => [mod.signal.server.refName, mod.signal.server] as const),
      ...[...this.#database.values()].map((mod) => [mod.signal.server.refName, mod.signal.server] as const),
    ];
    await runStage(
      "serverSignal",
      serverSignalClsEntries.map(([refName, serverSignalCls]) => ({
        label: `serverSignal:${refName}`,
        run: async () => {
          const serverSignal = new serverSignalCls();
          await InjectInfo.resolveInjection(serverSignal, serverSignalCls, this.registry, this.#env);
          SignalResolver.resolveServerSignal(serverSignalCls, { registry: this.registry, live: this.live });
          this.registry.serverSignalCls.set(refName, serverSignalCls);
          this.registry.serverSignal.set(serverSignalCls, serverSignal);
        },
      })),
    );
  }

  async #initializeService() {
    const serviceMap = new Map<string, ServiceCls>([
      ...[...this.#service.values()].map((mod) => [mod.service.srv.refName, mod.service.srv] as const),
      ...[...this.#database.values()].map((mod) => [mod.service.srv.refName, mod.service.srv] as const),
    ]);
    const { stages: serviceStages } = resolveServiceHierarchy(serviceMap);
    this.hierarchy.serviceStages = serviceStages;

    for (const [stageIdx, stage] of serviceStages.entries()) {
      await runStage(
        `service[stage=${stageIdx}]`,
        stage.map((refName) => ({
          label: `service:${refName}`,
          run: async () => {
            const serviceCls = serviceMap.get(refName);
            if (!serviceCls) throw new Error(`Service "${refName}" is not registered`);
            if (serviceCls.type === "database") {
              const databaseModule = this.#database.get(serviceCls.refName);
              if (!databaseModule) throw new Error(`Database "${serviceCls.refName}" is not registered`);
              ServiceResolver.resolveDatabaseService(
                databaseModule.constant,
                databaseModule.database,
                serviceCls,
                // Deliberately lazy. Resolving a cascade target eagerly would add an init-order edge between two
                // services that have no dependency at boot, and a cascade cycle would then fail the whole boot.
                (refName) => this.getService(refName),
              );
            }
            const service = new serviceCls();
            await InjectInfo.resolveInjection(service, serviceCls, this.registry, this.#env);
            await service._libsOnInit();
            this.live.service.set(refName, service);
            this.registry.serviceCls.set(refName, serviceCls);
            this.registry.service.set(serviceCls, service);
            service.logger.verbose(`${refName} service initialized`);
          },
        })),
      );
    }
  }

  async #initializeInternal() {
    const internalClsEntries = [
      ...[...this.#service.values()].map((mod) => [mod.signal.internal.refName, mod.signal.internal] as const),
      ...[...this.#database.values()].map((mod) => [mod.signal.internal.refName, mod.signal.internal] as const),
    ];
    await runStage(
      "internal",
      internalClsEntries.map(([refName, internalCls]) => ({
        label: `internal:${refName}`,
        run: async () => {
          const internal = new internalCls();
          await InjectInfo.resolveInjection(internal, internalCls, this.registry, this.#env);
          this.registry.internalCls.set(refName, internalCls);
          this.registry.internal.set(internalCls, internal);
          this.live.internal.set(refName, internal);
        },
      })),
    );
  }

  async #initializeSlice(): Promise<SignalRoutes> {
    const sliceClsEntries = [...this.#database.values()].map(
      (mod) => [mod.signal.slice.refName, mod.signal.slice] as const,
    );
    const routes: SignalRoutes["routes"] = {};
    const routeOptions: NonNullable<SignalRoutes["routeOptions"]> = {};
    const wsRoutes: WebsocketRoutes = {};
    await runStage(
      "slice",
      sliceClsEntries.map(([refName, sliceCls]) => ({
        label: `slice:${refName}`,
        run: async () => {
          const sliceEndpointCls = SignalResolver.resolveSlice(sliceCls);
          const sliceEndpoint = new sliceEndpointCls();
          await InjectInfo.resolveInjection(sliceEndpoint, sliceEndpointCls, this.registry, this.#env);
          const {
            routes: sliceRoutes,
            wsRoutes: sliceWsRoutes,
            routeOptions: sliceRouteOptions,
          } = SignalResolver.resolveEndpoint(sliceEndpointCls, sliceEndpoint, {
            registry: this.registry,
            env: this.#env,
            live: this.live,
            middleware: this.#middleware,
          });
          Object.assign(routes, sliceRoutes);
          Object.assign(routeOptions, sliceRouteOptions);
          Object.assign(wsRoutes, sliceWsRoutes);
          this.registry.endpointCls.set(refName, sliceEndpointCls);
          this.registry.endpoint.set(sliceEndpointCls, sliceEndpoint);
          this.live.sliceCls.set(sliceCls.baseName, sliceCls);
        },
      })),
    );
    return { routes, wsRoutes, routeOptions };
  }

  async #initializeEndpoint(): Promise<SignalRoutes> {
    const endpointClsEntries = [
      ...[...this.#service.values()].map((mod) => [mod.signal.endpoint.refName, mod.signal.endpoint] as const),
      ...[...this.#database.values()].map((mod) => [mod.signal.endpoint.refName, mod.signal.endpoint] as const),
    ];
    const routes: SignalRoutes["routes"] = {};
    const routeOptions: NonNullable<SignalRoutes["routeOptions"]> = {};
    const wsRoutes: WebsocketRoutes = {};
    await runStage(
      "endpoint",
      endpointClsEntries.map(([refName, endpointCls]) => ({
        label: `endpoint:${refName}`,
        run: async () => {
          const endpoint = new endpointCls();
          await InjectInfo.resolveInjection(endpoint, endpointCls, this.registry, this.#env);
          const {
            routes: endpointRoutes,
            wsRoutes: endpointWsRoutes,
            routeOptions: endpointRouteOptions,
          } = SignalResolver.resolveEndpoint(endpointCls, endpoint as Endpoint, {
            registry: this.registry,
            env: this.#env,
            live: this.live,
            middleware: this.#middleware,
          });
          Object.assign(routes, endpointRoutes);
          Object.assign(routeOptions, endpointRouteOptions);
          Object.assign(wsRoutes, endpointWsRoutes);
          this.registry.endpointCls.set(refName, endpointCls);
          this.registry.endpoint.set(endpointCls, endpoint);
          this.live.endpointCls.set(endpointCls.baseName, endpointCls);
        },
      })),
    );
    return { routes, wsRoutes, routeOptions };
  }
}
