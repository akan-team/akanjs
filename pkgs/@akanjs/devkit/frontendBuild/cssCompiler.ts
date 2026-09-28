import path from "node:path";
import { Logger } from "akanjs/common";
import { compile } from "tailwindcss";
import { SOURCE_EXTS } from "../akanApp/devHostPolicy";
import type { App } from "../commandDecorators";
import { BarrelAnalyzer } from "../transforms/barrelAnalyzer";
import { createTsconfigPackageResolver, rewriteBarrelImports } from "../transforms/barrelImportsPlugin";
import { CsrEntryFiles } from "./csrEntryFiles";
import { CssCandidateCache } from "./cssCandidateCache";
import { CssImportResolver } from "./cssImportResolver";

const NON_SOURCE_EXT_RE = /\.(json|svg|png|jpe?g|webp|gif|avif|ico|woff2?|ttf|otf|mp3|mp4|wav)$/i;
const NODE_MODULES_RE = /[\\/]node_modules[\\/]/;
const AKANJS_NODE_MODULE_RE = /[\\/]node_modules[\\/]akanjs[\\/]/;

interface CssDiscovery {
  cssPaths: string[];
  sourcePaths: string[];
}

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

  // Beside the sources, not in `dist`: the build and the dev server scan the same files, so they share one cache.
  get #candidateCachePath() {
    return path.join(this.#app.cwdPath, ".akan/cache/cssCandidates.json");
  }

  #cssText: string | null = null;
  #cssTextByBasePath: Record<string, string> | null = null;
  // Memoised for one compiler, i.e. one rebuild: nothing outlives it, so there is nothing to invalidate.
  #fileExistsCache = new Map<string, Promise<boolean>>();
  #resolvedFileCache = new Map<string, Promise<string | null>>();
  #resolvedSpecifierCache = new Map<string, Promise<string | null>>();
  #discoveredCssPaths = new Set<string>();
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
    const compileBasePath = async (basePath: string, basePathPageKeys: string[], label = basePath) => {
      if (basePathPageKeys.length === 0) return [basePath, ""] as const;
      const started = Date.now();
      const { cssPaths, sourcePaths } = await this.discoverCssAndSources({ refresh, pageKeys: basePathPageKeys });
      const { css, imported } = await this.#compileWithImports(cssPaths, sourcePaths);
      this.importedStylesheetsByBasePath[basePath] = imported;
      this.#logger.verbose(
        `css base=${label} paths=${cssPaths.length} sources=${sourcePaths.length} in ${Date.now() - started}ms`,
      );
      return [basePath, css] as const;
    };
    const cssEntries = await Promise.all([
      compileBasePath("", rootPageKeys, "root"),
      ...basePaths.map((basePath) =>
        compileBasePath(
          basePath,
          pageKeys.filter((pageKey) => getPageKeyBasePath(pageKey, basePaths) === basePath),
        ),
      ),
    ]);
    this.#cssTextByBasePath = Object.fromEntries(cssEntries);
    await this.#warnUnreachableStylesheets();
    return this.#cssTextByBasePath;
  }

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

  // Lib tokens go ahead of the app's stylesheets, so the app has the last word on a variable both declare.
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

  // A per-compile collector: getCssByBasePath compiles base paths concurrently, so instance state would mix them.
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

  // An unresolvable @import throws: under vocabulary closure a missing token file just renders unstyled.
  async #resolveCssImport(id: string, fromBase: string): Promise<string> {
    if (id.startsWith(".") || id.startsWith("/")) {
      const filePath = path.resolve(fromBase, id);
      if (await this.#fileExists(filePath)) return filePath;
      throw new Error(`[css] failed to resolve stylesheet import "${id}" from ${fromBase} (no file at ${filePath})`);
    }
    this.#cssImportResolver ??= await CssImportResolver.create(this.#app);
    const resolved = await this.#cssImportResolver.resolve(id, fromBase);
    if (resolved) return resolved;
    throw new Error(`[css] failed to resolve stylesheet import "${id}" from ${fromBase}`);
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
    // Keyed by importer directory even for bare specifiers: the Bun/require fallbacks are directory-dependent.
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
  return SOURCE_EXTS.has(path.extname(filePath));
}

export function isIgnoredNodeModuleSource(filePath: string): boolean {
  return NODE_MODULES_RE.test(filePath) && !AKANJS_NODE_MODULE_RE.test(filePath);
}

/** Skips `@theme` blocks: Tailwind emits those variables only when a utility uses one. */
export function declaredCustomProperties(css: string): string[] {
  const withoutThemeBlocks = css.replace(/@theme[^{]*\{[^}]*\}/g, "");
  return [...new Set([...withoutThemeBlocks.matchAll(/(?:^|[\s;{])(--[\w-]+)\s*:/g)].map(([, name]) => name))].filter(
    (name): name is string => !!name,
  );
}

export function getPageKeyBasePath(pageKey: string, basePaths: string[]): string | null {
  return CsrEntryFiles.basePathOfPageKey(pageKey, basePaths);
}
