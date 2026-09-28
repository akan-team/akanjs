interface RefreshRuntime {
  injectIntoGlobalHook(host: object): void;
  register(type: unknown, id: string): void;
  performReactRefresh(): unknown;
  createSignatureFunctionForTransform(): (type: unknown, ...rest: unknown[]) => unknown;
  isLikelyComponentType(value: unknown): boolean;
  getFamilyByType(value: unknown): unknown;
}

export type CsrAcceptCallback = (updated: string[]) => void;

export interface CsrHotContext {
  readonly data: Record<string, unknown> | undefined;
  accept(deps?: string | string[], callback?: CsrAcceptCallback): void;
  dispose(callback: (data: Record<string, unknown>) => void): void;
  invalidate(): void;
}

export interface CsrModuleRecord {
  readonly id: string;
  exports: unknown;
  readonly hot: CsrHotContext;
}

export type CsrModuleFactory = (
  this: unknown,
  require: (specifier: string) => unknown,
  module: CsrModuleRecord,
  exports: unknown,
  $RefreshReg$: (type: unknown, localId: string) => void,
  $RefreshSig$: () => (type: unknown, ...rest: unknown[]) => unknown,
  __akanImport: (specifier: string) => Promise<unknown>,
) => void;

export interface CsrUpdateMessage {
  generation: number;
  url?: string | null;
  reload?: boolean;
  reason?: string;
}

export interface CsrDevRuntimeApi {
  readonly generation: number;
  define(id: string, factory: CsrModuleFactory): void;
  defineHelpers(hash: string, factory: () => Record<string, unknown>): void;
  helpers(hash: string): Record<string, unknown>;
  start(options: { generation: number; refresh: string }): void;
  /** No entry to run: an SSR page requires the modules its RSC payload names, after the bootstrap has run. */
  startLibrary(options: { generation: number; refresh: string; bootstrap: string }): void;
  /** Registers a module the page already loaded outside the registry (an import map vendor). */
  provide(id: string, namespace: unknown): void;
  require(id: string): unknown;
  has(id: string): boolean;
  /** Settles once a patch defines `id`: the RSC payload can name a module whose patch is still on its way. */
  whenDefined(id: string): Promise<void>;
  /** Settles once every update handed to `hot` so far is applied, its accept callbacks included. */
  whenSettled(): Promise<void>;
  update(generation: number, factories: Record<string, CsrModuleFactory>): void;
  accept(ownerId: string, deps: string[], callback: CsrAcceptCallback): void;
  hot(message: CsrUpdateMessage): void;
  toESM(mod: unknown, isNodeMode?: number): unknown;
  reExport(target: object, mod: unknown, secondTarget?: object): object | undefined;
  inspect(): { generation: number; executed: string[]; modules: number };
}

interface CsrScriptElement {
  src: string;
  dataset: Record<string, string | undefined>;
  onload: (() => void) | null;
  onerror: (() => void) | null;
  remove(): void;
}

export interface CsrDevRuntimeHost {
  __akan?: CsrDevRuntimeApi;
  __AKAN_CSR_LAST_UPDATE__?: { generation: number; executed: string[]; appliedAt?: number; refreshedAt?: number };
  document: {
    currentScript: unknown;
    head: { appendChild(node: unknown): unknown };
    createElement(tagName: "script"): CsrScriptElement;
  };
  location: { reload(): void };
  console: { warn(...args: unknown[]): void };
  fetch?(url: string, init: { method: string; cache: "no-store" }): Promise<{ ok: boolean }>;
  setTimeout(callback: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

// Serialized with `toString()` into the page, so it must not reach anything outside its own body.
export const installCsrDevRuntime = (host: CsrDevRuntimeHost): void => {
  if (host.__akan) return;
  const modulePrefix = "akan-module:";
  const maxInvalidateRounds = 8;

  class HotContext implements CsrHotContext {
    selfAccepted = false;
    invalidated = false;
    readonly disposers: ((data: Record<string, unknown>) => void)[] = [];
    readonly acceptedDeps = new Map<string, CsrAcceptCallback>();
    constructor(readonly data: Record<string, unknown> | undefined) {}
    accept(deps?: string | string[], callback: CsrAcceptCallback = () => undefined) {
      if (deps === undefined) {
        this.selfAccepted = true;
        return;
      }
      for (const dep of Array.isArray(deps) ? deps : [deps])
        this.acceptedDeps.set(dep.startsWith(modulePrefix) ? dep.slice(modulePrefix.length) : dep, callback);
    }
    dispose(callback: (data: Record<string, unknown>) => void) {
      this.disposers.push(callback);
    }
    invalidate() {
      this.invalidated = true;
    }
  }

  class ModuleRecord implements CsrModuleRecord {
    exports: unknown = {};
    readonly parents = new Set<string>();
    readonly children = new Set<string>();
    readonly hot: HotContext;
    constructor(
      readonly id: string,
      data: Record<string, unknown> | undefined,
    ) {
      this.hot = new HotContext(data);
    }
  }

  class CsrDevRegistry implements CsrDevRuntimeApi {
    #factories = new Map<string, CsrModuleFactory>();
    #waiters = new Map<string, (() => void)[]>();
    //? Modules RSDW required for a payload's client references: nothing in the registry imports them.
    #roots = new Set<string>();
    #started = false;
    #startFailed = false;
    #early: CsrUpdateMessage[] = [];
    #helperFactories = new Map<string, () => Record<string, unknown>>();
    #helperValues = new Map<string, Record<string, unknown>>();
    #cache = new Map<string, ModuleRecord>();
    #hotData = new Map<string, Record<string, unknown>>();
    #refresh: RefreshRuntime | null = null;
    #refreshTimer: unknown = null;
    #generation = 0;
    #executed: string[] = [];
    #patchQueue: Promise<void> = Promise.resolve();
    #settling: Promise<void> = Promise.resolve();
    #reloading = false;

    get generation() {
      return this.#generation;
    }

    define(id: string, factory: CsrModuleFactory) {
      this.#factories.set(id, factory);
      this.#settleWaiters([id]);
    }

    //? Bun repeats its interop helpers in every module; the bundle defines each distinct set once and modules share it.
    defineHelpers(hash: string, factory: () => Record<string, unknown>) {
      if (!this.#helperFactories.has(hash)) this.#helperFactories.set(hash, factory);
    }

    helpers(hash: string) {
      const cached = this.#helperValues.get(hash);
      if (cached) return cached;
      const factory = this.#helperFactories.get(hash);
      if (!factory) throw new Error(`[akan-csr] no helpers registered as ${hash}`);
      const value = factory();
      this.#helperValues.set(hash, value);
      return value;
    }

    start({ generation, refresh }: { generation: number; refresh: string }) {
      const script = host.document.currentScript as CsrScriptElement | null;
      const entry = script?.dataset.akanCsrEntry;
      if (!entry) throw new Error("[akan-csr] the app script carries no data-akan-csr-entry");
      this.#generation = generation;
      this.#refresh = this.#load(refresh).exports as RefreshRuntime;
      // Before the entry runs: react-dom looks for the DevTools hook once, when it is first evaluated.
      this.#refresh.injectIntoGlobalHook(host);
      this.#run(entry);
    }

    //? The page's own HMR script already put this refresh runtime into React's hook; a second inject would wrap it.
    startLibrary({ generation, refresh, bootstrap }: { generation: number; refresh: string; bootstrap: string }) {
      this.#generation = generation;
      this.#refresh = this.#load(refresh).exports as RefreshRuntime;
      this.#run(bootstrap);
    }

    //? An entry that throws leaves no module to patch, so any newer update then reloads onto the fixed code.
    #run(entry: string) {
      try {
        this.#load(entry);
      } catch (error) {
        this.#startFailed = true;
        throw error;
      } finally {
        this.#begin();
      }
    }

    //? Seen as a compiled ESM module: named exports read through, and `default` stays the package's own default.
    provide(id: string, namespace: unknown) {
      if (this.#cache.has(id)) return;
      const view: Record<string, unknown> = {};
      Object.defineProperty(view, "__esModule", { value: true });
      if (namespace != null && (typeof namespace === "object" || typeof namespace === "function"))
        for (const key of Object.keys(namespace))
          Object.defineProperty(view, key, {
            get: () => (namespace as Record<string, unknown>)[key],
            enumerable: true,
          });
      const record = new ModuleRecord(id, undefined);
      record.exports = view;
      this.#cache.set(id, record);
    }

    require(id: string) {
      this.#roots.add(id);
      return this.#load(id).exports;
    }

    has(id: string) {
      return this.#cache.has(id) || this.#factories.has(id);
    }

    whenDefined(id: string) {
      if (this.has(id)) return Promise.resolve();
      return new Promise<void>((resolve, reject) => {
        const timer = host.setTimeout(
          () => reject(new Error(`[akan-csr] no module registered as ${id}, and no update brought one`)),
          20_000,
        );
        const waiters = this.#waiters.get(id) ?? [];
        waiters.push(() => {
          host.clearTimeout(timer);
          resolve();
        });
        this.#waiters.set(id, waiters);
      });
    }

    update(generation: number, factories: Record<string, CsrModuleFactory>) {
      if (generation <= this.#generation) return;
      if (generation !== this.#generation + 1) {
        this.#reload(`missed generation ${this.#generation + 1} before ${generation}`);
        return;
      }
      const ids = Object.keys(factories);
      for (const id of ids) this.#factories.set(id, factories[id] as CsrModuleFactory);
      this.#settleWaiters(ids);
      this.#generation = generation;
      this.#executed = [];
      const threw = (error: unknown) =>
        this.#reload(
          `generation ${generation} threw while applying: ${error instanceof Error ? error.message : error}`,
        );
      let pending: Promise<void>[] = [];
      try {
        pending = this.#apply(ids.filter((id) => this.#cache.has(id)));
      } catch (error) {
        threw(error);
      }
      host.__AKAN_CSR_LAST_UPDATE__ = { generation, executed: this.#executed.slice(), appliedAt: Date.now() };
      if (pending.length > 0) this.#settling = Promise.all(pending).then(() => this.#scheduleRefresh(), threw);
    }

    // For generated ESM: Bun renames a free `module` in an ESM file to a `module_<name>` it never defines.
    accept(ownerId: string, deps: string[], callback: CsrAcceptCallback) {
      const owner = this.#cache.get(ownerId);
      if (!owner) throw new Error(`[akan-csr] ${ownerId} accepts updates before it is loaded`);
      owner.hot.accept(deps, callback);
    }

    hot(message: CsrUpdateMessage) {
      //? An SSR page loads the registry after its WebSocket may already carry updates; they wait for the start.
      if (!this.#started) {
        this.#early.push(message);
        return;
      }
      if (message.generation <= this.#generation) return;
      if (message.reload || this.#startFailed) {
        this.#reload(
          this.#startFailed
            ? `the app failed to start, and generation ${message.generation} arrived`
            : (message.reason ?? "the dev server asked for a reload"),
        );
        return;
      }
      const url = message.url;
      if (!url) {
        this.#reload(`generation ${message.generation} arrived without a patch`);
        return;
      }
      //? The next patch waits for the last one's async accept callbacks, so the route table is never swapped twice at once.
      this.#patchQueue = this.#patchQueue.then(() => this.#loadPatch(url)).then(() => this.#settling);
    }

    inspect() {
      return { generation: this.#generation, executed: this.#executed.slice(), modules: this.#cache.size };
    }

    whenSettled() {
      return this.#patchQueue.then(() => this.#settling);
    }

    #begin() {
      this.#started = true;
      const early = this.#early;
      this.#early = [];
      for (const message of early) this.hot(message);
    }

    #settleWaiters(ids: string[]) {
      for (const id of ids) {
        const waiters = this.#waiters.get(id);
        if (!waiters) continue;
        this.#waiters.delete(id);
        for (const settle of waiters) settle();
      }
    }

    readonly toESM = (mod: unknown, _isNodeMode?: number): unknown => {
      //? Bun marks every external as format-unknown and passes isNodeMode; a registry module compiled from ESM
      //? carries __esModule, and Node's "default is module.exports" rule would hand its importer the whole namespace.
      if (mod != null && (mod as { __esModule?: boolean }).__esModule) return mod;
      const namespace: Record<string, unknown> = {};
      Object.defineProperty(namespace, "default", { value: mod, enumerable: true });
      if (mod == null || (typeof mod !== "object" && typeof mod !== "function")) return namespace;
      for (const key of Object.getOwnPropertyNames(mod)) {
        if (key === "default" || key === "__esModule") continue;
        Object.defineProperty(namespace, key, { get: () => (mod as Record<string, unknown>)[key], enumerable: true });
      }
      return namespace;
    };

    //? Bun's own __reExport copies the non-enumerable __esModule marker as an enumerable key.
    readonly reExport = (target: object, mod: unknown, secondTarget?: object): object | undefined => {
      const keys =
        mod != null && (typeof mod === "object" || typeof mod === "function") ? Object.getOwnPropertyNames(mod) : [];
      for (const to of secondTarget ? [target, secondTarget] : [target]) {
        for (const key of keys) {
          // biome-ignore lint/suspicious/noPrototypeBuiltins: Object.hasOwn needs Safari 15.4; native shells run older WebViews
          if (key === "default" || key === "__esModule" || Object.prototype.hasOwnProperty.call(to, key)) continue;
          Object.defineProperty(to, key, { get: () => (mod as Record<string, unknown>)[key], enumerable: true });
        }
      }
      return secondTarget;
    };

    //? A navigation away cancels every load this document starts, and reloading from that error would cancel the
    //? navigation too: so a failed patch asks the server first. A cancelled probe means the page is leaving (or the
    //? server is gone) and the next document or the reconnect decides; an answer says whether a reload is due.
    #loadPatch(url: string, retried = false): Promise<void> {
      return new Promise<void>((resolve) => {
        const script = host.document.createElement("script");
        script.src = url;
        script.onload = () => {
          script.remove();
          resolve();
        };
        script.onerror = () => {
          script.remove();
          const failed = () => {
            this.#reload(`patch ${url} failed to load`);
            resolve();
          };
          const probe = host.fetch?.(url, { method: "HEAD", cache: "no-store" });
          if (!probe) return failed();
          probe.then(
            (response) => (response.ok && !retried ? resolve(this.#loadPatch(url, true)) : failed()),
            () => resolve(),
          );
        };
        host.document.head.appendChild(script);
      });
    }

    #requireFrom(parentId: string) {
      return (specifier: string) => {
        const record = this.#load(
          specifier.startsWith(modulePrefix) ? specifier.slice(modulePrefix.length) : specifier,
        );
        this.#link(parentId, record);
        return record.exports;
      };
    }

    #link(parentId: string, record: ModuleRecord) {
      record.parents.add(parentId);
      this.#cache.get(parentId)?.children.add(record.id);
    }

    #load(id: string): ModuleRecord {
      const cached = this.#cache.get(id);
      if (cached) return cached;
      const factory = this.#factories.get(id);
      if (!factory) throw new Error(`[akan-csr] no module registered as ${id}`);
      const record = new ModuleRecord(id, this.#hotData.get(id));
      this.#cache.set(id, record);
      const requireFromHere = this.#requireFrom(id);
      const register = (type: unknown, localId: string) => this.#refresh?.register(type, `${id} ${localId}`);
      const signature = () => this.#refresh?.createSignatureFunctionForTransform() ?? ((type: unknown) => type);
      const importFromHere = (specifier: string) => new Promise((resolve) => resolve(requireFromHere(specifier)));
      try {
        factory.call(record.exports, requireFromHere, record, record.exports, register, signature, importFromHere);
      } catch (error) {
        this.#cache.delete(id);
        throw error;
      }
      this.#executed.push(id);
      if (!id.startsWith("stub:") && !id.includes("node_modules/")) this.#afterExecute(record);
      return record;
    }

    //? Bun's refresh transform wraps a hook-using arrow as `_s(() => ...)`, so Function.name is empty and
    //? isLikelyComponentType says no: a type the transform registered through $RefreshReg$ is a component too.
    //? An export may be a Proxy that throws until something registers it (akanjs clientRuntime): never a component.
    #isComponent(value: unknown) {
      const refresh = this.#refresh;
      if (!refresh) return false;
      try {
        return refresh.getFamilyByType(value) !== undefined || refresh.isLikelyComponentType(value);
      } catch {
        return false;
      }
    }

    #exportEntries(exports: unknown): [string, unknown][] {
      if (exports == null || (typeof exports !== "object" && typeof exports !== "function")) return [];
      return Object.keys(exports)
        .filter((key) => key !== "__esModule")
        .map((key) => {
          try {
            return [key, (exports as Record<string, unknown>)[key]];
          } catch {
            return [key, undefined];
          }
        });
    }

    #afterExecute(record: ModuleRecord) {
      const refresh = this.#refresh;
      if (!refresh) return;
      const previous = record.hot.data?.refresh as { boundary: boolean; signature: unknown[] } | undefined;
      const entries = this.#exportEntries(record.exports);
      for (const [key, value] of entries)
        if (this.#isComponent(value)) refresh.register(value, `${record.id} %exports% ${key}`);
      const boundary =
        this.#isComponent(record.exports) ||
        (entries.length > 0 && entries.every(([, value]) => this.#isComponent(value)));
      if (!boundary) {
        if (previous?.boundary) record.hot.invalidate();
        return;
      }
      record.hot.accept();
      const signature = [
        this.#safeFamily(record.exports),
        ...entries.flatMap(([key, value]) => [key, this.#safeFamily(value)]),
      ];
      record.hot.dispose((data) => {
        data.refresh = { boundary: true, signature };
      });
      if (!previous) return;
      const changed =
        !previous.boundary ||
        previous.signature.length !== signature.length ||
        previous.signature.some((part, index) => part !== signature[index]);
      if (changed) record.hot.invalidate();
      else this.#scheduleRefresh();
    }

    #safeFamily(value: unknown) {
      try {
        return this.#refresh?.getFamilyByType(value);
      } catch {
        return undefined;
      }
    }

    #scheduleRefresh() {
      if (this.#refreshTimer !== null) host.clearTimeout(this.#refreshTimer);
      this.#refreshTimer = host.setTimeout(() => {
        this.#refreshTimer = null;
        this.#refresh?.performReactRefresh();
        if (host.__AKAN_CSR_LAST_UPDATE__) host.__AKAN_CSR_LAST_UPDATE__.refreshedAt = Date.now();
      }, 16);
    }

    #apply(changed: string[]): Promise<void>[] {
      const settling: Promise<void>[] = [];
      let pending = changed;
      for (let round = 0; pending.length > 0; round += 1) {
        if (round === maxInvalidateRounds) {
          this.#reload("updates kept invalidating their boundaries");
          return [];
        }
        const plan = this.#collectOutdated(pending);
        if ("reload" in plan) {
          this.#reload(plan.reload);
          return [];
        }
        const parentsOf = new Map(
          [...plan.boundaries].map((id) => [id, [...(this.#cache.get(id)?.parents ?? [])]] as const),
        );
        this.#dispose(plan.outdated);
        //? A payload root's other exports reach no module outside the registry (the server holds references by name),
        //? so re-running it and refreshing its component families is the whole update even when it is no boundary.
        if ([...plan.boundaries].some((id) => this.#roots.has(id))) this.#scheduleRefresh();
        const invalidated: string[] = [];
        for (const id of plan.boundaries) {
          const record = this.#load(id);
          for (const parent of parentsOf.get(id) ?? []) this.#link(parent, record);
          if (record.hot.invalidated) invalidated.push(id);
        }
        settling.push(...this.#runAcceptedDeps(plan.accepted));
        pending = [];
        for (const id of invalidated) {
          const parents = [...(this.#cache.get(id)?.parents ?? [])];
          if (parents.length === 0 && this.#roots.has(id)) continue;
          if (parents.length === 0) {
            this.#reload(`${id} changed its exports and nothing above it can take the update`);
            return [];
          }
          pending.push(...parents);
        }
      }
      return settling;
    }

    //? A parent that accepts a dependency stops the bubbling on that edge: the dependency re-runs and the parent is told,
    //? instead of re-running itself. That is how the dev entry takes a page module without rebooting the router.
    #runAcceptedDeps(accepted: Map<string, Set<string>>): Promise<void>[] {
      const settling: Promise<void>[] = [];
      for (const [parentId, deps] of accepted) {
        const parent = this.#cache.get(parentId);
        if (!parent) continue;
        const updatedBy = new Map<CsrAcceptCallback, string[]>();
        for (const dep of deps) {
          this.#link(parentId, this.#load(dep));
          const callback = parent.hot.acceptedDeps.get(dep);
          if (callback) updatedBy.set(callback, [...(updatedBy.get(callback) ?? []), dep]);
        }
        for (const [callback, updated] of updatedBy) {
          const result: unknown = callback(updated);
          if (result instanceof Promise) settling.push(result);
        }
      }
      if (accepted.size > 0) this.#scheduleRefresh();
      return settling;
    }

    #collectOutdated(
      start: string[],
    ): { outdated: Set<string>; boundaries: Set<string>; accepted: Map<string, Set<string>> } | { reload: string } {
      const outdated = new Set<string>();
      const boundaries = new Set<string>();
      const accepted = new Map<string, Set<string>>();
      const queue = [...start];
      while (queue.length > 0) {
        const id = queue.shift() as string;
        if (outdated.has(id)) continue;
        const record = this.#cache.get(id);
        if (!record) continue;
        outdated.add(id);
        if (record.hot.selfAccepted && !record.hot.invalidated) {
          boundaries.add(id);
          continue;
        }
        if (record.parents.size === 0) {
          if (!this.#roots.has(id)) return { reload: `no component boundary above ${id}` };
          boundaries.add(id);
          continue;
        }
        for (const parentId of record.parents) {
          if (!this.#cache.get(parentId)?.hot.acceptedDeps.has(id)) {
            queue.push(parentId);
            continue;
          }
          const deps = accepted.get(parentId) ?? new Set<string>();
          accepted.set(parentId, deps.add(id));
        }
      }
      for (const parentId of accepted.keys()) if (outdated.has(parentId)) accepted.delete(parentId);
      return { outdated, boundaries, accepted };
    }

    #dispose(ids: Set<string>) {
      for (const id of ids) {
        const record = this.#cache.get(id);
        if (!record) continue;
        const data: Record<string, unknown> = {};
        for (const dispose of record.hot.disposers) dispose(data);
        this.#hotData.set(id, data);
        this.#cache.delete(id);
        for (const child of record.children) this.#cache.get(child)?.parents.delete(id);
      }
    }

    #reload(reason: string) {
      if (this.#reloading) return;
      this.#reloading = true;
      host.console.warn(`[akan-csr] full reload: ${reason}`);
      host.location.reload();
    }
  }

  host.__akan = new CsrDevRegistry();
};

export const CSR_DEV_RUNTIME_SCRIPT = `(${installCsrDevRuntime.toString()})(self);\n`;
