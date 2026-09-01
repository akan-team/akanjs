import { mkdir } from "node:fs/promises";
import path from "node:path";
import type { BaseBuildArtifact, ClientManifest, SsrManifest } from "akanjs/server";
import type { App } from "../commandDecorators";
import { createBarrelImportsPlugin } from "../transforms/barrelImportsPlugin";
import { toClientReferencePath } from "../transforms/rscUseClientTransform";
import type { ClientBundleTarget, ClientEntryDiscovery } from "./clientBuildTypes";
import { ClientEntriesBundler } from "./clientEntriesBundler";
import { GraphClientEntryDiscovery } from "./clientEntryDiscovery";
import { VENDOR_SPECIFIERS } from "./vendorSpecifiers";

const SSR_CLIENT_EXTERNALS = [
  "react",
  "react-dom",
  "react-dom/client",
  "react/jsx-runtime",
  "react/jsx-dev-runtime",
  "akanjs/fetch",
] as const;
const SSR_CLIENT_ALIAS_EXTERNALS = [
  "react",
  "react-dom",
  "react-dom/client",
  "react/jsx-runtime",
  "react/jsx-dev-runtime",
] as const;

export interface BuildRouteClientOptions {
  app: App;
  seeds: string[];
  artifact: BaseBuildArtifact;
  knownEntries?: Set<string>;
  routeId?: string;
  command?: "build" | "start";
  discovery?: ClientEntryDiscovery;
  /**
   * Client entries resolved by the caller, which skips discovery and bundles exactly this list.
   *
   * `AllRoutesBuilder` passes every route's entries at once so they share one `Bun.build`. Chunk
   * splitting is scoped to a single invocation, so a dependency reachable from entries spread across
   * several invocations is emitted once per invocation — mermaid landed in `apps/akan` four times that
   * way. Dev keeps one build per route and leaves this unset.
   */
  entries?: string[];
}

export interface BuildRouteClientResult {
  /** Newly-emitted manifest rows keyed by `${absEntry}#${exportName}`. */
  manifestDelta: ClientManifest;
  /** Newly-emitted ssrManifest rows keyed by entry URL. */
  ssrManifestDelta: SsrManifest;
  /** Absolute paths of the `"use client"` leaves this build added. */
  newEntries: string[];
  /** Absolute paths of all `"use client"` leaves discovered from this route's seeds. */
  discoveredEntries?: string[];
  /** Absolute source files included in the browser bundles for new entries. */
  clientDeps: string[];
  /** Absolute source files included in the browser bundle, grouped by original client entry. */
  clientDepsByEntry?: Record<string, string[]>;
}

interface BootstrapEntries {
  buildEntries: string[];
  originalByBuildEntry: Map<string, string>;
}

export class RouteClientBuilder {
  #app: App;
  #seeds: string[];
  #knownEntries: Set<string>;
  #command: "build" | "start";
  #discovery?: ClientEntryDiscovery;
  #entries?: string[];

  constructor(options: BuildRouteClientOptions) {
    this.#app = options.app;
    this.#seeds = options.seeds;
    this.#knownEntries = options.knownEntries ?? new Set<string>();
    this.#command = options.command ?? "start";
    this.#discovery = options.discovery;
    this.#entries = options.entries;
  }

  async build(): Promise<BuildRouteClientResult> {
    const discovered =
      this.#entries ??
      (await (this.#discovery ?? (await GraphClientEntryDiscovery.create(this.#app))).discover(this.#seeds));
    const entries = discovered.filter((e) => !this.#knownEntries.has(e));
    if (entries.length === 0) return this.#emptyResult(discovered);

    const bootstrapEntries = await this.#createBootstrapEntries(entries);
    const browserBundle = await this.#buildBrowserBundle(bootstrapEntries);
    const ssrBundle = await this.#buildSsrBundle(bootstrapEntries);

    const acceptedEntries = new Set(entries);
    const manifestDelta: ClientManifest = {};
    const ssrModuleMap: SsrManifest["moduleMap"] = {};
    const clientDeps = new Set<string>();
    const clientDepsByEntry: Record<string, string[]> = {};
    for (const [key, row] of Object.entries(browserBundle.manifest)) {
      const manifestEntry = RouteClientBuilder.resolveOriginalManifestEntry(
        key,
        bootstrapEntries.originalByBuildEntry,
        browserBundle.clientReferenceIdByAbsPath,
        this.#app.workspace.workspaceRoot,
      );
      if (!manifestEntry) continue;
      if (!acceptedEntries.has(manifestEntry.originalEntry)) continue;
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
      for (const dep of browserBundle.entryDepsByAbsPath.get(buildEntry) ?? []) deps.add(path.resolve(dep));
      const sortedDeps = [...deps].sort();
      clientDepsByEntry[originalEntry] = sortedDeps;
      for (const dep of sortedDeps) clientDeps.add(dep);
    }

    return {
      manifestDelta,
      ssrManifestDelta: { moduleLoading: null, moduleMap: ssrModuleMap },
      newEntries: entries,
      discoveredEntries: discovered,
      clientDeps: [...clientDeps].sort(),
      clientDepsByEntry,
    };
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
    const source = await Bun.file(absEntry).text();
    const transpiler = new Bun.Transpiler({ loader: this.#loaderFor(absEntry) });
    return transpiler.scan(source).exports;
  }

  #loaderFor(absPath: string): "ts" | "tsx" | "js" | "jsx" {
    if (absPath.endsWith(".tsx")) return "tsx";
    if (absPath.endsWith(".jsx")) return "jsx";
    if (absPath.endsWith(".ts")) return "ts";
    return "js";
  }

  static normalizeNamedDefaultFunctionForFastRefresh(source: string): string | null {
    let changed = false;
    const defaultNames: string[] = [];
    const next = source.replace(
      /(^|\n)(\s*)export\s+default\s+(async\s+)?function\s+([A-Za-z_$][\w$]*)(?=\s*(?:<|\())/g,
      (match, lineStart: string, indent: string, asyncKeyword: string | undefined, name: string) => {
        changed = true;
        defaultNames.push(name);
        return `${lineStart}${indent}${asyncKeyword ?? ""}function ${name}`;
      },
    );
    if (!changed) return null;
    return `${next}\n${defaultNames.map((name) => `export default ${name};`).join("\n")}\n`;
  }

  static resolveSsrClientRuntimeAliases(): Record<string, string> {
    const serverEntry = RouteClientBuilder.resolveAkanServerEntry();
    return { [Bun.resolveSync("akanjs/fetch", serverEntry)]: "akanjs/fetch" };
  }

  /**
   * `target: "bun"` is load-bearing: these chunks are `await import()`-ed by the SSR renderer, so a dependency
   * resolved through its `browser` export condition can touch `document` at module scope and throw mid-render,
   * degrading the whole document to client rendering. Bun's `conditions` only adds to the target's defaults —
   * `browser` still wins — so the target itself has to say server.
   */
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
