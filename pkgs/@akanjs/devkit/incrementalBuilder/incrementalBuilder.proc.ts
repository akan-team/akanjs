import path from "node:path";
// Module paths, never a barrel. The `@akanjs/devkit` root re-exports all 41 modules, which would drag
// @trapezedev/project, the @langchain stack, ssh2, ink and the cloud stack in; and `frontendBuild`'s own
// barrel reaches `cssCompiler`/`ssrBaseArtifactBuilder`, which pull tailwindcss + @tailwindcss/node
// (~40MB) into a process that then holds them for the whole dev session. Phase 2 moved css compilation
// into the batch worker, so this process has no use for them — `entryModuleGraph.test.ts` keeps it that way.
import type { App } from "@akanjs/devkit/commandDecorators";
import { AppExecutor, type PageRoot, WorkspaceExecutor } from "@akanjs/devkit/executors";
import { AutoImportSync } from "@akanjs/devkit/frontendBuild/autoImportSync";
import type { ClientEntryDiscovery } from "@akanjs/devkit/frontendBuild/clientBuildTypes";
import { GraphClientEntryDiscovery } from "@akanjs/devkit/frontendBuild/clientEntryDiscovery";
import { DevChangePlanner } from "@akanjs/devkit/frontendBuild/devChangePlanner";
import { DevGeneratedIndexSync } from "@akanjs/devkit/frontendBuild/devGeneratedIndexSync";
import { HmrWatcher } from "@akanjs/devkit/frontendBuild/hmrWatcher";
import { RouteClientBuilder } from "@akanjs/devkit/frontendBuild/routeClientBuilder";
import { WatchRootResolver } from "@akanjs/devkit/frontendBuild/watchRootResolver";
import { Logger } from "akanjs/common";
import type {
  BaseBuildArtifact,
  BuilderCsrReq,
  BuilderMessage,
  BuilderReq,
  BuilderRes,
  BuildPhase,
  BuildRouteResultPayload,
  ChangeBatch,
} from "akanjs/server";
import type { BuildBatchNeed, BuildBatchRequest, BuildBatchResult, OptimizedFonts } from "./buildBatchProtocol";
import { BuildBatchRunner } from "./buildBatchRunner";
import { BuilderChannel } from "./builderChannel";
import { prepareDevWatchBatch } from "./devWatchBatch";

interface IncrementalBuilderOptions {
  app: App;
  artifact: BaseBuildArtifact;
  watch: boolean;
  optimizedFonts: OptimizedFonts;
  discovery: ClientEntryDiscovery;
  initialGeneration?: number;
}

type IncrementalBuilderBootDeps = Pick<IncrementalBuilderOptions, "artifact" | "optimizedFonts" | "discovery">;

class IncrementalBuilder {
  #logger = new Logger("IncrementalBuilder");
  #app: App;
  #artifact: BaseBuildArtifact;
  #watch: boolean;
  /** Kept by value, not as a live `FontOptimizer`: it has to travel to each disposable build worker. */
  #optimizedFonts: OptimizedFonts;
  #discovery: ClientEntryDiscovery;
  #batchRunner: BuildBatchRunner;
  #changePlanner: DevChangePlanner;
  #generatedIndexSync: DevGeneratedIndexSync;
  #autoImportSync: AutoImportSync;
  #watcher: HmrWatcher | null = null;
  #generation = 0;
  #csrActive = IncrementalBuilder.#csrArmedByEnv();
  #workQueue: Promise<void> = Promise.resolve();
  #inFlight = 0;
  #workCount = 0;
  #shuttingDown = false;
  #cssRebuildQueue: Promise<void> = Promise.resolve();
  #cssRebuildTimer: ReturnType<typeof setTimeout> | null = null;
  #pendingCssRebuild: { generation?: number; changedFiles?: string[] } | null = null;
  constructor(options: IncrementalBuilderOptions) {
    this.#app = options.app;
    this.#artifact = options.artifact;
    this.#watch = options.watch;
    this.#optimizedFonts = options.optimizedFonts;
    this.#discovery = options.discovery;
    this.#generation = options.initialGeneration ?? 0;
    this.#batchRunner = new BuildBatchRunner({
      workspaceRoot: options.app.workspace.workspaceRoot,
      cwd: options.app.cwdPath,
    });
    this.#changePlanner = new DevChangePlanner({ workspaceRoot: options.app.workspace.workspaceRoot });
    this.#generatedIndexSync = new DevGeneratedIndexSync({ workspaceRoot: options.app.workspace.workspaceRoot });
    this.#autoImportSync = new AutoImportSync({ workspaceRoot: options.app.workspace.workspaceRoot });
  }

  get #artifactDir() {
    return `${this.#app.cwdPath}/.akan/artifact`;
  }

  /**
   * Build a route and answer it. The reply is part of the work item on purpose: `shutdown` drains the
   * work queue before exiting, so folding the flush in here is what makes "drained" mean "answered".
   */
  async handleBuildRoute(msg: BuilderReq): Promise<void> {
    await this.#enqueueWork(`build-route:${msg.routeId}`, async () =>
      BuilderChannel.send(await this.#handleBuildRoute(msg)),
    );
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
    BuilderChannel.emit({
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
    this.#inFlight += 1;
    const run = this.#workQueue.then(fn, fn);
    this.#workQueue = run.then(() => undefined).catch(() => undefined);
    try {
      return await run;
    } finally {
      this.#inFlight -= 1;
      this.#workCount += 1;
      this.#logger.verbose(`[work-queue] ${label} finished in ${Date.now() - started}ms`);
      this.#reportMetrics();
    }
  }

  /** No queued work and no debounced css rebuild, so nothing is lost if the process exits now. */
  get #idle(): boolean {
    return this.#inFlight === 0 && this.#cssRebuildTimer === null;
  }

  /**
   * Reported only when the builder is idle. The host's only lever against the bundler arenas
   * `Bun.build` retains is to recycle this process, and a recycle decided while work is queued would
   * either truncate that work or race the shutdown drain — so a busy builder simply says nothing.
   */
  #reportMetrics(): void {
    if (!this.#idle || this.#shuttingDown) return;
    BuilderChannel.emit({
      type: "builder-metrics",
      data: { rssBytes: process.memoryUsage.rss(), generation: this.#generation, workCount: this.#workCount },
    });
  }

  /**
   * Finish queued work, then exit so the OS reclaims the bundler arenas. The host restarts a
   * replacement; build requests that arrive during the drain are refused with the same retry error
   * the backend already handles for any other builder restart.
   */
  async shutdown(reason: string): Promise<void> {
    if (this.#shuttingDown) return;
    this.#shuttingDown = true;
    const started = Date.now();
    this.#logger.info(`shutdown requested (${reason}); draining ${this.#inFlight} work item(s)`);
    if (this.#cssRebuildTimer) {
      // Only reachable if a css batch landed between the idle report and this request: the fresh
      // boot build recompiles css from scratch anyway, so dropping the debounce loses nothing.
      clearTimeout(this.#cssRebuildTimer);
      this.#cssRebuildTimer = null;
      this.#pendingCssRebuild = null;
    }
    await this.#workQueue.catch(() => undefined);
    await this.#cssRebuildQueue.catch(() => undefined);
    // Drained queues do not mean the host has the results. The events those work items produced are the
    // largest messages this process sends, and `process.exit` discards an ipc write that has not
    // flushed — a `css-updated` relayed milliseconds before this line would be dropped with no error
    // anywhere, leaving the backend serving the previous bundle. See `BuilderChannel`.
    const flushed = await BuilderChannel.drain();
    this.#logger.info(
      `drained in ${Date.now() - started}ms${flushed ? ` after flushing ${flushed} ipc write(s)` : ""}; exiting for recycle`,
    );
    process.exit(0);
  }

  get shuttingDown(): boolean {
    return this.#shuttingDown;
  }
  //* Watch events name the file's real path, so synced lib pages are matched by `realDir` while their
  //* page key still carries the app-relative `(libs)/(<lib>)` prefix.
  static #matchPageRoot(roots: PageRoot[], abs: string): PageRoot | null {
    for (const root of roots) {
      const absRoot = path.resolve(root.realDir);
      if (abs === absRoot || abs.startsWith(`${absRoot}${path.sep}`)) return root;
    }
    return null;
  }
  batchTouchesPagesTree(roots: PageRoot[], batch: ChangeBatch): boolean {
    for (const f of batch.files) {
      const abs = path.resolve(f);
      if (!IncrementalBuilder.#matchPageRoot(roots, abs)) continue;
      if (/\.(tsx|ts|jsx|js)$/.test(abs)) return true;
    }
    return false;
  }
  async batchMayChangePageKeys(roots: PageRoot[], batch: ChangeBatch): Promise<boolean> {
    const pageKeys = new Set((await this.#app.getPageKeys()).map((key) => path.normalize(key)));
    for (const f of batch.files) {
      const abs = path.resolve(f);
      const root = IncrementalBuilder.#matchPageRoot(roots, abs);
      if (!root) continue;
      if (!/\.(tsx|ts|jsx|js)$/.test(abs)) continue;
      const rel = path.normalize(`${root.keyPrefix}${path.relative(path.resolve(root.realDir), abs)}`);
      if (!(await Bun.file(abs).exists()) || !pageKeys.has(rel)) return true;
    }
    return false;
  }
  /** Debounced css-only rebuild; the compile itself runs in a disposable worker like every other build. */
  scheduleCssRebuild({ generation, changedFiles }: { generation?: number; changedFiles?: string[] }) {
    this.#pendingCssRebuild = { generation, changedFiles };
    if (this.#cssRebuildTimer) clearTimeout(this.#cssRebuildTimer);
    this.#cssRebuildTimer = setTimeout(() => {
      this.#cssRebuildTimer = null;
      const next = this.#pendingCssRebuild;
      this.#pendingCssRebuild = null;
      if (!next) return;
      this.#inFlight += 1;
      this.#cssRebuildQueue = this.#cssRebuildQueue
        .then(async () => {
          await this.#runBatch({
            generation: next.generation ?? this.#generation,
            needs: ["css"],
            changedFiles: next.changedFiles ?? [],
          });
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
        })
        .finally(() => {
          this.#inFlight -= 1;
          this.#reportMetrics();
        });
    }, 150);
  }
  async installWatcher() {
    const artifactDir = this.#artifactDir;
    const roots = await new WatchRootResolver(this.#app).resolve();
    const watcher = new HmrWatcher({
      roots,
      logger: this.#logger,
      onBatch: async (batch: ChangeBatch) => {
        await this.#enqueueWork("hmr-batch", async () => this.#handleWatchBatch(artifactDir, batch));
      },
    });
    await watcher.start();
    this.#watcher = watcher;
    this.#logger.verbose(`watching ${roots.length} roots`);
  }

  async #handleWatchBatch(artifactDir: string, batch: ChangeBatch) {
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
    //* Both passes above write source files, and this generation's build consumes what they wrote. Hand
    //* them to the watcher so its verification scan does not read them back as a user edit and spend a
    //* second generation rebuilding identical content.
    await this.#watcher?.absorb([...autoImport.changedFiles, ...indexSync.changedFiles]);
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
      BuilderChannel.emit(event);
      return;
    }
    if (indexSync.changedFiles.length > 0) this.#sendBuildStatus("barrel", { generation, ok: true, files });

    // Server-only generations (e.g. a .service.ts or srvkit edit) must not rebuild or refresh the
    // client: a fresh pages buildId would broadcast rsc-refresh to browsers for no visible change.
    const rebuildClient = devPlan.actions.includes("rebuild-client");
    if (kinds.includes("code") && !rebuildClient) {
      this.#logger.verbose(`client rebuild skipped; devPlan actions=${devPlan.actions.join(",") || "(none)"}`);
    }

    const pageRoots = await this.#app.getPageRoots();
    if (kinds.includes("code") && rebuildClient && (await this.batchMayChangePageKeys(pageRoots, expandedBatch))) {
      const started = Date.now();
      await this.#app.getPageKeys({ refresh: true });
      this.#logger.verbose(`pageKeys updated, app pageKeys are refreshed (${Date.now() - started}ms)`);
    } else if (kinds.includes("code") && rebuildClient && this.batchTouchesPagesTree(pageRoots, expandedBatch)) {
      this.#logger.verbose("pageKeys refresh skipped; changed page source cannot add/remove a route key");
    }

    const needs: BuildBatchNeed[] = [];
    if (kinds.includes("code") && rebuildClient) {
      if (this.#shouldRebuildCsr()) needs.push("csr");
      else
        this.#logger.verbose(
          `csr-rebundle skipped; request /__csr or ?csr=true (or set AKAN_DEV_CSR_REBUILD=1) to enable per-save CSR rebuilds`,
        );
      needs.push("pages");
      // Server-only code edits cannot introduce class names the CSS scanner would pick up; only a
      // client rebuild or a direct stylesheet edit can change the compiled CSS. Folded into this
      // generation's batch rather than debounced separately: the work queue already serializes
      // generations, so by the time a second batch runs the 150ms debounce would have fired anyway,
      // and a second worker spawn per save costs more than the coalescing ever saved.
      needs.push("css");
    }

    BuilderChannel.emit(event);

    if (needs.length > 0) await this.#runBatch({ generation, needs, changedFiles: files });
    // A css-only batch keeps its debounce: those arrive in bursts while a stylesheet is edited, and
    // without a pages build in front of them there is nothing else to space them out.
    else if (kinds.includes("css")) {
      this.scheduleCssRebuild({ generation, changedFiles: files });
      this.#logger.verbose(`css-rebuild scheduled generation=${generation}`);
    }
  }

  /**
   * Run one generation of build work in a process that exits afterwards. The worker streams the
   * messages the backend and the HMR overlay consume, which this relays untouched, so the sequence a
   * browser observes is the same one the in-process build produced.
   */
  async #runBatch({
    generation,
    needs,
    changedFiles,
  }: {
    generation: number;
    needs: BuildBatchNeed[];
    changedFiles: string[];
  }): Promise<BuildBatchResult> {
    const started = Date.now();
    const result = await this.#batchRunner.run(await this.#batchRequest({ generation, needs, changedFiles }), (msg) =>
      BuilderChannel.emit(msg),
    );
    if (result.optimizedFonts) this.#optimizedFonts = result.optimizedFonts;
    if (result.cssAssets) this.#artifact = { ...this.#artifact, cssAssets: result.cssAssets };
    // A worker that died before reporting streamed no build-status of its own, so report one per need
    // it was given: the generation must go red rather than look like it silently succeeded.
    if (result.crashed) {
      // `base` is excluded because it is not a `BuildPhase`: a boot build has no phase board to fail, and
      // it never travels through here — `#buildBootDeps` runs it and throws into the degraded-boot path.
      for (const need of needs)
        if (need !== "base")
          this.#sendBuildStatus(need, { generation, ok: false, files: changedFiles, message: result.errors[need] });
    }
    if (needs.includes("css")) this.#logger.verbose(`css-rebuild checked (${Date.now() - started}ms)`);
    return result;
  }

  async #batchRequest({
    generation,
    needs,
    changedFiles,
  }: {
    generation: number;
    needs: BuildBatchNeed[];
    changedFiles: string[];
  }): Promise<BuildBatchRequest> {
    return {
      appName: this.#app.name,
      workspaceRoot: this.#app.workspace.workspaceRoot,
      repoName: this.#app.workspace.repoName,
      generation,
      needs,
      changedFiles,
      pageKeys: await this.#app.getPageKeys(),
      optimizedFonts: this.#optimizedFonts,
      cssAssets: this.#artifact.cssAssets ?? null,
      artifactDir: path.resolve(this.#artifactDir),
    };
  }

  async boot(): Promise<void> {
    if (this.#watch) await this.installWatcher();
    BuilderChannel.emit({ type: "builder-ready" });
    this.#logger.verbose(`ready (watch=${this.#watch})`);
  }

  /**
   * After a degraded boot recovers, the backend is still serving the last-good bundle; push a
   * fresh pages/css state so connected browsers pick up the fixed code without another edit.
   */
  async announceRecoveredState(changedFiles: string[]): Promise<void> {
    const generation = ++this.#generation;
    await this.#enqueueWork("boot-recovered", async () => {
      await this.#runBatch({ generation, needs: ["pages", "css"], changedFiles });
    });
  }

  /**
   * Re-announce the state this builder just booted with, after the host recycled the previous one.
   *
   * The backend reads `base-artifact.json` once at boot and never re-reads it, so a pages or css hash
   * that moved while the builder was being replaced would otherwise leave it pointing at the previous
   * artifact until the next save. Announced from the boot artifact rather than by rebuilding: the
   * bundles are already on disk, and spending another ~200MB of bundler arena in a process that was
   * just recycled to reclaim memory would defeat the purpose. The host suppresses the announcement
   * when the hashes match, which is the common case, so a clean recycle never reloads a browser.
   */
  async announceBootState(): Promise<void> {
    const generation = ++this.#generation;
    const reason = "builder-recycle" as const;
    // Awaited rather than emitted: this runs during a recycle, so the host may ask this builder to shut
    // down at any moment, and "announced boot state" must mean the announcement left the process.
    await BuilderChannel.send({
      type: "pages-updated",
      data: {
        bundlePath: this.#artifact.pagesBundlePath,
        buildId: this.#artifact.pagesBundleBuildId,
        generation,
        changedFiles: [],
        reason,
      },
    });
    const cssAssets = this.#artifact.cssAssets ?? {};
    const cssBase64ByUrl = Object.fromEntries(
      await Promise.all(
        Object.values(cssAssets).map(async ({ cssUrl, cssRelPath }) => [
          cssUrl,
          Buffer.from(await Bun.file(path.join(this.#artifactDir, cssRelPath)).arrayBuffer()).toString("base64"),
        ]),
      ),
    );
    await BuilderChannel.send({
      type: "css-updated",
      data: { cssAssets, cssBase64ByUrl, generation, changedFiles: [], reason },
    });
    this.#logger.verbose(`announced boot state after recycle generation=${generation}`);
  }

  /**
   * Build the dev CSR artifact because a request asked for it, and keep it in sync from now on. The
   * dev server only serves CSR through the opt-in `/__csr` and `?csr=true` routes — mobile local dev
   * points a device WebView at the latter — so nothing needs the artifact until one of them is hit.
   */
  async handleBuildCsr(msg: BuilderCsrReq): Promise<void> {
    await this.#enqueueWork("build-csr", async (): Promise<void> => {
      const started = Date.now();
      // Messages are not relayed: an on-demand CSR build is a request/response, and the phase board
      // never carried a csr status for it before. The error travels in the response below.
      const result = await this.#batchRunner.run(
        await this.#batchRequest({ generation: this.#generation, needs: ["csr"], changedFiles: [] }),
      );
      const error = result.errors.csr;
      if (error) {
        this.#logger.error(`csr-build failed: ${error}`);
        await BuilderChannel.send({ type: "build-csr-res", id: msg.id, ok: false, error });
        return;
      }
      this.#csrActive = true;
      this.#logger.info(`csr-build ok on demand (${Date.now() - started}ms); rebuilding CSR on every save now`);
      await BuilderChannel.send({ type: "build-csr-res", id: msg.id, ok: true });
    });
  }

  #shouldRebuildCsr() {
    return this.#csrActive;
  }

  static #csrArmedByEnv() {
    return process.env.AKAN_DEV_CSR_REBUILD === "1";
  }

  /**
   * Build the boot artifact in a process that exits afterwards, and keep only the serializable result.
   *
   * This runs in a worker for the same reason every other build does, and it was the largest single
   * holdout: measured on `apps/akan`, `SsrBaseArtifactBuilder.build()` retains **+1143 MB** that
   * `Bun.gc(true)` cannot touch, which is 65 % of the builder's post-boot RSS. Nothing was lost by
   * moving it — the builder only ever kept `artifact` and `optimizedFonts`, both plain data, and the
   * artifact is written to `base-artifact.json` regardless.
   *
   * `GraphClientEntryDiscovery.create` stays here because route builds need it live, and it costs
   * nothing to keep: measured at **0 ms and 0 MB**, because it builds its graph lazily on first use.
   */
  static async #buildBootDeps(app: App, runner: BuildBatchRunner): Promise<IncrementalBuilderBootDeps> {
    const result = await runner.run({
      appName: app.name,
      workspaceRoot: app.workspace.workspaceRoot,
      repoName: app.workspace.repoName,
      generation: 0,
      needs: ["base"],
      changedFiles: [],
      // Discovered by the worker: at boot the watcher has no validated keys to seed, and the boot build
      // globs them itself anyway.
      pageKeys: null,
      optimizedFonts: null,
      cssAssets: null,
      artifactDir: path.resolve(`${app.cwdPath}/.akan/artifact`),
    });
    // A failed boot build has to throw, not degrade quietly: `main` catches this to enter the degraded
    // watch mode that keeps the dev server alive until the error is fixed.
    if (result.errors.base) throw new Error(result.errors.base);
    if (!result.artifact || !result.optimizedFonts)
      throw new Error("boot build reported success without an artifact; the build worker likely died");
    const discovery = await GraphClientEntryDiscovery.create(app);
    return { artifact: result.artifact, optimizedFonts: result.optimizedFonts, discovery };
  }

  /**
   * A session that already armed dev CSR keeps it armed across builder restarts through the env flag,
   * so the artifact has to be rebuilt for the replacement. Queued after `builder-ready` and run in a
   * disposable worker rather than inline: a full minified browser-target build of every page costs
   * ~350MB of bundler arena that an inline build would never give back, and nothing serves CSR until a
   * `/__csr` or `?csr=true` request arrives anyway.
   */
  async rearmCsrFromEnv(): Promise<void> {
    if (!IncrementalBuilder.#csrArmedByEnv()) return;
    this.#csrActive = true;
    await this.#enqueueWork("build-csr-rearm", async () => {
      const result = await this.#batchRunner.run(
        await this.#batchRequest({ generation: this.#generation, needs: ["csr"], changedFiles: [] }),
      );
      if (result.errors.csr) this.#logger.error(`csr-rearm failed: ${result.errors.csr}`);
      else this.#logger.verbose("csr-rearm ok; this session had CSR armed before the builder restarted");
    });
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
    runner: BuildBatchRunner,
  ): Promise<{ builder: IncrementalBuilder; changedFiles: string[] }> {
    const firstMessage = bootError instanceof Error ? bootError.message : String(bootError);
    logger.error(`boot build failed; entering degraded watch mode until the error is fixed: ${firstMessage}`);
    let generation = 0;
    const sendFailure = (files: string[], message: string) => {
      BuilderChannel.emit({
        type: "build-status",
        data: { generation, phase: "pages", ok: false, files, message: `Boot build failed: ${message}` },
      });
    };
    sendFailure([], firstMessage);
    BuilderChannel.emit({ type: "builder-ready" });
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
              const deps = await IncrementalBuilder.#buildBootDeps(app, runner);
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
        await watcher.start();
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
    // Registered before the boot build so backend requests get an error response (instead of hanging
    // the backend) while the builder is still booting or recovering from a failed build.
    const bootingError = "builder is recovering from a failed boot build; retry after the build error is fixed";
    const recyclingError = "builder is recycling to release bundler memory; retry after it restarts";
    process.on("message", (msg: BuilderMessage) => {
      if (!msg || typeof msg !== "object") return;
      if (msg.type === "builder-shutdown") {
        if (!builder) {
          logger.warn(`ignoring shutdown request (${msg.reason}); builder is still recovering from a failed boot`);
          return;
        }
        void builder.shutdown(msg.reason);
        return;
      }
      if (msg.type === "build-route") {
        const error = builder?.shuttingDown ? recyclingError : bootingError;
        if (!builder || builder.shuttingDown) {
          BuilderChannel.emit({ type: "build-route-res", id: msg.id, ok: false, error });
          return;
        }
        void builder.handleBuildRoute(msg);
        return;
      }
      if (msg.type === "build-csr") {
        const error = builder?.shuttingDown ? recyclingError : bootingError;
        if (!builder || builder.shuttingDown) {
          BuilderChannel.emit({ type: "build-csr-res", id: msg.id, ok: false, error });
          return;
        }
        void builder.handleBuildCsr(msg);
      }
    });
    // The IPC channel closes when the dev host dies (including SIGKILL); exit instead of running
    // as an orphaned watcher that keeps rebuilding for nobody. Nothing is drained here on purpose —
    // there is no longer anyone on the other end to flush to.
    process.on("disconnect", () => {
      logger.warn("host IPC channel closed; exiting builder");
      process.exit(0);
    });
    let recoveredFiles: string[] | null = null;
    // Owned by `main` rather than the instance: the boot build has to run before an instance exists, and
    // a degraded boot re-runs it once per file change until it succeeds.
    const bootRunner = new BuildBatchRunner({ workspaceRoot, cwd: app.cwdPath });
    try {
      builder = new IncrementalBuilder({ app, watch, ...(await IncrementalBuilder.#buildBootDeps(app, bootRunner)) });
    } catch (err) {
      if (!watch) throw err;
      const recovered = await IncrementalBuilder.#recoverBoot(app, err, logger, bootRunner);
      builder = recovered.builder;
      recoveredFiles = recovered.changedFiles;
    }
    await builder.boot();
    if (recoveredFiles) await builder.announceRecoveredState(recoveredFiles);
    else if (process.env.AKAN_BUILDER_ANNOUNCE_BOOT === "1") await builder.announceBootState();
    await builder.rearmCsrFromEnv();
  }
}

void IncrementalBuilder.main().catch((err) => {
  console.error(err);
  process.exit(1);
});
