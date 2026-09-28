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
import { CSR_DEV_PATCHING_MARKER } from "akanjs/server/hmr/csrDevManifest";
import type { BuildBatchNeed, BuildBatchRequest, BuildBatchResult, OptimizedFonts } from "./buildBatchProtocol";
import { BuildBatchRunner } from "./buildBatchRunner";
import { BuilderChannel } from "./builderChannel";
import { type BatchJob, BuilderWorkQueue, type DiscoveryJob } from "./builderWorkQueue";
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
  #discoveredThrough = 0;
  #csrActive = IncrementalBuilder.#csrArmedByEnv();
  #csrBundler: CsrDevBundler;
  /** Null when `AKAN_DEV_CSR_PATCHER=off`: every CSR save then goes to a build worker, as before the patcher. */
  #patcher: CsrDevPatcher | null;
  /** A worker's full CSR build (arming, re-arming) that a patch must not race for the csr-dev directory. */
  #csrGate: Promise<void> = Promise.resolve();
  #csrArming = false;
  #csrArms = 0;
  #crashRetryTimer: ReturnType<typeof setTimeout> | null = null;
  readonly #crashRetryEntries = new Set<string>();
  #csrWasActive = false;
  #csrArmSucceeded = false;
  /** Where SSR pages load their client code from in dev; route builds bundle only its server half. */
  #ssrBundler: SsrDevBundler;
  /** Null when `AKAN_DEV_CSR_PATCHER=off`: every registry save then goes to a build worker. */
  #ssrPatcher: CsrDevPatcher | null;
  //* Serializes everything that writes ssr-dev: a save's patch (fast lane), a route build adding the entries it names,
  //* a queued worker batch with the ssr need, and the boot build. Never held while awaiting the slow lane.
  #ssrLock: Promise<void> = Promise.resolve();
  /** How often each reason sent a registry save to a build worker this session: the resident patcher's miss rate. */
  readonly #delegations = new Map<string, number>();
  /** The boot build of the SSR registry while it runs; it holds every entry the routes reach once it lands. */
  #ssrArming: Promise<void> | null = null;
  //* A registry build that failed on the user's code fails again until the code changes, so route builds do not retry
  //* it; the next attempt that touches the registry (a save's patch, a worker batch) settles it. A worker that died
  //* before reporting (an OOM kill) route builds do retry, at most every `#crashRetryMs`.
  #ssrBroken = false;
  #ssrCrashedAt: number | null = null;
  static readonly #crashRetryMs = 10_000;
  /** Arming and the route entries deferred behind it run beside both lanes; a recycle waits for them too. */
  readonly #beside = new Set<Promise<void>>();
  #barrelFailed = false;
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
    this.#discoveredThrough = this.#generation;
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
    this.#ssrBundler = new SsrDevBundler(options.app, { discovery: () => this.#discovery });
    this.#ssrPatcher =
      process.env.AKAN_DEV_CSR_PATCHER === "off" ? null : new CsrDevPatcher(this.#ssrBundler, { resident: true });
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
    const seenGeneration = this.#discoveredThrough;
    try {
      const delta = await new RouteClientBuilder({
        app: this.#app,
        routeId: msg.routeId,
        seeds: msg.seeds,
        graphSeeds: msg.graphSeeds,
        artifact: this.#artifact,
        knownEntries: new Set<string>(msg.knownEntries),
        discovery: this.#discovery,
        browser: "registry",
      }).build();
      await this.#ensureSsrEntries(delta.registryEntries ?? []);
      this.#logger.verbose(`build-route ok routeId=${msg.routeId} newEntries=${delta.newEntries.length}`);
      //? The builder's generation, not the route cache's: the cache's does not move when a fixed file maps to no entry,
      //? so the rebuild's ok would carry the failure's own number.
      this.#sendBuildStatus("route", { generation: this.#generation, ok: true, files: msg.seeds, scope: msg.routeId });
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
          seenGeneration,
        } as BuildRouteResultPayload,
      };
    } catch (err) {
      const errMsg = ApplicationBuildReporter.formatError(err, this.#app.workspace.workspaceRoot);
      this.#logger.error(`build-route failed routeId=${msg.routeId}: ${errMsg}`);
      this.#sendBuildStatus("route", {
        generation: this.#generation,
        ok: false,
        files: msg.seeds,
        message: errMsg,
        scope: msg.routeId,
      });
      return { type: "build-route-res", id: msg.id, ok: false, error: errMsg };
    }
  }
  #sendBuildStatus(
    phase: BuildPhase,
    {
      generation,
      ok,
      files,
      message,
      scope,
    }: { generation?: number; ok: boolean; files?: string[]; message?: string; scope?: string },
  ): void {
    if (typeof generation !== "number") return;
    BuilderChannel.emit({
      type: "build-status",
      data: { generation, phase, ok, files: files ?? [], message, ...(scope !== undefined ? { scope } : {}) },
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

  // Callers catch their own errors: the promise handed in never rejects.
  #runBeside(work: Promise<void>): Promise<void> {
    this.#inFlight += 1;
    const tracked: Promise<void> = work.finally(() => {
      this.#inFlight -= 1;
      this.#beside.delete(tracked);
      this.#reportMetrics();
    });
    this.#beside.add(tracked);
    return tracked;
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
    while (this.#beside.size > 0) await Promise.all([...this.#beside]);
    if (this.#delegations.size > 0)
      this.#logger.verbose(
        `registry saves handed to build workers this session: ${[...this.#delegations].map(([reason, count]) => `${reason}=${count}`).join(", ")}`,
      );
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

    // Invalidated in the slow lane, under the route builds that read it; a registry check reading it beside them caches
    // nothing a walk began before the invalidation (the discovery's epoch).
    const discovery = kinds.includes("code") ? { files, refresh: kinds.includes("config"), generation } : undefined;

    if (hasSyncErrors) {
      this.#barrelFailed = true;
      this.#sendBuildStatus("barrel", { generation, ok: false, files, message: indexSync.errors.join("\n") });
      BuilderChannel.emit(event);
      if (discovery)
        void this.#workQueue
          .enqueue("discovery", async () => await this.#refreshDiscovery(discovery))
          .catch(this.#slowLaneFailed("discovery"));
      return;
    }
    // After a failure too, where nothing changed on disk: the host re-sends a phase still failing to every new tab.
    if (indexSync.changedFiles.length > 0 || this.#barrelFailed)
      this.#sendBuildStatus("barrel", { generation, ok: true, files });
    this.#barrelFailed = false;

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
      //? One after the other, since two compiles side by side slow both. CSR goes first unless its build is being armed:
      //? a CSR patch then waits behind #csrGate, which SSR tabs must not.
      const patchCsr = async () => (this.#csrActive ? await this.#patchCsr(generation, files, trace) : false);
      const patchSsr = async () => await this.#patchSsr(generation, files, trace);
      let csrToWorker: boolean;
      let ssrToWorker: boolean;
      if (this.#csrArming) {
        ssrToWorker = await patchSsr();
        csrToWorker = await patchCsr();
      } else {
        csrToWorker = await patchCsr();
        ssrToWorker = await patchSsr();
      }
      if (csrToWorker) needs.unshift("csr");
      if (ssrToWorker) needs.unshift("ssr");
      const batch: BatchJob = { generation, needs, changedFiles: files, trace, ...(discovery ? { discovery } : {}) };
      // A worker's registry build rewrites the directory its patcher reads, so the next save waits for it.
      if (needs.includes("csr") || needs.includes("ssr")) await this.#workQueue.enqueueBatch(batch);
      else void this.#workQueue.enqueueBatch(batch).catch(this.#slowLaneFailed("batch"));
      return;
    }
    if (discovery)
      void this.#workQueue
        .enqueue("discovery", async () => await this.#refreshDiscovery(discovery))
        .catch(this.#slowLaneFailed("discovery"));
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
    // The arming build this save waited for failed: CSR is off again, and the next request arms it anew.
    if (!this.#csrActive) return false;
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
        this.#logger.verbose(
          `csr-patch handed to a build worker (${this.#countDelegation("csr", result.reason)}): ${result.reason}`,
        );
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
      const message = ApplicationBuildReporter.formatError(err, this.#app.workspace.workspaceRoot);
      if (IncrementalBuilder.#isCompileError(err)) {
        this.#sendBuildStatus("csr", { generation, ok: false, files, message });
        return false;
      }
      this.#logger.verbose(`csr-patch threw; a build worker takes this save: ${message}`);
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
      ServerGraphFile.clientExportsOf(file),
    );
    //? Ahead of this save's own discovery job in the slow lane: which client entries a page still names decides which
    //? pending roots this patch keeps.
    this.#discovery.invalidate?.(files);
    return await this.#withSsrLock(
      async () => await this.#runSsrPatcher(patcher, files, { trace, hold, batchGeneration: generation }),
    );
  }

  //* Adds the entries a route build names to the registry, since the tab requires them by id. A registry that cannot
  //* take them fails no route build: the page answers, and its tab waits for the registry while the overlay says why.
  async #ensureSsrEntries(entries: string[], { crashRetry = false }: { crashRetry?: boolean } = {}): Promise<void> {
    if (entries.length === 0) return;
    //? The boot build takes every entry the routes reach, so the first page answers now and its tab waits for the
    //? registry (boot.json) instead; whatever that build missed is added right after it lands.
    const arming = this.#ssrArming;
    if (arming) {
      void this.#runBeside(
        arming
          .then(async () => await this.#ensureSsrEntries(entries, { crashRetry }))
          .catch(this.#slowLaneFailed("ssr-ensure")),
      );
      return;
    }
    await this.#withSsrLock(async () => {
      const patcher = this.#ssrPatcher;
      // The builder's generation, not the request's: its build-status joins the saves' `ssr` ones.
      const generation = this.#generation;
      if (
        patcher &&
        !(await this.#runSsrPatcher(patcher, [], { roots: entries, onlyRoots: true, batchGeneration: generation }))
      )
        return;
      //? Read, not compiled: with the patcher off, the save's own worker batch already built every entry.
      if (!patcher && (await this.#ssrBundler.holds(entries))) return;
      //? Not retried per route build: the save that fixes the error rebuilds it, where each route build retrying held
      //? the SSR lock that save's patch waits on.
      if (this.#ssrBroken) return;
      if (this.#ssrCrashedAt !== null && Date.now() - this.#ssrCrashedAt < IncrementalBuilder.#crashRetryMs) {
        //? Handed over just now with nothing run for them: the retry must find them to hand over again.
        patcher?.releaseHandedOver();
        this.#retryAfterCrash(this.#ssrCrashedAt, entries);
        return;
      }
      await this.#runSsrWorker(generation).catch((err: unknown) => {
        this.#logger.error(
          `ssr-registry could not take a route's entries; the save that fixes it rebuilds it: ${ApplicationBuildReporter.formatError(err, this.#app.workspace.workspaceRoot)}`,
        );
      });
      //? A worker that died took these entries with it and left them pending nowhere: they are tried once more after the
      //? crash window, but a retry that crashes again waits for the next route build or save.
      if (this.#ssrCrashedAt !== null && !crashRetry) this.#retryAfterCrash(this.#ssrCrashedAt, entries);
    });
  }

  //? Once the crash window closes, for the entries skipped in it: later route builds may name none (the first one
  //? announced every entry to the route cache), so without this a tab could wait on boot.json until the next save.
  #retryAfterCrash(crashedAt: number, entries: string[]): void {
    for (const entry of entries) this.#crashRetryEntries.add(entry);
    if (this.#crashRetryTimer) return;
    const timer = setTimeout(
      () => {
        this.#crashRetryTimer = null;
        const retried = [...this.#crashRetryEntries];
        this.#crashRetryEntries.clear();
        if (this.shuttingDown || retried.length === 0) return;
        void this.#runBeside(this.#ensureSsrEntries(retried, { crashRetry: true })).catch(
          this.#slowLaneFailed("ssr-crash-retry"),
        );
      },
      Math.max(0, crashedAt + IncrementalBuilder.#crashRetryMs - Date.now()),
    );
    timer.unref?.();
    this.#crashRetryTimer = timer;
  }

  //* The boot build of the SSR registry runs beside the slow lane, holding only the SSR lock: the first page's route
  //* build bundles meanwhile instead of queueing behind it (on apps/akan it cost the first page about a second).
  async armSsrRegistry(): Promise<void> {
    //? `AKAN_DEV_SSR_ARM_DELAY_MS` is a test hook: an E2E has a tab reconnect before the boot build has run.
    const delayMs = Number(process.env.AKAN_DEV_SSR_ARM_DELAY_MS);
    if (Number.isInteger(delayMs) && delayMs > 0) await Bun.sleep(delayMs);
    const arm = async () =>
      await this.#withSsrLock(async () => {
        const generation = this.#generation;
        if (this.#ssrPatcher && !(await this.#runSsrPatcher(this.#ssrPatcher, [], { batchGeneration: generation })))
          return;
        await this.#runSsrWorker(generation);
      }).catch((err: unknown) => {
        this.#logger.error(
          `ssr-registry boot build failed; the next save retries it: ${ApplicationBuildReporter.formatError(err, this.#app.workspace.workspaceRoot)}`,
        );
      });
    const arming = this.#runBeside(
      (async () => {
        await arm();
        //? A boot build whose worker was killed (a small container's OOM) is tried once more before `boot-armed` lets
        //? the next app boot: retried after that, the two biggest workers of a boot would run side by side.
        const crashedAt = this.#ssrCrashedAt;
        if (crashedAt === null) return;
        while (!this.shuttingDown && Date.now() < crashedAt + IncrementalBuilder.#crashRetryMs) await Bun.sleep(250);
        if (!this.shuttingDown) await arm();
      })(),
    );
    this.#ssrArming = arming;
    await arming;
    this.#ssrArming = null;
  }

  //? A save the user broke fails the same way in a worker, so it is reported here and the patcher keeps its state: the
  //? modules it could not compile stay pending in the graph and the fixing save compiles them.
  static #isCompileError(error: unknown): boolean {
    return error instanceof AggregateError;
  }

  // Voided so the fast lane need not wait; unhandled, a rejection would exit the builder and drop the watcher with it.
  #slowLaneFailed(label: string) {
    return (error: unknown) =>
      this.#logger.error(
        `${label} failed in the slow lane: ${ApplicationBuildReporter.formatError(error, this.#app.workspace.workspaceRoot)}`,
      );
  }

  // A reason's own detail (which import) follows its first colon, so saves of one kind count together.
  #countDelegation(registry: "csr" | "ssr", reason: string): string {
    const key = `${registry}:${reason.split(":")[0]}`;
    const count = (this.#delegations.get(key) ?? 0) + 1;
    this.#delegations.set(key, count);
    return `#${count} for this reason`;
  }

  async #withSsrLock<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.#ssrLock.then(fn, fn);
    this.#ssrLock = run.then(
      () => undefined,
      () => undefined,
    );
    return await run;
  }

  // Runs the worker directly, under the SSR lock its callers hold: queueing it could wait on a batch that waits on them.
  async #runSsrWorker(generation: number): Promise<void> {
    let result: BuildBatchResult;
    try {
      result = await this.#runBatch({ generation, needs: ["ssr"], changedFiles: [] });
    } finally {
      this.#ssrPatcher?.forget();
    }
    this.#noteSsrWorker(result);
    if (result.errors.ssr) throw new Error(result.errors.ssr);
  }

  #noteSsrWorker(result: BuildBatchResult): void {
    const crashed = !!result.crashed && (result.crashedNeeds ?? ["ssr"]).includes("ssr");
    this.#ssrBroken = !!result.errors.ssr && !crashed;
    this.#ssrCrashedAt = crashed ? Date.now() : null;
  }

  async #runSsrPatcher(
    patcher: CsrDevPatcher,
    files: string[],
    {
      roots,
      onlyRoots,
      trace,
      hold,
      batchGeneration,
    }: { roots?: string[]; onlyRoots?: boolean; trace?: HmrTrace; hold?: boolean; batchGeneration?: number } = {},
  ): Promise<boolean> {
    const started = Date.now();
    const marker = path.join(this.#ssrBundler.outDir, CSR_DEV_PATCHING_MARKER);
    await Bun.write(marker, String(process.pid));
    try {
      const result = await patcher.update(files, {
        roots,
        onlyRoots,
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
              ...(update.epoch !== undefined ? { epoch: update.epoch } : {}),
              ...(update.first ? { first: true } : {}),
            },
          });
        },
      });
      if (result.kind === "delegate") {
        this.#logger.verbose(
          `ssr-patch handed to a build worker (${this.#countDelegation("ssr", result.reason)}): ${result.reason}`,
        );
        return true;
      }
      //? A route build's check reports only a failure: it compiles the roots the registry lacks and nothing else, so
      //? its ok, of the builder's current generation, would read as the fix of a save that broke something else.
      if (!onlyRoots) {
        this.#ssrBroken = false;
        this.#ssrCrashedAt = null;
        this.#sendBuildStatus("ssr", { generation: batchGeneration, ok: true, files });
      }
      this.#logger.verbose(
        result.kind === "unchanged"
          ? `ssr-patch unchanged (${Date.now() - started}ms)`
          : `ssr-patch generation=${result.update.generation} ${result.update.reload ? `reload (${result.update.reason})` : `patch modules=${result.update.changedIds.length}`} (${Date.now() - started}ms)`,
      );
      return false;
    } catch (err) {
      const message = ApplicationBuildReporter.formatError(err, this.#app.workspace.workspaceRoot);
      if (IncrementalBuilder.#isCompileError(err)) {
        this.#sendBuildStatus("ssr", { generation: batchGeneration, ok: false, files, message });
        return false;
      }
      this.#logger.verbose(`ssr-patch threw; a build worker takes it: ${message}`);
      patcher.forget();
      return true;
    } finally {
      await rm(marker, { force: true });
    }
  }

  async #runQueuedBatch({ discovery, ...work }: BatchJob): Promise<void> {
    if (discovery) await this.#refreshDiscovery(discovery);
    //? The slow lane runs in order, so every batch up to this one has had its discovery job.
    this.#discoveredThrough = Math.max(this.#discoveredThrough, work.generation);
    // A worker writing ssr-dev must not overlap the boot build, which no longer runs in this lane.
    //? Forgotten inside the lock: a route build's check waiting on it would patch the old state over the worker's.
    try {
      if (work.needs.includes("ssr"))
        await this.#withSsrLock(async () => {
          try {
            this.#noteSsrWorker(await this.#runBatch(work));
          } finally {
            this.#ssrPatcher?.forget();
          }
        });
      else await this.#runBatch(work);
    } finally {
      if (work.needs.includes("csr")) this.#patcher?.forget();
    }
  }

  async #refreshDiscovery({ files, refresh, generation }: DiscoveryJob): Promise<void> {
    const started = Date.now();
    if (refresh) this.#discovery = await GraphClientEntryDiscovery.create(this.#app);
    else this.#discovery.invalidate?.(files);
    this.#discoveredThrough = Math.max(this.#discoveredThrough, generation);
    this.#logger.verbose(`client-entry-discovery ${refresh ? "refreshed" : "invalidated"} (${Date.now() - started}ms)`);
  }

  async #runBatch(work: BatchWork): Promise<BuildBatchResult> {
    const { generation, needs, changedFiles } = work;
    const started = Date.now();
    const result = await this.#batchRunner.run(await this.#batchRequest(work), (msg) => BuilderChannel.emit(msg));
    if (result.optimizedFonts) this.#optimizedFonts = result.optimizedFonts;
    if (result.cssAssets) this.#artifact = { ...this.#artifact, cssAssets: result.cssAssets };
    // A need the worker died before reporting goes red here instead of looking silently successful.
    if (result.crashed) {
      const crashedNeeds = result.crashedNeeds ?? needs;
      //? A worker that died wrote no failure for the roots handed to it: they must not wait on one that never comes.
      if (crashedNeeds.includes("csr")) this.#patcher?.releaseHandedOver();
      if (crashedNeeds.includes("ssr")) this.#ssrPatcher?.releaseHandedOver();
      // `base` is not a `BuildPhase` and never comes through here: `#buildBootDeps` throws into the degraded boot.
      for (const need of crashedNeeds)
        if (need !== "base")
          this.#sendBuildStatus(need, {
            generation,
            ok: false,
            files: changedFiles,
            message: `${result.errors[need] ?? "the build worker crashed"}; the next save builds it again`,
          });
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
    //? Armed now, not when the build lands: a save handled meanwhile then patches CSR behind #csrGate instead of skipping.
    this.#beginCsrArm();
    this.#csrActive = true;
    const armed = this.#workQueue.enqueue("build-csr", async (): Promise<void> => {
      const started = Date.now();
      let error: string | undefined;
      try {
        // Not relayed: an on-demand CSR build is request/response, and its error travels in the response.
        const result = await this.#batchRunner.run(
          await this.#batchRequest({ generation: this.#generation, needs: ["csr"], changedFiles: [] }),
        );
        error = result.errors.csr;
      } catch (err) {
        error = ApplicationBuildReporter.formatError(err, this.#app.workspace.workspaceRoot);
      }
      if (error) {
        this.#logger.error(`csr-build failed: ${error}`);
        await BuilderChannel.send({ type: "build-csr-res", id: msg.id, ok: false, error });
        return;
      }
      this.#csrArmSucceeded = true;
      this.#patcher?.forget();
      this.#logger.info(`csr-build ok on demand (${Date.now() - started}ms); rebuilding CSR on every save now`);
      await BuilderChannel.send({ type: "build-csr-res", id: msg.id, ok: true });
    });
    this.#csrGate = this.#armingCsr(armed);
    await armed;
  }

  //? Settled by the last of the arming builds in flight, not by each: two requests that both fail would otherwise leave
  //? CSR on (the second saw the first's optimistic flag as where it started), and the first to finish would let saves
  //? patch CSR first while the second still builds.
  #beginCsrArm(): void {
    if (this.#csrArms === 0) {
      this.#csrWasActive = this.#csrActive;
      this.#csrArmSucceeded = false;
    }
    this.#csrArms += 1;
    this.#csrArming = true;
  }

  #armingCsr(armed: Promise<void>): Promise<void> {
    const settle = () => {
      this.#csrArms -= 1;
      if (this.#csrArms > 0) return;
      this.#csrArming = false;
      this.#csrActive = this.#csrWasActive || this.#csrArmSucceeded;
    };
    return armed.then(settle, settle);
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
    this.#beginCsrArm();
    this.#csrActive = true;
    //? The env keeps CSR armed whatever this build does, as it did before the builder restarted.
    this.#csrArmSucceeded = true;
    const rearmed = this.#workQueue.enqueue("build-csr-rearm", async () => {
      //? Relayed, unlike an on-demand build: a rebuild for a metadata save must reach the CSR tabs as their reload.
      const result = await this.#batchRunner.run(
        await this.#batchRequest({ generation: this.#generation, needs: ["csr"], changedFiles: [] }),
        (msg) => BuilderChannel.emit(msg),
      );
      this.#patcher?.forget();
      if (result.errors.csr) this.#logger.error(`csr-rearm failed: ${result.errors.csr}`);
      else this.#logger.verbose("csr-rearm ok; this session had CSR armed before the builder restarted");
    });
    this.#csrGate = this.#armingCsr(rearmed);
    await rearmed.catch((err: unknown) =>
      this.#logger.error(
        `csr-rearm failed: ${ApplicationBuildReporter.formatError(err, this.#app.workspace.workspaceRoot)}`,
      ),
    );
  }

  // A boot compile error must not kill the builder, the dev server's only file watcher: report it, emit builder-ready
  // so the backend keeps the last-good artifact, and retry the boot build on every change.
  static #recoverBoot(
    app: App,
    bootError: unknown,
    logger: Logger,
    runner: BuildBatchRunner,
    initialGeneration: number,
  ): Promise<{ builder: IncrementalBuilder; changedFiles: string[] }> {
    const firstMessage = bootError instanceof Error ? bootError.message : String(bootError);
    logger.error(`boot build failed; entering degraded watch mode until the error is fixed: ${firstMessage}`);
    let generation = initialGeneration;
    const sendFailure = (files: string[], message: string) => {
      BuilderChannel.emit({
        type: "build-status",
        data: { generation, phase: "pages", ok: false, files, message: `Boot build failed: ${message}` },
      });
    };
    sendFailure([], firstMessage);
    BuilderChannel.emit({ type: "builder-ready" });
    // Nothing builds until a save fixes the boot, so the next app's boot need not wait for this one.
    BuilderChannel.emit({ type: "boot-armed" });
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
      const handled = msg.type === "build-route" ? builder.handleBuildRoute(msg) : builder.handleBuildCsr(msg);
      // Unhandled, a rejection (an ipc write that failed) would exit the builder and drop the watcher with it.
      void handled.catch((err: unknown) =>
        logger.error(`${msg.type} failed: ${err instanceof Error ? err.message : String(err)}`),
      );
    });
    // Closes when the host dies (even by SIGKILL): nothing left to drain, and an orphan would rebuild for nobody.
    process.on("disconnect", () => {
      logger.warn("host IPC channel closed; exiting builder");
      process.exit(0);
    });
    let recoveredFiles: string[] | null = null;
    const bootRunner = new BuildBatchRunner({ workspaceRoot, cwd: app.cwdPath });
    const initialGeneration = IncrementalBuilder.#initialGeneration();
    try {
      const deps = await IncrementalBuilder.#buildBootDeps(app, bootRunner);
      builder = new IncrementalBuilder({ app, watch, initialGeneration, ...deps });
    } catch (err) {
      if (!watch) throw err;
      const recovered = await IncrementalBuilder.#recoverBoot(app, err, logger, bootRunner, initialGeneration);
      builder = recovered.builder;
      recoveredFiles = recovered.changedFiles;
    }
    await builder.boot();
    if (recoveredFiles) await builder.announceRecoveredState(recoveredFiles);
    else if (process.env.AKAN_BUILDER_ANNOUNCE_BOOT === "1") await builder.announceBootState();
    await Promise.all([builder.rearmCsrFromEnv(), builder.armSsrRegistry()]);
    BuilderChannel.emit({ type: "boot-armed" });
  }

  //? A replacement builder continues past the host's last generation: from 0, the save fixing an error read older than
  //? the failure the tabs hold, and from that generation itself its arming builds' ok did not read as the fix either.
  static #initialGeneration(): number {
    const generation = Number(process.env.AKAN_BUILDER_INITIAL_GENERATION);
    return Number.isInteger(generation) && generation > 0 ? generation + 1 : 0;
  }
}

// Awaited, not voided: on Windows Bun exits during a missing file's `Bun.file` read unless an entry await is pending.
await IncrementalBuilder.main().catch((err) => {
  console.error(err);
  process.exit(1);
});
