import path from "node:path";
import { Logger } from "akanjs/common";
import { compile } from "tailwindcss";
import type { App } from "../commandDecorators";
import { BarrelAnalyzer } from "../transforms/barrelAnalyzer";
import { createTsconfigPackageResolver, rewriteBarrelImports } from "../transforms/barrelImportsPlugin";
import { CssCandidateCache } from "./cssCandidateCache";
import { CssImportResolver } from "./cssImportResolver";

const SOURCE_EXTS = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"] as const;
const NON_SOURCE_EXT_RE = /\.(json|svg|png|jpe?g|webp|gif|avif|ico|woff2?|ttf|otf|mp3|mp4|wav)$/i;
const NODE_MODULES_RE = /[\\/]node_modules[\\/]/;
const AKANJS_NODE_MODULE_RE = /[\\/]node_modules[\\/]akanjs[\\/]/;

interface CssDiscovery {
  cssPaths: string[];
  sourcePaths: string[];
}

/** One `@import` target and the custom properties it declares, which is what proves it arrived downstream. */
export interface ImportedStylesheet {
  cssPath: string;
  declaredNames: string[];
}

export class CssCompiler {
  #logger = new Logger("CssCompiler");
  #transpiler = new Bun.Transpiler({ loader: "tsx" });
  #app: App;
  #cssImportResolver: CssImportResolver | null = null;
  constructor(app: App) {
    this.#app = app;
  }

  /**
   * Beside the sources rather than in `dist`, because the cache is keyed on source mtimes: a build and
   * the dev server describe the same files, so they should share it rather than each pay the first scan.
   */
  get #candidateCachePath() {
    return path.join(this.#app.cwdPath, ".akan/cache/cssCandidates.json");
  }

  #cssText: string | null = null;
  #cssTextByBasePath: Record<string, string> | null = null;
  /**
   * Import resolution memoised for the life of one compiler, which is one rebuild.
   *
   * The discovery BFS resolves the same specifier from every directory that imports it, and each miss
   * costs up to 13 sequential `exists()` calls — the bare path, six extensions, six `index.*`. Nothing
   * here outlives the rebuild, so there is no invalidation to get wrong.
   */
  #fileExistsCache = new Map<string, Promise<boolean>>();
  #resolvedFileCache = new Map<string, Promise<string | null>>();
  #resolvedSpecifierCache = new Map<string, Promise<string | null>>();
  /** Every stylesheet this compile reached, entry points and `@import` targets alike. */
  #discoveredCssPaths = new Set<string>();
  /**
   * `@import` targets per base path, so whoever writes the asset can check the file it actually wrote — the
   * compiled text and the written artifact are two different places a declaration can go missing.
   */
  importedStylesheetsByBasePath: Record<string, ImportedStylesheet[]> = {};

  #fileExists(absPath: string): Promise<boolean> {
    let cached = this.#fileExistsCache.get(absPath);
    if (!cached) {
      cached = Bun.file(absPath).exists();
      this.#fileExistsCache.set(absPath, cached);
    }
    return cached;
  }

  #resolveSourceFileCandidate(absPathNoExt: string): Promise<string | null> {
    let cached = this.#resolvedFileCache.get(absPathNoExt);
    if (cached) return cached;
    cached = (async () => {
      if (await this.#fileExists(absPathNoExt)) return isSourceFile(absPathNoExt) ? absPathNoExt : null;
      for (const ext of SOURCE_EXTS) {
        const filePath = `${absPathNoExt}${ext}`;
        if (await this.#fileExists(filePath)) return filePath;
      }
      for (const ext of SOURCE_EXTS) {
        const filePath = path.join(absPathNoExt, `index${ext}`);
        if (await this.#fileExists(filePath)) return filePath;
      }
      return null;
    })();
    this.#resolvedFileCache.set(absPathNoExt, cached);
    return cached;
  }
  async getCss({ refresh }: { refresh?: boolean } = {}) {
    if (this.#cssText !== null && !refresh) return this.#cssText;
    this.#discoveredCssPaths.clear();
    this.importedStylesheetsByBasePath = {};
    const { cssPaths, sourcePaths } = await this.discoverCssAndSources({ refresh });
    const { css, imported } = await this.#compileWithImports(cssPaths, sourcePaths);
    this.#cssText = css;
    this.importedStylesheetsByBasePath = { "": imported };
    await this.#warnUnreachableStylesheets();
    return this.#cssText;
  }

  async getCssByBasePath({ refresh }: { refresh?: boolean } = {}): Promise<Record<string, string>> {
    if (this.#cssTextByBasePath !== null && !refresh) return this.#cssTextByBasePath;
    this.#discoveredCssPaths.clear();
    this.importedStylesheetsByBasePath = {};
    const akanConfig = await this.#app.getConfig({ refresh });
    const pageKeys = await this.#app.getPageKeys({ refresh });
    const basePaths = [...akanConfig.basePaths];
    const rootPageKeys = pageKeys.filter((pageKey) => getPageKeyBasePath(pageKey, basePaths) === null);
    const cssEntries = await Promise.all([
      (async () => {
        if (rootPageKeys.length === 0) return ["", ""] as const;
        const started = Date.now();
        const { cssPaths, sourcePaths } = await this.discoverCssAndSources({ refresh, pageKeys: rootPageKeys });
        const { css, imported } = await this.#compileWithImports(cssPaths, sourcePaths);
        this.importedStylesheetsByBasePath[""] = imported;
        this.#logger.verbose(
          `css base=root paths=${cssPaths.length} sources=${sourcePaths.length} in ${Date.now() - started}ms`,
        );
        return ["", css] as const;
      })(),
      ...basePaths.map(async (basePath) => {
        const basePathPageKeys = pageKeys.filter((pageKey) => getPageKeyBasePath(pageKey, basePaths) === basePath);
        if (basePathPageKeys.length === 0) return [basePath, ""] as const;
        const started = Date.now();
        const { cssPaths, sourcePaths } = await this.discoverCssAndSources({ refresh, pageKeys: basePathPageKeys });
        const { css, imported } = await this.#compileWithImports(cssPaths, sourcePaths);
        this.importedStylesheetsByBasePath[basePath] = imported;
        this.#logger.verbose(
          `css base=${basePath} paths=${cssPaths.length} sources=${sourcePaths.length} in ${Date.now() - started}ms`,
        );
        return [basePath, css] as const;
      }),
    ]);
    this.#cssTextByBasePath = Object.fromEntries(cssEntries);
    await this.#warnUnreachableStylesheets();
    return this.#cssTextByBasePath;
  }

  /**
   * A stylesheet under `page/` reaches the build only by being imported from a route source. One that nothing
   * imports compiles to nothing and reports success, which is indistinguishable from an empty theme — so say it
   * out loud once per compile rather than leaving it to be noticed as unstyled elements in the browser.
   */
  async #warnUnreachableStylesheets() {
    const pageDir = path.join(this.#app.cwdPath, "page");
    const glob = new Bun.Glob("**/*.css");
    for await (const cssPath of glob.scan({ cwd: pageDir, absolute: true })) {
      // `(libs)` is a link farm: the same file is discovered under its real path in `libs/`, never this one.
      if (cssPath.includes(`${path.sep}(libs)${path.sep}`)) continue;
      if (this.#discoveredCssPaths.has(cssPath)) continue;
      this.#logger.warn(`css ${path.relative(this.#app.cwdPath, cssPath)} is imported by no route and never compiled`);
    }
  }

  async discoverCss({ refresh }: { refresh?: boolean } = {}): Promise<string[]> {
    const { cssPaths } = await this.discoverCssAndSources({ refresh });
    return cssPaths;
  }

  async discoverCssAndSources({
    refresh,
    pageKeys,
  }: {
    refresh?: boolean;
    pageKeys?: string[];
  } = {}): Promise<CssDiscovery> {
    pageKeys ??= await this.#app.getPageKeys({ refresh });
    const seeds = pageKeys.map((key) => path.resolve(this.#app.cwdPath, "page", key));
    const cssFiles = new Set<string>();
    const sourceFiles = new Set<string>();
    const queue = [...seeds];
    const resolvePackage = await createTsconfigPackageResolver(this.#app);
    const analyzer = new BarrelAnalyzer({ resolvePackage });
    const akanConfig = await this.#app.getConfig({ refresh });

    while (queue.length > 0) {
      const filePath = queue.shift();
      if (!filePath || sourceFiles.has(filePath) || isIgnoredNodeModuleSource(filePath)) continue;
      sourceFiles.add(filePath);

      let content: string;
      try {
        content = await Bun.file(filePath).text();
      } catch {
        continue;
      }

      let source = content;
      if (akanConfig.barrelImports.length > 0) {
        try {
          const rewritten = await rewriteBarrelImports(content, akanConfig.barrelImports, analyzer);
          if (rewritten !== null) source = rewritten;
        } catch {
          // best-effort: unresolved barrel rewrites should not stop CSS discovery
        }
      }

      let imports: Bun.Import[];
      try {
        imports = this.#transpiler.scanImports(source);
      } catch {
        continue;
      }

      const importerDir = path.dirname(filePath);
      for (const imp of imports) {
        const spec = imp.path;
        if (!spec) continue;
        if (spec.endsWith(".css")) {
          const cssPath = await this.#resolveCssImport(spec, importerDir);
          cssFiles.add(cssPath);
          continue;
        }
        if (NON_SOURCE_EXT_RE.test(spec)) continue;
        const resolved = await this.#resolveSourceImport(spec, importerDir, resolvePackage);
        if (!resolved || sourceFiles.has(resolved) || isIgnoredNodeModuleSource(resolved)) continue;
        queue.push(resolved);
      }
    }

    const tokenPaths = await this.#libTokenStylesheets(sourceFiles);
    const cssPaths = [...new Set([...tokenPaths, ...cssFiles])];
    for (const cssPath of cssPaths) this.#discoveredCssPaths.add(cssPath);
    return { cssPaths, sourcePaths: [...sourceFiles] };
  }

  /**
   * `libs/<lib>/ui/tokens.css` of every lib the page graph reached, so a lib can own the fixed colours its own
   * components need instead of each consuming app re-declaring them. Ordered ahead of the app's stylesheets:
   * the app is the last word on any variable both declare.
   */
  async #libTokenStylesheets(sourceFiles: Set<string>): Promise<string[]> {
    const libsRoot = path.join(this.#app.workspace.workspaceRoot, "libs");
    const libNames = new Set<string>();
    for (const filePath of sourceFiles) {
      const relPath = path.relative(libsRoot, filePath);
      if (relPath.startsWith("..") || path.isAbsolute(relPath)) continue;
      const [libName] = relPath.split(path.sep);
      if (libName) libNames.add(libName);
    }
    const tokenPaths = await Promise.all(
      [...libNames].sort().map(async (libName) => {
        const tokensPath = path.join(libsRoot, libName, "ui/tokens.css");
        return (await this.#fileExists(tokensPath)) ? tokensPath : null;
      }),
    );
    return tokenPaths.filter((tokensPath): tokensPath is string => !!tokensPath);
  }
  async compileCss(cssPaths: string[], sourcePaths: string[]): Promise<string> {
    const { css } = await this.#compileWithImports(cssPaths, sourcePaths);
    return css;
  }

  /**
   * The collector is per compile rather than per compiler instance: `getCssByBasePath` compiles every base path
   * concurrently, so instance state would mix one base path's imports into another's check.
   */
  async #compileWithImports(
    cssPaths: string[],
    sourcePaths: string[],
  ): Promise<{ css: string; imported: ImportedStylesheet[] }> {
    if (cssPaths.length === 0) return { css: "", imported: [] };

    const compileStarted = Date.now();
    const compilers = await Promise.all(
      cssPaths.map(async (cssPath) => {
        const css = await Bun.file(cssPath).text();
        const base = path.dirname(cssPath);
        const imported = new Map<string, string>();
        const compiler = await compile(css, {
          base,
          loadStylesheet: (id, fromBase) => this.#loadStylesheet(id, fromBase, imported),
          loadModule: (id, fromBase) => this.#loadModule(id, fromBase),
        });
        return { cssPath, compiler, imported };
      }),
    );

    const sourceDirs = new Set<string>();
    for (const entry of compilers) {
      if (!entry) continue;
      for (const s of entry.compiler.sources as { base: string }[]) sourceDirs.add(s.base);
    }
    const scanStarted = Date.now();
    const candidates = await this.#scanCandidates(sourcePaths, [...sourceDirs]);
    this.#logger.verbose(
      `css candidates scanned count=${candidates.length} sources=${sourcePaths.length} dirs=${sourceDirs.size} in ${Date.now() - scanStarted}ms`,
    );
    const parts: string[] = [];
    const imported: ImportedStylesheet[] = [];
    for (const entry of compilers) {
      if (!entry) continue;
      const part = entry.compiler.build(candidates);
      parts.push(part);
      for (const [cssPath, content] of entry.imported) {
        const declaredNames = declaredCustomProperties(content);
        imported.push({ cssPath, declaredNames });
        if (declaredNames.length === 0 || declaredNames.some((name) => part.includes(`${name}:`))) continue;
        this.#logger.warn(
          `css @import ${cssPath} was loaded by ${entry.cssPath} but none of its ${declaredNames.length} declaration(s) reached the compiled CSS`,
        );
      }
    }
    this.#logger.verbose(
      `css compiled paths=${cssPaths.length} candidates=${candidates.length} in ${Date.now() - compileStarted}ms`,
    );
    return { css: parts.join("\n"), imported };
  }

  async #loadStylesheet(id: string, fromBase: string, imported?: Map<string, string>) {
    const p = await this.#resolveCssImport(id, fromBase);
    this.#discoveredCssPaths.add(p);
    const content = await Bun.file(p).text();
    imported?.set(p, content);
    this.#logger.verbose(`css import "${id}" from ${fromBase} -> ${p} (${content.length} bytes)`);
    return { path: p, base: path.dirname(p), content };
  }

  /**
   * Every specifier is verified here, path-shaped ones included. An `@import` the pipeline cannot resolve is
   * a build error and never a no-op: the vocabulary closure means a component whose token declaration failed
   * to load renders unstyled, which nothing downstream can distinguish from a design choice.
   */
  async #resolveCssImport(id: string, fromBase: string): Promise<string> {
    if (id.startsWith(".") || id.startsWith("/")) {
      const filePath = path.resolve(fromBase, id);
      if (await this.#fileExists(filePath)) return filePath;
      throw new Error(`[css] failed to resolve stylesheet import "${id}" from ${fromBase} (no file at ${filePath})`);
    }
    const resolver = await this.#getCssImportResolver();
    const resolved = await resolver.resolve(id, fromBase);
    if (resolved) return resolved;
    throw new Error(`[css] failed to resolve stylesheet import "${id}" from ${fromBase}`);
  }

  async #getCssImportResolver() {
    if (this.#cssImportResolver) return this.#cssImportResolver;
    this.#cssImportResolver = await CssImportResolver.create(this.#app);
    return this.#cssImportResolver;
  }
  async #loadModule(id: string, fromBase: string) {
    const p = require.resolve(id, { paths: [fromBase] });
    const mod = await import(p);
    return { path: p, base: path.dirname(p), module: mod.default ?? mod };
  }
  #resolveSourceImport(
    id: string,
    fromBase: string,
    resolvePackage: Awaited<ReturnType<typeof createTsconfigPackageResolver>>,
  ): Promise<string | null> {
    // Keyed by importer directory even for bare specifiers: the tsconfig resolver is
    // directory-independent, but the `Bun.resolveSync` / `require.resolve` fallbacks below are not.
    // The expensive part — the `exists()` probes — is deduplicated by absolute path instead, which is
    // shared across every importer.
    const cacheKey = `${fromBase}\0${id}`;
    let cached = this.#resolvedSpecifierCache.get(cacheKey);
    if (cached) return cached;
    cached = this.#resolveSourceImportUncached(id, fromBase, resolvePackage);
    this.#resolvedSpecifierCache.set(cacheKey, cached);
    return cached;
  }

  async #resolveSourceImportUncached(
    id: string,
    fromBase: string,
    resolvePackage: Awaited<ReturnType<typeof createTsconfigPackageResolver>>,
  ): Promise<string | null> {
    if (id.startsWith(".") || id.startsWith("/")) {
      const abs = id.startsWith("/") ? id : path.resolve(fromBase, id);
      return this.#resolveSourceFileCandidate(abs);
    }

    const pkg = await resolvePackage(id);
    if (pkg) return pkg.entryFile;

    for (const resolve of [() => resolveSourceWithBun(id, fromBase), () => resolveSourceWithRequire(id, fromBase)]) {
      const resolved = await resolve();
      if (resolved) return resolved;
    }
    return null;
  }
  async #scanCandidates(sourcePaths: string[], dirs: string[]): Promise<string[]> {
    const candidates = new Set<string>();
    const glob = new Bun.Glob("**/*.{tsx,ts,jsx,js,html}");
    const files = new Set<string>(sourcePaths);
    await Promise.all(
      dirs.map(async (dir) => {
        for await (const file of glob.scan({ cwd: dir, absolute: true })) {
          if (isIgnoredNodeModuleSource(file)) continue;
          files.add(file);
        }
      }),
    );
    const cache = await new CssCandidateCache(this.#candidateCachePath).load();
    await Promise.all(
      [...files].map(async (file) => {
        for (const candidate of await cache.candidatesFor(file)) candidates.add(candidate);
      }),
    );
    await cache.save(files);
    this.#logger.verbose(`css candidate cache reused=${cache.reused} rescanned=${cache.rescanned}`);
    return [...candidates];
  }
}

function resolveSourceWithBun(id: string, fromBase: string): string | null {
  try {
    const resolved = Bun.resolveSync(id, fromBase);
    return isSourceFile(resolved) ? resolved : null;
  } catch {
    return null;
  }
}

function resolveSourceWithRequire(id: string, fromBase: string): string | null {
  try {
    const resolved = require.resolve(id, { paths: [fromBase] });
    return isSourceFile(resolved) ? resolved : null;
  } catch {
    return null;
  }
}

function isSourceFile(filePath: string) {
  return SOURCE_EXTS.includes(path.extname(filePath) as (typeof SOURCE_EXTS)[number]);
}

export function isIgnoredNodeModuleSource(filePath: string): boolean {
  return NODE_MODULES_RE.test(filePath) && !AKANJS_NODE_MODULE_RE.test(filePath);
}

/**
 * `@theme` blocks are stripped first: those variables are emitted only when a utility uses one, so their
 * absence from a build says nothing about whether the stylesheet arrived.
 */
export function declaredCustomProperties(css: string): string[] {
  const withoutThemeBlocks = css.replace(/@theme[^{]*\{[^}]*\}/g, "");
  return [...new Set([...withoutThemeBlocks.matchAll(/(?:^|[\s;{])(--[\w-]+)\s*:/g)].map(([, name]) => name))].filter(
    (name): name is string => !!name,
  );
}

function getPageKeyBasePath(pageKey: string, basePaths: string[]): string | null {
  const normalized = pageKey.split(path.sep).join("/").replace(/^\.\//, "");
  const segments = normalized.split("/");
  const firstPublicSegment = segments.find((segment) => segment !== "[lang]" && !/^\(.+\)$/.test(segment));
  return firstPublicSegment && basePaths.includes(firstPublicSegment) ? firstPublicSegment : null;
}
