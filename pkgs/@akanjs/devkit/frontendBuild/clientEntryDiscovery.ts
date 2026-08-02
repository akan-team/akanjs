import path from "node:path";
import type { App } from "../commandDecorators";
import { BarrelAnalyzer } from "../transforms/barrelAnalyzer";
import { createTsconfigPackageResolver, rewriteBarrelImports } from "../transforms/barrelImportsPlugin";
import type { AkanConfig, ClientEntryDiscovery, ScannedImport } from "./clientBuildTypes";

const USE_CLIENT_RE = /^\s*(?:\/\*[\s\S]*?\*\/\s*|\/\/[^\n]*\n\s*)*["']use client["']/;
const SOURCE_EXTS = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"];
const NODE_MODULES_RE = /[\\/]node_modules[\\/]/;
const AKANJS_NODE_MODULE_RE = /[\\/]node_modules[\\/]akanjs[\\/]/;
// File extensions whose imports can't produce React client components and that
// the bundler handles via dedicated loaders. Skipping them avoids resolver
// noise (Bun's scanImports surfaces CSS / asset imports too).
const NON_SOURCE_EXT_RE = /\.(css|scss|sass|less|json|svg|png|jpe?g|webp|gif|avif|ico|woff2?|ttf|otf|mp3|mp4|wav)$/i;
type PackageResolver = Awaited<ReturnType<typeof createTsconfigPackageResolver>>;

/**
 * Everything the traversal ever asks of a file, which is why its text is not kept.
 *
 * `imports` is empty for a client entry: the walk stops there, so they are never scanned.
 */
interface FileFacts {
  isClientEntry: boolean;
  imports: ScannedImport[];
}

const shouldSkipNodeModule = (absPath: string) => NODE_MODULES_RE.test(absPath) && !AKANJS_NODE_MODULE_RE.test(absPath);

/**
 * Graph-based `"use client"` discovery, seeded from an explicit file list.
 *
 * Walks imports — including dynamic `import()` — while flattening barrel
 * specifiers through the same `BarrelAnalyzer` the runtime plugin uses, so
 * the traversal matches the module graph the bundler will actually see.
 */
export class GraphClientEntryDiscovery implements ClientEntryDiscovery {
  #akanConfig: AkanConfig;
  #resolvePackage: PackageResolver;
  #analyzer: BarrelAnalyzer;
  #tsTranspiler = new Bun.Transpiler({ loader: "tsx" });
  #fileExistsCache = new Map<string, Promise<boolean>>();
  /**
   * Derived facts per file, never the source text.
   *
   * This instance lives as long as the builder process does — it is rebuilt only when the akan config
   * changes — so caching whole source texts (and a second, barrel-rewritten copy of each) meant the
   * watcher held every source file it had ever walked for the whole dev session. Nothing downstream
   * wanted the text: the walk needs one boolean and one import list per file, and both were already
   * cached separately under the same key.
   */
  #factsCache = new Map<string, Promise<FileFacts | null>>();
  #resolvedFileCache = new Map<string, Promise<string | null>>();
  #resolvedSpecifierCache = new Map<string, Promise<string | null>>();
  #reachableEntriesCache = new Map<string, Set<string>>();
  /** Keys of the three caches above whose answer was "not there" — see `#forgetMissing`. */
  #missingFiles = new Set<string>();
  #unresolvedPaths = new Set<string>();
  #unresolvedSpecifiers = new Set<string>();

  constructor(akanConfig: AkanConfig, resolvePackage: PackageResolver) {
    this.#akanConfig = akanConfig;
    this.#resolvePackage = resolvePackage;
    this.#analyzer = new BarrelAnalyzer({ resolvePackage });
  }

  static async create(app: App): Promise<GraphClientEntryDiscovery> {
    return new GraphClientEntryDiscovery(await app.getConfig(), await createTsconfigPackageResolver(app));
  }

  async discover(seeds: string[]): Promise<string[]> {
    const entries = new Set<string>();
    for (const seed of seeds) {
      for (const entry of await this.#discoverFromFile(seed, new Set())) entries.add(entry);
    }
    return Array.from(entries).sort();
  }

  invalidate(files: string[]): void {
    for (const file of files) {
      const absPath = path.resolve(file);
      this.#factsCache.delete(absPath);
      this.#fileExistsCache.delete(absPath);
      this.#reachableEntriesCache.delete(absPath);
    }
    if (files.length === 0) return;
    // Parent files cache the transitive result of their imports, so a changed
    // child can affect any reachable-entry cache above it.
    this.#reachableEntriesCache.clear();
    this.#forgetMissing();
  }

  /**
   * Drop every "there is no such file" answer, because a batch may be what created it.
   *
   * These caches are keyed by extension-less path and by `dir\0specifier`, neither of which maps back
   * to the path that just appeared, so a negative recorded before a module existed is unreachable any
   * other way — and this instance lives as long as the builder process. Positive answers are kept:
   * they are keyed by a real path, which arrives in `files` when it changes or goes away.
   */
  #forgetMissing(): void {
    for (const key of this.#missingFiles) this.#fileExistsCache.delete(key);
    for (const key of this.#unresolvedPaths) this.#resolvedFileCache.delete(key);
    for (const key of this.#unresolvedSpecifiers) this.#resolvedSpecifierCache.delete(key);
    this.#missingFiles.clear();
    this.#unresolvedPaths.clear();
    this.#unresolvedSpecifiers.clear();
  }

  async #fileExists(p: string): Promise<boolean> {
    const absPath = path.resolve(p);
    let cached = this.#fileExistsCache.get(absPath);
    if (!cached) {
      cached = Bun.file(absPath)
        .exists()
        .then((exists) => {
          if (!exists) this.#missingFiles.add(absPath);
          return exists;
        });
      this.#fileExistsCache.set(absPath, cached);
    }
    return cached;
  }

  /**
   * Read a file once and keep only what the traversal asks of it. The text itself is dropped as soon
   * as the boolean and the import list are out of it — see `#factsCache`.
   */
  #facts(file: string): Promise<FileFacts | null> {
    const absPath = path.resolve(file);
    let cached = this.#factsCache.get(absPath);
    if (!cached) {
      cached = (async () => {
        const content = await Bun.file(absPath)
          .text()
          .catch(() => null);
        if (content === null) return null;
        // A client entry ends the walk, so its imports are never needed.
        if (USE_CLIENT_RE.test(content)) return { isClientEntry: true, imports: [] };
        return { isClientEntry: false, imports: this.#scanImports(await this.#rewrite(content)) };
      })();
      this.#factsCache.set(absPath, cached);
    }
    return cached;
  }

  async #rewrite(content: string): Promise<string> {
    if (this.#akanConfig.barrelImports.length === 0) return content;
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
    let cached = this.#resolvedFileCache.get(cacheKey);
    if (cached) return cached;
    cached = (async () => {
      if (await this.#fileExists(cacheKey)) return cacheKey;
      for (const ext of SOURCE_EXTS) {
        const f = `${cacheKey}${ext}`;
        if (await this.#fileExists(f)) return f;
      }
      for (const ext of SOURCE_EXTS) {
        const f = path.join(cacheKey, `index${ext}`);
        if (await this.#fileExists(f)) return f;
      }
      this.#unresolvedPaths.add(cacheKey);
      return null;
    })();
    this.#resolvedFileCache.set(cacheKey, cached);
    return cached;
  }

  async #resolveSpecifier(spec: string, importerDir: string): Promise<string | null> {
    const cacheKey = `${importerDir}\0${spec}`;
    let cached = this.#resolvedSpecifierCache.get(cacheKey);
    if (cached) return cached;
    cached = (async () => {
      if (spec.startsWith(".") || spec.startsWith("/")) {
        const abs = spec.startsWith("/") ? spec : path.resolve(importerDir, spec);
        return this.#resolveFileCandidate(abs);
      }
      const pkg = await this.#resolvePackage(spec);
      if (pkg) return pkg.entryFile;
      this.#unresolvedSpecifiers.add(cacheKey);
      return null;
    })();
    this.#resolvedSpecifierCache.set(cacheKey, cached);
    return cached;
  }

  async #discoverFromFile(file: string, visiting: Set<string>): Promise<Set<string>> {
    const absPath = path.resolve(file);
    const cached = this.#reachableEntriesCache.get(absPath);
    if (cached) return new Set(cached);
    if (visiting.has(absPath) || shouldSkipNodeModule(absPath)) return new Set();

    visiting.add(absPath);
    const entries = new Set<string>();
    const facts = await this.#facts(absPath);
    if (!facts) return this.#finishDiscovery(absPath, visiting, entries);

    if (facts.isClientEntry) {
      entries.add(absPath);
      return this.#finishDiscovery(absPath, visiting, entries);
    }

    const importerDir = path.dirname(absPath);
    for (const imp of facts.imports) {
      const spec = imp.path;
      if (!spec) continue;
      if (NON_SOURCE_EXT_RE.test(spec)) continue;
      const resolved = await this.#resolveSpecifier(spec, importerDir);
      if (!resolved) continue;
      if (shouldSkipNodeModule(resolved)) continue;
      for (const entry of await this.#discoverFromFile(resolved, visiting)) entries.add(entry);
    }

    return this.#finishDiscovery(absPath, visiting, entries);
  }

  #finishDiscovery(absPath: string, visiting: Set<string>, entries: Set<string>): Set<string> {
    visiting.delete(absPath);
    this.#reachableEntriesCache.set(absPath, entries);
    return new Set(entries);
  }
}
