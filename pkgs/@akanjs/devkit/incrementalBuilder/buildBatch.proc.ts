import path from "node:path";
import { ApplicationBuildReporter } from "@akanjs/devkit/applicationBuildReporter";
import { resolveSsrPageEntriesForApp } from "@akanjs/devkit/artifact/implicitRootLayout";
import { computeRouteSeedIndex, saveRouteSeedIndex } from "@akanjs/devkit/artifact/routeSeedIndex";
import type { App } from "@akanjs/devkit/commandDecorators";
// Subpath imports only, as few as possible: spawned per generation, this process pays every import on every save.
import { AppExecutor, WorkspaceExecutor } from "@akanjs/devkit/executors";
import {
  CsrArtifactBuilder,
  CsrDevBundler,
  CssCompiler,
  FontOptimizer,
  PagesBundleBuilder,
  ServerGraphFile,
  SsrBaseArtifactBuilder,
  SsrDevBundler,
} from "@akanjs/devkit/frontendBuild";
import { Logger } from "akanjs/common";
import type { BuilderMessage, BuildPhase, HmrTrace } from "akanjs/server";
import { resolveDevCsrMode } from "akanjs/server/hmr/csrDevManifest";
import type { BuildBatchRequest, BuildBatchResult, OptimizedFonts, PagesBatchCssAssets } from "./buildBatchProtocol";

// `Bun.build` keeps native bundler arenas that `Bun.gc(true)` cannot reclaim; only exiting returns them.
class BuildBatch {
  #logger = new Logger("BuildBatch");
  #request: BuildBatchRequest;
  #app: App;
  #result: BuildBatchResult;
  constructor(request: BuildBatchRequest, app: App) {
    this.#request = request;
    this.#app = app;
    this.#result = { generation: request.generation, errors: {} };
  }

  async run(): Promise<BuildBatchResult> {
    if (this.#request.needs.includes("base")) await this.#buildBase();
    if (this.#request.needs.includes("csr")) await this.#buildCsr();
    if (this.#request.needs.includes("ssr")) await this.#buildSsrRegistry();
    // Css before pages: it scans the sources and reads nothing pages produces, so a class edit need not wait for pages.
    if (this.#request.needs.includes("css")) await this.#buildCss();
    if (this.#request.needs.includes("pages")) await this.#buildPages();
    return this.#result;
  }

  // A bare `process.send` is safe only because this process exits by returning from `main`, which flushes ipc;
  // an explicit `process.exit` after an emit would silently drop payloads (route through BuilderChannel then).
  #emit(message: BuilderMessage): void {
    process.send?.(message);
  }

  #sentTrace(): HmrTrace | undefined {
    if (!this.#request.trace) return undefined;
    const now = Date.now();
    return { ...this.#request.trace, patchAt: now, sentAt: now };
  }

  #emitStatus(phase: BuildPhase, message?: string): void {
    this.#emit({
      type: "build-status",
      data: {
        generation: this.#request.generation,
        phase,
        ok: !message,
        files: this.#request.changedFiles,
        message,
      },
    });
  }

  // `Bun.build` rejects with an AggregateError whose own message is only "Bundle failed"; the reasons are nested.
  #fail(need: keyof BuildBatchResult["errors"], label: string, err: unknown): void {
    const message = ApplicationBuildReporter.formatError(err, this.#request.workspaceRoot);
    this.#logger.error(`${label} failed: ${message}`);
    this.#result.errors[need] = message;
    if (need !== "base") this.#emitStatus(need, message);
  }

  // Streams nothing: the builder is not serving yet, so the watcher reads the outcome from the batch result.
  async #buildBase(): Promise<void> {
    const started = Date.now();
    try {
      const { artifact, optimizedFonts } = await new SsrBaseArtifactBuilder(this.#app).build();
      this.#result.artifact = artifact;
      this.#result.optimizedFonts = optimizedFonts;
      this.#logger.verbose(`base-artifact ok buildId=${artifact.pagesBundleBuildId} (${Date.now() - started}ms)`);
    } catch (err) {
      this.#fail("base", "base-artifact", err);
    }
  }

  async #buildCsr(): Promise<void> {
    const started = Date.now();
    try {
      if (resolveDevCsrMode() === "registry") await this.#updateCsrRegistry(started);
      else await this.#rebuildCsrArtifact(started);
      this.#emitStatus("csr");
    } catch (err) {
      this.#fail("csr", "csr-rebundle", err);
    }
  }

  async #rebuildCsrArtifact(started: number): Promise<void> {
    await new CsrArtifactBuilder(this.#app).build();
    this.#logger.verbose(`csr-rebundle ok (${Date.now() - started}ms)`);
    // A CSR tab takes none of the SSR refresh messages, so a rebuilt artifact reaches it only as this reload.
    if (this.#request.changedFiles.length === 0) return;
    this.#emit({
      type: "csr-updated",
      data: { generation: Date.now(), mode: "artifact", reload: true, reason: "the CSR artifact was rebuilt" },
    });
  }

  async #updateCsrRegistry(started: number): Promise<void> {
    const update = await new CsrDevBundler(this.#app).update(this.#request.changedFiles, {
      announce: (announced) =>
        this.#emit({
          type: "csr-updated",
          data: {
            generation: announced.generation,
            mode: "registry",
            reload: announced.reload,
            reason: announced.reason,
            patchUrl: announced.patchUrl,
            changedIds: announced.changedIds,
            trace: this.#sentTrace(),
          },
        }),
    });
    if (!update) {
      this.#logger.verbose(`csr-dev unchanged (${Date.now() - started}ms)`);
      return;
    }
    this.#logger.verbose(
      `csr-dev generation=${update.generation} ${update.reload ? `reload (${update.reason})` : `patch modules=${update.changedIds.length}`} graph=${update.moduleCount} (${Date.now() - started}ms)`,
    );
  }

  // Takes every entry the routes reach as a root, so a route build naming any of them finds it in the registry.
  async #buildSsrRegistry(): Promise<void> {
    const started = Date.now();
    try {
      const bundler = new SsrDevBundler(this.#app);
      //? Runs before pages, so the graph is the last build's, as in the resident builder: a save it holds still waits.
      const hold = await ServerGraphFile.touches(
        await ServerGraphFile.read(this.#request.artifactDir),
        this.#request.changedFiles,
        (file) => ServerGraphFile.clientExportsOf(file),
      );
      const update = await bundler.update(this.#request.changedFiles, {
        roots: await bundler.clientEntries(),
        announce: (announced) =>
          this.#emit({
            type: "ssr-updated",
            data: {
              generation: announced.generation,
              reload: announced.reload,
              reason: announced.reason,
              patchUrl: announced.patchUrl,
              changedIds: announced.changedIds,
              trace: this.#sentTrace(),
              ...(announced.epoch !== undefined ? { epoch: announced.epoch } : {}),
              ...(announced.first ? { first: true } : {}),
              ...(hold && this.#request.changedFiles.length > 0
                ? { hold, batchGeneration: this.#request.generation }
                : {}),
            },
          }),
      });
      this.#emitStatus("ssr");
      this.#logger.verbose(
        update
          ? `ssr-dev generation=${update.generation} ${update.reload ? `reload (${update.reason})` : `patch modules=${update.changedIds.length}`} graph=${update.moduleCount} (${Date.now() - started}ms)`
          : `ssr-dev unchanged (${Date.now() - started}ms)`,
      );
    } catch (err) {
      this.#fail("ssr", "ssr-dev", err);
    }
  }

  // Rewritten with the bundle: the backend rereads it on `pages-updated` to pick up added, moved or deleted routes.
  async #buildPages(): Promise<void> {
    const started = Date.now();
    try {
      const pageEntries = await resolveSsrPageEntriesForApp(this.#app, await this.#app.getPageKeys());
      const seedIndex = computeRouteSeedIndex(pageEntries);
      const previousGraph = await ServerGraphFile.read(this.#request.artifactDir);
      const next = await new PagesBundleBuilder(this.#app, "start", pageEntries).build();
      await saveRouteSeedIndex(this.#request.artifactDir, seedIndex);
      const nextGraph = await ServerGraphFile.read(this.#request.artifactDir);
      const serverTouched = await ServerGraphFile.touches(
        previousGraph,
        [...this.#request.changedFiles, ...(previousGraph?.carried ?? [])],
        (file) => nextGraph?.clientExports[file] ?? null,
        nextGraph,
      );
      this.#emit({
        type: "pages-updated",
        data: {
          bundlePath: next.bundlePath,
          buildId: next.buildId,
          generation: this.#request.generation,
          changedFiles: this.#request.changedFiles,
          trace: this.#sentTrace(),
          serverTouched,
        },
      });
      this.#emitStatus("pages");
      this.#logger.verbose(`pages-rebundle ok buildId=${next.buildId} (${Date.now() - started}ms)`);
    } catch (err) {
      this.#fail("pages", "pages-rebundle", err);
      await ServerGraphFile.carry(this.#request.artifactDir, this.#request.changedFiles).catch((carryError: unknown) =>
        this.#logger.warn(`server graph carry failed; the next save may skip its RSC refresh: ${String(carryError)}`),
      );
    }
  }

  async #buildCss(): Promise<void> {
    const started = Date.now();
    try {
      const cssByBasePath = await new CssCompiler(this.#app).getCssByBasePath({ refresh: true });
      const optimizedFonts = await this.#optimizeFonts();
      const cssAssetEntries: Array<[string, { cssUrl: string; cssRelPath: string }]> = [];
      const cssBase64ByUrl: Record<string, string> = {};
      await Promise.all(
        Object.entries(cssByBasePath).map(async ([basePath, baseCssText]) => {
          const cssText = [baseCssText, optimizedFonts.css].filter(Boolean).join("\n");
          if (!cssText) return;
          const cssAssetName = basePath || "root";
          const cssHash = Bun.hash(`${basePath}\n${cssText}`).toString(36);
          const cssRelPath = `styles/${cssAssetName}-${cssHash}.css`;
          const cssUrl = `/_akan/styles/${cssAssetName}-${cssHash}.css`;
          await Bun.write(path.join(this.#request.artifactDir, cssRelPath), cssText);
          cssAssetEntries.push([basePath, { cssUrl, cssRelPath }]);
          cssBase64ByUrl[cssUrl] = Buffer.from(new TextEncoder().encode(cssText)).toString("base64");
        }),
      );
      const cssAssets = Object.fromEntries(cssAssetEntries) as PagesBatchCssAssets;
      this.#result.cssAssets = cssAssets;
      this.#emitStatus("css");
      if (JSON.stringify(this.#request.cssAssets ?? {}) === JSON.stringify(cssAssets)) {
        this.#logger.verbose("css-rebuild unchanged assets; broadcast skipped");
        return;
      }
      this.#emit({
        type: "css-updated",
        data: {
          cssAssets,
          cssBase64ByUrl,
          generation: this.#request.generation,
          changedFiles: this.#request.changedFiles,
        },
      });
      this.#logger.verbose(`css-compile ok assets=${Object.keys(cssAssets).length} (${Date.now() - started}ms)`);
    } catch (err) {
      this.#fail("css", "css-rebuild", err);
    }
  }

  async #optimizeFonts(): Promise<OptimizedFonts> {
    const previous = this.#request.optimizedFonts;
    if (previous && !BuildBatch.#shouldReoptimizeFonts(previous, this.#request.changedFiles)) {
      this.#logger.verbose(`font-optimize cached files=${previous.files.length}`);
      return previous;
    }
    const started = Date.now();
    const optimizedFonts = await new FontOptimizer(this.#app, "start").optimize();
    this.#result.optimizedFonts = optimizedFonts;
    this.#logger.verbose(`font-optimize ok files=${optimizedFonts.files.length} (${Date.now() - started}ms)`);
    return optimizedFonts;
  }

  static #shouldReoptimizeFonts(previous: OptimizedFonts, changedFiles: string[]): boolean {
    return changedFiles.some((file) => {
      const normalized = path.resolve(file);
      if (/\.(woff2?|ttf|otf)$/i.test(normalized)) return true;
      return previous.files.some((fontFile) => path.resolve(fontFile) === normalized);
    });
  }

  static async main(): Promise<void> {
    const raw = process.argv[2];
    if (!raw) throw new Error("[build-batch] missing request argument");
    const parsed = JSON.parse(raw) as BuildBatchRequest;
    const request = parsed.trace
      ? {
          ...parsed,
          trace: { ...parsed.trace, workerStartAt: Math.round(performance.timeOrigin), workerAt: Date.now() },
        }
      : parsed;
    const workspace = WorkspaceExecutor.fromRoot({
      workspaceRoot: request.workspaceRoot,
      repoName: request.repoName,
    });
    const app = AppExecutor.from(workspace, request.appName);
    // Seeded, not rediscovered: route discovery would be the largest cost of spawning this process.
    if (request.pageKeys) app.setPageKeys(request.pageKeys);
    //? Exits with the builder that spawned it (a kill, a crash, a restart for a metadata save): left running, it would
    //? write a registry its replacement is rebuilding. Removed before returning, since the listener keeps Bun's IPC open.
    const orphaned = () => process.exit(1);
    process.on("disconnect", orphaned);
    const result = await new BuildBatch(request, app).run();
    process.send?.({ type: "build-batch-result", data: result });
    process.off("disconnect", orphaned);
  }
}

// Awaited, not voided: on Windows Bun exits during a missing file's `Bun.file` read unless an entry await is pending.
await BuildBatch.main().catch((err) => {
  console.error(err);
  process.exit(1);
});
