import fs from "node:fs";
import path from "node:path";
import { SOURCE_EXTS } from "../akanApp/devHostPolicy";
import type { App } from "../commandDecorators";
import { BarrelAnalyzer, type BarrelExportMap } from "../transforms/barrelAnalyzer";
import { createTsconfigPackageResolver, rewriteBarrelImports } from "../transforms/barrelImportsPlugin";
import type { AkanConfig, ClientEntryDiscovery, DiscoverOptions, ScannedImport } from "./clientBuildTypes";

const USE_CLIENT_RE = /^\s*(?:\/\*[^*]*\*+(?:[^/*][^*]*\*+)*\/\s*|\/\/[^\n]*\n\s*)*["']use client["']/;
const NODE_MODULES_RE = /[\\/]node_modules[\\/]/;
const AKANJS_NODE_MODULE_RE = /[\\/]node_modules[\\/]akanjs[\\/]/;
// Bun's scanImports also surfaces CSS and asset imports, none of which can be a client component.
const NON_SOURCE_EXT_RE = /\.(css|scss|sass|less|json|svg|png|jpe?g|webp|gif|avif|ico|woff2?|ttf|otf|mp3|mp4|wav)$/i;
type PackageResolver = Awaited<ReturnType<typeof createTsconfigPackageResolver>>;

interface FileFacts {
  isClientEntry: boolean;
  imports: ScannedImport[];
}

interface Lookup<T> {
  epoch: number;
  promise: Promise<T>;
  found?: boolean;
}

interface DiscoveryWalk {
  visiting: Set<string>;
  //? Walked below a file the walk was already inside (an import cycle): their result lacks what that file reaches.
  partial: Set<string>;
  //? Every file's result within this walk, partial ones included: the file the cycle went back to is an ancestor here
  //? and brings the rest itself, and re-walking each path through a dense cycle grows exponentially.
  memo: Map<string, Set<string>>;
  importsAs?: DiscoverOptions["importsAs"];
  reachable: Map<string, Set<string>>;
}

const exportsKeyOf = (map: BarrelExportMap | null): string =>
  JSON.stringify(map ? [...map].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)) : null);

const shouldSkipNodeModule = (absPath: string) => NODE_MODULES_RE.test(absPath) && !AKANJS_NODE_MODULE_RE.test(absPath);

/** `"use client"` discovery over the import graph (dynamic imports included), flattening barrels as the bundler does. */
export class GraphClientEntryDiscovery implements ClientEntryDiscovery {
  #akanConfig: Pick<AkanConfig, "barrelImports">;
  #resolvePackage: PackageResolver;
  #analyzer: BarrelAnalyzer;
  #tsTranspiler = new Bun.Transpiler({ loader: "tsx" });
  #fileExistsCache = new Map<string, Lookup<boolean>>();
  // Facts, never source text: this instance lives as long as the builder process, so texts would pin every file walked.
  #factsCache = new Map<string, Promise<FileFacts | null>>();
  #resolvedFileCache = new Map<string, Lookup<string | null>>();
  #resolvedSpecifierCache = new Map<string, Lookup<string | null>>();
  #reachableEntriesCache = new Map<string, Set<string>>();
  //? Keyed by a walk's `importsAs`: a file's answer under swapped imports holds only for walks swapping the same ones.
  #swappedEntriesCaches = new WeakMap<object, Map<string, Set<string>>>();
  #readFiles = new Set<string>();
  #barrelImporters = new Map<string, Set<string>>();
  //? Barrels a save went beside, by the analysis before it: a save of any component re-reads its barrel, and only an
  //? export that moved sends that barrel's importers back to the disk.
  #reread = new Map<string, Promise<BarrelExportMap | null>>();
  #settled: Promise<void> = Promise.resolve();
  //? Bumped by every invalidation: a walk that began before one computed from facts it may have read stale, so it
  //? answers its caller but caches nothing (a registry check walks this instance beside the slow lane's route builds).
  #epoch = 0;

  constructor(akanConfig: Pick<AkanConfig, "barrelImports">, resolvePackage: PackageResolver) {
    this.#akanConfig = akanConfig;
    this.#resolvePackage = resolvePackage;
    this.#analyzer = new BarrelAnalyzer({ resolvePackage });
  }

  static async create(app: App): Promise<GraphClientEntryDiscovery> {
    return new GraphClientEntryDiscovery(await app.getConfig(), await createTsconfigPackageResolver(app));
  }

  async discover(seeds: string[], { importsAs }: DiscoverOptions = {}): Promise<string[]> {
    this.#settled = this.#settled.then(() => this.#dropRenarrowed());
    await this.#settled;
    const entries = new Set<string>();
    const reachable = importsAs ? this.#swappedEntriesCache(importsAs) : this.#reachableEntriesCache;
    for (const seed of seeds) {
      const walk: DiscoveryWalk = { visiting: new Set(), partial: new Set(), memo: new Map(), importsAs, reachable };
      for (const entry of await this.#discoverFromFile(seed, walk)) entries.add(entry);
    }
    return Array.from(entries).sort();
  }

  async resolveImport(spec: string, importerDir: string): Promise<string | null> {
    const resolved = await this.#resolveSpecifier(spec, importerDir);
    return resolved ? path.resolve(resolved) : null;
  }

  #swappedEntriesCache(importsAs: object): Map<string, Set<string>> {
    const cache = this.#swappedEntriesCaches.get(importsAs) ?? new Map<string, Set<string>>();
    this.#swappedEntriesCaches.set(importsAs, cache);
    return cache;
  }

  invalidate(files: string[]): void {
    if (files.length === 0) return;
    let moved = false;
    for (const file of files) {
      const absPath = path.resolve(file);
      const exists = fs.existsSync(absPath);
      if (exists !== this.#readFiles.has(absPath)) moved = true;
      if (!exists) this.#readFiles.delete(absPath);
      this.#factsCache.delete(absPath);
      this.#fileExistsCache.delete(absPath);
    }
    this.#epoch += 1;
    // Reachable-entry results are transitive, so a changed child invalidates every ancestor.
    this.#reachableEntriesCache.clear();
    this.#swappedEntriesCaches = new WeakMap();
    for (const [barrel, before] of this.#analyzer.forget(files))
      if (!this.#reread.has(barrel)) this.#reread.set(barrel, before);
    //? A file gone, or one never read, can leave a found resolution on its old target (`Chart.tsx` to
    //? `Chart/index.tsx`), so a move drops them all; a save of a file already read keeps them (a walk re-resolving
    //? every package cost 3x). Misses lapse with the epoch on their own (#lookup).
    if (!moved) return;
    this.#fileExistsCache.clear();
    this.#resolvedFileCache.clear();
    this.#resolvedSpecifierCache.clear();
  }

  //? An importer's facts hold the files its barrel imports narrowed to, which an export moved between them changes.
  async #dropRenarrowed(): Promise<void> {
    const reread = [...this.#reread];
    this.#reread.clear();
    for (const [barrel, before] of reread) {
      const [was, now] = await Promise.all([before, this.#analyzer.analyze(barrel)]);
      if (exportsKeyOf(was) === exportsKeyOf(now)) continue;
      for (const importer of this.#barrelImporters.get(barrel) ?? []) this.#factsCache.delete(importer);
    }
  }

  //? A found answer outlives later epochs; a miss, or a lookup still in flight, answers only walks of its own epoch, so
  //? a file created meanwhile is looked up again.
  #lookup<T>(cache: Map<string, Lookup<T>>, key: string, run: () => Promise<T>, isFound: (value: T) => boolean) {
    const cached = cache.get(key);
    if (cached && (cached.found || cached.epoch === this.#epoch)) return cached.promise;
    const entry: Lookup<T> = { epoch: this.#epoch, promise: run() };
    entry.promise.then(
      (value) => {
        entry.found = isFound(value);
      },
      () => {
        entry.found = false;
      },
    );
    cache.set(key, entry);
    return entry.promise;
  }

  async #fileExists(p: string): Promise<boolean> {
    const absPath = path.resolve(p);
    return await this.#lookup(
      this.#fileExistsCache,
      absPath,
      () => Bun.file(absPath).exists(),
      (exists) => exists,
    );
  }

  #facts(file: string): Promise<FileFacts | null> {
    const absPath = path.resolve(file);
    let cached = this.#factsCache.get(absPath);
    if (!cached) {
      cached = (async () => {
        const content = await Bun.file(absPath)
          .text()
          .catch(() => null);
        if (content === null) return null;
        this.#readFiles.add(absPath);
        if (USE_CLIENT_RE.test(content)) return { isClientEntry: true, imports: [] };
        return { isClientEntry: false, imports: this.#scanImports(await this.#rewrite(content, absPath)) };
      })();
      this.#factsCache.set(absPath, cached);
    }
    return cached;
  }

  async #rewrite(content: string, absPath: string): Promise<string> {
    if (this.#akanConfig.barrelImports.length === 0) return content;
    for (const barrel of this.#akanConfig.barrelImports.filter((barrel) => content.includes(barrel)))
      this.#barrelImporters.set(barrel, (this.#barrelImporters.get(barrel) ?? new Set()).add(absPath));
    try {
      return (await rewriteBarrelImports(content, this.#akanConfig.barrelImports, this.#analyzer)) ?? content;
    } catch {
      return content;
    }
  }

  #scanImports(source: string): ScannedImport[] {
    try {
      return this.#tsTranspiler.scanImports(source);
    } catch {
      return [];
    }
  }

  async #resolveFileCandidate(absPathNoExt: string): Promise<string | null> {
    const cacheKey = path.resolve(absPathNoExt);
    return await this.#lookup(
      this.#resolvedFileCache,
      cacheKey,
      async () => {
        if (await this.#fileExists(cacheKey)) return cacheKey;
        for (const ext of SOURCE_EXTS) {
          const f = `${cacheKey}${ext}`;
          if (await this.#fileExists(f)) return f;
        }
        for (const ext of SOURCE_EXTS) {
          const f = path.join(cacheKey, `index${ext}`);
          if (await this.#fileExists(f)) return f;
        }
        return null;
      },
      (file) => file !== null,
    );
  }

  async #resolveSpecifier(spec: string, importerDir: string): Promise<string | null> {
    const cacheKey = `${importerDir}\0${spec}`;
    return await this.#lookup(
      this.#resolvedSpecifierCache,
      cacheKey,
      async () => {
        if (spec.startsWith(".") || spec.startsWith("/")) {
          const abs = spec.startsWith("/") ? spec : path.resolve(importerDir, spec);
          return await this.#resolveFileCandidate(abs);
        }
        const pkg = await this.#resolvePackage(spec);
        return pkg ? pkg.entryFile : null;
      },
      (file) => file !== null,
    );
  }

  async #discoverFromFile(file: string, walk: DiscoveryWalk): Promise<Set<string>> {
    const epoch = this.#epoch;
    const absPath = path.resolve(file);
    const importsAs = walk.importsAs?.get(absPath);
    const cached = walk.reachable.get(absPath);
    if (cached) return new Set(cached);
    const memo = walk.memo.get(absPath);
    if (memo) {
      //? Reused from another path: whatever this path is walking now inherits its gap and stays out of the cache.
      if (walk.partial.has(absPath)) for (const onPath of walk.visiting) walk.partial.add(onPath);
      return new Set(memo);
    }
    if (walk.visiting.has(absPath)) {
      let below = false;
      for (const onPath of walk.visiting) {
        if (below) walk.partial.add(onPath);
        else below = onPath === absPath;
      }
      return new Set();
    }
    if (shouldSkipNodeModule(absPath)) return new Set();

    walk.visiting.add(absPath);
    const entries = new Set<string>();
    const facts = await this.#facts(absPath);
    if (!facts) return this.#finishDiscovery(absPath, walk, entries, epoch);

    if (facts.isClientEntry) {
      entries.add(absPath);
      return this.#finishDiscovery(absPath, walk, entries, epoch);
    }

    const importerDir = path.dirname(absPath);
    for (const imp of facts.imports) {
      const swapped = importsAs?.get(imp.path);
      const spec = swapped === undefined ? imp.path : swapped;
      if (!spec) continue;
      if (NON_SOURCE_EXT_RE.test(spec)) continue;
      const resolved = await this.#resolveSpecifier(spec, importerDir);
      if (!resolved) continue;
      if (shouldSkipNodeModule(resolved)) continue;
      for (const entry of await this.#discoverFromFile(resolved, walk)) entries.add(entry);
    }

    return this.#finishDiscovery(absPath, walk, entries, epoch);
  }

  #finishDiscovery(absPath: string, walk: DiscoveryWalk, entries: Set<string>, epoch: number): Set<string> {
    walk.visiting.delete(absPath);
    walk.memo.set(absPath, entries);
    if (epoch === this.#epoch && !walk.partial.has(absPath)) walk.reachable.set(absPath, entries);
    return new Set(entries);
  }
}
