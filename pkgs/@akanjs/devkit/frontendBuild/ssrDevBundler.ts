import { mkdir } from "node:fs/promises";
import path from "node:path";
import { SSR_DEV_DIRNAME, SSR_DEV_ROUTE_PREFIX } from "akanjs/server/hmr/csrDevManifest";
import { resolveSsrPageEntriesForApp } from "../artifact/implicitRootLayout";
import { computeRouteSeedIndex } from "../artifact/routeSeedIndex";
import type { App } from "../commandDecorators";
import { bundleDefine } from "./bundleDefine";
import type { ClientEntryDiscovery } from "./clientBuildTypes";
import { GraphClientEntryDiscovery } from "./clientEntryDiscovery";
import { CsrDevPaths } from "./csrDevPaths";
import type { CsrDevContext } from "./csrDevTypes";
import { DevRegistryBundler } from "./devRegistryBundler";
import { VENDOR_SPECIFIERS } from "./vendorSpecifiers";

//* Dev-only client code of SSR pages as a module registry, under `.akan/artifact/ssr-dev`. Its roots are a bootstrap
//* (the app's client runtime) and every `"use client"` entry; React and the akanjs vendor facets stay the import map's,
//* so the page keeps one React and one store registry.
export class SsrDevBundler extends DevRegistryBundler {
  static readonly #formatVersion = 1;
  static readonly bootstrapKey = "";
  readonly reloadsOnEntryChange = false;
  #discovery: ClientEntryDiscovery | null;

  constructor(app: App, { discovery }: { discovery?: ClientEntryDiscovery } = {}) {
    super(app, { dirName: SSR_DEV_DIRNAME, routePrefix: SSR_DEV_ROUTE_PREFIX, library: true });
    this.#discovery = discovery ?? null;
  }

  async context(): Promise<CsrDevContext> {
    const akanConfig = await this.app.getConfig();
    const define = bundleDefine(this.app, "start", "ssr");
    const optimizeImports = [...akanConfig.optimizeImports];
    const configKey = Bun.hash(
      JSON.stringify(["ssr", SsrDevBundler.#formatVersion, Bun.version, define, optimizeImports, VENDOR_SPECIFIERS]),
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
    };
  }

  // Run first in the tab, before any client module the payload names: the store registry must exist by then.
  async writeEntries(): Promise<{ files: Record<string, string>; changed: string[] }> {
    await mkdir(this.entryDir, { recursive: true });
    const file = path.join(this.entryDir, "bootstrap.ts");
    const hasStore = await Bun.file(path.join(this.app.cwdPath, "lib", "st.ts")).exists();
    const source = hasStore ? `import ${JSON.stringify(`@apps/${this.app.name}/client`)};\n` : "export {};\n";
    const unchanged = (await Bun.file(file).exists()) && (await Bun.file(file).text()) === source;
    if (!unchanged) await Bun.write(file, source);
    const entryFile = CsrDevPaths.realpath(file);
    return { files: { [SsrDevBundler.bootstrapKey]: entryFile }, changed: unchanged ? [] : [entryFile] };
  }

  /** Every `"use client"` entry the app's routes reach, the ones a route build names in its manifest. */
  async clientEntries(): Promise<string[]> {
    const pageEntries = await resolveSsrPageEntriesForApp(this.app, await this.app.getPageKeys());
    const seedIndex = computeRouteSeedIndex(pageEntries);
    const seeds = [...new Set([...seedIndex.globalLayoutFiles, ...seedIndex.entries.flatMap((entry) => entry.seeds)])];
    this.#discovery ??= await GraphClientEntryDiscovery.create(this.app);
    return (await this.#discovery.discover(seeds)).map((file) => CsrDevPaths.realpath(file));
  }

  protected async rootFiles(entryFiles: string[]): Promise<string[]> {
    return [...entryFiles, ...(await this.clientEntries())];
  }
}
