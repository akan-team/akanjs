import { rm } from "node:fs/promises";
import path from "node:path";
// Module paths, never a barrel: the devkit and `frontendBuild` barrels would hold tailwindcss (~40MB), ssh2, ink
// and the cloud stack for the whole dev session (`entryModuleGraph.test.ts` enforces it).
import { ApplicationBuildReporter } from "@akanjs/devkit/applicationBuildReporter";
import { CodegenLock } from "@akanjs/devkit/codegenLock";
import type { App } from "@akanjs/devkit/commandDecorators";
import { AppExecutor, type PageRoot, WorkspaceExecutor } from "@akanjs/devkit/executors";
import { AutoImportSync } from "@akanjs/devkit/frontendBuild/autoImportSync";
import type { ClientEntryDiscovery } from "@akanjs/devkit/frontendBuild/clientBuildTypes";
import { GraphClientEntryDiscovery } from "@akanjs/devkit/frontendBuild/clientEntryDiscovery";
import { CsrDevBundler } from "@akanjs/devkit/frontendBuild/csrDevBundler";
import { CsrDevPatcher } from "@akanjs/devkit/frontendBuild/csrDevPatcher";
import { DevChangePlanner } from "@akanjs/devkit/frontendBuild/devChangePlanner";
import { DevGeneratedIndexSync } from "@akanjs/devkit/frontendBuild/devGeneratedIndexSync";
import { HmrWatcher } from "@akanjs/devkit/frontendBuild/hmrWatcher";
import { RouteClientBuilder } from "@akanjs/devkit/frontendBuild/routeClientBuilder";
import { ServerGraphFile } from "@akanjs/devkit/frontendBuild/serverGraphFile";
import { SsrDevBundler } from "@akanjs/devkit/frontendBuild/ssrDevBundler";
import { WatchRootResolver } from "@akanjs/devkit/frontendBuild/watchRootResolver";
import { hasUseClientDirective, scanUseClientExports } from "@akanjs/devkit/transforms/rscUseClientTransform";
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
  HmrTrace,
} from "akanjs/server";
import { CSR_DEV_PATCHING_MARKER, resolveDevSsrClientMode } from "akanjs/server/hmr/csrDevManifest";
import type { BuildBatchNeed, BuildBatchRequest, BuildBatchResult, OptimizedFonts } from "./buildBatchProtocol";
import { BuildBatchRunner } from "./buildBatchRunner";
import { BuilderChannel } from "./builderChannel";
import { type BatchJob, BuilderWorkQueue } from "./builderWorkQueue";
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
type BatchWork = Pick<BuildBatchRequest, "generation" | "needs" | "changedFiles" | "trace">;

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
  #csrBundler: CsrDevBundler;
  /** Null when `AKAN_DEV_CSR_PATCHER=off`: every CSR save then goes to a build worker, as before the patcher. */
  #patcher: CsrDevPatcher | null;
  /** A worker's full CSR build (arming, re-arming) that a patch must not race for the csr-dev directory. */
  #csrGate: Promise<void> = Promise.resolve();
  /** Set under `AKAN_DEV_SSR_CLIENT=registry`: SSR pages load their client code from this registry, not route chunks. */
  #ssrBundler: SsrDevBundler | null;
  #ssrPatcher: CsrDevPatcher | null;
  //* Serializes everything that writes ssr-dev: a save's patch (fast lane), a route build adding the entries it names,
  //* and a worker's full build (slow lane). Never held while awaiting the slow lane, which a route build may be in.
  #ssrLock: Promise<void> = Promise.resolve();
  //* Two lanes: a save's codegen and CSR patch in the fast one, which the watcher waits for; build workers, route
  //* builds and discovery in the slow one, which folds queued batches. A save no longer waits behind pages and css.
  #fastQueue: Promise<void> = Promise.resolve();
  #workQueue: BuilderWorkQueue;
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
    this.#csrBundler = new CsrDevBundler(options.app);
    this.#patcher =
      process.env.AKAN_DEV_CSR_PATCHER === "off" ? null : new CsrDevPatcher(this.#csrBundler, { resident: true });
    this.#ssrBundler = resolveDevSsrClientMode() === "registry" ? new SsrDevBundler(options.app) : null;
    this.#ssrPatcher =
      this.#ssrBundler && process.env.AKAN_DEV_CSR_PATCHER !== "off"
        ? new CsrDevPatcher(this.#ssrBundler, { resident: true })
        : null;
    this.#workQueue = new BuilderWorkQueue({
      runBatch: async (batch) => await this.#runQueuedBatch(batch),
      onSettled: (label, ms) => {
        this.#workCount += 1;
        this.#logger.verbose(`[work-queue] ${label} finished in ${ms}ms`);
        this.#reportMetrics();
      },
    });
  }

  get #artifactDir() {
    return `${this.#app.cwdPath}/.akan/artifact`;
  }

  // The reply is part of the work item on purpose: `shutdown` drains the queue, so "drained" must mean "answered".
  async handleBuildRoute(msg: BuilderReq): Promise<void> {
    await this.#workQueue.enqueue(`build-route:${msg.routeId}`, async () =>
      BuilderChannel.send(await this.#handleBuildRoute(msg)),
    );
  }

  async #handleBuildRoute(msg: BuilderReq): Promise<BuilderRes> {
    try {
      const delta = await new RouteClientBuilder({
        app: this.#app,
        routeId: msg.routeId,
        seeds: msg.seeds,
        graphSeeds: msg.graphSeeds,
        artifact: this.#artifact,
        knownEntries: new Set<string>(msg.knownEntries),
        discovery: this.#discovery,
        browser: this.#ssrBundler ? "registry" : "chunks",
      }).build();
      await this.#ensureSsrEntries(delta.registryEntries ?? [], msg.generation);
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
      const errMsg = ApplicationBuildReporter.formatError(err, this.#app.workspace.workspaceRoot);
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
  async #enqueueFast<T>(label: string, fn: () => Promise<T>): Promise<T> {
    const started = Date.now();
    this.#inFlight += 1;
    const run = this.#fastQueue.then(fn, fn);
    this.#fastQueue = run.then(() => undefined).catch(() => undefined);
    try {
      return await run;
    } finally {
      this.#inFlight -= 1;
      this.#workCount += 1;
      this.#logger.verbose(`[fast-queue] ${label} finished in ${Date.now() - started}ms`);
      this.#reportMetrics();
    }
  }

  get #idle(): boolean {
    return this.#inFlight === 0 && this.#workQueue.size === 0 && this.#cssRebuildTimer === null;
  }

  // Idle only: the host recycles on these metrics, and a recycle decided mid-work would truncate it or race the drain.
  #reportMetrics(): void {
    if (!this.#idle || this.#shuttingDown) return;
    BuilderChannel.emit({
      type: "builder-metrics",
      data: { rssBytes: process.memoryUsage.rss(), generation: this.#generation, workCount: this.#workCount },
    });
  }

  // Exits so the OS reclaims the bundler arenas; the host spawns the replacement.
  async shutdown(reason: string): Promise<void> {
    if (this.#shuttingDown) return;
    this.#shuttingDown = true;
    const started = Date.now();
    this.#logger.debug(`shutdown requested (${reason}); draining ${this.#inFlight} work item(s)`);
    // Before the drain: a save landing mid-drain would queue behind the awaited tail and `process.exit` would cut
    // its artifacts off half-written; the replacement's boot build redoes that work anyway.
    this.#watcher?.stop();
    if (this.#cssRebuildTimer) {
      // Only if css landed after the idle report; the replacement's boot build recompiles css, so nothing is lost.
      clearTimeout(this.#cssRebuildTimer);
      this.#cssRebuildTimer = null;
      this.#pendingCssRebuild = null;
    }
    // The fast lane first: a save it is still handling may queue a batch in the slow one.
    await this.#fastQueue.catch(() => undefined);
    await this.#workQueue.drain();
    await this.#cssRebuildQueue.catch(() => undefined);
    // Drained queues are not delivered results: `process.exit` drops unflushed ipc writes (a relayed `css-updated`).
    const flushed = await BuilderChannel.drain();
    this.#logger.debug(
      `drained in ${Date.now() - started}ms${flushed ? ` after flushing ${flushed} ipc write(s)` : ""}; exiting for recycle`,
    );
    process.exit(0);
  }

  get shuttingDown(): boolean {
    return this.#shuttingDown;
  }
  //* Watch events carry real paths: synced lib pages match by `realDir`, their keys keep the `(libs)/(<lib>)` prefix.
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
    const roots = await new WatchRootResolver(this.#app).resolve();
    const watcher = new HmrWatcher({
      roots,
      logger: this.#logger,
      onBatch: async (batch: ChangeBatch) => {
        await this.#enqueueFast("hmr-batch", async () => this.#handleWatchBatch(batch));
      },
    });
    await watcher.start();
    this.#watcher = watcher;
    this.#logger.verbose(`watching ${roots.length} roots`);
  }

  async #handleWatchBatch(batch: ChangeBatch) {
    const rawKinds = new Set(batch.kinds);
    if (rawKinds.size === 0) return;
    const generation = ++this.#generation;
    const trace = { ...batch.trace, batchAt: Date.now() };
    //* Auto-import edits touch only this batch's files, so they rebuild in this same generation.
    const [autoImport, indexSync] = await CodegenLock.run(
      this.#app.workspace.workspaceRoot,
      `hmr-batch:${this.#app.name}`,
      async () => {
        const auto = await this.#autoImportSync.syncForBatch(batch.files);
        return [auto, await this.#generatedIndexSync.syncForBatch(batch.files)] as const;
      },
    );
    for (const error of autoImport.errors) this.#logger.error(error);
    if (autoImport.changedFiles.length > 0)
      this.#logger.verbose(`[auto-import] inserted imports into ${autoImport.changedFiles.length} file(s)`);
    //* Absorbed so the watcher's verification scan does not replay these writes as a user edit next generation.
    await this.#watcher?.absorb([...autoImport.changedFiles, ...indexSync.changedFiles]);
    const { files, kinds, expandedBatch, devPlan, event, hasSyncErrors } = prepareDevWatchBatch({
      generation,
      batch,
      indexSync,
      changePlanner: this.#changePlanner,
    });
    this.#logger.verbose(
      `[hmr] batch generation=${generation} kinds=${kinds.join(",")} files=${files.length} generated=${indexSync.changedFiles.length} roles=${devPlan.roles.join(",") || "(none)"} actions=${devPlan.actions.join(",") || "(none)"}`,
    );
    for (const error of indexSync.errors) this.#logger.error(error);

    // Route builds are the only reader, and they run in the slow lane: invalidating there keeps it still under them.
    const discovery = kinds.includes("code") ? { files, refresh: kinds.includes("config") } : undefined;

    if (hasSyncErrors) {
      this.#sendBuildStatus("barrel", { generation, ok: false, files, message: indexSync.errors.join("\n") });
      BuilderChannel.emit(event);
      if (discovery) void this.#workQueue.enqueue("discovery", async () => await this.#refreshDiscovery(discovery));
      return;
    }
    if (indexSync.changedFiles.length > 0) this.#sendBuildStatus("barrel", { generation, ok: true, files });

    // Server-only generations skip the client: a fresh pages buildId would rsc-refresh browsers for no visible change.
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

    BuilderChannel.emit(event);

    if (kinds.includes("code") && rebuildClient) {
      // Css rides the pages batch rather than its own debounce: the slow lane folds a burst of saves into one batch.
      const needs: BuildBatchNeed[] = ["pages", "css"];
      if (!this.#csrActive)
        this.#logger.verbose(
          `csr-rebundle skipped; request /__csr or ?csr=true (or set AKAN_DEV_CSR_REBUILD=1) to enable per-save CSR rebuilds`,
        );
      else if (!this.#patcher || (await this.#patchCsr(generation, files, trace))) needs.unshift("csr");
      if (this.#ssrBundler && (await this.#patchSsr(generation, files, trace))) needs.unshift("ssr");
      const batch: BatchJob = { generation, needs, changedFiles: files, trace, ...(discovery ? { discovery } : {}) };
      // A worker's registry build rewrites the directory its patcher reads, so the next save waits for it.
      if (needs.includes("csr") || needs.includes("ssr")) {
        await this.#workQueue.enqueueBatch(batch);
        if (needs.includes("csr")) this.#patcher?.forget();
        if (needs.includes("ssr")) this.#ssrPatcher?.forget();
      } else void this.#workQueue.enqueueBatch(batch);
      return;
    }
    if (discovery) void this.#workQueue.enqueue("discovery", async () => await this.#refreshDiscovery(discovery));
    // Css-only batches keep the debounce: they arrive in bursts while a stylesheet is edited.
    if (kinds.includes("css")) {
      this.scheduleCssRebuild({ generation, changedFiles: files });
      this.#logger.verbose(`css-rebuild scheduled generation=${generation}`);
    }
  }

  // True when the save has to go to a build worker: the patcher handed it back, or threw (the worker reports why).
  async #patchCsr(generation: number, files: string[], trace: HmrTrace): Promise<boolean> {
    const patcher = this.#patcher;
    if (!patcher) return true;
    await this.#csrGate;
    const started = Date.now();
    const marker = path.join(this.#csrBundler.outDir, CSR_DEV_PATCHING_MARKER);
    await Bun.write(marker, String(process.pid));
    try {
      const result = await patcher.update(files, {
        announce: (update) => {
          const now = Date.now();
          BuilderChannel.emit({
            type: "csr-updated",
            data: {
              generation: update.generation,
              mode: "registry",
              reload: update.reload,
              reason: update.reason,
              patchUrl: update.patchUrl,
              changedIds: update.changedIds,
              trace: { ...trace, patchAt: now, sentAt: now },
            },
          });
        },
      });
      if (result.kind === "delegate") {
        this.#logger.verbose(`csr-patch handed to a build worker: ${result.reason}`);
        return true;
      }
      this.#sendBuildStatus("csr", { generation, ok: true, files });
      this.#logger.verbose(
        result.kind === "unchanged"
          ? `csr-patch unchanged (${Date.now() - started}ms)`
          : `csr-patch generation=${result.update.generation} ${result.update.reload ? `reload (${result.update.reason})` : `patch modules=${result.update.changedIds.length}`} (${Date.now() - started}ms)`,
      );
      return false;
    } catch (err) {
      this.#logger.verbose(
        `csr-patch threw; a build worker takes this save: ${ApplicationBuildReporter.formatError(err, this.#app.workspace.workspaceRoot)}`,
      );
      patcher.forget();
      return true;
    } finally {
      await rm(marker, { force: true });
    }
  }

  // True when the save has to go to a build worker, as for CSR.
  async #patchSsr(generation: number, files: string[], trace: HmrTrace): Promise<boolean> {
    const patcher = this.#ssrPatcher;
    if (!patcher) return true;
    const hold = await ServerGraphFile.touches(await ServerGraphFile.read(this.#artifactDir), files, (file) =>
      IncrementalBuilder.#clientExportsOf(file),
    );
    return await this.#withSsrLock(
      async () => await this.#runSsrPatcher(patcher, files, { trace, hold, batchGeneration: generation }),
    );
  }

  static async #clientExportsOf(file: string): Promise<string[] | null> {
    const source = await Bun.file(file)
      .text()
      .catch(() => null);
    if (source === null || !hasUseClientDirective(source)) return null;
    try {
      return scanUseClientExports(source, file);
    } catch {
      // A module the server can no longer read as client references is a server change; the pages build says why.
      return null;
    }
  }

  // A route build answers only once the registry holds every entry its rows name: the tab requires them by id.
  async #ensureSsrEntries(entries: string[], generation?: number): Promise<void> {
    if (!this.#ssrBundler || entries.length === 0) return;
    await this.#withSsrLock(async () => {
      if (this.#ssrPatcher && !(await this.#runSsrPatcher(this.#ssrPatcher, [], { roots: entries }))) return;
      await this.#runSsrWorker(generation ?? this.#generation);
    });
  }

  // The boot build of the SSR registry: a worker in the slow lane, so the first route builds queue behind it.
  async armSsrRegistry(): Promise<void> {
    if (!this.#ssrBundler) return;
    await this.#workQueue
      .enqueue("ssr-arm", async () => {
        await this.#withSsrLock(async () => {
          if (this.#ssrPatcher && !(await this.#runSsrPatcher(this.#ssrPatcher, []))) return;
          await this.#runSsrWorker(this.#generation);
        });
      })
      .catch((err: unknown) => {
        this.#logger.error(
          `ssr-registry boot build failed; the next save retries it: ${ApplicationBuildReporter.formatError(err, this.#app.workspace.workspaceRoot)}`,
        );
      });
  }

  async #withSsrLock<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.#ssrLock.then(fn, fn);
    this.#ssrLock = run.then(
      () => undefined,
      () => undefined,
    );
    return await run;
  }

  // Runs the worker directly: every caller is already in the slow lane or holds the lock no worker batch takes.
  async #runSsrWorker(generation: number): Promise<void> {
    const result = await this.#runBatch({ generation, needs: ["ssr"], changedFiles: [] });
    this.#ssrPatcher?.forget();
    if (result.errors.ssr) throw new Error(result.errors.ssr);
  }

  async #runSsrPatcher(
    patcher: CsrDevPatcher,
    files: string[],
    {
      roots,
      trace,
      hold,
      batchGeneration,
    }: { roots?: string[]; trace?: HmrTrace; hold?: boolean; batchGeneration?: number } = {},
  ): Promise<boolean> {
    const outDir = this.#ssrBundler?.outDir;
    if (!outDir) return false;
    const started = Date.now();
    const marker = path.join(outDir, CSR_DEV_PATCHING_MARKER);
    await Bun.write(marker, String(process.pid));
    try {
      const result = await patcher.update(files, {
        roots,
        announce: (update) => {
          const now = Date.now();
          BuilderChannel.emit({
            type: "ssr-updated",
            data: {
              generation: update.generation,
              reload: update.reload,
              reason: update.reason,
              patchUrl: update.patchUrl,
              changedIds: update.changedIds,
              ...(trace ? { trace: { ...trace, patchAt: now, sentAt: now } } : {}),
              ...(hold ? { hold } : {}),
              ...(batchGeneration !== undefined ? { batchGeneration } : {}),
            },
          });
        },
      });
      if (result.kind === "delegate") {
        this.#logger.verbose(`ssr-patch handed to a build worker: ${result.reason}`);
        return true;
      }
      this.#sendBuildStatus("ssr", { generation: batchGeneration, ok: true, files });
      this.#logger.verbose(
        result.kind === "unchanged"
          ? `ssr-patch unchanged (${Date.now() - started}ms)`
          : `ssr-patch generation=${result.update.generation} ${result.update.reload ? `reload (${result.update.reason})` : `patch modules=${result.update.changedIds.length}`} (${Date.now() - started}ms)`,
      );
      return false;
    } catch (err) {
      this.#logger.verbose(
        `ssr-patch threw; a build worker takes it: ${ApplicationBuildReporter.formatError(err, this.#app.workspace.workspaceRoot)}`,
      );
      patcher.forget();
      return true;
    } finally {
      await rm(marker, { force: true });
    }
  }

  async #runQueuedBatch({ discovery, ...work }: BatchJob): Promise<void> {
    if (discovery) await this.#refreshDiscovery(discovery);
    await this.#runBatch(work);
  }

  async #refreshDiscovery({ files, refresh }: { files: string[]; refresh: boolean }): Promise<void> {
    const started = Date.now();
    if (refresh) this.#discovery = await GraphClientEntryDiscovery.create(this.#app);
    else this.#discovery.invalidate?.(files);
    this.#logger.verbose(`client-entry-discovery ${refresh ? "refreshed" : "invalidated"} (${Date.now() - started}ms)`);
  }

  async #runBatch(work: BatchWork): Promise<BuildBatchResult> {
    const { generation, needs, changedFiles } = work;
    const started = Date.now();
    const result = await this.#batchRunner.run(await this.#batchRequest(work), (msg) => BuilderChannel.emit(msg));
    if (result.optimizedFonts) this.#optimizedFonts = result.optimizedFonts;
    if (result.cssAssets) this.#artifact = { ...this.#artifact, cssAssets: result.cssAssets };
    // A crashed worker streamed no build-status, so each need goes red here instead of looking silently successful.
    if (result.crashed) {
      // `base` is not a `BuildPhase` and never comes through here: `#buildBootDeps` throws into the degraded boot.
      for (const need of needs)
        if (need !== "base")
          this.#sendBuildStatus(need, { generation, ok: false, files: changedFiles, message: result.errors[need] });
    }
    if (needs.includes("css")) this.#logger.verbose(`css-rebuild checked (${Date.now() - started}ms)`);
    return result;
  }

  async #batchRequest({ generation, needs, changedFiles, trace }: BatchWork): Promise<BuildBatchRequest> {
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
      ...(trace ? { trace } : {}),
    };
  }

  async boot(): Promise<void> {
    if (this.#watch) await this.installWatcher();
    BuilderChannel.emit({ type: "builder-ready" });
    this.#logger.verbose(`ready (watch=${this.#watch})`);
  }

  // The backend still serves the last-good bundle after a degraded boot; push fresh pages/css without another edit.
  async announceRecoveredState(changedFiles: string[]): Promise<void> {
    const generation = ++this.#generation;
    await this.#workQueue.enqueue("boot-recovered", async () => {
      await this.#runBatch({ generation, needs: ["pages", "css"], changedFiles });
    });
  }

  // The backend reads base-artifact.json once, at its boot. Re-announced from disk rather than rebuilt (this process
  // was recycled to free bundler memory); the host drops it when hashes match, so a clean recycle reloads nothing.
  async announceBootState(): Promise<void> {
    const generation = ++this.#generation;
    const reason = "builder-recycle" as const;
    // Awaited, not emitted: the host may shut this builder down any moment, so "announced" must mean flushed.
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

  // On demand: dev serves CSR only via the opt-in `/__csr` and `?csr=true` routes; once built, it rebuilds every save.
  async handleBuildCsr(msg: BuilderCsrReq): Promise<void> {
    const armed = this.#workQueue.enqueue("build-csr", async (): Promise<void> => {
      const started = Date.now();
      // Not relayed: an on-demand CSR build is request/response, and its error travels in the response.
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
      this.#patcher?.forget();
      this.#logger.info(`csr-build ok on demand (${Date.now() - started}ms); rebuilding CSR on every save now`);
      await BuilderChannel.send({ type: "build-csr-res", id: msg.id, ok: true });
    });
    this.#csrGate = armed.catch(() => undefined);
    await armed;
  }

  static #csrArmedByEnv() {
    return process.env.AKAN_DEV_CSR_REBUILD === "1";
  }

  // Discovery stays in-process because route builds need it live; it is free at boot, building its graph lazily.
  static async #buildBootDeps(app: App, runner: BuildBatchRunner): Promise<IncrementalBuilderBootDeps> {
    const result = await runner.run({
      appName: app.name,
      workspaceRoot: app.workspace.workspaceRoot,
      repoName: app.workspace.repoName,
      generation: 0,
      needs: ["base"],
      changedFiles: [],
      pageKeys: null,
      optimizedFonts: null,
      cssAssets: null,
      artifactDir: path.resolve(`${app.cwdPath}/.akan/artifact`),
    });
    // Throws rather than degrading quietly: `main` catches it to enter degraded watch mode.
    if (result.errors.base) throw new Error(result.errors.base);
    if (!result.artifact || !result.optimizedFonts)
      throw new Error("boot build reported success without an artifact; the build worker likely died");
    const discovery = await GraphClientEntryDiscovery.create(app);
    return { artifact: result.artifact, optimizedFonts: result.optimizedFonts, discovery };
  }

  // The env flag carries an armed CSR session across builder restarts, so the replacement rebuilds it after ready.
  async rearmCsrFromEnv(): Promise<void> {
    if (!IncrementalBuilder.#csrArmedByEnv()) return;
    this.#csrActive = true;
    const rearmed = this.#workQueue.enqueue("build-csr-rearm", async () => {
      const result = await this.#batchRunner.run(
        await this.#batchRequest({ generation: this.#generation, needs: ["csr"], changedFiles: [] }),
      );
      this.#patcher?.forget();
      if (result.errors.csr) this.#logger.error(`csr-rearm failed: ${result.errors.csr}`);
      else this.#logger.verbose("csr-rearm ok; this session had CSR armed before the builder restarted");
    });
    this.#csrGate = rearmed.catch(() => undefined);
    await rearmed;
  }

  // A boot compile error must not kill the builder, the dev server's only file watcher: report it, emit builder-ready
  // so the backend keeps the last-good artifact, and retry the boot build on every change.
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
    // Registered before the boot build so a request during boot or recovery gets an error instead of hanging.
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
      if (msg.type !== "build-route" && msg.type !== "build-csr") return;
      if (!builder || builder.shuttingDown) {
        const error = builder?.shuttingDown ? recyclingError : bootingError;
        BuilderChannel.emit({ type: `${msg.type}-res`, id: msg.id, ok: false, error });
        return;
      }
      if (msg.type === "build-route") void builder.handleBuildRoute(msg);
      else void builder.handleBuildCsr(msg);
    });
    // Closes when the host dies (even by SIGKILL): nothing left to drain, and an orphan would rebuild for nobody.
    process.on("disconnect", () => {
      logger.warn("host IPC channel closed; exiting builder");
      process.exit(0);
    });
    let recoveredFiles: string[] | null = null;
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
    await Promise.all([builder.rearmCsrFromEnv(), builder.armSsrRegistry()]);
  }
}

// Awaited, not voided: on Windows Bun exits during a missing file's `Bun.file` read unless an entry await is pending.
await IncrementalBuilder.main().catch((err) => {
  console.error(err);
  process.exit(1);
});
