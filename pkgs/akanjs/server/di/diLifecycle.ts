import { type BackendEnv, DatabaseModes, getEnv } from "akanjs/base";
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
import { Logging, type MiddlewareCls, Timeout } from "../../signal/middleware";
import type { ServerSignal, ServerSignalCls } from "../../signal/serverSignal";
import { SignalRegistry } from "../../signal/signalRegistry";
import type { AkanLib, DatabaseModule, ScalarModule, ServiceModule } from "../akanLib";
import { createDefaultAkanOption } from "../akanOption";
import type { WebProxyRegistration } from "../proxy";
import { CascadeRunner, DatabaseResolver, ServiceResolver, SignalResolver } from "../resolver";
import type { SignalRoutes, WebsocketRoutes } from "../types";
import { collectPredefinedDependencies, getPredefinedAdaptor, predefinedAdaptorRole } from "./predefinedAdaptor";
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
  /**
   * Drop these modules and everything that reaches them, leaving the rest mounted. Applied over `modules`
   * rather than beside it, so a module named by both stays out.
   */
  disableModules?: string[];
  /**
   * The same, by owning lib: every database and service module the named libs registered goes, along with
   * everything that reaches one. What a lib's `option.ts` contributes — middleware, web proxies, adaptor
   * overrides — is untouched, as it is under `modules`.
   */
  disableLibs?: string[];
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

  // The rule `getEnv()` settles on, run where a boot may fail: a mode that is misspelled, ambiguous or missing its
  // drivers stops here and says what to fix, instead of surfacing as an import error inside an adaptor's init.
  static #databaseMode() {
    const { environment, operationMode } = getEnv();
    const mode = DatabaseModes.resolve({
      requested: process.env.AKAN_DATABASE_MODE,
      declared: process.env.AKAN_DATABASE_MODES,
      local: environment === "local" || operationMode === "local",
    });
    const missing = DatabaseModes.drivers[mode].filter((driver) => {
      try {
        import.meta.resolve(driver);
        return false;
      } catch {
        return true;
      }
    });
    if (missing.length)
      throw new Error(
        `The ${mode} database mode imports ${missing.join(", ")}, which this build does not carry. Declare "${mode}" in database.modes of akan.config.ts: akan build bundles the drivers of every declared mode, and akan start installs them.`,
      );
    return mode;
  }

  static #envOn(...names: string[]) {
    return !names.some((name) => process.env[name] === "false" || process.env[name] === "0");
  }

  constructor({ env, modules = [], disableModules = [], disableLibs = [] }: DiLifecycleProps, ...libs: AkanLib[]) {
    this.#env = env;
    const databaseMode = DiLifecycle.#databaseMode();
    this.logger.info(`Database mode: ${DatabaseModes.describe(databaseMode)}`);
    // Copied: "single" mode hands back the shared module-scope object, and applyAdaptor overrides mutate per app.
    this.#predefinedAdaptor = { ...getPredefinedAdaptor(databaseMode) };
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
    // Registered rather than opt-in because it is what makes an endpoint's declared `timeout` mean anything;
    // it stands aside for every endpoint that declared none.
    this.#middleware.set(Timeout.refName, Timeout);
    const defaultOption = createDefaultAkanOption();
    defaultOption.getMiddlewares().forEach((middleware) => {
      this.#middleware.set(middleware.refName, middleware);
    });
    this.webProxies.push(...defaultOption.getWebProxies());
    const databaseCandidates = new Map<string, DiModuleCandidate>();
    const serviceCandidates = new Map<string, DiModuleCandidate>();
    // Last writer wins, exactly as the candidate maps do: two libs declaring one refName leave the surviving
    // candidate's own lib as its owner, so disabling the other lib does not take a module it did not provide.
    const moduleLibs = new Map<string, string>();
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
        moduleLibs.set(mod.constant.refName, lib.name);
      });
      lib.service.forEach((mod) => {
        serviceCandidates.set(mod.service.srv.refName, { refName: mod.service.srv.refName, module: mod });
        moduleLibs.set(mod.service.srv.refName, lib.name);
      });
      lib.scalar.forEach((mod) => {
        this.#scalar.set(mod.constant.refName, mod);
      });
    });
    const disabledModules = this.#resolveDisabledModules({
      databaseCandidates,
      serviceCandidates,
      modules,
      disableModules,
      disableLibs,
      moduleLibs,
    });
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
    for (const adaptor of collectPredefinedDependencies(this.#predefinedAdaptor)) {
      this.#adaptor.set(adaptor.refName, adaptor);
      claimAdaptor(adaptor, "a predefined adaptor's dependency");
    }
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

  #resolveDisabledModules({
    databaseCandidates,
    serviceCandidates,
    modules,
    disableModules,
    disableLibs,
    moduleLibs,
  }: {
    databaseCandidates: Map<string, DiModuleCandidate>;
    serviceCandidates: Map<string, DiModuleCandidate>;
    modules: string[];
    disableModules: string[];
    disableLibs: string[];
    moduleLibs: Map<string, string>;
  }) {
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

    const excluded = this.#resolveExcludedModules({ candidates, disableModules, disableLibs, moduleLibs });
    // Last, so it wins over a selection: `modules` says what a process is for, the exclusions what it must not run.
    excluded.forEach((reason, refName) => {
      if (!disabledReasons.has(refName)) disabledReasons.set(refName, reason);
    });
    const excludedClosure = new Set(excluded.keys());

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
          if (excludedClosure.has(dependencyRefName)) excludedClosure.add(refName);
          changed = true;
          break;
        }
      });
    }

    disabledReasons.forEach((reason, refName) => {
      this.disabledModules.set(refName, reason);
      this.logger.verbose(`Skipping disabled module "${refName}": ${reason}`);
    });
    // The named ones are the caller's own list; the modules that came with them are the surprise worth a line.
    const cascaded = [...excludedClosure]
      .filter((refName) => !excluded.has(refName))
      .sort((a, b) => a.localeCompare(b));
    if (cascaded.length) {
      const option = disableLibs.length
        ? disableModules.length
          ? "disableModules/disableLibs"
          : "disableLibs"
        : "disableModules";
      this.logger.info(`${option} also dropped ${cascaded.length} dependent module(s): ${cascaded.join(", ")}`);
    }
    return new Set(disabledReasons.keys());
  }

  /**
   * The modules the caller took off, by name and by owning lib, each mapped to the reason it is gone. An
   * unknown name is refused for the mirror of the reason `modules` refuses one: a typo there drops a module
   * silently, and a typo here keeps one running silently.
   */
  #resolveExcludedModules({
    candidates,
    disableModules,
    disableLibs,
    moduleLibs,
  }: {
    candidates: Map<string, DiModuleCandidate>;
    disableModules: string[];
    disableLibs: string[];
    moduleLibs: Map<string, string>;
  }) {
    const excluded = new Map<string, string>();
    if (disableModules.length) {
      const known = new Set([...candidates.keys(), ...this.#service.keys()]);
      const unknown = disableModules.filter((refName) => !known.has(refName));
      if (unknown.length) {
        const registered = [...known].sort((a, b) => a.localeCompare(b)).join(", ");
        throw new Error(
          `[DI:disableModules] unknown module ${unknown.map((refName) => `"${refName}"`).join(", ")}. Registered: ${registered}`,
        );
      }
      disableModules.forEach((refName) => {
        if (candidates.has(refName)) excluded.set(refName, 'named by the "disableModules" option');
      });
    }
    if (disableLibs.length) {
      // Every mounted lib, not just the ones that registered a module: a lib that carries only scalars or an
      // `option.ts` is a legitimate name to write, and refusing it would read as a typo.
      const known = new Set(this.#libs.map((lib) => lib.name));
      const unknown = disableLibs.filter((name) => !known.has(name));
      if (unknown.length) {
        const registered = [...known].sort((a, b) => a.localeCompare(b)).join(", ");
        throw new Error(
          `[DI:disableLibs] unknown lib ${unknown.map((name) => `"${name}"`).join(", ")}. Mounted: ${registered}`,
        );
      }
      const excludedLibs = new Set(disableLibs);
      moduleLibs.forEach((libName, refName) => {
        if (!excludedLibs.has(libName) || !candidates.has(refName) || excluded.has(refName)) return;
        excluded.set(refName, `in lib "${libName}", named by the "disableLibs" option`);
      });
    }
    return excluded;
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
    this.logger.debug(`Mounting ${selected.size} of ${candidates.size} module(s): ${mounted}`);
    return selected;
  }

  /**
   * Run every init stage in dependency order and collect the generated routes.
   *
   * A stage runs its tasks in parallel and reports every failure, which means the ones that *succeeded*
   * alongside a failure are live: connections opened, timers armed, `onInit` done. The error then propagates and
   * the process usually exits, so this rarely mattered — but a caller that catches and retries (a test harness,
   * a dev restart) accumulated them. `destroyAll` already walks the stages in reverse and skips what was never
   * registered, so the wind-down is the one that already exists.
   */
  async initializeAll(): Promise<SignalRoutes> {
    try {
      return await this.#initializeAll();
    } catch (error) {
      await this.destroyAll().catch((destroyError: unknown) => {
        // The init failure is the one worth reporting; a failure while unwinding it is a footnote.
        this.logger.warn(`Failed to unwind a partial init: ${reasonMessage(destroyError)}`);
      });
      throw error;
    }
  }

  async #initializeAll(): Promise<SignalRoutes> {
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
    const liveKeys: string[] = [];
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
          liveKeys.push(...SignalResolver.registerLiveSync(sliceCls, { registry: this.registry, live: this.live }));
        },
      })),
    );
    if (liveKeys.length) this.logger.verbose(`Live sync: ${liveKeys.length} live slice(s) — ${liveKeys.join(", ")}`);
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
