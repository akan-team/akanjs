import { mkdir } from "node:fs/promises";
import path from "node:path";
import { CSR_DEV_DIRNAME } from "akanjs/server/hmr/csrDevManifest";
import { resolveSsrPageEntriesForApp } from "../artifact/implicitRootLayout";
import type { App } from "../commandDecorators";
import { bundleDefine } from "./bundleDefine";
import { CsrDevArtifactWriter } from "./csrDevArtifactWriter";
import { CsrDevModuleCompiler } from "./csrDevModuleCompiler";
import { CsrDevPatcher } from "./csrDevPatcher";
import { CsrDevPaths } from "./csrDevPaths";
import { CsrDevResolver } from "./csrDevResolver";
import type { CsrDevCompiledModule, CsrDevContext, CsrDevGraph } from "./csrDevTypes";
import { CsrEntryFiles } from "./csrEntryFiles";
import { PagesEntrySourceGenerator } from "./pagesEntrySourceGenerator";

export interface CsrDevUpdate {
  generation: number;
  reload: boolean;
  reason?: string;
  patchUrl?: string;
  changedIds: string[];
  moduleCount: number;
}

export interface CsrDevUpdateOptions {
  /** Called once an update exists: for a patch before app.js is rewritten, for a reload after everything is on disk. */
  announce?: (update: CsrDevUpdate) => void;
}

//* Dev-only CSR as a module registry, under `.akan/artifact/csr-dev`. This owns the context, the page entries and the
//* full build; `CsrDevPatcher` owns the incremental path, which the resident builder keeps in memory between saves.
export class CsrDevBundler {
  static readonly #formatVersion = 3;
  readonly #app: App;
  readonly #entryDir: string;
  readonly outDir: string;
  readonly paths: CsrDevPaths;
  readonly writer: CsrDevArtifactWriter;

  constructor(app: App) {
    this.#app = app;
    this.paths = new CsrDevPaths(app.workspace.workspaceRoot);
    this.outDir = path.join(app.cwdPath, ".akan/artifact", CSR_DEV_DIRNAME);
    this.#entryDir = path.join(app.cwdPath, ".akan/generated", CSR_DEV_DIRNAME);
    this.writer = new CsrDevArtifactWriter(this.outDir);
  }

  // A build worker: a throwaway patcher that starts from the disk, and builds everything itself when it cannot patch.
  async update(changedFiles: string[] = [], { announce }: CsrDevUpdateOptions = {}): Promise<CsrDevUpdate | null> {
    const result = await new CsrDevPatcher(this).update(changedFiles, { announce, allowWholeAppBuilds: true });
    if (result.kind === "unchanged") return null;
    if (result.kind === "update") return result.update;
    const update = await this.fullBuild(result.context, result.generation, result.reason);
    announce?.(update);
    return update;
  }

  async context(): Promise<CsrDevContext> {
    const akanConfig = await this.#app.getConfig();
    const pageEntries = await resolveSsrPageEntriesForApp(this.#app, await this.#app.getPageKeys());
    const basePaths = [...akanConfig.basePaths];
    const htmlBasePaths = basePaths.length > 0 ? basePaths : [""];
    const define = bundleDefine(this.#app, "start", "csr");
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

  async fullBuild(context: CsrDevContext, generation: number, reason: string): Promise<CsrDevUpdate> {
    await this.writer.reset();
    const entries = await this.writeEntries(context);
    const entryFiles = Object.values(entries.files);
    const resolver = new CsrDevResolver({ paths: this.paths, context, entryFiles });
    await resolver.prepass();
    const { modules: compiled } = await this.compiler(context, resolver).compile(
      [...entryFiles, context.refreshFile],
      new Set(),
    );
    const graph: CsrDevGraph = {
      version: 1,
      configKey: context.configKey,
      refresh: this.paths.idOf(context.refreshFile),
      entries: this.entryIds(entries.files),
      modules: {},
      resolution: {},
      pending: [],
    };
    this.merge(graph, resolver, compiled);
    await this.writer.writeModules(compiled);
    const vendorFile = await this.writer.writeVendor(graph);
    await this.writer.writeApp(graph, generation);
    await this.writer.writeState(graph, { version: 1, generation, vendorFile, entries: graph.entries });
    await this.writer.prune(vendorFile, generation);
    return { generation, reload: true, reason, changedIds: [], moduleCount: Object.keys(graph.modules).length };
  }

  async writeEntries(context: CsrDevContext): Promise<{ files: Record<string, string>; changed: string[] }> {
    await mkdir(this.#entryDir, { recursive: true });
    const files: Record<string, string> = {};
    const changed: string[] = [];
    for (const basePath of context.htmlBasePaths) {
      const file = path.join(this.#entryDir, CsrEntryFiles.entryFilename(basePath));
      const entryPages = CsrEntryFiles.pageEntriesForBasePath(context.pageEntries, basePath, context.basePaths);
      const generator = new PagesEntrySourceGenerator(entryPages);
      const pages = await generator.generateStatic({ fromDir: this.#entryDir });
      const hot = await generator.generateHotReplace({
        fromDir: this.#entryDir,
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

  compiler(context: CsrDevContext, resolver: CsrDevResolver): CsrDevModuleCompiler {
    return new CsrDevModuleCompiler({ app: this.#app, paths: this.paths, resolver, context, outDir: this.outDir });
  }

  merge(graph: CsrDevGraph, resolver: CsrDevResolver, compiled: CsrDevCompiledModule[]): void {
    for (const module of compiled)
      graph.modules[module.id] = {
        vendor: module.vendor,
        mtimeMs: module.mtimeMs,
        hash: module.hash,
        deps: module.deps.map((dep) => (CsrDevPaths.isStub(dep) ? dep : this.paths.idOf(dep))),
        ...(module.helpers ? { helpers: module.helpers.hash } : {}),
      };
    graph.pending = [];
    graph.resolution = resolver.serialize();
  }

  entryIds(files: Record<string, string>): Record<string, string> {
    return Object.fromEntries(Object.entries(files).map(([basePath, file]) => [basePath, this.paths.idOf(file)]));
  }

  #resolveRefreshRuntime(): string {
    const akanWebkit = CsrDevPaths.tryResolve("akanjs/webkit", this.#app.cwdPath);
    const bases = [this.#app.cwdPath, this.paths.root, ...(akanWebkit ? [path.dirname(path.dirname(akanWebkit))] : [])];
    for (const base of bases) {
      const resolved = CsrDevPaths.tryResolve("react-refresh/runtime", base);
      if (resolved) return CsrDevPaths.realpath(resolved);
    }
    throw new Error(`[csr-dev] react-refresh/runtime is not resolvable from ${bases.join(", ")}`);
  }
}
