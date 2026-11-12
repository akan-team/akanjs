import path from "node:path";
// Module paths, never a barrel: the devkit and `frontendBuild` barrels would hold tailwindcss (~40MB), ssh2, ink
// and the cloud stack for the whole dev session (`entryModuleGraph.test.ts` enforces it).
import { ApplicationBuildReporter } from "@akanjs/devkit/app/applicationBuildReporter";
import type { App } from "@akanjs/devkit/commandDecorators";
import { AppExecutor, type PageRoot, WorkspaceExecutor } from "@akanjs/devkit/executors";
import type { ClientEntryDiscovery } from "@akanjs/devkit/frontendBuild/clientBuildTypes";
import { GraphClientEntryDiscovery } from "@akanjs/devkit/frontendBuild/clientEntryDiscovery";
import { RouteClientBuilder } from "@akanjs/devkit/frontendBuild/routeClientBuilder";
import { Logger } from "akanjs/common";
import type {
  BaseBuildArtifact,
  BuilderCsrReq,
  BuilderGraphReq,
  BuilderMessage,
  BuilderReq,
  BuilderRes,
  BuildRouteResultPayload,
  ChangeBatch,
} from "akanjs/server";
import type { BatchWork, BuildBatchRequest, BuildBatchResult, OptimizedFonts } from "./buildBatchProtocol";
import { BuildBatchRunner } from "./buildBatchRunner";
import { BuilderBoot, type IncrementalBuilderOptions } from "./builderBoot";
import { sendBuildStatus } from "./builderBuildStatus";
import { BuilderChannel } from "./builderChannel";
import { BuilderGraphPayloads } from "./builderGraphPayloads";
import { BuilderLanes } from "./builderLanes";
import { BuilderWatch } from "./builderWatch";
import type { BatchJob, DiscoveryJob } from "./builderWorkQueue";
import { CsrRegistry } from "./csrRegistry";
import { SsrRegistry } from "./ssrRegistry";

class IncrementalBuilder {
  #logger = new Logger("IncrementalBuilder");
  #app: App;
  #artifact: BaseBuildArtifact;
  #watch: boolean;
  /** Kept by value, not as a live `FontOptimizer`: it has to travel to each disposable build worker. */
  #optimizedFonts: OptimizedFonts;
  #discovery: ClientEntryDiscovery;
  #batchRunner: BuildBatchRunner;
  #generation = 0;
  readonly #graphPayloads: BuilderGraphPayloads;
  #discoveredThrough = 0;
  /** How often each reason sent a registry save to a build worker this session: the resident patcher's miss rate. */
  readonly #delegations = new Map<string, number>();
  readonly #lanes: BuilderLanes;
  readonly #csr: CsrRegistry;
  readonly #ssr: SsrRegistry;
  readonly #watcher: BuilderWatch;
  constructor(options: IncrementalBuilderOptions) {
    this.#app = options.app;
    this.#artifact = options.artifact;
    this.#watch = options.watch;
    this.#optimizedFonts = options.optimizedFonts;
    this.#discovery = options.discovery;
    this.#generation = options.initialGeneration ?? 0;
    this.#discoveredThrough = this.#generation;
    this.#graphPayloads = new BuilderGraphPayloads(options.app, () => this.#generation);
    this.#batchRunner = new BuildBatchRunner({
      workspaceRoot: options.app.workspace.workspaceRoot,
      cwd: options.app.cwdPath,
    });
    const logger = this.#logger;
    const generation = () => this.#generation;
    const countDelegation = (registry: "csr" | "ssr", reason: string) => this.#countDelegation(registry, reason);
    const runBatch = (work: BatchWork) => this.#runBatch(work);
    this.#lanes = new BuilderLanes(
      options.app,
      { logger },
      { generation, runQueuedBatch: (batch) => this.#runQueuedBatch(batch), runBatch },
    );
    const lanes = this.#lanes;
    this.#csr = new CsrRegistry(
      options.app,
      { logger, lanes, batchRunner: this.#batchRunner },
      { generation, artifact: () => this.#artifact, batchRequest: (work) => this.#batchRequest(work), countDelegation },
    );
    this.#ssr = new SsrRegistry(
      options.app,
      { logger, lanes, artifactDir: this.#artifactDir },
      { generation, discovery: () => this.#discovery, runBatch, countDelegation },
    );
    this.#watcher = new BuilderWatch(
      options.app,
      { logger, lanes, csr: this.#csr, ssr: this.#ssr, graphPayloads: this.#graphPayloads },
      { nextGeneration: () => ++this.#generation, refreshDiscovery: (job) => this.#refreshDiscovery(job) },
    );
  }

  get #artifactDir() {
    return `${this.#app.cwdPath}/.akan/artifact`;
  }

  // The reply is part of the work item on purpose: `shutdown` drains the queue, so "drained" must mean "answered".
  async handleBuildRoute(msg: BuilderReq): Promise<void> {
    await this.#lanes.workQueue.enqueue(`build-route:${msg.routeId}`, async () =>
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
      await this.#ssr.ensureSsrEntries(delta.registryEntries ?? []);
      this.#logger.verbose(`build-route ok routeId=${msg.routeId} newEntries=${delta.newEntries.length}`);
      //? The builder's generation, not the route cache's: the cache's does not move when a fixed file maps to no entry,
      //? so the rebuild's ok would carry the failure's own number.
      sendBuildStatus("route", { generation: this.#generation, ok: true, files: msg.seeds, scope: msg.routeId });
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
      sendBuildStatus("route", {
        generation: this.#generation,
        ok: false,
        files: msg.seeds,
        message: errMsg,
        scope: msg.routeId,
      });
      return { type: "build-route-res", id: msg.id, ok: false, error: errMsg };
    }
  }

  // Exits so the OS reclaims the bundler arenas; the host spawns the replacement.
  async shutdown(reason: string): Promise<void> {
    if (this.#lanes.shuttingDown) return;
    this.#lanes.markShuttingDown();
    const started = Date.now();
    this.#logger.debug(`shutdown requested (${reason}); draining ${this.#lanes.inFlight} work item(s)`);
    // Before the drain: a save landing mid-drain would queue behind the awaited tail and `process.exit` would cut
    // its artifacts off half-written; the replacement's boot build redoes that work anyway.
    this.#watcher.stop();
    await this.#lanes.drain();
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
    return this.#lanes.shuttingDown;
  }
  batchTouchesPagesTree(roots: PageRoot[], batch: ChangeBatch): boolean {
    return this.#watcher.batchTouchesPagesTree(roots, batch);
  }
  batchMayChangePageKeys(roots: PageRoot[], batch: ChangeBatch): Promise<boolean> {
    return this.#watcher.batchMayChangePageKeys(roots, batch);
  }
  scheduleCssRebuild(rebuild: { generation?: number; changedFiles?: string[] }) {
    this.#lanes.scheduleCssRebuild(rebuild);
  }
  installWatcher(): Promise<void> {
    return this.#watcher.installWatcher();
  }

  armSsrRegistry(): Promise<void> {
    return this.#ssr.armSsrRegistry();
  }

  // A reason's own detail (which import) follows its first colon, so saves of one kind count together.
  #countDelegation(registry: "csr" | "ssr", reason: string): string {
    const key = `${registry}:${reason.split(":")[0]}`;
    const count = (this.#delegations.get(key) ?? 0) + 1;
    this.#delegations.set(key, count);
    return `#${count} for this reason`;
  }

  async #runQueuedBatch({ discovery, ...work }: BatchJob): Promise<void> {
    if (discovery) await this.#refreshDiscovery(discovery);
    //? The slow lane runs in order, so every batch up to this one has had its discovery job.
    this.#discoveredThrough = Math.max(this.#discoveredThrough, work.generation);
    // A worker writing ssr-dev must not overlap the boot build, which no longer runs in this lane.
    //? Forgotten inside the lock: a route build's check waiting on it would patch the old state over the worker's.
    try {
      if (work.needs.includes("ssr"))
        await this.#ssr.withSsrLock(async () => {
          try {
            this.#ssr.noteSsrWorker(await this.#runBatch(work));
          } finally {
            this.#ssr.ssrPatcher?.forget();
          }
        });
      else await this.#runBatch(work);
    } finally {
      if (work.needs.includes("csr")) this.#csr.patcher?.forget();
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
      if (crashedNeeds.includes("csr")) this.#csr.patcher?.releaseHandedOver();
      if (crashedNeeds.includes("ssr")) this.#ssr.ssrPatcher?.releaseHandedOver();
      // `base` is not a `BuildPhase` and never comes through here: `buildBootDeps` throws into the degraded boot.
      for (const need of crashedNeeds)
        if (need !== "base" && need !== "shell")
          sendBuildStatus(need, {
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
    await this.#lanes.workQueue.enqueue("boot-recovered", async () => {
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

  async handleBuildGraph(msg: BuilderGraphReq): Promise<void> {
    try {
      const data = await this.#graphPayloads.of(msg);
      await BuilderChannel.send({ type: "build-graph-res", id: msg.id, ok: true, data });
    } catch (err) {
      const error = ApplicationBuildReporter.formatError(err, this.#app.workspace.workspaceRoot);
      this.#logger.error(`build-graph failed: ${error}`);
      await BuilderChannel.send({ type: "build-graph-res", id: msg.id, ok: false, error });
    }
  }

  handleBuildCsr(msg: BuilderCsrReq): Promise<void> {
    return this.#csr.handleBuildCsr(msg);
  }

  rearmCsrFromEnv(): Promise<void> {
    return this.#csr.rearmCsrFromEnv();
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
      if (msg.type !== "build-route" && msg.type !== "build-csr" && msg.type !== "build-graph") return;
      if (!builder || builder.shuttingDown) {
        const error = builder?.shuttingDown ? recyclingError : bootingError;
        BuilderChannel.emit({ type: `${msg.type}-res`, id: msg.id, ok: false, error });
        return;
      }
      const handled =
        msg.type === "build-route"
          ? builder.handleBuildRoute(msg)
          : msg.type === "build-csr"
            ? builder.handleBuildCsr(msg)
            : builder.handleBuildGraph(msg);
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
    const initialGeneration = BuilderBoot.initialGeneration();
    try {
      const deps = await BuilderBoot.buildBootDeps(app, bootRunner);
      builder = new IncrementalBuilder({ app, watch, initialGeneration, ...deps });
    } catch (err) {
      if (!watch) throw err;
      const recovered = await BuilderBoot.recoverBoot(
        app,
        err,
        logger,
        bootRunner,
        initialGeneration,
        (options) => new IncrementalBuilder(options),
      );
      builder = recovered.builder;
      recoveredFiles = recovered.changedFiles;
    }
    await builder.boot();
    if (recoveredFiles) await builder.announceRecoveredState(recoveredFiles);
    else if (process.env.AKAN_BUILDER_ANNOUNCE_BOOT === "1") await builder.announceBootState();
    await Promise.all([builder.rearmCsrFromEnv(), builder.armSsrRegistry()]);
    BuilderChannel.emit({ type: "boot-armed" });
  }
}

// Awaited, not voided: on Windows Bun exits during a missing file's `Bun.file` read unless an entry await is pending.
await IncrementalBuilder.main().catch((err) => {
  console.error(err);
  process.exit(1);
});
