import path from "node:path";
import { optimize } from "@tailwindcss/node";
import type { BaseBuildArtifact } from "akanjs/server";
import { resolveSsrPageEntriesForApp } from "../artifact/implicitRootLayout";
import { computeRouteSeedIndex, type RouteSeedIndex, saveRouteSeedIndex } from "../artifact/routeSeedIndex";
import type { App } from "../commandDecorators";
import { ClientEntriesBundler } from "./clientEntriesBundler";
import { CssCompiler } from "./cssCompiler";
import { FontOptimizer } from "./fontOptimizer";
import { PagesBundleBuilder } from "./pagesBundleBuilder";
import { RouteClientBuilder } from "./routeClientBuilder";
import { VENDOR_SPECIFIERS, type VendorSpecifier } from "./vendorSpecifiers";

export interface BuildSsrBaseArtifactResult {
  artifact: BaseBuildArtifact;
  seedIndex: RouteSeedIndex;
  cssCompiler: CssCompiler;
  optimizedFonts: Awaited<ReturnType<FontOptimizer["optimize"]>>;
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

  constructor(app: App, command: "build" | "start" = "start") {
    this.#app = app;
    this.#command = command;
    this.#artifactDir = `${command === "build" ? app.dist.cwdPath : app.cwdPath}/.akan/artifact`;
    this.#absArtifactDir = path.resolve(this.#artifactDir);
  }

  async build(): Promise<BuildSsrBaseArtifactResult> {
    const akanConfig = await this.#app.getConfig();
    const { rscClientUrl, rscRuntimeClientManifest, rscRuntimeSsrManifest, vendorMap } =
      await this.#buildRuntimeClientEntries();
    const pageKeys = await this.#app.getPageKeys();
    this.#app.verbose(`[base-artifact] discovered ${pageKeys.length} route files under ${this.#app.cwdPath}/page`);

    const pageEntries = await resolveSsrPageEntriesForApp(this.#app, pageKeys);
    const { cssCompiler, optimizedFonts, cssAssets } = await this.#buildStyleAssets();
    const pagesBundle = await new PagesBundleBuilder(this.#app, this.#command, pageEntries).build();
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
      deepLinkAssociations: Object.values(akanConfig.mobile.targets)
        .filter((target) => (target.deepLinks?.domains?.length ?? 0) > 0)
        .map((target) => ({
          targetName: target.name,
          appId: target.appId,
          domains: target.deepLinks?.domains ?? [],
          iosTeamId: target.deepLinks?.ios?.teamId,
          androidSha256CertFingerprints: target.deepLinks?.android?.sha256CertFingerprints,
        })),
    };
    await Bun.write(path.join(this.#absArtifactDir, "base-artifact.json"), `${JSON.stringify(artifact, null, 2)}\n`);
    this.#app.verbose(`[base-artifact] complete in ${Date.now() - this.#started}ms`);

    return { artifact, seedIndex, cssCompiler, optimizedFonts };
  }

  async #buildRuntimeClientEntries(): Promise<
    Pick<BaseBuildArtifact, "rscClientUrl" | "rscRuntimeClientManifest" | "rscRuntimeSsrManifest"> & {
      vendorMap: Record<VendorSpecifier, string>;
    }
  > {
    const akanServerPath = await this.#resolveAkanServerPath();
    const rscClientEntry = path.resolve(akanServerPath, "rscClient.tsx");
    const rscSegmentOutletEntry = path.resolve(akanServerPath, "rscSegmentOutlet.tsx");
    const vendorEntries = VENDOR_SPECIFIERS.map((specifier) => ({
      specifier,
      absPath: path.resolve(akanServerPath, "vendor", `${specifier.replaceAll("/", "-").replaceAll(".", "-")}.ts`),
    }));
    const entries = [rscClientEntry, rscSegmentOutletEntry, ...vendorEntries.map((v) => v.absPath)];
    const clientBundle = await new ClientEntriesBundler({ app: this.#app, entries, command: this.#command }).bundle();
    const ssrBundle = await new ClientEntriesBundler({
      app: this.#app,
      entries: [rscSegmentOutletEntry],
      ...RouteClientBuilder.resolveSsrClientExternalOptions(this.#command),
      outputSubdir: "client-ssr",
      command: this.#command,
    }).bundle();
    const rscClientUrl = clientBundle.entryUrlsByAbsPath.get(rscClientEntry) ?? "";
    const rscRuntimeSsrManifest = {
      moduleLoading: null,
      moduleMap: Object.fromEntries(
        Object.entries(clientBundle.manifest)
          .map(([key, row]) => {
            const ssrOutput = ssrBundle.entryOutputAbsByAbsPath.get(rscSegmentOutletEntry);
            if (
              !ssrOutput ||
              key !== `${clientBundle.clientReferenceIdByAbsPath.get(rscSegmentOutletEntry)}#${row.name}`
            ) {
              return null;
            }
            return [
              row.id,
              { [row.name]: { id: ssrOutput, chunks: [ssrOutput, ssrOutput], name: row.name, async: true } },
            ];
          })
          .filter(
            (entry): entry is [string, Record<string, { id: string; chunks: string[]; name: string; async: true }>] =>
              Boolean(entry),
          ),
      ),
    };
    const vendorMap = Object.fromEntries(
      vendorEntries.map(({ specifier, absPath }) => [specifier, clientBundle.entryUrlsByAbsPath.get(absPath) ?? ""]),
    ) as Record<VendorSpecifier, string>;
    this.#app.verbose(`[base-artifact] rscClientUrl=${rscClientUrl} vendors=${Object.keys(vendorMap).length}`);
    return {
      rscClientUrl,
      rscRuntimeClientManifest: clientBundle.manifest,
      rscRuntimeSsrManifest,
      vendorMap,
    };
  }
  async #resolveAkanServerPath() {
    const candidates: string[] = [];
    try {
      candidates.push(path.dirname(Bun.resolveSync("akanjs/server", this.#app.workspace.workspaceRoot)));
    } catch {
      // Source workspaces and bundled CLI execution have different resolution roots; try explicit candidates below.
    }
    candidates.push(
      path.join(this.#app.workspace.workspaceRoot, "pkgs/akanjs/server"),
      path.join(this.#app.workspace.workspaceRoot, "node_modules/akanjs/server"),
    );
    try {
      candidates.push(path.dirname(Bun.resolveSync("akanjs/server", path.dirname(Bun.main))));
    } catch {
      // Published CLI installs may hoist dependencies differently; explicit Bun.main candidates cover that.
    }
    candidates.push(
      path.join(path.dirname(Bun.main), "node_modules/akanjs/server"),
      path.join(path.dirname(Bun.main), "../../akanjs/server"),
      path.resolve(import.meta.dir, "../../server"),
      path.resolve(import.meta.dir, "../server"),
    );
    for (const candidate of candidates) {
      if (await Bun.file(path.join(candidate, "rscClient.tsx")).exists()) return candidate;
    }
    throw new Error(`[base-artifact] failed to locate akanjs/server; looked in: ${candidates.join(", ")}`);
  }

  async #buildStyleAssets(): Promise<{
    cssCompiler: CssCompiler;
    optimizedFonts: Awaited<ReturnType<FontOptimizer["optimize"]>>;
    cssAssets: BaseBuildArtifact["cssAssets"];
  }> {
    const cssCompiler = new CssCompiler(this.#app);
    const cssByBasePath = await cssCompiler.getCssByBasePath();
    const optimizedFonts = await new FontOptimizer(this.#app, this.#command).optimize();
    const cssAssets = Object.fromEntries(
      await Promise.all(
        Object.entries(cssByBasePath).flatMap(([basePath, baseCssText]) => {
          const cssText = [baseCssText, optimizedFonts.css].filter(Boolean).join("\n");
          if (!cssText) return [];
          return [this.#writeCssAsset(basePath, cssText)];
        }),
      ),
    );
    if (optimizedFonts.files.length > 0)
      this.#app.verbose(`[base-artifact] optimized ${optimizedFonts.files.length} font files`);
    return { cssCompiler, optimizedFonts, cssAssets };
  }

  async #writeCssAsset(basePath: string, cssText: string) {
    const cssAssetName = basePath || "root";
    const preparedCssText = await prepareCssAsset(this.#command, basePath, cssText);
    const cssHash = Bun.hash(`${basePath}\n${preparedCssText}`).toString(36);
    const [cssRelPath, cssUrl] = [
      `styles/${cssAssetName}-${cssHash}.css`,
      `/_akan/styles/${cssAssetName}-${cssHash}.css`,
    ];
    await Bun.write(path.join(this.#absArtifactDir, cssRelPath), preparedCssText);
    this.#app.verbose(`[base-artifact] wrote ${preparedCssText.length} bytes of CSS for ${basePath} -> ${cssRelPath}`);
    return [basePath, { cssUrl, cssRelPath }] as const;
  }
}
