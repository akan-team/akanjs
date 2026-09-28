import fs from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { CSR_DEV_DIRNAME, CSR_DEV_MANIFEST_FILE, type CsrDevManifest } from "akanjs/server/hmr/csrDevManifest";
import { isAkanRuntimeMetadataFile } from "akanjs/server/hmr/runtimeMetadataFile";
import { resolveSsrPageEntriesForApp } from "../artifact/implicitRootLayout";
import type { App } from "../commandDecorators";
import { bundleDefine } from "./bundleDefine";
import { CsrArtifactBuilder } from "./csrArtifactBuilder";
import { CsrDevArtifactWriter } from "./csrDevArtifactWriter";
import { CsrDevModuleCompiler } from "./csrDevModuleCompiler";
import { CsrDevPaths } from "./csrDevPaths";
import { CsrDevResolver } from "./csrDevResolver";
import type { CsrDevCompiledModule, CsrDevContext, CsrDevGraph } from "./csrDevTypes";
import { PagesEntrySourceGenerator } from "./pagesEntrySourceGenerator";

export interface CsrDevUpdate {
  generation: number;
  reload: boolean;
  reason?: string;
  patchUrl?: string;
  changedIds: string[];
  moduleCount: number;
}

//* Dev-only CSR as a module registry. The build worker is a fresh process per save, so the graph, every module's
//* factory and the resolutions live on disk under `.akan/artifact/csr-dev`.
export class CsrDevBundler {
  static readonly #formatVersion = 3;
  readonly #app: App;
  readonly #paths: CsrDevPaths;
  readonly #outDir: string;
  readonly #entryDir: string;
  readonly #writer: CsrDevArtifactWriter;

  constructor(app: App) {
    this.#app = app;
    this.#paths = new CsrDevPaths(app.workspace.workspaceRoot);
    this.#outDir = path.join(app.cwdPath, ".akan/artifact", CSR_DEV_DIRNAME);
    this.#entryDir = path.join(app.cwdPath, ".akan/generated", CSR_DEV_DIRNAME);
    this.#writer = new CsrDevArtifactWriter(this.#outDir);
  }

  async update(changedFiles: string[] = []): Promise<CsrDevUpdate | null> {
    const context = await this.#context();
    if (context.pageEntries.length === 0) return null;
    const manifest = await this.#writer.readJson<CsrDevManifest>(CSR_DEV_MANIFEST_FILE);
    const graph = await this.#writer.readJson<CsrDevGraph>("graph.json");
    const generation = (manifest?.generation ?? 0) + 1;
    if (!manifest || !graph || graph.version !== 1 || graph.configKey !== context.configKey)
      return await this.#fullBuild(context, generation, manifest ? "the dev bundle config changed" : "first build");
    const metadataFile = changedFiles.find(isAkanRuntimeMetadataFile);
    // `lib/useClient.ts` inlines signal and dictionary metadata through a macro at build time.
    if (metadataFile) return await this.#fullBuild(context, generation, `${path.basename(metadataFile)} changed`);
    return await this.#incrementalBuild(context, graph, manifest, changedFiles, generation);
  }

  async #context(): Promise<CsrDevContext> {
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

  #resolveRefreshRuntime(): string {
    const akanWebkit = CsrDevPaths.tryResolve("akanjs/webkit", this.#app.cwdPath);
    const bases = [
      this.#app.cwdPath,
      this.#paths.root,
      ...(akanWebkit ? [path.dirname(path.dirname(akanWebkit))] : []),
    ];
    for (const base of bases) {
      const resolved = CsrDevPaths.tryResolve("react-refresh/runtime", base);
      if (resolved) return CsrDevPaths.realpath(resolved);
    }
    throw new Error(`[csr-dev] react-refresh/runtime is not resolvable from ${bases.join(", ")}`);
  }

  async #fullBuild(context: CsrDevContext, generation: number, reason: string): Promise<CsrDevUpdate> {
    await this.#writer.reset();
    const entries = await this.#writeEntries(context);
    const entryFiles = Object.values(entries.files);
    const resolver = new CsrDevResolver({ paths: this.#paths, context, entryFiles });
    await resolver.prepass();
    const compiled = await this.#compiler(context, resolver).compile([...entryFiles, context.refreshFile], new Set());
    const graph: CsrDevGraph = {
      version: 1,
      configKey: context.configKey,
      refresh: this.#paths.idOf(context.refreshFile),
      entries: this.#entryIds(entries.files),
      modules: {},
      resolution: {},
      pending: [],
    };
    this.#merge(graph, resolver, compiled);
    await this.#writer.writeModules(compiled);
    const vendorFile = await this.#writer.writeVendor(graph);
    await this.#writer.writeApp(graph, generation);
    await this.#writer.writeState(graph, { version: 1, generation, vendorFile, entries: graph.entries });
    await this.#writer.prune(vendorFile, generation);
    return { generation, reload: true, reason, changedIds: [], moduleCount: Object.keys(graph.modules).length };
  }

  async #incrementalBuild(
    context: CsrDevContext,
    graph: CsrDevGraph,
    manifest: CsrDevManifest,
    changedFiles: string[],
    generation: number,
  ): Promise<CsrDevUpdate | null> {
    const entries = await this.#writeEntries(context);
    const entryIds = this.#entryIds(entries.files);
    await this.#forgetDeletedModules(graph);
    const changed = await this.#changedModules(graph, changedFiles);
    for (const file of entries.changed) changed.add(this.#paths.idOf(file));
    const routesMoved = entries.changed.length > 0 || JSON.stringify(entryIds) !== JSON.stringify(graph.entries);
    if (changed.size === 0) return null;

    const resolver = new CsrDevResolver({
      paths: this.#paths,
      context,
      entryFiles: Object.values(entries.files),
      resolution: graph.resolution,
    });
    const known = new Set(Object.keys(graph.modules).map((id) => this.#paths.fileOf(id)));
    let compiled: CsrDevCompiledModule[];
    try {
      compiled = await this.#compiler(context, resolver).compile(
        [...changed].map((id) => this.#paths.fileOf(id)),
        known,
      );
    } catch (error) {
      graph.pending = [...changed];
      await this.#writer.writeJson("graph.json", graph);
      throw error;
    }
    const vendorJoined = compiled.some((module) => module.vendor && !graph.modules[module.id]);
    this.#merge(graph, resolver, compiled);
    graph.entries = entryIds;
    await this.#writer.writeModules(compiled);
    const vendorFile = vendorJoined ? await this.#writer.writeVendor(graph) : manifest.vendorFile;
    await this.#writer.writeApp(graph, generation);
    const changedIds = compiled.filter((module) => !module.vendor).map((module) => module.id);
    const constantId = changedIds.find((id) => id.endsWith(".constant.ts"));
    // A model class swapped under live store state would mix old and new instances; reload instead.
    const reason = vendorJoined
      ? "an npm module joined the graph"
      : routesMoved
        ? "the route table changed"
        : constantId
          ? `${path.basename(constantId)} changed`
          : undefined;
    const patchUrl = reason
      ? undefined
      : await this.#writer.writePatch(
          generation,
          compiled.filter((module) => !module.vendor),
        );
    await this.#writer.writeState(graph, { ...manifest, generation, vendorFile, entries: entryIds });
    await this.#writer.prune(vendorFile, generation);
    return {
      generation,
      reload: !!reason,
      reason,
      patchUrl,
      changedIds,
      moduleCount: Object.keys(graph.modules).length,
    };
  }

  async #changedModules(graph: CsrDevGraph, changedFiles: string[]): Promise<Set<string>> {
    const changed = new Set<string>(graph.pending.filter((id) => graph.modules[id]));
    for (const file of changedFiles) {
      const id = this.#paths.idOf(file);
      if (graph.modules[id]) changed.add(id);
    }
    // Stat, not trust: a save made while CSR was unarmed, or a build that failed, never reached this graph. The hash
    // settles it because route discovery rewrites the generated layout wrappers, touching them on every call.
    for (const [id, module] of Object.entries(graph.modules)) {
      if (module.vendor || changed.has(id)) continue;
      const file = this.#paths.fileOf(id);
      if (CsrDevPaths.mtimeOf(file) === module.mtimeMs) continue;
      if ((await CsrDevPaths.hashOf(file)) !== module.hash) changed.add(id);
    }
    return changed;
  }

  // A deleted module leaves the graph instead of being rebuilt: rebuilding a missing file fails every save after it.
  // An importer that still names it fails on its own rebuild, with the resolution error that says why.
  async #forgetDeletedModules(graph: CsrDevGraph): Promise<void> {
    const deleted = Object.keys(graph.modules).filter(
      (id) => !graph.modules[id]?.vendor && !fs.existsSync(this.#paths.fileOf(id)),
    );
    for (const id of deleted) delete graph.modules[id];
    await this.#writer.forgetModules(deleted);
  }

  async #writeEntries(context: CsrDevContext): Promise<{ files: Record<string, string>; changed: string[] }> {
    await mkdir(this.#entryDir, { recursive: true });
    const files: Record<string, string> = {};
    const changed: string[] = [];
    for (const basePath of context.htmlBasePaths) {
      const file = path.join(this.#entryDir, CsrArtifactBuilder.entryFilename(basePath));
      const entryPages = CsrArtifactBuilder.pageEntriesForBasePath(context.pageEntries, basePath, context.basePaths);
      const generator = new PagesEntrySourceGenerator(entryPages);
      const pages = await generator.generateStatic({ fromDir: this.#entryDir });
      const hot = await generator.generateHotReplace({
        fromDir: this.#entryDir,
        ownerId: this.#paths.idOf(file),
        moduleIds: entryPages.map(({ moduleAbsPath }) => this.#paths.idOf(moduleAbsPath)),
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

  #compiler(context: CsrDevContext, resolver: CsrDevResolver): CsrDevModuleCompiler {
    return new CsrDevModuleCompiler({ app: this.#app, paths: this.#paths, resolver, context, outDir: this.#outDir });
  }

  #merge(graph: CsrDevGraph, resolver: CsrDevResolver, compiled: CsrDevCompiledModule[]): void {
    for (const module of compiled)
      graph.modules[module.id] = {
        vendor: module.vendor,
        mtimeMs: module.mtimeMs,
        hash: module.hash,
        deps: module.deps.map((dep) => (CsrDevPaths.isStub(dep) ? dep : this.#paths.idOf(dep))),
        ...(module.helpers ? { helpers: module.helpers.hash } : {}),
      };
    graph.pending = [];
    graph.resolution = resolver.serialize();
  }

  #entryIds(files: Record<string, string>): Record<string, string> {
    return Object.fromEntries(Object.entries(files).map(([basePath, file]) => [basePath, this.#paths.idOf(file)]));
  }
}
