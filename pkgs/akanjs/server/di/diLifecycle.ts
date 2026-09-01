import { type BackendEnv, getEnv } from "akanjs/base";
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
import { agent as agentSignal } from "../../signal/agent.signal";
import { agentTurnConstant, agentTurnDocument } from "../../signal/agentTurn";
import { Base, BaseEndpoint, BaseInternal } from "../../signal/base.signal";
import type { Endpoint } from "../../signal/endpoint";
import type { Internal } from "../../signal/internal";
import { Logging, type MiddlewareCls } from "../../signal/middleware";
import type { ServerSignal, ServerSignalCls } from "../../signal/serverSignal";
import { SignalRegistry } from "../../signal/signalRegistry";
import type { AkanLib, DatabaseModule, ScalarModule, ServiceModule } from "../akanLib";
import { createDefaultAkanOption } from "../akanOption";
import type { WebProxyRegistration } from "../proxy";
import { CascadeRunner, DatabaseResolver, ServiceResolver, SignalResolver } from "../resolver";
import type { SignalRoutes, WebsocketRoutes } from "../types";
import { getPredefinedAdaptor, predefinedAdaptorRole } from "./predefinedAdaptor";
import { collectAdaptors, resolveAdaptorHierarchy } from "./resolveAdaptorHierarchy";
import { resolveServiceHierarchy } from "./resolveServiceHierarchy";
import {
  assertUniqueRegistrations,
  type DiModuleCandidate,
  getModuleCascadeRefNames,
  getModuleDependencyRefNames,
  isDestroyableUse,
  normalizeAdaptorRefName,
  normalizeServiceRefName,
  normalizeSignalRefName,
  type Registration,
  reasonMessage,
  runStage,
  toError,
} from "./utils";

export interface DiLifecycleProps {
  env: BackendEnv;
  /**
   * Boot only these modules and the ones they reach, leaving every other module out of the container. Omitted or
   * empty mounts every module whose service is enabled.
   */
  modules?: string[];
}

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
  readonly #env: BackendEnv;
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
  readonly #cascade = new CascadeRunner();

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

  static #envOn(...names: string[]) {
    return !names.some((name) => process.env[name] === "false" || process.env[name] === "0");
  }

  constructor({ env, modules = [] }: DiLifecycleProps, ...libs: AkanLib[]) {
    this.#env = env;
    // Copied: "single" mode hands back the shared module-scope object, and applyAdaptor overrides mutate per app.
    this.#predefinedAdaptor = { ...getPredefinedAdaptor(getEnv().databaseMode ?? "single") };
    this.#libs = libs;
    this.#service.set("base", {
      service: srv.base,
      signal: SignalRegistry.registerService("base" as const, BaseInternal, BaseEndpoint, Base),
    });
    // The in-page agent relay ships with the framework; a lib that still carries its own `agent` module wins the
    // refName below (candidates merge last), so an older workspace copy keeps working unchanged.
    const frameworkAgent: ServiceModule | null = DiLifecycle.#envOn("AKAN_AGENT", "AKAN_PUBLIC_AGENT")
      ? { service: srv.agent, signal: agentSignal }
      : null;
    if (frameworkAgent) this.#service.set("agent", frameworkAgent);
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
      lib.option.getAdaptorOverrides().forEach(({ role, adaptor }) => {
        const roleKey = Object.entries(this.#predefinedAdaptorRole).find(([, roleCls]) => roleCls === role)?.[0];
        if (!roleKey) {
          this.logger.warn(`applyAdaptor got an unknown role "${role.refName}" — override ignored`);
          return;
        }
        (this.#predefinedAdaptor as Record<string, AdaptorCls>)[roleKey] = adaptor;
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
    const disabledModules = this.#resolveDisabledModules(databaseCandidates, serviceCandidates, modules);
    databaseCandidates.forEach(({ refName, module }) => {
      if (disabledModules.has(refName)) return;
      this.#database.set(refName, module as DatabaseModule);
    });
    serviceCandidates.forEach(({ refName, module }) => {
      if (disabledModules.has(refName)) return;
      this.#service.set(refName, module as ServiceModule);
    });
    if (frameworkAgent && this.#service.get("agent") !== frameworkAgent)
      this.logger.info("agent relay is provided by a lib module — the framework's is skipped");
    if (!this.#scalar.has("agentTurn"))
      this.#scalar.set("agentTurn", { constant: agentTurnConstant, database: agentTurnDocument });
    const adaptorClaims = new Map<string, AdaptorCls>();
    const adaptorRegistrations: Registration[] = [];
    // A class reached twice is one adaptor, not two claimants; only a rival class under the same refName is recorded.
    const claimAdaptor = (adaptorCls: AdaptorCls, owner: string) => {
      const claimed = adaptorClaims.get(adaptorCls.refName);
      if (claimed === adaptorCls) return;
      if (!claimed) adaptorClaims.set(adaptorCls.refName, adaptorCls);
      adaptorRegistrations.push({ key: adaptorCls.refName, owner });
    };
    for (const [role, adaptorCls] of Object.entries(this.#predefinedAdaptor))
      claimAdaptor(adaptorCls, `predefined adaptor "${role}"`);
    this.#database.forEach((mod) => {
      const { adaptor, schema } = DatabaseResolver.resolveDatabase(mod.constant, mod.database);
      this.#adaptor.set(adaptor.refName, adaptor);
      claimAdaptor(adaptor, `database module "${mod.constant.refName}"`);
      this.#cascade.register(mod.constant, schema, mod.service.srv);
    });
    const services = [
      ...[...this.#service.values()].map((mod) => mod.service.srv),
      ...[...this.#database.values()].map((mod) => mod.service.srv),
    ];
    for (const service of services) {
      for (const adaptor of collectAdaptors([service])) {
        this.#adaptor.set(adaptor.refName, adaptor);
        claimAdaptor(adaptor, `service "${service.refName}"`);
      }
    }
    assertUniqueRegistrations("adaptor", adaptorRegistrations);
  }

  #resolveDisabledModules(
    databaseCandidates: Map<string, DiModuleCandidate>,
    serviceCandidates: Map<string, DiModuleCandidate>,
    modules: string[],
  ) {
    const candidates = new Map<string, DiModuleCandidate>([...databaseCandidates, ...serviceCandidates]);
    const disabledReasons = new Map<string, string>();

    candidates.forEach(({ refName, module }) => {
      if (!module.service.srv.enabled) disabledReasons.set(refName, "service disabled");
    });

    // Applied over the enabled set rather than beside it: naming a module the workspace disabled does not enable it.
    const selected = this.#resolveSelectedModules(candidates, modules);
    if (selected) {
      candidates.forEach(({ refName }) => {
        if (!selected.has(refName) && !disabledReasons.has(refName))
          disabledReasons.set(refName, 'not named by the "modules" option');
      });
    }

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

  /**
   * The named modules closed over everything they reach: the services and signals they inject, and the cascade
   * edges whose absence fails `CascadeRunner.seal`. `null` means no selection was asked for.
   *
   * An unknown name is refused rather than ignored, because a typo would otherwise boot an app with the module
   * silently missing — the one failure this option exists to make impossible.
   */
  #resolveSelectedModules(candidates: Map<string, DiModuleCandidate>, modules: string[]) {
    if (!modules.length) return null;
    const known = new Set([...candidates.keys(), ...this.#service.keys()]);
    const unknown = modules.filter((refName) => !known.has(refName));
    if (unknown.length) {
      const registered = [...known].sort((a, b) => a.localeCompare(b)).join(", ");
      throw new Error(
        `[DI:modules] unknown module ${unknown.map((refName) => `"${refName}"`).join(", ")}. Registered: ${registered}`,
      );
    }
    const selected = new Set<string>();
    const pending = modules.filter((refName) => candidates.has(refName));
    while (pending.length) {
      const refName = pending.pop();
      if (!refName || selected.has(refName)) continue;
      selected.add(refName);
      const candidate = candidates.get(refName);
      if (!candidate) continue;
      const dependencies = [
        ...getModuleDependencyRefNames(candidate.module),
        ...getModuleCascadeRefNames(candidate.module),
      ];
      for (const dependency of dependencies) if (candidates.has(dependency)) pending.push(dependency);
    }
    const mounted = [...selected].sort((a, b) => a.localeCompare(b)).join(", ");
    this.logger.info(`Mounting ${selected.size} of ${candidates.size} module(s): ${mounted}`);
    return selected;
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
    const routes: SignalRoutes["routes"] = {};
    SignalResolver.mergeHttpRoutes(routes, sliceRoutes);
    SignalResolver.mergeHttpRoutes(routes, endpointRoutes);
    return {
      routes,
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
    // `llmOption` is seeded first so the predefined LLM adaptor always resolves its `use`, with or without an app.
    const entries = [
      {
        key: "llmOption",
        owner: "the framework",
        value: Object.assign({}, ...this.#libs.map((lib) => lib.option.getLlm(this.#env))) as unknown,
      },
      ...this.#libs.flatMap((lib) =>
        lib.option.getUses(this.#env).map(([key, value]) => ({ key, owner: `lib "${lib.name}"`, value })),
      ),
    ];
    assertUniqueRegistrations("use", entries);
    await runStage(
      "uses",
      entries.map(({ key, value }) => ({
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
              ServiceResolver.resolveDatabaseService(databaseModule.database, serviceCls, this.#cascade);
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
    // Sealed only now: a service that registered a `remove` listener in `onInit` still counts against a bulk
    // cascade, and every target service is live, so an unmounted one fails here instead of mid-removal.
    this.#cascade.seal((refName: string) => this.getService(refName));
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
          SignalResolver.mergeHttpRoutes(routes, sliceRoutes);
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
          SignalResolver.mergeHttpRoutes(routes, endpointRoutes);
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
