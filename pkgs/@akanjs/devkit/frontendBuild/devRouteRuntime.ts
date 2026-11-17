import fs from "node:fs";
import path from "node:path";
import type { RuntimeFamily } from "../quality/runtimeNameTable";
import { RouteRuntime } from "../transforms/routeRuntime";
import { CsrDevPaths } from "./csrDevPaths";

export interface DevRouteTransform {
  contents: string;
  perModule: boolean;
  stamp: string;
}

export type StoreOwners = Record<"use" | "do" | "slice", Record<string, string[]>>;

const storeFamilies = { use: "st.use", do: "st.do", slice: "st.slice" } as const satisfies Record<
  keyof StoreOwners,
  RuntimeFamily
>;
const roles = ["signal", "store", "constant"] as const;
const workspaceImport = /(\b(?:from|import)\s*)"(@(?:apps|libs)\/[^/"]+\/lib\/(?:usePage|__client\/[\w.-]+))"/g;

//* The production `RouteRuntime` for the dev registry: the same verdicts, with each piece it adds written as a
//* relative path, which resolves against the disk with no resolution build, so a save naming a new module stays a patch.
export class DevRouteRuntime {
  //? Read by `StoreFacade` to name the module behind a key the page has not loaded; only a dev bootstrap sets it.
  static readonly ownersKey = "akanjs.store.owners";
  //? Not in the bootstrap: a store save changes the table, and a change reaching the bootstrap reloads the tab.
  static readonly ownersModule = "storeOwners";
  static readonly #libStoreRoot = /^libs\/[^/]+\/lib\/(?:st|__client\/(_st|[^/]+\.st))\.ts$/;
  static readonly #libStoreClass = /^libs\/[^/]+\/lib\/(_?([^/]+))\/\2\.store\.ts$/;
  readonly #workspaceRoot: string;
  readonly #runtime: RouteRuntime;
  readonly scopes: string[];
  readonly digest: string;

  static async read(workspaceRoot: string, appScope: string): Promise<DevRouteRuntime | null> {
    const runtime = await RouteRuntime.read(workspaceRoot, appScope);
    if (!runtime) return null;
    const scopes = runtime.table.layers.map(({ scope }) => scope);
    const pieces = scopes.map((scope) => DevRouteRuntime.#namesIn(path.join(workspaceRoot, scope, "lib/__client")));
    const digest = Bun.hash(JSON.stringify([runtime.table.layers, pieces, runtime.storeNeeds])).toString(36);
    return new DevRouteRuntime(workspaceRoot, runtime, scopes, digest);
  }

  //? Every file the table and the piece list are read from, by mtime: checked on each save, re-read only once it moves.
  static inputsOf(workspaceRoot: string, scopes: readonly string[]): string {
    const mtimeOf = (file: string) => fs.statSync(file, { throwIfNoEntry: false })?.mtimeMs ?? -1;
    const stamped = scopes.map((scope) => {
      const lib = path.join(workspaceRoot, scope, "lib");
      const dirs = DevRouteRuntime.#dirsIn(lib).map((dir) => [
        dir,
        ...roles.map((role) => mtimeOf(path.join(lib, dir, `${dir.replace(/^_/, "")}.${role}.ts`))),
      ]);
      return [scope, mtimeOf(path.join(lib, "st.ts")), DevRouteRuntime.#namesIn(path.join(lib, "__client")), dirs];
    });
    return Bun.hash(JSON.stringify(stamped)).toString(36);
  }

  constructor(workspaceRoot: string, runtime: RouteRuntime, scopes: string[], digest: string) {
    this.#workspaceRoot = workspaceRoot;
    this.#runtime = runtime;
    this.scopes = scopes;
    this.digest = digest;
  }

  get wholeSource(): string {
    return this.#runtime.wholeSource;
  }

  redirectOf(absPath: string): string | null {
    return this.#runtime.redirectOf(absPath);
  }

  transform(source: string, absPath: string): DevRouteTransform | null {
    const routed = this.#runtime.transform(source, absPath);
    if (!routed) return null;
    const from = path.dirname(CsrDevPaths.realpath(absPath));
    const contents =
      routed.source === source
        ? source
        : routed.source.replace(workspaceImport, (written, lead: string, specifier: string) => {
            const file = CsrDevPaths.resolveOnDisk(path.join(this.#workspaceRoot, specifier.slice(1)));
            return file ? `${lead}${JSON.stringify(DevRouteRuntime.#relative(from, file))}` : written;
          });
    const stamp = Bun.hash(`${routed.perModule}\n${contents}`).toString(36);
    return { contents, perModule: routed.perModule, stamp };
  }

  //? A lib store run again takes its registry entry and actions back from the app's store extending it.
  appStoresAfter(id: string, depsOf: (id: string) => readonly string[] | undefined): string[] {
    const appLib = `${this.#runtime.table.scope}/lib`;
    const [storeClass, dir = "", model = ""] = id.match(DevRouteRuntime.#libStoreClass) ?? [];
    const [libRoot, piece = "_st"] = storeClass ? [id, `${model}.st`] : (id.match(DevRouteRuntime.#libStoreRoot) ?? []);
    if (!libRoot) return [];
    const after = [`${appLib}/__client/${piece}.ts`, `${appLib}/__client/_st.ts`];
    const appStore = `${appLib}/${dir}/${model}.store.ts`;
    if (storeClass && DevRouteRuntime.#imports(depsOf, appStore, id)) after.unshift(appStore);
    return [...new Set(after)].filter((file) => !!depsOf(file));
  }

  get owners(): StoreOwners {
    const { table } = this.#runtime;
    const ownersOf = (family: RuntimeFamily) => {
      const byModule: Record<string, string[]> = {};
      for (const key of table.keysOf(family))
        for (const { scope, module } of table.lookup(family, key)?.owners ?? []) {
          const label = `${module} (${scope})`;
          byModule[label] = [...(byModule[label] ?? []), key];
        }
      return byModule;
    };
    return {
      use: ownersOf(storeFamilies.use),
      do: ownersOf(storeFamilies.do),
      slice: ownersOf(storeFamilies.slice),
    };
  }

  ownersSource(): string {
    return `(globalThis as Record<symbol, unknown>)[Symbol.for(${JSON.stringify(DevRouteRuntime.ownersKey)})] = ${JSON.stringify(this.owners)};\n`;
  }

  static #relative(from: string, file: string): string {
    const relative = path.relative(from, CsrDevPaths.realpath(file));
    if (path.isAbsolute(relative)) return relative.split(path.sep).join("/");
    const posix = relative.split(path.sep).join("/");
    return posix.startsWith("../") ? posix : `./${posix}`;
  }

  static #imports(depsOf: (id: string) => readonly string[] | undefined, from: string, target: string): boolean {
    const seen = new Set([from]);
    const queue = [from];
    for (const id of queue)
      for (const dep of depsOf(id) ?? []) {
        if (dep === target) return true;
        if (seen.has(dep)) continue;
        seen.add(dep);
        queue.push(dep);
      }
    return false;
  }

  static #dirsIn(dir: string): string[] {
    try {
      return fs
        .readdirSync(dir, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && !entry.name.startsWith("__"))
        .map((entry) => entry.name)
        .sort();
    } catch {
      return [];
    }
  }

  static #namesIn(dir: string): string[] {
    try {
      return fs.readdirSync(dir).sort();
    } catch {
      return [];
    }
  }
}
