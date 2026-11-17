import { mkdir } from "node:fs/promises";
import path from "node:path";
import { SSR_DEV_DIRNAME, SSR_DEV_ROUTE_PREFIX } from "akanjs/server/hmr/csrDevManifest";
import { resolveSsrPageEntriesForApp } from "../artifact/implicitRootLayout";
import { computeRouteSeedIndex } from "../artifact/routeSeedIndex";
import { StoreBootstrap } from "../artifact/storeBootstrap";
import type { App } from "../commandDecorators";
import { workspaceBarrels } from "../transforms/barrelImportsPlugin";
import { bundleDefine } from "./bundleDefine";
import type { ClientEntryDiscovery } from "./clientBuildTypes";
import { GraphClientEntryDiscovery } from "./clientEntryDiscovery";
import { CsrDevPaths } from "./csrDevPaths";
import type { CsrDevContext } from "./csrDevTypes";
import { DevRegistryBundler } from "./devRegistryBundler";
import { DevRouteRuntime } from "./devRouteRuntime";
import { VENDOR_SPECIFIERS } from "./vendorSpecifiers";

//* Dev-only client code of SSR pages as a module registry, under `.akan/artifact/ssr-dev`. Its roots are a bootstrap
//* (the app's client runtime) and every `"use client"` entry; React and the akanjs vendor facets stay the import map's,
//* so the page keeps one React and one store registry.
export class SsrDevBundler extends DevRegistryBundler {
  static readonly #formatVersion = 4;
  static readonly bootstrapKey = "";
  readonly reloadsOnEntryChange = false;
  #discovery: ClientEntryDiscovery | null = null;
  readonly #sharedDiscovery: (() => ClientEntryDiscovery) | null;
  #route: { inputs: string; runtime: DevRouteRuntime } | null = null;
  #wholeWarned: string | null = null;

  /** `discovery` is the resident builder's, which it keeps current with every save; a worker discovers afresh. */
  constructor(app: App, { discovery }: { discovery?: () => ClientEntryDiscovery } = {}) {
    super(app, { dirName: SSR_DEV_DIRNAME, routePrefix: SSR_DEV_ROUTE_PREFIX, library: true });
    this.#sharedDiscovery = discovery ?? null;
  }

  async context(): Promise<CsrDevContext> {
    const akanConfig = await this.app.getConfig();
    const define = bundleDefine(this.app, "start", "ssr");
    const optimizeImports = [...akanConfig.optimizeImports];
    const routed = akanConfig.clientRuntime === "route";
    //? Under "route", the framework barrels narrow as in a route build: `akanjs/ui` whole names every model runtime
    //? marker, which would load every module's store on every page.
    const barrelImports = routed
      ? [...new Set(akanConfig.barrelImports)].filter(
          (barrel) => barrel && !(VENDOR_SPECIFIERS as readonly string[]).includes(barrel),
        )
      : workspaceBarrels(akanConfig.barrelImports);
    const route = routed ? await this.#routeRuntime() : null;
    const routeRuntime = typeof route === "string" ? null : route;
    this.#warnWhole(typeof route === "string" ? route : null);
    const modelRuntime = routeRuntime?.wholeSource;
    const configKey = Bun.hash(
      JSON.stringify([
        "ssr",
        SsrDevBundler.#formatVersion,
        Bun.version,
        define,
        optimizeImports,
        VENDOR_SPECIFIERS,
        barrelImports,
        ...(modelRuntime === undefined ? [] : [modelRuntime]),
      ]),
    ).toString(36);
    return {
      pageEntries: [],
      basePaths: [...akanConfig.basePaths],
      htmlBasePaths: [],
      define,
      optimizeImports,
      configKey,
      refreshFile: null,
      externals: VENDOR_SPECIFIERS,
      barrelImports,
      ...(routeRuntime ? { modelRuntime, routeRuntime } : {}),
    };
  }

  //? A runtime that could not be read is never kept: syncing a lib it mounts changes none of the app's own inputs.
  async #routeRuntime(): Promise<DevRouteRuntime | string> {
    const { name } = this.app;
    const whole = (why: string, first = "Run") =>
      `[client-runtime] clientRuntime: "route" is set, but ${why}, so every page of the development server loads the whole client runtime. ${first} \`akan sync ${name}\`.`;
    const missing = whole(`the per-module runtime files of ${name} or a lib it mounts are missing`);
    if ((await StoreBootstrap.scopeOf(this.app)) !== "page") return missing;
    const root = this.app.workspace.workspaceRoot;
    const scope = `apps/${name}`;
    const scopes = this.#route?.runtime.scopes ?? [scope];
    const inputs = DevRouteRuntime.inputsOf(root, scopes);
    if (this.#route?.inputs === inputs) return this.#route.runtime;
    this.#route = null;
    try {
      const runtime = await DevRouteRuntime.read(root, scope);
      if (!runtime) return missing;
      const moved = JSON.stringify(runtime.scopes) !== JSON.stringify(scopes);
      this.#route = { inputs: moved ? DevRouteRuntime.inputsOf(root, runtime.scopes) : inputs, runtime };
      return runtime;
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      return whole(`the modules of ${name} or a lib it mounts could not be read (${reason})`, "Fix that, then run");
    }
  }

  #warnWhole(warning: string | null) {
    if (warning && warning !== this.#wholeWarned) this.app.logger.warn(warning);
    this.#wholeWarned = warning;
  }

  //? The client runtime of an SSR page inlines no dictionary (`lib/usePage.ts` reads one only when rendering csr), so
  //? a dictionary save is none of this registry's business.
  override isMetadataFile(file: string): boolean {
    return super.isMetadataFile(file) && !file.endsWith(".dictionary.ts") && path.basename(file) !== "dict.ts";
  }

  // Run first in the tab, before any client module the payload names: the store registry must exist by then.
  async writeEntries(context?: CsrDevContext): Promise<{ files: Record<string, string>; changed: string[] }> {
    await mkdir(this.entryDir, { recursive: true });
    const hasStore = await Bun.file(path.join(this.app.cwdPath, "lib", "st.ts")).exists();
    const scope = context?.modelRuntime === undefined ? "whole" : "page";
    const owners = hasStore ? context?.routeRuntime?.ownersSource() : undefined;
    const { ownersModule } = DevRouteRuntime;
    const bootstrap = hasStore
      ? `${StoreBootstrap.source(this.app.name, scope)}${owners ? `import "./${ownersModule}";\n` : ""}`
      : "export {};\n";
    const entryFile = await SsrDevBundler.#writeIfChanged(path.join(this.entryDir, "bootstrap.ts"), bootstrap);
    const ownersFile = owners
      ? await SsrDevBundler.#writeIfChanged(path.join(this.entryDir, `${ownersModule}.ts`), owners)
      : null;
    const changed = [entryFile, ownersFile].flatMap((written) => (written?.changed ? [written.file] : []));
    return { files: { [SsrDevBundler.bootstrapKey]: entryFile.file }, changed };
  }

  static async #writeIfChanged(file: string, source: string): Promise<{ file: string; changed: boolean }> {
    const unchanged = (await Bun.file(file).exists()) && (await Bun.file(file).text()) === source;
    if (!unchanged) await Bun.write(file, source);
    return { file: CsrDevPaths.realpath(file), changed: !unchanged };
  }

  /** Every `"use client"` entry the app's routes reach, the ones a route build names in its manifest. */
  async clientEntries(): Promise<string[]> {
    const pageEntries = await resolveSsrPageEntriesForApp(this.app, await this.app.getPageKeys());
    const seedIndex = computeRouteSeedIndex(pageEntries);
    const seeds = [...new Set([...seedIndex.globalLayoutFiles, ...seedIndex.entries.flatMap((entry) => entry.seeds)])];
    const discovery = this.#sharedDiscovery?.() ?? (await this.#ownDiscovery());
    return (await discovery.discover(seeds)).map((file) => CsrDevPaths.realpath(file));
  }

  async #ownDiscovery(): Promise<ClientEntryDiscovery> {
    this.#discovery ??= await GraphClientEntryDiscovery.create(this.app);
    return this.#discovery;
  }

  protected async rootFiles(entryFiles: string[]): Promise<string[]> {
    return [...entryFiles, ...(await this.clientEntries())];
  }
}
