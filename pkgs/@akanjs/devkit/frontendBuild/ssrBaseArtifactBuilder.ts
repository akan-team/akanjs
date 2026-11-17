import { rename } from "node:fs/promises";
import path from "node:path";
import { optimize } from "@tailwindcss/node";
import type { AkanNativeAppId, AkanWebConfig } from "akanjs";
import type { BaseBuildArtifact } from "akanjs/server";
import type { BunPlugin } from "bun";
import { resolveSsrPageEntriesForApp } from "../artifact/implicitRootLayout";
import { computeRouteSeedIndex, type RouteSeedIndex, saveRouteSeedIndex } from "../artifact/routeSeedIndex";
import type { App } from "../commandDecorators";
import { ClientEntriesBundler } from "./clientEntriesBundler";
import { CssCompiler, type ImportedStylesheet } from "./cssCompiler";
import { DictionaryAssetBuilder } from "./dictionaryAssetBuilder";
import { FontOptimizer } from "./fontOptimizer";
import { PagesBundleBuilder } from "./pagesBundleBuilder";
import { RouteClientBuilder } from "./routeClientBuilder";
import type { RuntimeChunks } from "./routeModulePreloads";
import { VendorNarrowing } from "./vendorNarrowing";
import type { VendorSpecifier } from "./vendorSpecifiers";

export type BaseBuildPhase = "runtime" | "routes" | "styles" | "dictionary" | "pages" | "total";

export interface BuildSsrBaseArtifactResult {
  artifact: BaseBuildArtifact;
  seedIndex: RouteSeedIndex;
  cssCompiler: CssCompiler;
  optimizedFonts: Awaited<ReturnType<FontOptimizer["optimize"]>>;
  runtimeChunks: RuntimeChunks;
  phaseMs: Record<BaseBuildPhase, number>;
}

export function prepareCssAsset(command: "build" | "start", basePath: string, cssText: string): string {
  return optimize(cssText, { file: `${basePath || "root"}.css`, minify: command === "build" }).code;
}

export class SsrBaseArtifactBuilder {
  #app: App;
  #command: "build" | "start";
  #artifactDir: string;
  #absArtifactDir: string;
  #started = Date.now();
  #serverEnv: BunPlugin | undefined;
  #vendorExports: Partial<Record<VendorSpecifier, readonly string[]>>;
  #dictionaryRoutes?: ReadonlyMap<string, readonly string[]>;

  /**
   * `serverEnv`: the build's server env plugin, so the route bundle carries the env files the backend does and no more.
   * `vendorExports`: the only names a vendor entry exports, for a build whose every client module is already bundled.
   * `dictionaryRoutes`: the dictionary groups each route can show, for a build that cuts the page dictionary by route.
   */
  constructor(
    app: App,
    command: "build" | "start" = "start",
    {
      serverEnv,
      vendorExports = {},
      dictionaryRoutes,
    }: {
      serverEnv?: BunPlugin;
      vendorExports?: Partial<Record<VendorSpecifier, readonly string[]>>;
      dictionaryRoutes?: ReadonlyMap<string, readonly string[]>;
    } = {},
  ) {
    this.#app = app;
    this.#command = command;
    this.#serverEnv = serverEnv;
    this.#vendorExports = vendorExports;
    this.#dictionaryRoutes = dictionaryRoutes;
    this.#artifactDir = `${command === "build" ? app.dist.cwdPath : app.cwdPath}/.akan/artifact`;
    this.#absArtifactDir = path.resolve(this.#artifactDir);
  }

  //? The web router reads this, so `akan start` writes the whole surface: a native shell asks the dev server for the
  //? CSR page even when the app ships none, and a narrowed dev artifact hands it the SSR page, which cannot run there.
  static servedWeb(command: "build" | "start", web: AkanWebConfig): AkanWebConfig {
    return command === "start" ? { ssr: true, csr: true } : web;
  }

  async build(): Promise<BuildSsrBaseArtifactResult> {
    const akanConfig = await this.#app.getConfig();
    const phaseMs = { runtime: 0, routes: 0, styles: 0, dictionary: 0, pages: 0, total: 0 };
    const timed = async <T>(phase: BaseBuildPhase, run: () => Promise<T>): Promise<T> => {
      const started = performance.now();
      try {
        return await run();
      } finally {
        phaseMs[phase] = Math.round(performance.now() - started);
      }
    };
    const { rscClientUrl, rscRuntimeClientManifest, rscRuntimeSsrManifest, vendorMap, runtimeChunks } = await timed(
      "runtime",
      () => this.buildRuntimeClientEntries(),
    );
    const pageEntries = await timed("routes", async () => {
      const pageKeys = await this.#app.getPageKeys();
      this.#app.verbose(`[base-artifact] discovered ${pageKeys.length} route files under ${this.#app.cwdPath}/page`);
      return await resolveSsrPageEntriesForApp(this.#app, pageKeys);
    });
    const { cssCompiler, optimizedFonts, cssAssets } = await timed("styles", () => this.#buildStyleAssets());
    const {
      assets: dictAssets,
      routes: dictRoutes,
      groups: dictGroups,
    } = await timed("dictionary", () =>
      new DictionaryAssetBuilder(this.#app, this.#absArtifactDir).buildAll(akanConfig.i18n, {
        splitApi: true,
        routes: this.#dictionaryRoutes,
        everyGroupAlone: this.#command === "start",
      }),
    );
    const pagesBundle = await timed("pages", () =>
      new PagesBundleBuilder(this.#app, this.#command, pageEntries, this.#serverEnv).build(),
    );
    this.#app.verbose(
      `[base-artifact] pages bundle -> ${pagesBundle.bundlePath} (buildId=${pagesBundle.buildId}, splitting=${pagesBundle.splitting}, entry=${pagesBundle.entryBytes} bytes, outputs=${pagesBundle.outputCount}, chunks=${pagesBundle.chunkCount}, total=${pagesBundle.outputBytes} bytes)`,
    );

    const seedIndex = computeRouteSeedIndex(pageEntries);
    const seedIndexPath = await saveRouteSeedIndex(this.#absArtifactDir, seedIndex, {
      production: this.#command === "build",
    });
    this.#app.verbose(
      `[base-artifact] route seed index -> ${seedIndexPath} entries=${seedIndex.entries.length} globalLayouts=${seedIndex.globalLayoutFiles.length}`,
    );

    const artifact: BaseBuildArtifact = {
      rscClientUrl,
      rscRuntimeClientManifest,
      rscRuntimeSsrManifest,
      vendorMap,
      cssAssets,
      dictAssets,
      ...(dictRoutes ? { dictRoutes } : {}),
      ...(dictGroups ? { dictGroups } : {}),
      pagesBundlePath:
        this.#command === "build"
          ? path.relative(this.#absArtifactDir, pagesBundle.bundlePath)
          : pagesBundle.bundlePath,
      pagesBundleBuildId: pagesBundle.buildId,
      domains: [...akanConfig.domains],
      subRoutes: Object.fromEntries(
        Array.from(akanConfig.subRoutes.entries()).map(([basePath, domains]) => [basePath, [...domains]]),
      ),
      basePaths: [...akanConfig.basePaths],
      branches: [...akanConfig.branches],
      i18n: akanConfig.i18n,
      imageConfig: akanConfig.images,
      web: SsrBaseArtifactBuilder.servedWeb(this.#command, akanConfig.web),
      deepLinkAssociations: Object.values(akanConfig.native.targets)
        .filter((target) => (target.deepLinks?.domains?.length ?? 0) > 0)
        .map((target) => ({
          targetName: target.name,
          iosAppId: SsrBaseArtifactBuilder.#appIdOn(target.appId, "ios"),
          androidAppId: SsrBaseArtifactBuilder.#appIdOn(target.appId, "android"),
          domains: target.deepLinks?.domains ?? [],
          iosTeamId: target.ios?.teamId,
          androidSha256CertFingerprints: target.android?.sha256CertFingerprints,
        })),
    };
    await SsrBaseArtifactBuilder.writeArtifact(this.#absArtifactDir, artifact);
    phaseMs.total = Date.now() - this.#started;
    this.#app.verbose(`[base-artifact] complete in ${phaseMs.total}ms`);

    return { artifact, seedIndex, cssCompiler, optimizedFonts, runtimeChunks, phaseMs };
  }

  //? Renamed into place, last: a dev backend booted beside this build starts on the file the moment it exists.
  static async writeArtifact(absArtifactDir: string, artifact: BaseBuildArtifact): Promise<void> {
    const artifactPath = path.join(absArtifactDir, "base-artifact.json");
    await Bun.write(`${artifactPath}.tmp`, `${JSON.stringify(artifact, null, 2)}\n`);
    await rename(`${artifactPath}.tmp`, artifactPath);
  }

  async buildRuntimeClientEntries(): Promise<
    Pick<BaseBuildArtifact, "rscClientUrl" | "rscRuntimeClientManifest" | "rscRuntimeSsrManifest"> & {
      vendorMap: Record<VendorSpecifier, string>;
      runtimeChunks: RuntimeChunks;
    }
  > {
    const akanServerPath = await VendorNarrowing.akanServerPath(this.#app.workspace.workspaceRoot);
    const rscClientEntry = path.resolve(akanServerPath, "rscClient.tsx");
    const rscSegmentOutletEntry = path.resolve(akanServerPath, "rscSegmentOutlet.tsx");
    const vendorEntries = VendorNarrowing.entriesIn(akanServerPath);
    const entries = [rscClientEntry, rscSegmentOutletEntry, ...vendorEntries.map((v) => v.absPath)];
    const narrowing = new VendorNarrowing(path.dirname(akanServerPath), this.#vendorExports);
    const clientBundle = await new ClientEntriesBundler({
      app: this.#app,
      entries,
      command: this.#command,
      entryExports: narrowing.entryExports(vendorEntries),
      plugins: await narrowing.plugins(),
    }).bundle();
    const ssrBundle = await new ClientEntriesBundler({
      app: this.#app,
      entries: [rscSegmentOutletEntry],
      ...RouteClientBuilder.resolveSsrClientBundleOptions(this.#command),
      outputSubdir: "client-ssr",
      command: this.#command,
    }).bundle();
    const rscClientUrl = clientBundle.entryUrlsByAbsPath.get(rscClientEntry) ?? "";
    const rscRuntimeSsrManifest = {
      moduleLoading: null,
      moduleMap: SsrBaseArtifactBuilder.outletModuleMap(
        clientBundle.manifest,
        clientBundle.clientReferenceIdByAbsPath.get(rscSegmentOutletEntry),
        ssrBundle.entryOutputAbsByAbsPath.get(rscSegmentOutletEntry),
      ),
    };
    const vendorMap = Object.fromEntries(
      vendorEntries.map(({ specifier, absPath }) => [specifier, clientBundle.entryUrlsByAbsPath.get(absPath) ?? ""]),
    ) as Record<VendorSpecifier, string>;
    this.#app.verbose(`[base-artifact] rscClientUrl=${rscClientUrl} vendors=${Object.keys(vendorMap).length}`);
    const chunksOf = (absPath: string) => clientBundle.entryChunkUrlsByAbsPath.get(absPath) ?? [];
    return {
      rscClientUrl,
      rscRuntimeClientManifest: clientBundle.manifest,
      rscRuntimeSsrManifest,
      vendorMap,
      runtimeChunks: {
        runtime: [...new Set([...chunksOf(rscClientEntry), ...chunksOf(rscSegmentOutletEntry)])],
        vendors: Object.fromEntries(vendorEntries.map(({ specifier, absPath }) => [specifier, chunksOf(absPath)])),
      },
    };
  }

  /** Every export of the outlet module shares one client id, so each joins that id's row instead of replacing it. */
  static outletModuleMap(
    manifest: NonNullable<BaseBuildArtifact["rscRuntimeClientManifest"]>,
    outletReferenceId: string | undefined,
    ssrOutput: string | undefined,
  ) {
    const moduleMap: Record<string, Record<string, { id: string; chunks: string[]; name: string; async: true }>> = {};
    if (!ssrOutput || !outletReferenceId) return moduleMap;
    for (const [key, row] of Object.entries(manifest)) {
      if (key !== `${outletReferenceId}#${row.name}`) continue;
      moduleMap[row.id] = {
        ...moduleMap[row.id],
        [row.name]: { id: ssrOutput, chunks: [ssrOutput, ssrOutput], name: row.name, async: true },
      };
    }
    return moduleMap;
  }

  async #buildStyleAssets(): Promise<{
    cssCompiler: CssCompiler;
    optimizedFonts: Awaited<ReturnType<FontOptimizer["optimize"]>>;
    cssAssets: BaseBuildArtifact["cssAssets"];
  }> {
    const cssCompiler = new CssCompiler(this.#app);
    const cssByBasePath = await cssCompiler.getCssByBasePath();
    // The style contract (vocabulary closure, WCAG contrast) is enforced by `akan lint`, not by the build.
    const optimizedFonts = await new FontOptimizer(this.#app, this.#command).optimize();
    const cssAssets = Object.fromEntries(
      await Promise.all(
        Object.entries(cssByBasePath).flatMap(([basePath, baseCssText]) => {
          const cssText = [baseCssText, optimizedFonts.css].filter(Boolean).join("\n");
          if (!cssText) return [];
          return [this.#writeCssAsset(basePath, cssText, cssCompiler.importedStylesheetsByBasePath[basePath] ?? [])];
        }),
      ),
    );
    if (optimizedFonts.files.length > 0)
      this.#app.verbose(`[base-artifact] optimized ${optimizedFonts.files.length} font files`);
    return { cssCompiler, optimizedFonts, cssAssets };
  }

  async #writeCssAsset(basePath: string, cssText: string, imported: ImportedStylesheet[]) {
    const cssAssetName = basePath || "root";
    const preparedCssText = await prepareCssAsset(this.#command, basePath, cssText);
    const cssHash = Bun.hash(`${basePath}\n${preparedCssText}`).toString(36);
    const [cssRelPath, cssUrl] = [
      `styles/${cssAssetName}-${cssHash}.css`,
      `/_akan/styles/${cssAssetName}-${cssHash}.css`,
    ];
    await Bun.write(path.join(this.#absArtifactDir, cssRelPath), preparedCssText);
    SsrBaseArtifactBuilder.#warnDroppedImports(this.#app, cssRelPath, preparedCssText, imported);
    this.#app.verbose(`[base-artifact] wrote ${preparedCssText.length} bytes of CSS for ${basePath} -> ${cssRelPath}`);
    return [basePath, { cssUrl, cssRelPath }] as const;
  }

  // Checked against the written asset, not the compiled text: it is the only stylesheet an SSR render serves.
  static #appIdOn(appId: AkanNativeAppId, platform: "ios" | "android"): string | null {
    return typeof appId === "string" ? appId : (appId[platform] ?? appId.default ?? null);
  }

  static #warnDroppedImports(app: App, cssRelPath: string, css: string, imported: ImportedStylesheet[]) {
    for (const { cssPath, declaredNames } of imported) {
      if (declaredNames.length === 0 || declaredNames.some((name) => css.includes(`${name}:`))) continue;
      app.logger.warn(
        `[base-artifact] @import ${cssPath} declares ${declaredNames.length} custom propert${declaredNames.length === 1 ? "y" : "ies"} and none of them are in ${cssRelPath}`,
      );
    }
  }
}
