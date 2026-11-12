import { LibSource } from "./libSource";
import type { PackageJson } from "./types";

type DependencyMap = Record<string, string>;

export interface ScannedImports {
  runtime: readonly string[];
  typeOnly: readonly string[];
}

export class ManifestDependencies {
  readonly #root: PackageJson;
  readonly #runtime: Set<string>;
  readonly #typeOnly: Set<string>;
  readonly #isKept: (dep: string) => boolean;

  constructor(root: PackageJson, { runtime, typeOnly }: ScannedImports, isKept: (dep: string) => boolean) {
    this.#root = root;
    this.#runtime = new Set(runtime);
    this.#typeOnly = new Set(typeOnly);
    this.#isKept = isKept;
  }

  static keptBy(manifest: PackageJson): string[] {
    const { keepDependencies } = (manifest[LibSource.manifestKey] ?? {}) as { keepDependencies?: unknown };
    return Array.isArray(keepDependencies)
      ? keepDependencies.filter((dep): dep is string => typeof dep === "string")
      : [];
  }

  //* The scan recognises only the names the root declares, so only those can be proven unused and pruned.
  realign(manifest: PackageJson) {
    const removed: string[] = [];
    const unverifiable: string[] = [];
    const dependencies: DependencyMap = {};
    for (const [dep, version] of Object.entries(manifest.dependencies ?? {})) {
      if (this.#typeOnly.has(dep)) continue;
      const rootVersion = this.#rootVersionOf(dep);
      if (!rootVersion) {
        unverifiable.push(dep);
        dependencies[dep] = version;
      } else if (this.#runtime.has(dep) || this.#isKept(dep)) dependencies[dep] = rootVersion;
      else removed.push(dep);
    }
    const runtimeOfRootDependencies = [...this.#runtime].filter((dep) => this.#root.dependencies?.[dep]);
    this.#append(dependencies, runtimeOfRootDependencies);

    const devDependencies: DependencyMap = {};
    for (const [dep, version] of Object.entries(manifest.devDependencies ?? {}))
      if (!Object.hasOwn(dependencies, dep)) devDependencies[dep] = this.#rootVersionOf(dep) ?? version;
    this.#append(devDependencies, [...this.#typeOnly]);
    return { dependencies, devDependencies, removed, unverifiable };
  }

  #append(map: DependencyMap, deps: string[]) {
    for (const dep of deps.filter((dep) => !Object.hasOwn(map, dep)).sort((a, b) => (a < b ? -1 : 1))) {
      const rootVersion = this.#rootVersionOf(dep);
      if (rootVersion) map[dep] = rootVersion;
    }
  }

  #rootVersionOf(dep: string) {
    return this.#root.dependencies?.[dep] ?? this.#root.devDependencies?.[dep];
  }
}
