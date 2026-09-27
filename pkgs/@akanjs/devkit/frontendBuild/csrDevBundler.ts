import fs from "node:fs";
import { mkdir, readdir, rename, rm } from "node:fs/promises";
import path from "node:path";
import {
  CSR_DEV_APP_FILE,
  CSR_DEV_DIRNAME,
  CSR_DEV_MANIFEST_FILE,
  CSR_DEV_ROUTE_PREFIX,
  type CsrDevManifest,
} from "akanjs/server/hmr/csrDevManifest";
import { isAkanRuntimeMetadataFile } from "akanjs/server/hmr/runtimeMetadataFile";
import type { BunPlugin } from "bun";
import { type PageEntry, resolveSsrPageEntriesForApp } from "../artifact/implicitRootLayout";
import type { App } from "../commandDecorators";
import { bundleDefine } from "./bundleDefine";
import { CsrArtifactBuilder } from "./csrArtifactBuilder";
import { PagesBundleBuilder } from "./pagesBundleBuilder";
import { PagesEntrySourceGenerator } from "./pagesEntrySourceGenerator";
import { RouteClientBuilder } from "./routeClientBuilder";

export interface CsrDevUpdate {
  generation: number;
  reload: boolean;
  reason?: string;
  patchUrl?: string;
  changedIds: string[];
  moduleCount: number;
}

interface CsrDevGraphModule {
  vendor: boolean;
  mtimeMs: number;
  hash: string;
  deps: string[];
}

interface CsrDevGraph {
  version: 1;
  configKey: string;
  refresh: string;
  entries: Record<string, string>;
  modules: Record<string, CsrDevGraphModule>;
  resolution: Record<string, Record<string, string>>;
  pending: string[];
}

interface BundleContext {
  pageEntries: PageEntry[];
  basePaths: string[];
  htmlBasePaths: string[];
  define: Record<string, string>;
  optimizeImports: string[];
  configKey: string;
  refreshFile: string;
}

interface CompiledModule {
  id: string;
  file: string;
  vendor: boolean;
  factory: string;
  deps: string[];
  mtimeMs: number;
  hash: string;
}

interface CompileSession {
  context: BundleContext;
  entryFiles: string[];
  resolution: Map<string, Map<string, string>>;
  prepassDone: boolean;
  fallbacks: Set<string>;
}

interface MetafileImport {
  path: string;
  kind: string;
  original?: string;
  external?: boolean;
}

interface Metafile {
  inputs: Record<string, { imports: MetafileImport[] }>;
  outputs: Record<string, { entryPoint?: string; inputs: Record<string, unknown> }>;
}

//* Dev-only CSR as a module registry: every module is its own CJS factory (Bun.build with each import external),
//* so a save re-executes only the changed modules instead of reloading one scope-hoisted HTML file.
export class CsrDevBundler {
  static readonly #formatVersion = 1;
  static readonly #modulePrefix = "akan-module:";
  static readonly #stubPrefix = "stub:";
  static readonly #inline = "inline";
  static readonly #keptPatches = 40;
  static readonly #keptVendors = 3;
  static readonly #storeRoot = /(?:^|\/)lib\/st\.ts$/;
  static readonly #helperPatches = [
    ["__toESM", "(mod, isNodeMode, target)", "toESM"],
    ["__reExport", "(target, mod, secondTarget)", "reExport"],
  ] as const;
  readonly #app: App;
  readonly #root: string;
  readonly #outDir: string;
  readonly #entryDir: string;

  constructor(app: App) {
    this.#app = app;
    this.#root = CsrDevBundler.#realpath(app.workspace.workspaceRoot);
    this.#outDir = path.join(app.cwdPath, ".akan/artifact", CSR_DEV_DIRNAME);
    this.#entryDir = path.join(app.cwdPath, ".akan/generated", CSR_DEV_DIRNAME);
  }

  async update(changedFiles: string[] = []): Promise<CsrDevUpdate | null> {
    const context = await this.#context();
    if (context.pageEntries.length === 0) return null;
    const manifest = await this.#readJson<CsrDevManifest>(CSR_DEV_MANIFEST_FILE);
    const graph = await this.#readJson<CsrDevGraph>("graph.json");
    const generation = (manifest?.generation ?? 0) + 1;
    if (!manifest || !graph || graph.version !== 1 || graph.configKey !== context.configKey)
      return await this.#fullBuild(context, generation, manifest ? "the dev bundle config changed" : "first build");
    const metadataFile = changedFiles.find(isAkanRuntimeMetadataFile);
    // `lib/useClient.ts` inlines signal and dictionary metadata through a macro at build time.
    if (metadataFile) return await this.#fullBuild(context, generation, `${path.basename(metadataFile)} changed`);
    return await this.#incrementalBuild(context, graph, manifest, changedFiles, generation);
  }

  async #context(): Promise<BundleContext> {
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
    const akanWebkit = CsrDevBundler.#tryResolve("akanjs/webkit", this.#app.cwdPath);
    const bases = [this.#app.cwdPath, this.#root, ...(akanWebkit ? [path.dirname(path.dirname(akanWebkit))] : [])];
    for (const base of bases) {
      const resolved = CsrDevBundler.#tryResolve("react-refresh/runtime", base);
      if (resolved) return CsrDevBundler.#realpath(resolved);
    }
    throw new Error(`[csr-dev] react-refresh/runtime is not resolvable from ${bases.join(", ")}`);
  }

  async #fullBuild(context: BundleContext, generation: number, reason: string): Promise<CsrDevUpdate> {
    await rm(this.#outDir, { recursive: true, force: true });
    await mkdir(path.join(this.#outDir, "modules"), { recursive: true });
    const entries = await this.#writeEntries(context);
    const session: CompileSession = {
      context,
      entryFiles: Object.values(entries.files),
      resolution: new Map(),
      prepassDone: false,
      fallbacks: new Set(),
    };
    await this.#prepass(session);
    const compiled = await this.#compile(session, [...session.entryFiles, context.refreshFile], new Set());
    const graph: CsrDevGraph = {
      version: 1,
      configKey: context.configKey,
      refresh: this.#idOf(context.refreshFile),
      entries: this.#entryIds(entries.files),
      modules: {},
      resolution: {},
      pending: [],
    };
    this.#merge(graph, session, compiled);
    await this.#writeModules(compiled);
    const vendorFile = await this.#writeVendor(graph);
    await this.#writeApp(graph, generation);
    await this.#writeState(graph, { version: 1, generation, vendorFile, entries: graph.entries });
    await this.#prune(vendorFile, generation);
    return { generation, reload: true, reason, changedIds: [], moduleCount: Object.keys(graph.modules).length };
  }

  async #incrementalBuild(
    context: BundleContext,
    graph: CsrDevGraph,
    manifest: CsrDevManifest,
    changedFiles: string[],
    generation: number,
  ): Promise<CsrDevUpdate | null> {
    const entries = await this.#writeEntries(context);
    const entryIds = this.#entryIds(entries.files);
    const changed = new Set<string>(graph.pending);
    for (const file of changedFiles) {
      const id = this.#idOf(file);
      if (graph.modules[id]) changed.add(id);
    }
    // Stat, not trust: a save made while CSR was unarmed, or a build that failed, never reached this graph. The hash
    // settles it because route discovery rewrites the generated layout wrappers, touching them on every call.
    for (const [id, module] of Object.entries(graph.modules)) {
      if (module.vendor || changed.has(id)) continue;
      const file = this.#fileOf(id);
      if (CsrDevBundler.#mtimeOf(file) === module.mtimeMs) continue;
      if ((await CsrDevBundler.#hashOf(file)) !== module.hash) changed.add(id);
    }
    for (const file of entries.changed) changed.add(this.#idOf(file));
    const routesMoved = entries.changed.length > 0 || JSON.stringify(entryIds) !== JSON.stringify(graph.entries);
    if (changed.size === 0) return null;

    const session: CompileSession = {
      context,
      entryFiles: Object.values(entries.files),
      resolution: this.#resolutionOf(graph),
      prepassDone: false,
      fallbacks: new Set(),
    };
    const known = new Set(Object.keys(graph.modules).map((id) => this.#fileOf(id)));
    let compiled: CompiledModule[];
    try {
      compiled = await this.#compile(
        session,
        [...changed].map((id) => this.#fileOf(id)),
        known,
      );
    } catch (error) {
      graph.pending = [...changed];
      await this.#writeJson("graph.json", graph);
      throw error;
    }
    const vendorJoined = compiled.some((module) => module.vendor && !graph.modules[module.id]);
    this.#merge(graph, session, compiled);
    graph.entries = entryIds;
    await this.#writeModules(compiled);
    const vendorFile = vendorJoined ? await this.#writeVendor(graph) : manifest.vendorFile;
    await this.#writeApp(graph, generation);
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
      : await this.#writePatch(
          generation,
          compiled.filter((module) => !module.vendor),
        );
    await this.#writeState(graph, { ...manifest, generation, vendorFile, entries: entryIds });
    await this.#prune(vendorFile, generation);
    return {
      generation,
      reload: !!reason,
      reason,
      patchUrl,
      changedIds,
      moduleCount: Object.keys(graph.modules).length,
    };
  }

  async #writeEntries(context: BundleContext): Promise<{ files: Record<string, string>; changed: string[] }> {
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
        ownerId: this.#idOf(file),
        moduleIds: entryPages.map(({ moduleAbsPath }) => this.#idOf(moduleAbsPath)),
      });
      const source = `import * as akanWebkit from "akanjs/webkit";\n${pages}\nvoid akanWebkit.bootCsr(pages);\n${hot}`;
      if ((await Bun.file(file).exists()) && (await Bun.file(file).text()) === source) {
        files[basePath] = CsrDevBundler.#realpath(file);
        continue;
      }
      await Bun.write(file, source);
      files[basePath] = CsrDevBundler.#realpath(file);
      changed.push(files[basePath]);
    }
    return { files, changed };
  }

  // Resolution comes from a plain browser build: Bun's runtime resolver ignores the `browser` condition and picks
  // Node builds (`@firebase/util` resolves to its node-esm entry), which the registry build would then ship.
  async #prepass(session: CompileSession): Promise<void> {
    const result = await Bun.build({
      entrypoints: [...session.entryFiles, session.context.refreshFile],
      target: "browser",
      metafile: true,
      env: "AKAN_PUBLIC_*",
      define: session.context.define,
      optimizeImports: session.context.optimizeImports,
      plugins: [PagesBundleBuilder.createCssStubPlugin()],
    });
    const { inputs } = result.metafile as unknown as Metafile;
    for (const [input, { imports }] of Object.entries(inputs)) {
      const importer = CsrDevBundler.#realpath(path.resolve(input));
      for (const record of imports) {
        if (!record.original) continue;
        if (record.external) {
          if (record.original.startsWith("node:"))
            this.#remember(session, importer, record.original, `${CsrDevBundler.#stubPrefix}${record.original}`);
          continue;
        }
        const target = path.resolve(record.path);
        if (fs.existsSync(target)) this.#remember(session, importer, record.original, CsrDevBundler.#realpath(target));
      }
    }
    session.prepassDone = true;
  }

  async #compile(session: CompileSession, startFiles: string[], known: Set<string>): Promise<CompiledModule[]> {
    const compiled = new Map<string, CompiledModule>();
    const seen = new Set([...known, ...startFiles]);
    let frontier = [...new Set(startFiles)];
    while (frontier.length > 0) {
      const round = await this.#compileRound(session, frontier);
      if (round.misses.length > 0 && !session.prepassDone) {
        this.#app.verbose(`[csr-dev] ${round.misses.length} unresolved import(s); rerunning the resolution build`);
        await this.#prepass(session);
        continue;
      }
      const next: string[] = [];
      for (const module of round.modules) {
        compiled.set(module.file, module);
        for (const dep of module.deps) {
          if (dep.startsWith(CsrDevBundler.#stubPrefix) || seen.has(dep)) continue;
          seen.add(dep);
          next.push(dep);
        }
      }
      frontier = next;
    }
    if (session.fallbacks.size > 0)
      this.#app.verbose(
        `[csr-dev] ${session.fallbacks.size} import(s) outside the browser build's graph resolved with Bun's runtime resolver: ${[...session.fallbacks].slice(0, 5).join(", ")}${session.fallbacks.size > 5 ? ", ..." : ""}`,
      );
    return [...compiled.values()];
  }

  async #compileRound(
    session: CompileSession,
    files: string[],
  ): Promise<{ modules: CompiledModule[]; misses: string[] }> {
    const appFiles = files.filter((file) => !CsrDevBundler.#isVendorFile(file));
    const vendorFiles = files.filter((file) => CsrDevBundler.#isVendorFile(file));
    const rounds = await Promise.all([
      appFiles.length > 0 ? this.#bunBuild(session, appFiles, false) : null,
      vendorFiles.length > 0 ? this.#bunBuild(session, vendorFiles, true) : null,
    ]);
    const modules = rounds.flatMap((round) => round?.modules ?? []);
    const misses = rounds.flatMap((round) => round?.misses ?? []);
    // One entrypoint per build cannot inline another: Bun ignores an external for an absolute import of an entrypoint.
    for (const file of rounds.flatMap((round) => round?.tangled ?? [])) {
      const single = await this.#bunBuild(session, [file], CsrDevBundler.#isVendorFile(file));
      if (single.tangled.length > 0) throw new Error(`[csr-dev] ${this.#idOf(file)} kept inlining another module`);
      modules.push(...single.modules);
      misses.push(...single.misses);
    }
    return { modules, misses };
  }

  async #bunBuild(
    session: CompileSession,
    files: string[],
    vendor: boolean,
  ): Promise<{ modules: CompiledModule[]; misses: string[]; tangled: string[] }> {
    const mtimes = new Map(files.map((file) => [file, CsrDevBundler.#mtimeOf(file)]));
    const hashes = new Map(
      await Promise.all(files.map(async (file) => [file, vendor ? "" : await CsrDevBundler.#hashOf(file)] as const)),
    );
    const misses: string[] = [];
    const plugin: BunPlugin = {
      name: "akan-csr-registry",
      setup: (build) => {
        build.onLoad({ filter: /\.css$/ }, () => ({ contents: "", loader: "js" }));
        if (!vendor)
          build.onLoad({ filter: /\.tsx$/ }, async (args) => {
            if (CsrDevBundler.#isVendorFile(args.path)) return undefined;
            const normalized = RouteClientBuilder.normalizeNamedDefaultFunctionForFastRefresh(
              await Bun.file(args.path).text(),
            );
            return normalized ? { contents: normalized, loader: "tsx" } : undefined;
          });
        build.onResolve({ filter: /.*/ }, (args) => {
          if (args.kind === "entry-point-build" || !args.importer) return undefined;
          const importer = CsrDevBundler.#realpath(args.importer);
          const target = this.#resolve(session, importer, args.path);
          if (target === CsrDevBundler.#inline) return undefined;
          if (target === null) {
            misses.push(`${args.path} from ${this.#idOf(importer)}`);
            return { path: `akan-miss:${args.path}`, external: true };
          }
          const external = target.startsWith(CsrDevBundler.#stubPrefix)
            ? target
            : `${CsrDevBundler.#modulePrefix}${this.#idOf(target)}`;
          return { path: external, external: true };
        });
      },
    };
    const result = await Bun.build({
      entrypoints: files,
      root: this.#root,
      target: "browser",
      format: "cjs",
      reactFastRefresh: !vendor,
      naming: { entry: "[dir]/[name].[ext]", asset: "assets/[name]-[hash].[ext]" },
      publicPath: CSR_DEV_ROUTE_PREFIX,
      metafile: true,
      env: "AKAN_PUBLIC_*",
      define: session.context.define,
      optimizeImports: session.context.optimizeImports,
      plugins: [plugin],
    });
    const { outputs } = result.metafile as unknown as Metafile;
    const modules: CompiledModule[] = [];
    const tangled: string[] = [];
    for (const artifact of result.outputs) {
      if (artifact.kind === "asset") {
        await Bun.write(path.join(this.#outDir, artifact.path), artifact);
        continue;
      }
      if (artifact.kind !== "entry-point") continue;
      const meta = outputs[artifact.path];
      if (!meta?.entryPoint) throw new Error(`[csr-dev] no entry point recorded for ${artifact.path}`);
      const file = CsrDevBundler.#realpath(path.resolve(meta.entryPoint));
      const inputs = Object.keys(meta.inputs).map((input) => CsrDevBundler.#realpath(path.resolve(input)));
      if (inputs.some((input) => input !== file && this.#isRegistryModule(session.context, input))) {
        tangled.push(file);
        continue;
      }
      const code = await artifact.text();
      const id = this.#idOf(file);
      modules.push({
        id,
        file,
        vendor,
        factory: CsrDevBundler.#factory(id, code),
        deps: this.#emittedDeps(code),
        mtimeMs: mtimes.get(file) ?? CsrDevBundler.#mtimeOf(file),
        hash: hashes.get(file) ?? "",
      });
    }
    return { modules, misses, tangled };
  }

  // Read off the emitted code rather than onResolve: Bun resolves both arms of `NODE_ENV ? require(a) : require(b)`
  // before dropping the dead one, and following it would pull every package's production build in too.
  #emittedDeps(code: string): string[] {
    const deps = new Set<string>();
    const references = /\b(?:require|import|__akanImport)\("((?:akan-module|stub):[^"]+)"\)/g;
    for (const [, reference] of code.matchAll(references)) {
      if (!reference) continue;
      deps.add(
        reference.startsWith(CsrDevBundler.#stubPrefix)
          ? reference
          : this.#fileOf(reference.slice(CsrDevBundler.#modulePrefix.length)),
      );
    }
    return [...deps];
  }

  #resolve(session: CompileSession, importer: string, specifier: string): string | null {
    if (this.#isInlineSpecifier(session.context, specifier)) return CsrDevBundler.#inline;
    const known = session.resolution.get(importer)?.get(specifier);
    const usable = known && (known.startsWith(CsrDevBundler.#stubPrefix) || fs.existsSync(known)) ? known : null;
    const target = usable ?? this.#resolveUnknown(session, importer, specifier);
    if (target === null || target.startsWith(CsrDevBundler.#stubPrefix)) return target;
    if (!CsrDevBundler.#isScript(target)) return CsrDevBundler.#inline;
    if (!usable) this.#remember(session, importer, specifier, target);
    return target;
  }

  #resolveUnknown(session: CompileSession, importer: string, specifier: string): string | null {
    if (specifier.startsWith("node:")) return `${CsrDevBundler.#stubPrefix}${specifier}`;
    const relative = specifier.startsWith(".") || path.isAbsolute(specifier);
    if (!relative && !session.prepassDone) return null;
    if (!relative) {
      const sibling = this.#resolvedBySibling(session, importer, specifier);
      if (sibling) return sibling;
    }
    const resolved = CsrDevBundler.#tryResolve(specifier, path.dirname(importer));
    if (!resolved) throw new Error(`[csr-dev] cannot resolve "${specifier}" from ${this.#idOf(importer)}`);
    if (!path.isAbsolute(resolved)) return `${CsrDevBundler.#stubPrefix}${specifier}`;
    if (!relative) session.fallbacks.add(specifier);
    return CsrDevBundler.#realpath(resolved);
  }

  //? The browser build tree-shakes the unused re-exports of a side-effect-free barrel, so their imports have no
  //? recorded resolution; a file of the same package resolves a bare specifier to the same target, conditions included.
  #resolvedBySibling(session: CompileSession, importer: string, specifier: string): string | null {
    const scope = CsrDevBundler.#packageScopeOf(importer);
    for (const [other, bySpecifier] of session.resolution) {
      const target = bySpecifier.get(specifier);
      if (target && CsrDevBundler.#packageScopeOf(other) === scope) return target;
    }
    return null;
  }

  static #packageScopeOf(file: string): string {
    const marker = `${path.sep}node_modules${path.sep}`;
    const index = file.lastIndexOf(marker);
    if (index < 0) return "";
    const [scope, name] = file.slice(index + marker.length).split(path.sep);
    return file.slice(0, index + marker.length) + (scope?.startsWith("@") ? `${scope}${path.sep}${name}` : scope);
  }

  #remember(session: CompileSession, importer: string, specifier: string, target: string): void {
    const byImporter = session.resolution.get(importer) ?? new Map<string, string>();
    session.resolution.set(importer, byImporter.set(specifier, target));
  }

  //? Only the barrel a bare import names is inlined, so its icons tree-shake per importer; what the barrel itself
  //? imports stays a registry module, keeping shared state such as react-icons' IconContext a single instance.
  #isInlineSpecifier(context: BundleContext, specifier: string): boolean {
    if (specifier.startsWith(".") || path.isAbsolute(specifier) || specifier.startsWith("node:")) return false;
    return context.optimizeImports.some((pattern) => {
      const base = pattern.endsWith("/*") ? pattern.slice(0, -2) : pattern;
      return specifier === base || specifier.startsWith(`${base}/`);
    });
  }

  #isRegistryModule(context: BundleContext, file: string): boolean {
    if (!CsrDevBundler.#isScript(file)) return false;
    const marker = `${path.sep}node_modules${path.sep}`;
    const index = file.lastIndexOf(marker);
    if (index < 0) return true;
    const [scope, name] = file.slice(index + marker.length).split(path.sep);
    const packageName = scope?.startsWith("@") ? `${scope}/${name}` : scope;
    if (!packageName) return true;
    return !context.optimizeImports.some((pattern) => {
      const base = pattern.endsWith("/*") ? pattern.slice(0, -2) : pattern;
      return base === packageName || base.startsWith(`${packageName}/`);
    });
  }

  #merge(graph: CsrDevGraph, session: CompileSession, compiled: CompiledModule[]): void {
    for (const module of compiled)
      graph.modules[module.id] = {
        vendor: module.vendor,
        mtimeMs: module.mtimeMs,
        hash: module.hash,
        deps: module.deps.map((dep) => (dep.startsWith(CsrDevBundler.#stubPrefix) ? dep : this.#idOf(dep))),
      };
    graph.pending = [];
    graph.resolution = Object.fromEntries(
      [...session.resolution].map(([importer, bySpecifier]) => [
        this.#idOf(importer),
        Object.fromEntries(
          [...bySpecifier].map(([specifier, target]) => [
            specifier,
            target.startsWith(CsrDevBundler.#stubPrefix) ? target : this.#idOf(target),
          ]),
        ),
      ]),
    );
  }

  #resolutionOf(graph: CsrDevGraph): Map<string, Map<string, string>> {
    return new Map(
      Object.entries(graph.resolution).map(([importer, bySpecifier]) => [
        this.#fileOf(importer),
        new Map(
          Object.entries(bySpecifier).map(([specifier, target]) => [
            specifier,
            target.startsWith(CsrDevBundler.#stubPrefix) ? target : this.#fileOf(target),
          ]),
        ),
      ]),
    );
  }

  #entryIds(files: Record<string, string>): Record<string, string> {
    return Object.fromEntries(Object.entries(files).map(([basePath, file]) => [basePath, this.#idOf(file)]));
  }

  async #writeModules(compiled: CompiledModule[]): Promise<void> {
    await mkdir(path.join(this.#outDir, "modules"), { recursive: true });
    await Promise.all(compiled.map((module) => Bun.write(this.#modulePath(module.id), module.factory)));
  }

  async #defineLines(ids: string[]): Promise<string[]> {
    return await Promise.all(
      ids.map(async (id) => `__akan.define(${JSON.stringify(id)}, ${await Bun.file(this.#modulePath(id)).text()});\n`),
    );
  }

  async #writeVendor(graph: CsrDevGraph): Promise<string> {
    const ids = Object.keys(graph.modules)
      .filter((id) => graph.modules[id]?.vendor)
      .sort();
    const stubs = new Set(
      Object.values(graph.modules).flatMap((module) =>
        module.deps.filter((dep) => dep.startsWith(CsrDevBundler.#stubPrefix)),
      ),
    );
    const lines = await this.#defineLines(ids);
    for (const stub of [...stubs].sort()) {
      const message = `[akan-csr] ${stub.slice(CsrDevBundler.#stubPrefix.length)} is a Node built-in the browser does not have`;
      lines.push(
        `__akan.define(${JSON.stringify(stub)}, function () {\n  throw new Error(${JSON.stringify(message)});\n});\n`,
      );
    }
    const code = lines.join("");
    const vendorFile = `vendor-${Bun.hash(code).toString(36)}.js`;
    await this.#writeAtomic(vendorFile, code);
    return vendorFile;
  }

  async #writeApp(graph: CsrDevGraph, generation: number): Promise<void> {
    const ids = Object.keys(graph.modules)
      .filter((id) => !graph.modules[id]?.vendor)
      .sort();
    const lines = await this.#defineLines(ids);
    lines.push(`__akan.start(${JSON.stringify({ generation, refresh: graph.refresh })});\n`);
    await this.#writeAtomic(CSR_DEV_APP_FILE, lines.join(""));
  }

  async #writePatch(generation: number, modules: CompiledModule[]): Promise<string> {
    const factories = modules.map((module) => `${JSON.stringify(module.id)}: ${module.factory}`).join(",\n");
    const patchFile = `patch-${generation}.js`;
    await this.#writeAtomic(patchFile, `__akan.update(${generation}, {\n${factories}\n});\n`);
    return `${CSR_DEV_ROUTE_PREFIX}${patchFile}`;
  }

  // The manifest goes last: the server renders shells from it, so it must never name a file not yet written.
  async #writeState(graph: CsrDevGraph, manifest: CsrDevManifest): Promise<void> {
    await this.#writeJson("graph.json", graph);
    await this.#writeJson(CSR_DEV_MANIFEST_FILE, manifest);
  }

  async #prune(vendorFile: string, generation: number): Promise<void> {
    const names = await readdir(this.#outDir);
    const stale = names.filter((name) => {
      const patch = /^patch-(\d+)\.js$/.exec(name);
      return patch ? Number(patch[1]) <= generation - CsrDevBundler.#keptPatches : false;
    });
    const vendors = names
      .filter((name) => /^vendor-[\w-]+\.js$/.test(name) && name !== vendorFile)
      .map((name) => ({ name, mtimeMs: CsrDevBundler.#mtimeOf(path.join(this.#outDir, name)) }))
      .sort((a, b) => b.mtimeMs - a.mtimeMs)
      .slice(CsrDevBundler.#keptVendors - 1)
      .map(({ name }) => name);
    await Promise.all([...stale, ...vendors].map((name) => rm(path.join(this.#outDir, name), { force: true })));
  }

  async #readJson<T>(name: string): Promise<T | null> {
    const file = Bun.file(path.join(this.#outDir, name));
    if (!(await file.exists())) return null;
    return (await file.json().catch(() => null)) as T | null;
  }

  async #writeJson(name: string, value: unknown): Promise<void> {
    await this.#writeAtomic(name, JSON.stringify(value));
  }

  // A rename is atomic: the dev server may be streaming the previous app.js to a reloading page right now.
  async #writeAtomic(name: string, content: string): Promise<void> {
    const target = path.join(this.#outDir, name);
    const temp = `${target}.${process.pid}.tmp`;
    await Bun.write(temp, content);
    await rename(temp, target);
  }

  #modulePath(id: string): string {
    return path.join(this.#outDir, "modules", `${Bun.hash(id).toString(36)}.js`);
  }

  #idOf(file: string): string {
    const real = CsrDevBundler.#realpath(file);
    const relative = path.relative(this.#root, real);
    const id = relative.startsWith("..") || path.isAbsolute(relative) ? real : relative;
    return id.split(path.sep).join("/");
  }

  #fileOf(id: string): string {
    return path.isAbsolute(id) ? id : path.join(this.#root, id);
  }

  static #factory(id: string, code: string): string {
    const prefix = CsrDevBundler.#modulePrefix;
    let patched = code.replaceAll(`import("${prefix}`, `__akanImport("${prefix}`);
    for (const [name, params, method] of CsrDevBundler.#helperPatches) {
      const definition = `var ${name} = ${params} => {`;
      if (patched.includes(definition))
        patched = patched.replace(definition, `var ${name} = __akan.${method};\nvar __bun${name} = ${params} => {`);
      else if (patched.includes(`${name}(`))
        throw new Error(
          `[csr-dev] ${id}: Bun's ${name} helper no longer reads "${definition}"; CsrDevBundler must follow`,
        );
    }
    // StoreRegistry.build merges into one global store instance, so every importer already holds the updated `st`:
    // re-running the store root is the whole update, and bubbling past it would only reach the page modules.
    if (CsrDevBundler.#storeRoot.test(id)) patched += "\nmodule.hot.accept();";
    return `function (require, module, exports, $RefreshReg$, $RefreshSig$, __akanImport) {\n${patched}\n}`;
  }

  static #isVendorFile(file: string): boolean {
    return file.includes(`${path.sep}node_modules${path.sep}`);
  }

  static #isScript(file: string): boolean {
    return /\.[cm]?[jt]sx?$/.test(file);
  }

  static #mtimeOf(file: string): number {
    return fs.statSync(file, { throwIfNoEntry: false })?.mtimeMs ?? -1;
  }

  static async #hashOf(file: string): Promise<string> {
    const source = Bun.file(file);
    return (await source.exists()) ? Bun.hash(await source.arrayBuffer()).toString(36) : "";
  }

  static #realpath(file: string): string {
    // A deleted file keeps its own path, so its id still matches the graph entry it leaves behind.
    return fs.existsSync(file) ? fs.realpathSync(file) : path.resolve(file);
  }

  static #tryResolve(specifier: string, from: string): string | null {
    try {
      return Bun.resolveSync(specifier, from);
    } catch {
      // Unresolvable is an answer here; the caller decides whether it is an error.
      return null;
    }
  }
}
