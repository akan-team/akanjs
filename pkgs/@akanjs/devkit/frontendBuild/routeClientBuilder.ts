import { mkdir } from "node:fs/promises";
import path from "node:path";
import type { BaseBuildArtifact, ClientManifest, ClientManifestEntry, SsrManifest } from "akanjs/server";
import { SSR_DEV_CHUNK, SSR_DEV_ID_PREFIX } from "akanjs/server/hmr/csrDevManifest";
import type { App } from "../commandDecorators";
import { createBarrelImportsPlugin } from "../transforms/barrelImportsPlugin";
import { loaderFor } from "../transforms/moduleSyntax";
import { scanUseClientExports, toClientReferencePath } from "../transforms/rscUseClientTransform";
import type { ClientBundleTarget, ClientEntryDiscovery } from "./clientBuildTypes";
import { ClientEntriesBundler } from "./clientEntriesBundler";
import { GraphClientEntryDiscovery } from "./clientEntryDiscovery";
import { CsrDevPaths } from "./csrDevPaths";
import { VENDOR_SPECIFIERS } from "./vendorSpecifiers";

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
  artifact: BaseBuildArtifact;
  knownEntries?: Set<string>;
  routeId?: string;
  command?: "build" | "start";
  discovery?: ClientEntryDiscovery;
  /** Pre-resolved client entries: skips discovery and bundles exactly this list. */
  entries?: string[];
  /** Defaults to `registry` under `start`: the browser loads each entry from the SSR dev registry, so only `client-ssr` builds. */
  browser?: "chunks" | "registry";
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
}

interface BootstrapEntries {
  buildEntries: string[];
  originalByBuildEntry: Map<string, string>;
}

export class RouteClientBuilder {
  #app: App;
  #seeds: string[];
  #graphSeeds?: string[];
  #knownEntries: Set<string>;
  #command: "build" | "start";
  #discovery?: ClientEntryDiscovery;
  #entries?: string[];
  #browser: "chunks" | "registry";

  constructor(options: BuildRouteClientOptions) {
    this.#app = options.app;
    this.#seeds = options.seeds;
    this.#graphSeeds = options.graphSeeds;
    this.#knownEntries = options.knownEntries ?? new Set<string>();
    this.#command = options.command ?? "start";
    this.#discovery = options.discovery;
    this.#entries = options.entries;
    this.#browser = options.browser ?? (this.#command === "start" ? "registry" : "chunks");
  }

  async build(): Promise<BuildRouteClientResult> {
    const discovered = this.#entries ?? (await (await this.#getDiscovery()).discover(this.#seeds));
    if (discovered.every((e) => this.#knownEntries.has(e))) return this.#emptyResult(discovered);
    const entries = this.#graphSeeds
      ? [...new Set([...discovered, ...(await (await this.#getDiscovery()).discover(this.#graphSeeds))])].sort()
      : discovered.filter((e) => !this.#knownEntries.has(e));

    const bootstrapEntries = await this.#createBootstrapEntries(entries);
    //? Registry mode builds no browser bundle: the SSR bundle has the same entries, exports and imports to read.
    const registry = this.#browser === "registry" ? new CsrDevPaths(this.#app.workspace.workspaceRoot) : null;
    const browserBundle = registry ? null : await this.#buildBrowserBundle(bootstrapEntries);
    const ssrBundle = await this.#buildSsrBundle(bootstrapEntries);
    const referenceBundle = browserBundle ?? ssrBundle;

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

      const ssrOutput = ssrBundle.entryOutputAbsByAbsPath.get(manifestEntry.buildEntry);
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

  async #buildBrowserBundle(bootstrapEntries: BootstrapEntries) {
    const reactFastRefresh = process.env.AKAN_REACT_FAST_REFRESH !== "0";
    return new ClientEntriesBundler({
      app: this.#app,
      entries: bootstrapEntries.buildEntries,
      plugins: [
        await createBarrelImportsPlugin(this.#app, {
          pipeAfter: reactFastRefresh ? RouteClientBuilder.normalizeNamedDefaultFunctionForFastRefresh : undefined,
        }),
      ],
      external: VENDOR_SPECIFIERS,
      command: this.#command,
      reactFastRefresh,
    }).bundle();
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

  async #createBootstrapEntries(entries: string[]): Promise<BootstrapEntries> {
    if (!(await Bun.file(path.join(this.#app.cwdPath, "lib", "st.ts")).exists())) {
      return { buildEntries: entries, originalByBuildEntry: new Map() };
    }

    const outdir = path.join(this.#app.cwdPath, ".akan", "generated", "client-entry-bootstrap");
    await mkdir(outdir, { recursive: true });

    const originalByBuildEntry = new Map<string, string>();
    const buildEntries = await Promise.all(
      entries.map(async (entry) => {
        const absEntry = path.resolve(entry);
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
      ...source.matchAll(/(^|\n)(\s*)export\s+default\s+(async\s+)?function\s+([A-Za-z_$][\w$]*)(?=\s*(?:<|\())/g),
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
  }): string {
    const originalEntry = JSON.stringify(path.resolve(args.originalEntry));
    const namedExports = args.exportNames.filter((name) => name !== "default");
    const lines = [
      `import ${JSON.stringify(`@apps/${args.appName}/client`)};`,
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
