export interface RouteRuntimeImport {
  path: string;
  lazy: boolean;
}

export interface RouteRuntimeBundle {
  //? Absolute paths, from a bundle of the same entries in which every entry loads the whole runtime.
  importsByModule: ReadonlyMap<string, readonly RouteRuntimeImport[]>;
  entries: readonly string[];
  //? The entries each route renders first; an entry of no route stands alone.
  entriesByRoute?: ReadonlyMap<string, readonly string[]>;
}

//* The import graph the per-route runtime is planned over: what one module reaches without passing a runtime file,
//* whose own imports differ between a page loading the whole runtime and a page loading pieces.
export class RouteRuntimeGraph {
  readonly #imports: ReadonlyMap<string, readonly RouteRuntimeImport[]>;
  readonly #isRuntimeFile: (absPath: string) => boolean;

  constructor(
    imports: ReadonlyMap<string, readonly RouteRuntimeImport[]>,
    isRuntimeFile: (absPath: string) => boolean,
  ) {
    this.#imports = imports;
    this.#isRuntimeFile = isRuntimeFile;
  }

  get modules(): string[] {
    return [...this.#imports.keys()];
  }

  has(absPath: string) {
    return this.#imports.has(absPath);
  }

  importsOf(absPath: string): string[] {
    return (this.#imports.get(absPath) ?? []).filter(({ lazy }) => !lazy).map(({ path }) => path);
  }

  lazyImportsOf(absPath: string): string[] {
    return (this.#imports.get(absPath) ?? [])
      .filter(({ path, lazy }) => lazy && !this.#isRuntimeFile(path))
      .map(({ path }) => path);
  }

  //? A module asked for by `import()` loads when that call runs, so it is planned as an entry of its own.
  get lazyRoots(): string[] {
    return [...new Set(this.modules.flatMap((module) => this.lazyImportsOf(module)))];
  }

  closureOf(roots: Iterable<string>, into = new Set<string>()): Set<string> {
    const queue: string[] = [];
    for (const root of roots)
      if (!into.has(root) && !this.#isRuntimeFile(root)) {
        into.add(root);
        queue.push(root);
      }
    for (const module of queue)
      for (const imported of this.importsOf(module)) {
        if (into.has(imported) || this.#isRuntimeFile(imported)) continue;
        into.add(imported);
        queue.push(imported);
      }
    return into;
  }
}
