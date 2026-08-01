import path from "node:path";
import {
  type App,
  AppExecutor,
  AutoImportSync,
  type ChangeBatch,
  type ClientEntryDiscovery,
  CsrArtifactBuilder,
  type CssCompiler,
  DevChangePlanner,
  DevGeneratedIndexSync,
  FontOptimizer,
  GraphClientEntryDiscovery,
  HmrWatcher,
  PagesBundleBuilder,
  RouteClientBuilder,
  SsrBaseArtifactBuilder,
  WatchRootResolver,
  WorkspaceExecutor,
} from "@akanjs/devkit";
import { Logger } from "akanjs/common";
import type {
  BaseBuildArtifact,
  BuilderMessage,
  BuilderReq,
  BuilderRes,
  BuildPhase,
  BuildRouteResultPayload,
} from "akanjs/server";
import { prepareDevWatchBatch } from "./devWatchBatch";

interface IncrementalBuilderOptions {
  app: App;
  artifact: BaseBuildArtifact;
  watch: boolean;
  cssCompiler: CssCompiler;
  optimizedFonts: Awaited<ReturnType<FontOptimizer["optimize"]>>;
  discovery: ClientEntryDiscovery;
  initialGeneration?: number;
}

type IncrementalBuilderBootDeps = Pick<
  IncrementalBuilderOptions,
  "artifact" | "cssCompiler" | "optimizedFonts" | "discovery"
>;

class IncrementalBuilder {
  #logger = new Logger("IncrementalBuilder");
  #app: App;
  #artifact: BaseBuildArtifact;
  #watch: boolean;
  #cssCompiler: CssCompiler;
  #optimizedFonts: Awaited<ReturnType<FontOptimizer["optimize"]>>;
  #discovery: ClientEntryDiscovery;
  #changePlanner: DevChangePlanner;
  #generatedIndexSync: DevGeneratedIndexSync;
  #autoImportSync: AutoImportSync;
  #generation = 0;
  #workQueue: Promise<void> = Promise.resolve();
  #cssRebuildQueue: Promise<void> = Promise.resolve();
  #cssRebuildTimer: ReturnType<typeof setTimeout> | null = null;
  #pendingCssRebuild: { artifactDir: string; refresh: boolean; generation?: number; changedFiles?: string[] } | null =
    null;
  constructor(options: IncrementalBuilderOptions) {
    this.#app = options.app;
    this.#artifact = options.artifact;
    this.#watch = options.watch;
    this.#cssCompiler = options.cssCompiler;
    this.#optimizedFonts = options.optimizedFonts;
    this.#discovery = options.discovery;
    this.#generation = options.initialGeneration ?? 0;
    this.#changePlanner = new DevChangePlanner({ workspaceRoot: options.app.workspace.workspaceRoot });
    this.#generatedIndexSync = new DevGeneratedIndexSync({ workspaceRoot: options.app.workspace.workspaceRoot });
    this.#autoImportSync = new AutoImportSync({ workspaceRoot: options.app.workspace.workspaceRoot });
  }

  get #artifactDir() {
    return `${this.#app.cwdPath}/.akan/artifact`;
  }

  async handleBuildRoute(msg: BuilderReq): Promise<BuilderRes> {
    return this.#enqueueWork(`build-route:${msg.routeId}`, async () => this.#handleBuildRoute(msg));
  }

  async #handleBuildRoute(msg: BuilderReq): Promise<BuilderRes> {
    try {
      const delta = await new RouteClientBuilder({
        app: this.#app,
        routeId: msg.routeId,
        seeds: msg.seeds,
        artifact: this.#artifact,
        knownEntries: new Set<string>(msg.knownEntries),
        discovery: this.#discovery,
      }).build();
      this.#logger.verbose(`build-route ok routeId=${msg.routeId} newEntries=${delta.newEntries.length}`);
      this.#sendBuildStatus("route", { generation: msg.generation, ok: true, files: msg.seeds });
      return {
        type: "build-route-res",
        id: msg.id,
        ok: true,
        data: {
          manifestDelta: delta.manifestDelta as BuildRouteResultPayload["manifestDelta"],
          ssrManifestDelta: delta.ssrManifestDelta.moduleMap as BuildRouteResultPayload["ssrManifestDelta"],
          newEntries: delta.newEntries,
          discoveredEntries: delta.discoveredEntries,
          clientDeps: delta.clientDeps,
          clientDepsByEntry: delta.clientDepsByEntry,
          routeId: msg.routeId,
          generation: msg.generation,
        } as BuildRouteResultPayload,
      };
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      this.#logger.error(`build-route failed routeId=${msg.routeId}: ${errMsg}`);
      this.#sendBuildStatus("route", { generation: msg.generation, ok: false, files: msg.seeds, message: errMsg });
      return { type: "build-route-res", id: msg.id, ok: false, error: errMsg };
    }
  }
  #sendBuildStatus(
    phase: BuildPhase,
    { generation, ok, files, message }: { generation?: number; ok: boolean; files?: string[]; message?: string },
  ): void {
    if (typeof generation !== "number") return;
    process.send?.({
      type: "build-status",
      data: {
        generation,
        phase,
        ok,
        files: files ?? [],
        message,
      },
    });
  }
  async #enqueueWork<T>(label: string, fn: () => Promise<T>): Promise<T> {
    const started = Date.now();
    const run = this.#workQueue.then(fn, fn);
    this.#workQueue = run.then(() => undefined).catch(() => undefined);
    try {
      return await run;
    } finally {
      this.#logger.verbose(`[work-queue] ${label} finished in ${Date.now() - started}ms`);
    }
  }
  batchTouchesPagesTree(appDir: string, batch: ChangeBatch): boolean {
    const absAppDir = path.resolve(appDir);
    for (const f of batch.files) {
      const abs = path.resolve(f);
      if (!abs.startsWith(`${absAppDir}${path.sep}`) && abs !== absAppDir) continue;
      if (/\.(tsx|ts|jsx|js)$/.test(abs)) return true;
    }
    return false;
  }
  async batchMayChangePageKeys(appDir: string, batch: ChangeBatch): Promise<boolean> {
    const absAppDir = path.resolve(appDir);
    const pageKeys = new Set((await this.#app.getPageKeys()).map((key) => path.normalize(key)));
    for (const f of batch.files) {
      const abs = path.resolve(f);
      if (!abs.startsWith(`${absAppDir}${path.sep}`) && abs !== absAppDir) continue;
      if (!/\.(tsx|ts|jsx|js)$/.test(abs)) continue;
      const rel = path.normalize(path.relative(absAppDir, abs));
      if (!(await Bun.file(abs).exists()) || !pageKeys.has(rel)) return true;
    }
    return false;
  }
  async rebuildCssArtifact(
    artifactDir: string,
    { refresh, generation, changedFiles }: { refresh: boolean; generation?: number; changedFiles?: string[] },
  ) {
    const cssStarted = Date.now();
    const cssByBasePathStarted = Date.now();
    const cssByBasePath = await this.#cssCompiler.getCssByBasePath({ refresh });
    this.#logger.verbose(`css-get-by-base-path ok (${Date.now() - cssByBasePathStarted}ms)`);
    const fontStarted = Date.now();
    const optimizedFonts = await this.#getOptimizedFonts(changedFiles ?? []);
    this.#logger.verbose(`font-assets ready (${Date.now() - fontStarted}ms)`);
    const cssAssetEntries: Array<[string, { cssUrl: string; cssRelPath: string }]> = [];
    const cssBase64ByUrl: Record<string, string> = {};
    await Promise.all(
      Object.entries(cssByBasePath).flatMap(([basePath, baseCssText]) => {
        const cssText = [baseCssText, optimizedFonts.css].filter(Boolean).join("\n");
        if (!cssText) return [];
        return [
          (async () => {
            const cssAssetName = basePath || "root";
            const cssHash = Bun.hash(`${basePath}\n${cssText}`).toString(36);
            const cssRelPath = `styles/${cssAssetName}-${cssHash}.css`;
            const cssUrl = `/_akan/styles/${cssAssetName}-${cssHash}.css`;
            await Bun.write(path.join(artifactDir, cssRelPath), cssText);
            cssAssetEntries.push([basePath, { cssUrl, cssRelPath }]);
            cssBase64ByUrl[cssUrl] = Buffer.from(new TextEncoder().encode(cssText)).toString("base64");
          })(),
        ];
      }),
    );
    const cssAssets = Object.fromEntries(cssAssetEntries);
    if (JSON.stringify(this.#artifact.cssAssets ?? {}) === JSON.stringify(cssAssets)) {
      this.#logger.verbose("css-rebuild unchanged assets; broadcast skipped");
      return;
    }
    this.#artifact = { ...this.#artifact, cssAssets };
    this.#logger.verbose(`css-compile ok assets=${Object.keys(cssAssets).length} (${Date.now() - cssStarted}ms)`);
    process.send?.({
      type: "css-updated",
      data: {
        cssAssets,
        cssBase64ByUrl,
        generation,
        changedFiles,
      },
    });
  }

  scheduleCssRebuild(
    artifactDir: string,
    { refresh, generation, changedFiles }: { refresh: boolean; generation?: number; changedFiles?: string[] },
  ) {
    this.#pendingCssRebuild = { artifactDir, refresh, generation, changedFiles };
    if (this.#cssRebuildTimer) clearTimeout(this.#cssRebuildTimer);
    this.#cssRebuildTimer = setTimeout(() => {
      this.#cssRebuildTimer = null;
      const next = this.#pendingCssRebuild;
      this.#pendingCssRebuild = null;
      if (!next) return;
      this.#cssRebuildQueue = this.#cssRebuildQueue
        .then(async () => {
          const started = Date.now();
          await this.rebuildCssArtifact(next.artifactDir, {
            refresh: next.refresh,
            generation: next.generation,
            changedFiles: next.changedFiles,
          });
          this.#sendBuildStatus("css", { generation: next.generation, ok: true, files: next.changedFiles });
          this.#logger.verbose(`css-rebuild checked (${Date.now() - started}ms)`);
        })
        .catch((err) => {
          const message = err instanceof Error ? err.message : String(err);
          this.#logger.error(`css-rebuild failed: ${message}`);
          this.#sendBuildStatus("css", {
            generation: next.generation,
            ok: false,
            files: next.changedFiles,
            message,
          });
        });
    }, 150);
  }

  async #getOptimizedFonts(changedFiles: string[]) {
    if (!this.#shouldReoptimizeFonts(changedFiles)) {
      this.#logger.verbose(`font-optimize cached files=${this.#optimizedFonts.files.length}`);
      return this.#optimizedFonts;
    }
    const started = Date.now();
    this.#optimizedFonts = await new FontOptimizer(this.#app, "start").optimize();
    this.#logger.verbose(`font-optimize ok files=${this.#optimizedFonts.files.length} (${Date.now() - started}ms)`);
    return this.#optimizedFonts;
  }

  #shouldReoptimizeFonts(changedFiles: string[]) {
    if (changedFiles.length === 0) return false;
    return changedFiles.some((file) => {
      const normalized = path.resolve(file);
      if (/\.(woff2?|ttf|otf)$/i.test(normalized)) return true;
      return this.#optimizedFonts.files.some((fontFile) => path.resolve(fontFile) === normalized);
    });
  }
  async installWatcher() {
    const [appDir, artifactDir] = [`${this.#app.cwdPath}/page`, this.#artifactDir];
    const roots = await new WatchRootResolver(this.#app).resolve();
    const watcher = new HmrWatcher({
      roots,
      logger: this.#logger,
      onBatch: async (batch: ChangeBatch) => {
        await this.#enqueueWork("hmr-batch", async () => this.#handleWatchBatch(appDir, artifactDir, batch));
      },
    });
    watcher.start();
    this.#logger.verbose(`watching ${roots.length} roots`);
  }

  async #handleWatchBatch(appDir: string, artifactDir: string, batch: ChangeBatch) {
    const rawKinds = new Set(batch.kinds);
    if (rawKinds.size === 0) return;
    const generation = ++this.#generation;
    //* Insert framework imports that are used but omitted (e.g. `Int` in *.constant.ts, `fetch` in
    //* *.store.ts) before regenerating barrels. Edits land on files already in this batch, so they
    //* rebuild in this same generation; the write is idempotent so it does not re-trigger the watcher.
    const autoImport = await this.#autoImportSync.syncForBatch(batch.files);
    for (const error of autoImport.errors) this.#logger.error(error);
    if (autoImport.changedFiles.length > 0)
      this.#logger.verbose(`[auto-import] inserted imports into ${autoImport.changedFiles.length} file(s)`);
    const indexSync = await this.#generatedIndexSync.syncForBatch(batch.files);
    const { files, kinds, expandedBatch, event, hasSyncErrors } = prepareDevWatchBatch({
      generation,
      batch,
      indexSync,
      changePlanner: this.#changePlanner,
    });
    const devPlan = event.devPlan;
    this.#logger.verbose(
      `[hmr] batch generation=${generation} kinds=${kinds.join(",")} files=${files.length} generated=${indexSync.changedFiles.length} roles=${devPlan.roles.join(",") || "(none)"} actions=${devPlan.actions.join(",") || "(none)"}`,
    );
    for (const error of indexSync.errors) this.#logger.error(error);

    if (kinds.includes("code")) {
      const started = Date.now();
      if (kinds.includes("config")) this.#discovery = await GraphClientEntryDiscovery.create(this.#app);
      else this.#discovery.invalidate?.(files);
      this.#logger.verbose(
        `client-entry-discovery ${kinds.includes("config") ? "refreshed" : "invalidated"} (${Date.now() - started}ms)`,
      );
    }

    if (hasSyncErrors) {
      this.#sendBuildStatus("barrel", { generation, ok: false, files, message: indexSync.errors.join("\n") });
      process.send?.(event);
      return;
    }
    if (indexSync.changedFiles.length > 0) this.#sendBuildStatus("barrel", { generation, ok: true, files });

    // Server-only generations (e.g. a .service.ts or srvkit edit) must not rebuild or refresh the
    // client: a fresh pages buildId would broadcast rsc-refresh to browsers for no visible change.
    const rebuildClient = devPlan.actions.includes("rebuild-client");
    if (kinds.includes("code") && !rebuildClient) {
      this.#logger.verbose(`client rebuild skipped; devPlan actions=${devPlan.actions.join(",") || "(none)"}`);
    }

    if (kinds.includes("code") && rebuildClient && (await this.batchMayChangePageKeys(appDir, expandedBatch))) {
      const started = Date.now();
      await this.#app.getPageKeys({ refresh: true });
      this.#logger.verbose(`pageKeys updated, app pageKeys are refreshed (${Date.now() - started}ms)`);
    } else if (kinds.includes("code") && rebuildClient && this.batchTouchesPagesTree(appDir, expandedBatch)) {
      this.#logger.verbose("pageKeys refresh skipped; changed page source cannot add/remove a route key");
    }

    if (kinds.includes("code") && rebuildClient && this.#shouldRebuildCsr()) {
      try {
        const started = Date.now();
        await new CsrArtifactBuilder(this.#app).build();
        this.#sendBuildStatus("csr", { generation, ok: true, files });
        this.#logger.verbose(`csr-rebundle ok (${Date.now() - started}ms)`);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.#logger.error(`csr-rebundle failed: ${message}`);
        this.#sendBuildStatus("csr", { generation, ok: false, files, message });
      }
    } else if (kinds.includes("code") && rebuildClient) {
      this.#logger.verbose(`csr-rebundle skipped; set AKAN_DEV_CSR_REBUILD=1 to enable per-save CSR rebuilds`);
    }

    process.send?.(event);

    if (kinds.includes("code") && rebuildClient) {
      try {
        const started = Date.now();
        const next = await new PagesBundleBuilder(this.#app).build();
        process.send?.({
          type: "pages-updated",
          data: { bundlePath: next.bundlePath, buildId: next.buildId, generation, changedFiles: files },
        });
        this.#sendBuildStatus("pages", { generation, ok: true, files });
        this.#logger.verbose(`pages-rebundle ok buildId=${next.buildId} (${Date.now() - started}ms)`);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.#logger.error(`pages-rebundle failed: ${message}`);
        this.#sendBuildStatus("pages", { generation, ok: false, files, message });
      }
    }
    // Server-only code edits cannot introduce class names the CSS scanner would pick up; only a
    // client rebuild or a direct stylesheet edit can change the compiled CSS.
    if (kinds.includes("css") || (kinds.includes("code") && rebuildClient)) {
      this.scheduleCssRebuild(artifactDir, { refresh: true, generation, changedFiles: files });
      this.#logger.verbose(`css-rebuild scheduled generation=${generation}`);
    }
  }

  async boot(): Promise<void> {
    if (this.#watch) await this.installWatcher();
    process.send?.({ type: "builder-ready" });
    this.#logger.verbose(`ready (watch=${this.#watch})`);
  }

  /**
   * After a degraded boot recovers, the backend is still serving the last-good bundle; push a
   * fresh pages/css state so connected browsers pick up the fixed code without another edit.
   */
  async announceRecoveredState(changedFiles: string[]): Promise<void> {
    const generation = ++this.#generation;
    await this.#enqueueWork("boot-recovered", async () => {
      try {
        const next = await new PagesBundleBuilder(this.#app).build();
        process.send?.({
          type: "pages-updated",
          data: { bundlePath: next.bundlePath, buildId: next.buildId, generation, changedFiles },
        });
        this.#sendBuildStatus("pages", { generation, ok: true, files: changedFiles, message: "Boot build recovered" });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.#logger.error(`recovered pages rebundle failed: ${message}`);
        this.#sendBuildStatus("pages", { generation, ok: false, files: changedFiles, message });
      }
      this.scheduleCssRebuild(this.#artifactDir, { refresh: true, generation, changedFiles });
    });
  }

  #shouldRebuildCsr() {
    // CSR is served by `akn start`, so rebuild dev CSR artifacts until incremental CSR HMR is implemented.
    return true;
  }

  static async #buildBootDeps(app: App): Promise<IncrementalBuilderBootDeps> {
    const { artifact, cssCompiler, optimizedFonts } = await new SsrBaseArtifactBuilder(app).build();
    await new CsrArtifactBuilder(app).build();
    const discovery = await GraphClientEntryDiscovery.create(app);
    return { artifact, cssCompiler, optimizedFonts, discovery };
  }

  /**
   * A compile error in the boot build must not kill the builder: the builder is the dev server's
   * file watcher, so exiting here leaves nothing to notice the fix. Report the failure, emit
   * builder-ready so the host keeps the backend serving the last-good artifact, then retry the
   * boot build on every file change until it succeeds.
   */
  static #recoverBoot(
    app: App,
    bootError: unknown,
    logger: Logger,
  ): Promise<{ builder: IncrementalBuilder; changedFiles: string[] }> {
    const firstMessage = bootError instanceof Error ? bootError.message : String(bootError);
    logger.error(`boot build failed; entering degraded watch mode until the error is fixed: ${firstMessage}`);
    let generation = 0;
    const sendFailure = (files: string[], message: string) => {
      process.send?.({
        type: "build-status",
        data: { generation, phase: "pages", ok: false, files, message: `Boot build failed: ${message}` },
      });
    };
    sendFailure([], firstMessage);
    process.send?.({ type: "builder-ready" });
    return new Promise((resolve, reject) => {
      void (async () => {
        const roots = await new WatchRootResolver(app).resolve();
        const watcher = new HmrWatcher({
          roots,
          logger,
          onBatch: async (batch) => {
            generation += 1;
            const files = [...batch.files].sort();
            try {
              // A broken akan.config.ts caches its import failure; re-import it before rebuilding.
              if (new Set(batch.kinds).has("config")) await app.getConfig({ refresh: true });
              const deps = await IncrementalBuilder.#buildBootDeps(app);
              const builder = new IncrementalBuilder({ app, watch: true, initialGeneration: generation, ...deps });
              watcher.stop();
              logger.info(`boot build recovered generation=${generation}`);
              resolve({ builder, changedFiles: files });
            } catch (err) {
              const message = err instanceof Error ? err.message : String(err);
              logger.error(`boot build retry failed: ${message}`);
              sendFailure(files, message);
            }
          },
        });
        watcher.start();
        logger.warn(`[degraded] watching ${roots.length} roots for a fix`);
      })().catch(reject);
    });
  }

  static async main(): Promise<void> {
    const logger = new Logger("IncrementalBuilder");
    const { appName, repoName, workspaceRoot } = WorkspaceExecutor.getBaseDevEnv();
    if (!workspaceRoot || !appName) throw new Error("AKAN_WORKSPACE_ROOT or AKAN_PUBLIC_APP_NAME is not set");
    const workspace = WorkspaceExecutor.fromRoot({ workspaceRoot, repoName });
    const app = AppExecutor.from(workspace, appName);
    const watch = process.env.AKAN_WATCH !== "0";
    let builder: IncrementalBuilder | null = null;
    // Registered before the boot build so build-route requests get an error response (instead of
    // hanging the backend) while the builder is still booting or recovering from a failed build.
    process.on("message", (msg: BuilderMessage) => {
      if (!msg || typeof msg !== "object" || msg.type !== "build-route") return;
      if (!builder) {
        process.send?.({
          type: "build-route-res",
          id: msg.id,
          ok: false,
          error: "builder is recovering from a failed boot build; retry after the build error is fixed",
        });
        return;
      }
      void builder.handleBuildRoute(msg).then((res) => process.send?.(res));
    });
    // The IPC channel closes when the dev host dies (including SIGKILL); exit instead of running
    // as an orphaned watcher that keeps rebuilding for nobody.
    process.on("disconnect", () => {
      logger.warn("host IPC channel closed; exiting builder");
      process.exit(0);
    });
    let recoveredFiles: string[] | null = null;
    try {
      builder = new IncrementalBuilder({ app, watch, ...(await IncrementalBuilder.#buildBootDeps(app)) });
    } catch (err) {
      if (!watch) throw err;
      const recovered = await IncrementalBuilder.#recoverBoot(app, err, logger);
      builder = recovered.builder;
      recoveredFiles = recovered.changedFiles;
    }
    await builder.boot();
    if (recoveredFiles) await builder.announceRecoveredState(recoveredFiles);
  }
}

void IncrementalBuilder.main().catch((err) => {
  console.error(err);
  process.exit(1);
});
