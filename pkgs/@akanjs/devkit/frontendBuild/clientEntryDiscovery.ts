import path from "node:path";
import { SOURCE_EXTS } from "../akanApp/devHostPolicy";
import type { App } from "../commandDecorators";
import { BarrelAnalyzer } from "../transforms/barrelAnalyzer";
import { createTsconfigPackageResolver, rewriteBarrelImports } from "../transforms/barrelImportsPlugin";
import type { AkanConfig, ClientEntryDiscovery, ScannedImport } from "./clientBuildTypes";

const USE_CLIENT_RE = /^\s*(?:\/\*[\s\S]*?\*\/\s*|\/\/[^\n]*\n\s*)*["']use client["']/;
const NODE_MODULES_RE = /[\\/]node_modules[\\/]/;
const AKANJS_NODE_MODULE_RE = /[\\/]node_modules[\\/]akanjs[\\/]/;
// Bun's scanImports also surfaces CSS and asset imports, none of which can be a client component.
const NON_SOURCE_EXT_RE = /\.(css|scss|sass|less|json|svg|png|jpe?g|webp|gif|avif|ico|woff2?|ttf|otf|mp3|mp4|wav)$/i;
type PackageResolver = Awaited<ReturnType<typeof createTsconfigPackageResolver>>;

interface FileFacts {
  isClientEntry: boolean;
  imports: ScannedImport[];
}

const shouldSkipNodeModule = (absPath: string) => NODE_MODULES_RE.test(absPath) && !AKANJS_NODE_MODULE_RE.test(absPath);

/** `"use client"` discovery over the import graph (dynamic imports included), flattening barrels as the bundler does. */
export class GraphClientEntryDiscovery implements ClientEntryDiscovery {
  #akanConfig: Pick<AkanConfig, "barrelImports">;
  #resolvePackage: PackageResolver;
  #analyzer: BarrelAnalyzer;
  #tsTranspiler = new Bun.Transpiler({ loader: "tsx" });
  #fileExistsCache = new Map<string, Promise<boolean>>();
  // Facts, never source text: this instance lives as long as the builder process, so texts would pin every file walked.
  #factsCache = new Map<string, Promise<FileFacts | null>>();
  #resolvedFileCache = new Map<string, Promise<string | null>>();
  #resolvedSpecifierCache = new Map<string, Promise<string | null>>();
  #reachableEntriesCache = new Map<string, Set<string>>();
  #missingFiles = new Set<string>();
  #unresolvedPaths = new Set<string>();
  #unresolvedSpecifiers = new Set<string>();
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
    this.#epoch += 1;
    // Reachable-entry results are transitive, so a changed child invalidates every ancestor.
    this.#reachableEntriesCache.clear();
    this.#forgetMissing();
  }

  // Negatives are keyed by extension-less path or `dir\0specifier`, which a new file's path cannot reach, so all go.
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

  #facts(file: string): Promise<FileFacts | null> {
    const absPath = path.resolve(file);
    let cached = this.#factsCache.get(absPath);
    if (!cached) {
      cached = (async () => {
        const content = await Bun.file(absPath)
          .text()
          .catch(() => null);
        if (content === null) return null;
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
    const epoch = this.#epoch;
    const absPath = path.resolve(file);
    const cached = this.#reachableEntriesCache.get(absPath);
    if (cached) return new Set(cached);
    if (visiting.has(absPath) || shouldSkipNodeModule(absPath)) return new Set();

    visiting.add(absPath);
    const entries = new Set<string>();
    const facts = await this.#facts(absPath);
    if (!facts) return this.#finishDiscovery(absPath, visiting, entries, epoch);

    if (facts.isClientEntry) {
      entries.add(absPath);
      return this.#finishDiscovery(absPath, visiting, entries, epoch);
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

    return this.#finishDiscovery(absPath, visiting, entries, epoch);
  }

  #finishDiscovery(absPath: string, visiting: Set<string>, entries: Set<string>, epoch: number): Set<string> {
    visiting.delete(absPath);
    if (epoch === this.#epoch) this.#reachableEntriesCache.set(absPath, entries);
    return new Set(entries);
  }
}
