import { mkdir } from "node:fs/promises";
import path from "node:path";
import { CSR_DEV_DIRNAME, CSR_DEV_ROUTE_PREFIX } from "akanjs/server/hmr/csrDevManifest";
import { resolveSsrPageEntriesForApp } from "../artifact/implicitRootLayout";
import type { App } from "../commandDecorators";
import { AsyncDefaultExportDetector } from "../transforms/asyncDefaultExportDetector";
import { bundleDefine } from "./bundleDefine";
import { CsrDevPaths } from "./csrDevPaths";
import type { CsrDevContext } from "./csrDevTypes";
import { CsrEntryFiles } from "./csrEntryFiles";
import { DevRegistryBundler } from "./devRegistryBundler";
import { PagesEntrySourceGenerator } from "./pagesEntrySourceGenerator";

//* Dev-only CSR as a module registry, under `.akan/artifact/csr-dev`: one entry per basePath boots every page.
export class CsrDevBundler extends DevRegistryBundler {
  static readonly #formatVersion = 4;
  readonly reloadsOnEntryChange = true;
  //? Detecting a page's async default parses it with TypeScript: on apps/akan every page each save cost ~100ms.
  readonly #asyncDefaults = new Map<string, { mtimeMs: number; detected: Promise<boolean> }>();

  constructor(app: App) {
    super(app, { dirName: CSR_DEV_DIRNAME, routePrefix: CSR_DEV_ROUTE_PREFIX, library: false });
  }

  async context(): Promise<CsrDevContext | null> {
    const akanConfig = await this.app.getConfig();
    const pageEntries = await resolveSsrPageEntriesForApp(this.app, await this.app.getPageKeys());
    if (pageEntries.length === 0) return null;
    const basePaths = [...akanConfig.basePaths];
    const htmlBasePaths = basePaths.length > 0 ? basePaths : [""];
    const define = bundleDefine(this.app, "start", "csr");
    const optimizeImports = [...akanConfig.optimizeImports];
    const configKey = Bun.hash(
      JSON.stringify([CsrDevBundler.#formatVersion, Bun.version, define, optimizeImports, htmlBasePaths]),
    ).toString(36);
    return {
      pageEntries,
      basePaths,
      htmlBasePaths,
      define,
      optimizeImports,
      configKey,
      refreshFile: this.#resolveRefreshRuntime(),
    };
  }

  async writeEntries(context: CsrDevContext): Promise<{ files: Record<string, string>; changed: string[] }> {
    await mkdir(this.entryDir, { recursive: true });
    const files: Record<string, string> = {};
    const changed: string[] = [];
    for (const basePath of context.htmlBasePaths) {
      const file = path.join(this.entryDir, CsrEntryFiles.entryFilename(basePath));
      const entryPages = CsrEntryFiles.pageEntriesForBasePath(context.pageEntries, basePath, context.basePaths);
      const generator = new PagesEntrySourceGenerator(entryPages, {
        isAsyncDefault: (moduleAbsPath) => this.#isAsyncDefault(moduleAbsPath),
      });
      const pages = await generator.generateStatic({ fromDir: this.entryDir });
      const hot = await generator.generateHotReplace({
        fromDir: this.entryDir,
        ownerId: this.paths.idOf(file),
        moduleIds: entryPages.map(({ moduleAbsPath }) => this.paths.idOf(moduleAbsPath)),
      });
      const source = `import * as akanWebkit from "akanjs/webkit";\n${pages}\nvoid akanWebkit.bootCsr(pages);\n${hot}`;
      const unchanged = (await Bun.file(file).exists()) && (await Bun.file(file).text()) === source;
      if (!unchanged) await Bun.write(file, source);
      const entryFile = CsrDevPaths.realpath(file);
      files[basePath] = entryFile;
      if (!unchanged) changed.push(entryFile);
    }
    return { files, changed };
  }

  protected async rootFiles(entryFiles: string[]): Promise<string[]> {
    return entryFiles;
  }

  #isAsyncDefault(moduleAbsPath: string): Promise<boolean> {
    const mtimeMs = CsrDevPaths.mtimeOf(moduleAbsPath);
    const cached = this.#asyncDefaults.get(moduleAbsPath);
    if (cached?.mtimeMs === mtimeMs) return cached.detected;
    const detected = AsyncDefaultExportDetector.detect(moduleAbsPath);
    this.#asyncDefaults.set(moduleAbsPath, { mtimeMs, detected });
    return detected;
  }

  #resolveRefreshRuntime(): string {
    const akanWebkit = CsrDevPaths.tryResolve("akanjs/webkit", this.app.cwdPath);
    const bases = [this.app.cwdPath, this.paths.root, ...(akanWebkit ? [path.dirname(path.dirname(akanWebkit))] : [])];
    for (const base of bases) {
      const resolved = CsrDevPaths.tryResolve("react-refresh/runtime", base);
      if (resolved) return CsrDevPaths.realpath(resolved);
    }
    throw new Error(`[csr-dev] react-refresh/runtime is not resolvable from ${bases.join(", ")}`);
  }
}
