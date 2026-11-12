import path from "node:path";
import type { App } from "@akanjs/devkit/commandDecorators";
import type { PageRoot } from "@akanjs/devkit/executors";
import { AutoImportSync } from "@akanjs/devkit/frontendBuild/autoImportSync";
import { DevChangePlanner } from "@akanjs/devkit/frontendBuild/devChangePlanner";
import { DevGeneratedIndexSync } from "@akanjs/devkit/frontendBuild/devGeneratedIndexSync";
import { HmrWatcher } from "@akanjs/devkit/frontendBuild/hmrWatcher";
import { WatchRootResolver } from "@akanjs/devkit/frontendBuild/watchRootResolver";
import { CodegenLock } from "@akanjs/devkit/workspace/codegenLock";
import type { Logger } from "akanjs/common";
import type { ChangeBatch } from "akanjs/server";
import type { BuildBatchNeed } from "./buildBatchProtocol";
import { sendBuildStatus } from "./builderBuildStatus";
import { BuilderChannel } from "./builderChannel";
import type { BuilderGraphPayloads } from "./builderGraphPayloads";
import type { BuilderLanes } from "./builderLanes";
import type { BatchJob, DiscoveryJob } from "./builderWorkQueue";
import type { CsrRegistry } from "./csrRegistry";
import { prepareDevWatchBatch } from "./devWatchBatch";
import type { SsrRegistry } from "./ssrRegistry";

interface BuilderWatchParts {
  logger: Logger;
  lanes: BuilderLanes;
  csr: CsrRegistry;
  ssr: SsrRegistry;
  graphPayloads: BuilderGraphPayloads;
}

interface BuilderWatchLinks {
  nextGeneration: () => number;
  refreshDiscovery: (job: DiscoveryJob) => Promise<void>;
}

export class BuilderWatch {
  readonly #app: App;
  readonly #logger: Logger;
  readonly #lanes: BuilderLanes;
  readonly #csr: CsrRegistry;
  readonly #ssr: SsrRegistry;
  readonly #graphPayloads: BuilderGraphPayloads;
  readonly #links: BuilderWatchLinks;
  #changePlanner: DevChangePlanner;
  #generatedIndexSync: DevGeneratedIndexSync;
  #autoImportSync: AutoImportSync;
  #watcher: HmrWatcher | null = null;
  #barrelFailed = false;

  constructor(app: App, { logger, lanes, csr, ssr, graphPayloads }: BuilderWatchParts, links: BuilderWatchLinks) {
    this.#app = app;
    this.#logger = logger;
    this.#lanes = lanes;
    this.#csr = csr;
    this.#ssr = ssr;
    this.#graphPayloads = graphPayloads;
    this.#links = links;
    this.#changePlanner = new DevChangePlanner({ workspaceRoot: app.workspace.workspaceRoot });
    this.#generatedIndexSync = new DevGeneratedIndexSync({ workspaceRoot: app.workspace.workspaceRoot });
    this.#autoImportSync = new AutoImportSync({ workspaceRoot: app.workspace.workspaceRoot });
  }

  stop(): void {
    this.#watcher?.stop();
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
      if (!BuilderWatch.#matchPageRoot(roots, abs)) continue;
      if (/\.(tsx|ts|jsx|js)$/.test(abs)) return true;
    }
    return false;
  }
  async batchMayChangePageKeys(roots: PageRoot[], batch: ChangeBatch): Promise<boolean> {
    const pageKeys = new Set((await this.#app.getPageKeys()).map((key) => path.normalize(key)));
    for (const f of batch.files) {
      const abs = path.resolve(f);
      const root = BuilderWatch.#matchPageRoot(roots, abs);
      if (!root) continue;
      if (!/\.(tsx|ts|jsx|js)$/.test(abs)) continue;
      const rel = path.normalize(`${root.keyPrefix}${path.relative(path.resolve(root.realDir), abs)}`);
      if (!(await Bun.file(abs).exists()) || !pageKeys.has(rel)) return true;
    }
    return false;
  }
  async installWatcher() {
    const roots = await new WatchRootResolver(this.#app).resolve();
    const watcher = new HmrWatcher({
      roots,
      logger: this.#logger,
      onBatch: async (batch: ChangeBatch) => {
        await this.#lanes.enqueueFast("hmr-batch", async () => this.#handleWatchBatch(batch));
      },
    });
    await watcher.start();
    this.#watcher = watcher;
    this.#logger.verbose(`watching ${roots.length} roots`);
  }

  async #handleWatchBatch(batch: ChangeBatch) {
    this.#graphPayloads.touched(batch.files);
    const rawKinds = new Set(batch.kinds);
    if (rawKinds.size === 0) return;
    const generation = this.#links.nextGeneration();
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
      sendBuildStatus("barrel", { generation, ok: false, files, message: indexSync.errors.join("\n") });
      BuilderChannel.emit(event);
      if (discovery)
        void this.#lanes.workQueue
          .enqueue("discovery", async () => await this.#links.refreshDiscovery(discovery))
          .catch(this.#lanes.slowLaneFailed("discovery"));
      return;
    }
    // After a failure too, where nothing changed on disk: the host re-sends a phase still failing to every new tab.
    if (indexSync.changedFiles.length > 0 || this.#barrelFailed)
      sendBuildStatus("barrel", { generation, ok: true, files });
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
      if (!this.#csr.csrActive)
        this.#logger.verbose(
          `csr-rebundle skipped; request /__csr or ?csr=true (or set AKAN_DEV_CSR_REBUILD=1) to enable per-save CSR rebuilds`,
        );
      //? One after the other, since two compiles side by side slow both. CSR goes first unless its build is being armed:
      //? a CSR patch then waits behind #csrGate, which SSR tabs must not.
      const patchCsr = async () => (this.#csr.csrActive ? await this.#csr.patchCsr(generation, files, trace) : false);
      const patchSsr = async () => await this.#ssr.patchSsr(generation, files, trace);
      let csrToWorker: boolean;
      let ssrToWorker: boolean;
      if (this.#csr.csrArming) {
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
      if (needs.includes("csr") || needs.includes("ssr")) await this.#lanes.workQueue.enqueueBatch(batch);
      else void this.#lanes.workQueue.enqueueBatch(batch).catch(this.#lanes.slowLaneFailed("batch"));
      return;
    }
    if (discovery)
      void this.#lanes.workQueue
        .enqueue("discovery", async () => await this.#links.refreshDiscovery(discovery))
        .catch(this.#lanes.slowLaneFailed("discovery"));
    // Css-only batches keep the debounce: they arrive in bursts while a stylesheet is edited.
    if (kinds.includes("css")) {
      this.#lanes.scheduleCssRebuild({ generation, changedFiles: files });
      this.#logger.verbose(`css-rebuild scheduled generation=${generation}`);
    }
  }
}
