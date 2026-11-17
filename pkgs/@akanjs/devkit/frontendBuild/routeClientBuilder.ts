import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import type { BaseBuildArtifact, ClientManifest, ClientManifestEntry, SsrManifest } from "akanjs/server";
import { SSR_DEV_CHUNK, SSR_DEV_ID_PREFIX } from "akanjs/server/hmr/csrDevManifest";
import { type ClientRuntimeScope, StoreBootstrap } from "../artifact/storeBootstrap";
import type { App } from "../commandDecorators";
import { RouteRuntimeReport } from "../quality/routeRuntimeReport";
import { createBarrelImportsPlugin } from "../transforms/barrelImportsPlugin";
import { loaderFor } from "../transforms/moduleSyntax";
import { ReactIconImports } from "../transforms/reactIconImports";
import { RouteRuntime } from "../transforms/routeRuntime";
import type { RouteRuntimeBundle } from "../transforms/routeRuntimeGraph";
import { scanUseClientExports, toClientReferencePath } from "../transforms/rscUseClientTransform";
import { SignalDescriptors } from "../transforms/signalDescriptors";
import type { ClientBundleTarget, ClientEntryDiscovery, ClientModuleImport } from "./clientBuildTypes";
import { ClientEntriesBundler } from "./clientEntriesBundler";
import { GraphClientEntryDiscovery } from "./clientEntryDiscovery";
import { CsrDevPaths } from "./csrDevPaths";
import { RouteRuntimeCheck } from "./routeRuntimeCheck";
import { type RoutePaysVerdict, RouteRuntimePays } from "./routeRuntimePays";
import { VendorFileImports } from "./vendorFileImports";

const SSR_CLIENT_ALIAS_EXTERNALS = [
  "react",
  "react-dom",
  "react-dom/client",
  "react/jsx-runtime",
  "react/jsx-dev-runtime",
] as const;
const SSR_CLIENT_EXTERNALS = [...SSR_CLIENT_ALIAS_EXTERNALS, "akanjs/fetch"] as const;

export interface BuildRouteClientOptions {
  app: App;
  seeds: string[];
  /** Every route's seeds: a build that runs at all bundles the whole app, since two builds each copy shared modules. */
  graphSeeds?: string[];
  artifact?: BaseBuildArtifact;
  knownEntries?: Set<string>;
  routeId?: string;
  command?: "build" | "start";
  discovery?: ClientEntryDiscovery;
  /** Pre-resolved client entries: skips discovery and bundles exactly this list. */
  entries?: string[];
  /** Defaults to `registry` under `start`: the browser loads each entry from the SSR dev registry, so only `client-ssr` builds. */
  browser?: "chunks" | "registry";
  /** The entries each route loads: under `clientRuntime: "route"` an entry only whole-runtime routes hold keeps it too. */
  entriesByRoute?: ReadonlyMap<string, readonly string[]>;
  /** The entries each route loads first, which its size is measured over. Defaults to `entriesByRoute`. */
  sizedEntriesByRoute?: ReadonlyMap<string, readonly string[]>;
}

export interface BuildRouteClientResult {
  manifestDelta: ClientManifest;
  ssrManifestDelta: SsrManifest;
  newEntries: string[];
  discoveredEntries?: string[];
  clientDeps: string[];
  clientDepsByEntry?: Record<string, string[]>;
  /** Registry mode: the entries the manifest rows name, which the SSR dev registry must hold before they are served. */
  registryEntries?: string[];
  /** Chunks mode: the importmap specifiers each browser chunk imports statically. */
  externalsByChunkUrl?: Record<string, string[]>;
  /** The imports of every module the browser loads, or in registry mode of the SSR bundle standing in for it. */
  clientGraph?: ReadonlyMap<string, readonly ClientModuleImport[]>;
}

interface BootstrapEntries {
  buildEntries: string[];
  originalByBuildEntry: Map<string, string>;
}

interface NarrowedBuild {
  entries: BootstrapEntries;
  kept: ReadonlySet<string>;
  bundle: Awaited<ReturnType<ClientEntriesBundler["bundle"]>>;
  runtime: RouteRuntime;
}

type BundleOf = (runtime: RouteRuntime, kept: ReadonlySet<string>, outputSubdir?: string) => Promise<NarrowedBuild>;

const referenceSubdir = "client-whole";
//? Each trial bundles the whole app again, and the entries left to try shrink slowly where pages share most of them.
const measuredTrials = 6;

export class RouteClientBuilder {
  #app: App;
  #seeds: string[];
  #graphSeeds?: string[];
  #knownEntries: Set<string>;
  #command: "build" | "start";
  #discovery?: ClientEntryDiscovery;
  #entries?: string[];
  #browser: "chunks" | "registry";
  #entriesByRoute?: ReadonlyMap<string, readonly string[]>;
  #sizedEntriesByRoute?: ReadonlyMap<string, readonly string[]>;

  constructor(options: BuildRouteClientOptions) {
    this.#app = options.app;
    this.#seeds = options.seeds;
    this.#graphSeeds = options.graphSeeds;
    this.#knownEntries = options.knownEntries ?? new Set<string>();
    this.#command = options.command ?? "start";
    this.#discovery = options.discovery;
    this.#entries = options.entries;
    this.#browser = options.browser ?? (this.#command === "start" ? "registry" : "chunks");
    this.#entriesByRoute = options.entriesByRoute;
    this.#sizedEntriesByRoute = options.sizedEntriesByRoute;
  }

  async build(): Promise<BuildRouteClientResult> {
    const discovered = this.#entries ?? (await (await this.#getDiscovery()).discover(this.#seeds));
    if (discovered.every((e) => this.#knownEntries.has(e))) return this.#emptyResult(discovered);
    const entries = this.#graphSeeds
      ? [...new Set([...discovered, ...(await (await this.#getDiscovery()).discover(this.#graphSeeds))])].sort()
      : discovered.filter((e) => !this.#knownEntries.has(e));

    //? Registry mode builds no browser bundle: the SSR bundle has the same entries, exports and imports to read.
    const registry = this.#browser === "registry" ? new CsrDevPaths(this.#app.workspace.workspaceRoot) : null;
    const routeRuntime = registry ? null : await this.#readRouteRuntime();
    if (!registry && !routeRuntime) await rm(path.join(this.#app.cwdPath, RouteRuntimeReport.file), { force: true });
    const ssrEntries = await this.#createBootstrapEntries(entries, "whole");
    //? First: its entries all load the whole runtime, so its graph says which of them a per-route build may narrow.
    const ssrBundle = await this.#buildSsrBundle(ssrEntries);
    const narrowed = routeRuntime
      ? await this.#buildNarrowed(entries, ssrEntries, routeRuntime, {
          importsByModule: ssrBundle.graph.importsByModule,
          entries: entries.map((entry) => path.resolve(entry)),
          entriesByRoute: this.#entriesByRoute,
        })
      : null;
    const browserEntries = registry ? null : (narrowed?.entries ?? ssrEntries);
    const browserBundle =
      narrowed?.bundle ?? (browserEntries ? await this.#buildBrowserBundle(browserEntries, routeRuntime) : null);
    if (narrowed) this.#check(narrowed);
    const referenceBundle = browserBundle ?? ssrBundle;
    const bootstrapEntries = browserEntries ?? ssrEntries;
    const ssrEntryByOriginal = new Map(
      [...ssrEntries.originalByBuildEntry].map(([buildEntry, originalEntry]) => [originalEntry, buildEntry]),
    );

    const acceptedEntries = new Set(entries);
    const routeEntries = new Set(discovered);
    const manifestDelta: ClientManifest = {};
    const ssrModuleMap: SsrManifest["moduleMap"] = {};
    const clientDeps = new Set<string>();
    const clientDepsByEntry: Record<string, string[]> = {};
    for (const [key, bundleRow] of Object.entries(referenceBundle.manifest)) {
      const manifestEntry = RouteClientBuilder.resolveOriginalManifestEntry(
        key,
        bootstrapEntries.originalByBuildEntry,
        referenceBundle.clientReferenceIdByAbsPath,
        this.#app.workspace.workspaceRoot,
      );
      if (!manifestEntry) continue;
      if (!acceptedEntries.has(manifestEntry.originalEntry)) continue;
      const row = registry
        ? RouteClientBuilder.#registryRow(registry, manifestEntry.originalEntry, bundleRow)
        : bundleRow;
      manifestDelta[manifestEntry.key] = row;

      const ssrOutput = ssrBundle.entryOutputAbsByAbsPath.get(
        ssrEntryByOriginal.get(manifestEntry.originalEntry) ?? manifestEntry.buildEntry,
      );
      if (!ssrOutput) continue;

      ssrModuleMap[row.id] ??= {};
      ssrModuleMap[row.id][row.name] = { id: ssrOutput, chunks: [ssrOutput, ssrOutput], name: row.name, async: true };
    }
    for (const entry of bootstrapEntries.buildEntries) {
      const buildEntry = path.resolve(entry);
      const originalEntry = path.resolve(bootstrapEntries.originalByBuildEntry.get(buildEntry) ?? buildEntry);
      if (!acceptedEntries.has(originalEntry)) continue;
      const deps = new Set<string>([originalEntry]);
      for (const dep of referenceBundle.entryDepsByAbsPath.get(buildEntry) ?? []) deps.add(path.resolve(dep));
      const sortedDeps = [...deps].sort();
      clientDepsByEntry[originalEntry] = sortedDeps;
      if (routeEntries.has(originalEntry)) for (const dep of sortedDeps) clientDeps.add(dep);
    }

    return {
      manifestDelta,
      ssrManifestDelta: { moduleLoading: null, moduleMap: ssrModuleMap },
      newEntries: entries.filter((e) => !this.#knownEntries.has(e)),
      discoveredEntries: discovered,
      clientDeps: [...clientDeps].sort(),
      clientDepsByEntry,
      ...(registry ? { registryEntries: [...acceptedEntries].sort() } : {}),
      ...(browserBundle ? { externalsByChunkUrl: Object.fromEntries(browserBundle.externalsByChunkUrl) } : {}),
      clientGraph: referenceBundle.graph.importsByModule,
    };
  }

  static #registryRow(paths: CsrDevPaths, entry: string, row: ClientManifestEntry): ClientManifestEntry {
    return {
      id: `${SSR_DEV_ID_PREFIX}${paths.idOf(entry)}`,
      chunks: [SSR_DEV_CHUNK, SSR_DEV_CHUNK],
      name: row.name,
      async: true,
    };
  }

  async #getDiscovery(): Promise<ClientEntryDiscovery> {
    this.#discovery ??= await GraphClientEntryDiscovery.create(this.#app);
    return this.#discovery;
  }

  #emptyResult(discoveredEntries: string[] = []): BuildRouteClientResult {
    return {
      manifestDelta: {},
      ssrManifestDelta: { moduleLoading: null, moduleMap: {} },
      newEntries: [],
      discoveredEntries,
      clientDeps: [],
      clientDepsByEntry: {},
    };
  }

  async #readRouteRuntime(): Promise<RouteRuntime | null> {
    if ((await this.#app.getConfig()).clientRuntime !== "route") return null;
    const { name } = this.#app;
    const whole = (why: string, first = "Run") => {
      this.#app.logger.warn(
        `[client-runtime] ${why}, so every page of this build loads the whole client runtime, not only what it uses. ${first} \`akan sync ${name}\` and build again.`,
      );
      return null;
    };
    const missing = `the per-module runtime files of ${name} or a lib it mounts are missing`;
    if ((await StoreBootstrap.scopeOf(this.#app)) !== "page") return whole(missing);
    try {
      return (await RouteRuntime.read(this.#app.workspace.workspaceRoot, `apps/${name}`)) ?? whole(missing);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      return whole(`the modules of ${name} or a lib it mounts could not be read (${reason})`, "Fix that, then run");
    }
  }

  async #buildNarrowed(
    entries: string[],
    whole: BootstrapEntries,
    runtime: RouteRuntime,
    planned: RouteRuntimeBundle,
  ): Promise<NarrowedBuild> {
    const bundleOf: BundleOf = async (routeRuntime, kept, outputSubdir) => {
      const started = Date.now();
      const browserEntries = await this.#createBootstrapEntries(entries, "page", { kept, whole });
      const bundle = await this.#buildBrowserBundle(browserEntries, routeRuntime, outputSubdir);
      this.#app.verbose(`[client-runtime] bundled ${outputSubdir ?? "client"} (${Date.now() - started}ms)`);
      return { entries: browserEntries, kept, bundle, runtime: routeRuntime };
    };
    const first = await bundleOf(runtime, runtime.plan(planned));
    const routes = this.#entriesByRoute;
    if (!routes || !runtime.decided) return first;
    const perModuleIn = ({ kept }: NarrowedBuild) =>
      [...routes].filter(([, held]) => !held.some((entry) => kept.has(entry))).map(([route]) => route);
    const analysed = perModuleIn(first);
    const { built, refused } =
      analysed.length > 0
        ? await this.#keptWhereNotSmaller(first, routes, planned, bundleOf)
        : { built: first, refused: [] };
    const perModule = perModuleIn(built);
    const report = {
      app: this.#app.name,
      routes: routes.size,
      perModule,
      notSmaller: analysed.filter((route) => !perModule.includes(route)),
      refused,
      causes: built.runtime.decided?.causes() ?? [],
    };
    await RouteRuntimeReport.write(this.#app.cwdPath, report);
    this.#app.log(`[client-runtime] ${RouteRuntimeReport.summary(report)}`);
    for (const route of report.notSmaller) this.#app.verbose(`[client-runtime] not smaller per module: ${route}`);
    for (const route of refused) this.#app.verbose(`[client-runtime] larger with the whole runtime here: ${route}`);
    for (const route of perModule) this.#app.verbose(`[client-runtime] per module: ${route}`);
    return built;
  }

  //? A pass either keeps entries or refuses some for good, and neither set ever loses one, so the passes end.
  async #keptWhereNotSmaller(
    first: NarrowedBuild,
    routes: ReadonlyMap<string, readonly string[]>,
    planned: RouteRuntimeBundle,
    bundleOf: BundleOf,
  ): Promise<{ built: NarrowedBuild; refused: string[] }> {
    const pays = new RouteRuntimePays();
    const sizesOf = (build: NarrowedBuild) => pays.sizesOf(build.bundle, this.#sizedBuildEntries(build.entries));
    //? A keep is never taken back, so a build that did not pay is replaced from a runtime read again.
    const bundleWith = async (verdicts: readonly RoutePaysVerdict[], last: NarrowedBuild | null, subdir?: string) => {
      const runtime = await this.#readRouteRuntime();
      if (!runtime) return null;
      let kept = runtime.plan(planned);
      for (const { entry, ...measured } of verdicts) kept = runtime.keep([entry], { rule: "not-smaller", ...measured });
      const build = await bundleOf(runtime, subdir ? runtime.keepAll() : kept, subdir);
      for (const chunk of last?.bundle.graph.importsByChunk.keys() ?? [])
        if (!build.bundle.graph.importsByChunk.has(chunk)) await rm(chunk, { force: true });
      return build;
    };
    const reference = await bundleWith([], null, referenceSubdir);
    if (!reference) return { built: first, refused: [] };
    const wholeSizes = await sizesOf(reference);
    await rm(path.join(this.#artifactDir, referenceSubdir), { recursive: true, force: true });
    let current = { build: first, sizes: await sizesOf(first), verdicts: [] as RoutePaysVerdict[] };
    let onDisk = first;
    const refused = new Set<string>();
    const refusedRoutes = new Set<string>();
    for (let trial = 0; trial < measuredTrials; trial++) {
      const verdicts = RouteRuntimePays.decide({
        entriesByRoute: routes,
        isKept: (entry) => current.build.kept.has(entry),
        isRefused: (entry) => refused.has(entry),
        whole: wholeSizes,
        measured: current.sizes,
      });
      if (verdicts.length === 0) break;
      const tried = await bundleWith([...current.verdicts, ...verdicts], onDisk);
      if (!tried) break;
      onDisk = tried;
      const sizes = await sizesOf(tried);
      const larger = RouteRuntimePays.larger({
        entriesByRoute: routes,
        wasKept: (entry) => current.build.kept.has(entry),
        isKept: (entry) => tried.kept.has(entry),
        before: current.sizes,
        after: sizes,
      });
      if (larger.length === 0) {
        current = { build: tried, sizes, verdicts: [...current.verdicts, ...verdicts] };
        continue;
      }
      for (const route of larger) {
        refusedRoutes.add(route);
        for (const entry of routes.get(route) ?? []) refused.add(entry);
      }
      if (!verdicts.some(({ entry }) => refused.has(entry))) for (const { entry } of verdicts) refused.add(entry);
    }
    const built = onDisk === current.build ? onDisk : ((await bundleWith(current.verdicts, onDisk)) ?? onDisk);
    return { built, refused: [...refusedRoutes] };
  }

  get #artifactDir() {
    return path.join(this.#command === "build" ? this.#app.dist.cwdPath : this.#app.cwdPath, ".akan/artifact");
  }

  #sizedBuildEntries({ originalByBuildEntry }: BootstrapEntries): Map<string, string[]> {
    const buildEntryOf = new Map([...originalByBuildEntry].map(([buildEntry, original]) => [original, buildEntry]));
    return new Map(
      [...(this.#sizedEntriesByRoute ?? this.#entriesByRoute ?? [])].map(([route, held]) => [
        route,
        held.map((entry) => buildEntryOf.get(path.resolve(entry)) ?? path.resolve(entry)),
      ]),
    );
  }

  #check({ entries, kept, bundle, runtime: routeRuntime }: NarrowedBuild) {
    const { workspaceRoot } = this.#app.workspace;
    const buildEntryOf = new Map(
      [...entries.originalByBuildEntry].map(([buildEntry, original]) => [original, buildEntry]),
    );
    const check = new RouteRuntimeCheck(workspaceRoot, bundle.graph, {
      entries: new Map([...entries.originalByBuildEntry].filter(([, entry]) => !kept.has(entry))),
      wholeReaders: routeRuntime.wholeReaders,
      wholeConstantReaders: routeRuntime.wholeConstantReaders,
      routes: new Map(
        [...(this.#entriesByRoute ?? [])].map(([route, held]) => [
          route,
          held.map((entry) => buildEntryOf.get(path.resolve(entry)) ?? path.resolve(entry)),
        ]),
      ),
    });
    check.assert();
    const { repeated } = check;
    if (repeated.length === 0) return;
    const more = repeated.length - RouteRuntimeCheck.shown;
    this.#app.logger.warn(
      [
        `[client-runtime] a page keeping the whole runtime loads a piece of what that runtime already holds:`,
        ...repeated.slice(0, RouteRuntimeCheck.shown).map((line) => `  - ${line}`),
        ...(more > 0 ? [`  - and ${more} more`] : []),
      ].join("\n"),
    );
  }

  async #buildBrowserBundle(
    bootstrapEntries: BootstrapEntries,
    routeRuntime: RouteRuntime | null,
    outputSubdir?: string,
  ) {
    const reactFastRefresh = process.env.AKAN_REACT_FAST_REFRESH !== "0";
    const icons = ReactIconImports.forApp(this.#app);
    const vendorFiles = await VendorFileImports.of(this.#app.workspace.workspaceRoot);
    return new ClientEntriesBundler({
      app: this.#app,
      entries: bootstrapEntries.buildEntries,
      plugins: [
        icons.plugin,
        ...(routeRuntime ? [this.#signalDescriptors(routeRuntime)] : []),
        vendorFiles.plugin(),
        await createBarrelImportsPlugin(this.#app, {
          pipeAfter: icons.pipe(
            reactFastRefresh ? RouteClientBuilder.normalizeNamedDefaultFunctionForFastRefresh : undefined,
          ),
          external: vendorFiles.specifiers,
          routeRuntime,
        }),
      ],
      external: vendorFiles.specifiers,
      command: this.#command,
      reactFastRefresh,
      ...(outputSubdir ? { outputSubdir } : {}),
    }).bundle();
  }

  #signalDescriptors(routeRuntime: RouteRuntime) {
    const scopes = routeRuntime.table.layers.map(({ scope }) => scope);
    return new SignalDescriptors(this.#app.workspace.workspaceRoot, scopes, {
      onUnread: (reason) => this.#app.logger.warn(`[client-runtime] ${reason}, so their pieces run the macro`),
      takenFromPieces: (absPath) => routeRuntime.takenFromPieces(absPath),
    }).plugin;
  }

  async #buildSsrBundle(bootstrapEntries: BootstrapEntries) {
    return new ClientEntriesBundler({
      app: this.#app,
      entries: bootstrapEntries.buildEntries,
      plugins: [await createBarrelImportsPlugin(this.#app)],
      ...RouteClientBuilder.resolveSsrClientBundleOptions(this.#command),
      outputSubdir: "client-ssr",
      command: this.#command,
    }).bundle();
  }

  //? `narrowed.kept`: an entry keeping the whole runtime is the same file a build of `clientRuntime: "all"` bundles.
  async #createBootstrapEntries(
    entries: string[],
    scope: ClientRuntimeScope,
    narrowed?: { kept: ReadonlySet<string>; whole: BootstrapEntries },
  ): Promise<BootstrapEntries> {
    if (!(await Bun.file(path.join(this.#app.cwdPath, "lib", "st.ts")).exists())) {
      return { buildEntries: entries, originalByBuildEntry: new Map() };
    }
    const wholeByOriginal = new Map(
      [...(narrowed?.whole.originalByBuildEntry ?? [])].map(([buildEntry, original]) => [original, buildEntry]),
    );

    const dirName = scope === "page" ? "client-entry-bootstrap-route" : "client-entry-bootstrap";
    const outdir = path.join(this.#app.cwdPath, ".akan", "generated", dirName);
    await mkdir(outdir, { recursive: true });

    const originalByBuildEntry = new Map<string, string>();
    const buildEntries = await Promise.all(
      entries.map(async (entry) => {
        const absEntry = path.resolve(entry);
        const whole = narrowed?.kept.has(absEntry) ? wholeByOriginal.get(absEntry) : undefined;
        if (whole) {
          originalByBuildEntry.set(whole, absEntry);
          return whole;
        }
        const hash = Bun.hash(`${this.#app.name}\n${absEntry}`).toString(36);
        const base = path.basename(absEntry).replace(/[^A-Za-z0-9._-]/g, "_");
        const wrapperEntry = path.join(outdir, `${base}-${hash}.tsx`);
        const exportNames = await this.#scanExportNames(absEntry);
        await Bun.write(
          wrapperEntry,
          RouteClientBuilder.createStoreBootstrapEntrySource({
            appName: this.#app.name,
            originalEntry: absEntry,
            exportNames,
            scope,
          }),
        );
        originalByBuildEntry.set(path.resolve(wrapperEntry), absEntry);
        return wrapperEntry;
      }),
    );

    return { buildEntries, originalByBuildEntry };
  }

  async #scanExportNames(absEntry: string): Promise<string[]> {
    return scanUseClientExports(await Bun.file(absEntry).text(), absEntry, this.#app.workspace.workspaceRoot);
  }

  static normalizeNamedDefaultFunctionForFastRefresh(
    source: string,
    { path: filePath }: { path?: string } = {},
  ): string | null {
    const declared = RouteClientBuilder.#declaredNamedDefaultFunctions(source, filePath);
    if (declared.length === 0) return null;
    let next = "";
    let cursor = 0;
    for (const { index, text, lineStart, indent, asyncKeyword, name } of declared) {
      next += `${source.slice(cursor, index)}${lineStart}${indent}${asyncKeyword}function ${name}`;
      cursor = index + text.length;
    }
    next += source.slice(cursor);
    return `${next}\n${declared.map(({ name }) => `export default ${name};`).join("\n")}\n`;
  }

  //? The pattern also matches inside strings and comments (a docs page quoting code), so every candidate is renamed to
  //? a probe export and only the ones the parser reports as exports are declarations.
  static #declaredNamedDefaultFunctions(source: string, filePath?: string) {
    const candidates = [
      ...source.matchAll(/(^|\n)([^\S\n]*)export\s+default\s+(async\s+)?function\s+([A-Za-z_$][\w$]*)(?=\s*(?:<|\())/g),
    ].map((match) => ({
      index: match.index,
      text: match[0],
      lineStart: match[1] ?? "",
      indent: match[2] ?? "",
      asyncKeyword: match[3] ?? "",
      name: match[4] ?? "",
    }));
    if (candidates.length === 0) return [];
    const probeName = (idx: number) => `__akanNamedDefault${idx}`;
    let probe = "";
    let cursor = 0;
    candidates.forEach(({ index, text, lineStart, indent, asyncKeyword }, idx) => {
      probe += `${source.slice(cursor, index)}${lineStart}${indent}export ${asyncKeyword}function ${probeName(idx)}`;
      cursor = index + text.length;
    });
    probe += source.slice(cursor);
    const exported = RouteClientBuilder.#scanExports(probe, filePath);
    return candidates.filter((_, idx) => exported.has(probeName(idx)));
  }

  static #scanExports(source: string, filePath?: string): Set<string> {
    try {
      return new Set(new Bun.Transpiler({ loader: filePath ? loaderFor(filePath) : "tsx" }).scan(source).exports);
    } catch {
      // Unparseable source is left alone, so the bundler reports its syntax error at the real line.
      return new Set();
    }
  }

  static resolveSsrClientRuntimeAliases(): Record<string, string> {
    const serverEntry = RouteClientBuilder.resolveAkanServerEntry();
    return { [Bun.resolveSync("akanjs/fetch", serverEntry)]: "akanjs/fetch" };
  }

  // `target: "bun"` is load-bearing: a `browser` export condition can touch `document` at module scope mid-SSR, and
  // Bun's `conditions` only add to the target's defaults, so the target itself must say server.
  static resolveSsrClientBundleOptions(command: "build" | "start"): {
    target: ClientBundleTarget;
    external: readonly string[];
    externalSubpaths?: readonly string[];
    externalAliases?: Record<string, string>;
  } {
    if (command === "start") {
      return {
        target: "bun",
        external: SSR_CLIENT_EXTERNALS,
        externalSubpaths: ["akanjs/fetch"],
        externalAliases: RouteClientBuilder.resolveSsrClientRuntimeAliases(),
      };
    }

    return { target: "bun", external: SSR_CLIENT_ALIAS_EXTERNALS };
  }

  static resolveAkanServerEntry(): string {
    try {
      return Bun.resolveSync("akanjs/server", import.meta.dir);
    } catch {
      return path.resolve(import.meta.dir, "../../../server/index.ts");
    }
  }

  static createStoreBootstrapEntrySource(args: {
    appName: string;
    originalEntry: string;
    exportNames: string[];
    scope?: ClientRuntimeScope;
  }): string {
    const originalEntry = JSON.stringify(path.resolve(args.originalEntry));
    const namedExports = args.exportNames.filter((name) => name !== "default");
    const lines = [
      ...StoreBootstrap.importLines(args.appName, args.scope),
      ...(namedExports.length > 0 ? [`export { ${namedExports.join(", ")} } from ${originalEntry};`] : []),
    ];
    if (args.exportNames.includes("default")) lines.push(`export { default } from ${originalEntry};`);
    return `${lines.join("\n")}\n`;
  }

  static resolveOriginalManifestEntry(
    manifestKey: string,
    originalByBuildEntry: Map<string, string>,
    clientReferenceIdByBuildEntry: Map<string, string> = new Map(),
    workspaceRoot = process.cwd(),
  ): { buildEntry: string; originalEntry: string; name: string; key: string } | null {
    const hashIdx = manifestKey.lastIndexOf("#");
    if (hashIdx < 0) return null;
    const buildReferenceId = manifestKey.slice(0, hashIdx);
    const name = manifestKey.slice(hashIdx + 1);
    const buildEntry =
      [...clientReferenceIdByBuildEntry.entries()].find(([, referenceId]) => referenceId === buildReferenceId)?.[0] ??
      buildReferenceId;
    const originalEntry = originalByBuildEntry.get(buildEntry) ?? buildEntry;
    const originalReferenceId = toClientReferencePath(originalEntry, workspaceRoot);
    return { buildEntry, originalEntry, name, key: `${originalReferenceId}#${name}` };
  }
}
