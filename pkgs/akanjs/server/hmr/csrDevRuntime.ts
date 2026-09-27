interface RefreshRuntime {
  injectIntoGlobalHook(host: object): void;
  register(type: unknown, id: string): void;
  performReactRefresh(): unknown;
  createSignatureFunctionForTransform(): (type: unknown, ...rest: unknown[]) => unknown;
  isLikelyComponentType(value: unknown): boolean;
  getFamilyByType(value: unknown): unknown;
}

export interface CsrHotContext {
  readonly data: Record<string, unknown> | undefined;
  accept(): void;
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
  start(options: { generation: number; refresh: string }): void;
  update(generation: number, factories: Record<string, CsrModuleFactory>): void;
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
  __AKAN_CSR_LAST_UPDATE__?: { generation: number; executed: string[] };
  document: {
    currentScript: unknown;
    head: { appendChild(node: unknown): unknown };
    createElement(tagName: "script"): CsrScriptElement;
  };
  location: { reload(): void };
  console: { warn(...args: unknown[]): void };
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
    constructor(readonly data: Record<string, unknown> | undefined) {}
    accept() {
      this.selfAccepted = true;
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
    #cache = new Map<string, ModuleRecord>();
    #hotData = new Map<string, Record<string, unknown>>();
    #refresh: RefreshRuntime | null = null;
    #refreshTimer: unknown = null;
    #generation = 0;
    #executed: string[] = [];
    #patchQueue: Promise<void> = Promise.resolve();
    #reloading = false;

    get generation() {
      return this.#generation;
    }

    define(id: string, factory: CsrModuleFactory) {
      this.#factories.set(id, factory);
    }

    start({ generation, refresh }: { generation: number; refresh: string }) {
      const script = host.document.currentScript as CsrScriptElement | null;
      const entry = script?.dataset.akanCsrEntry;
      if (!entry) throw new Error("[akan-csr] the app script carries no data-akan-csr-entry");
      this.#generation = generation;
      this.#refresh = this.#load(refresh).exports as RefreshRuntime;
      // Before the entry runs: react-dom looks for the DevTools hook once, when it is first evaluated.
      this.#refresh.injectIntoGlobalHook(host);
      this.#load(entry);
    }

    update(generation: number, factories: Record<string, CsrModuleFactory>) {
      if (generation <= this.#generation) return;
      if (generation !== this.#generation + 1) {
        this.#reload(`missed generation ${this.#generation + 1} before ${generation}`);
        return;
      }
      const ids = Object.keys(factories);
      for (const id of ids) this.#factories.set(id, factories[id] as CsrModuleFactory);
      this.#generation = generation;
      this.#executed = [];
      try {
        this.#apply(ids.filter((id) => this.#cache.has(id)));
      } catch (error) {
        this.#reload(
          `generation ${generation} threw while applying: ${error instanceof Error ? error.message : error}`,
        );
      }
      host.__AKAN_CSR_LAST_UPDATE__ = { generation, executed: this.#executed.slice() };
    }

    hot(message: CsrUpdateMessage) {
      if (message.reload) {
        this.#reload(message.reason ?? "the dev server asked for a reload");
        return;
      }
      if (message.generation <= this.#generation) return;
      const url = message.url;
      if (!url) {
        this.#reload(`generation ${message.generation} arrived without a patch`);
        return;
      }
      this.#patchQueue = this.#patchQueue.then(() => this.#loadPatch(url));
    }

    inspect() {
      return { generation: this.#generation, executed: this.#executed.slice(), modules: this.#cache.size };
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

    #loadPatch(url: string) {
      return new Promise<void>((resolve) => {
        const script = host.document.createElement("script");
        script.src = url;
        script.onload = () => {
          script.remove();
          resolve();
        };
        script.onerror = () => {
          this.#reload(`patch ${url} failed to load`);
          resolve();
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
      }, 16);
    }

    #apply(changed: string[]) {
      let pending = changed;
      for (let round = 0; pending.length > 0; round += 1) {
        if (round === maxInvalidateRounds) {
          this.#reload("updates kept invalidating their boundaries");
          return;
        }
        const plan = this.#collectOutdated(pending);
        if ("reload" in plan) {
          this.#reload(plan.reload);
          return;
        }
        const parentsOf = new Map(
          [...plan.boundaries].map((id) => [id, [...(this.#cache.get(id)?.parents ?? [])]] as const),
        );
        this.#dispose(plan.outdated);
        const invalidated: string[] = [];
        for (const id of plan.boundaries) {
          const record = this.#load(id);
          for (const parent of parentsOf.get(id) ?? []) this.#link(parent, record);
          if (record.hot.invalidated) invalidated.push(id);
        }
        pending = [];
        for (const id of invalidated) {
          const parents = [...(this.#cache.get(id)?.parents ?? [])];
          if (parents.length === 0) {
            this.#reload(`${id} changed its exports and nothing above it can take the update`);
            return;
          }
          pending.push(...parents);
        }
      }
    }

    #collectOutdated(start: string[]): { outdated: Set<string>; boundaries: Set<string> } | { reload: string } {
      const outdated = new Set<string>();
      const boundaries = new Set<string>();
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
        if (record.parents.size === 0) return { reload: `no component boundary above ${id}` };
        queue.push(...record.parents);
      }
      return { outdated, boundaries };
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
