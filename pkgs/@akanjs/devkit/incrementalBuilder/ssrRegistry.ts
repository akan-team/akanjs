import { rm } from "node:fs/promises";
import path from "node:path";
import { ApplicationBuildReporter } from "@akanjs/devkit/app/applicationBuildReporter";
import type { App } from "@akanjs/devkit/commandDecorators";
import type { ClientEntryDiscovery } from "@akanjs/devkit/frontendBuild/clientBuildTypes";
import { CsrDevPatcher } from "@akanjs/devkit/frontendBuild/csrDevPatcher";
import { ServerGraphFile } from "@akanjs/devkit/frontendBuild/serverGraphFile";
import { SsrDevBundler } from "@akanjs/devkit/frontendBuild/ssrDevBundler";
import type { Logger } from "akanjs/common";
import type { HmrTrace } from "akanjs/server";
import { CSR_DEV_PATCHING_MARKER } from "akanjs/server/hmr/csrDevManifest";
import type { BatchWork, BuildBatchResult } from "./buildBatchProtocol";
import { isCompileError, sendBuildStatus } from "./builderBuildStatus";
import { BuilderChannel } from "./builderChannel";
import type { BuilderLanes } from "./builderLanes";

interface SsrRegistryLinks {
  generation: () => number;
  discovery: () => ClientEntryDiscovery;
  runBatch: (work: BatchWork) => Promise<BuildBatchResult>;
  countDelegation: (registry: "csr" | "ssr", reason: string) => string;
}

export class SsrRegistry {
  readonly #app: App;
  readonly #logger: Logger;
  readonly #lanes: BuilderLanes;
  readonly #artifactDir: string;
  readonly #links: SsrRegistryLinks;
  #crashRetryTimer: ReturnType<typeof setTimeout> | null = null;
  readonly #crashRetryEntries = new Set<string>();
  /** Where SSR pages load their client code from in dev; route builds bundle only its server half. */
  #ssrBundler: SsrDevBundler;
  /** Null when `AKAN_DEV_CSR_PATCHER=off`: every registry save then goes to a build worker. */
  #ssrPatcher: CsrDevPatcher | null;
  //* Serializes everything that writes ssr-dev: a save's patch (fast lane), a route build adding the entries it names,
  //* a queued worker batch with the ssr need, and the boot build. Never held while awaiting the slow lane.
  #ssrLock: Promise<void> = Promise.resolve();
  /** The boot build of the SSR registry while it runs; it holds every entry the routes reach once it lands. */
  #ssrArming: Promise<void> | null = null;
  //* A registry build that failed on the user's code fails again until the code changes, so route builds do not retry
  //* it; the next attempt that touches the registry (a save's patch, a worker batch) settles it. A worker that died
  //* before reporting (an OOM kill) route builds do retry, at most every `#crashRetryMs`.
  #ssrBroken = false;
  #ssrCrashedAt: number | null = null;
  static readonly #crashRetryMs = 10_000;

  constructor(
    app: App,
    { logger, lanes, artifactDir }: { logger: Logger; lanes: BuilderLanes; artifactDir: string },
    links: SsrRegistryLinks,
  ) {
    this.#app = app;
    this.#logger = logger;
    this.#lanes = lanes;
    this.#artifactDir = artifactDir;
    this.#links = links;
    this.#ssrBundler = new SsrDevBundler(app, { discovery: links.discovery });
    this.#ssrPatcher =
      process.env.AKAN_DEV_CSR_PATCHER === "off" ? null : new CsrDevPatcher(this.#ssrBundler, { resident: true });
  }

  get ssrPatcher(): CsrDevPatcher | null {
    return this.#ssrPatcher;
  }

  // True when the save has to go to a build worker, as for CSR.
  async patchSsr(generation: number, files: string[], trace: HmrTrace): Promise<boolean> {
    const patcher = this.#ssrPatcher;
    if (!patcher) return true;
    const hold = await ServerGraphFile.touches(await ServerGraphFile.read(this.#artifactDir), files, (file) =>
      ServerGraphFile.clientExportsOf(file),
    );
    //? Ahead of this save's own discovery job in the slow lane: which client entries a page still names decides which
    //? pending roots this patch keeps.
    this.#links.discovery().invalidate?.(files);
    return await this.withSsrLock(
      async () => await this.#runSsrPatcher(patcher, files, { trace, hold, batchGeneration: generation }),
    );
  }

  //* Adds the entries a route build names to the registry, since the tab requires them by id. A registry that cannot
  //* take them fails no route build: the page answers, and its tab waits for the registry while the overlay says why.
  async ensureSsrEntries(entries: string[], { crashRetry = false }: { crashRetry?: boolean } = {}): Promise<void> {
    if (entries.length === 0) return;
    //? The boot build takes every entry the routes reach, so the first page answers now and its tab waits for the
    //? registry (boot.json) instead; whatever that build missed is added right after it lands.
    const arming = this.#ssrArming;
    if (arming) {
      void this.#lanes.runBeside(
        arming
          .then(async () => await this.ensureSsrEntries(entries, { crashRetry }))
          .catch(this.#lanes.slowLaneFailed("ssr-ensure")),
      );
      return;
    }
    await this.withSsrLock(async () => {
      const patcher = this.#ssrPatcher;
      // The builder's generation, not the request's: its build-status joins the saves' `ssr` ones.
      const generation = this.#links.generation();
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
      if (this.#ssrCrashedAt !== null && Date.now() - this.#ssrCrashedAt < SsrRegistry.#crashRetryMs) {
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
        if (this.#lanes.shuttingDown || retried.length === 0) return;
        void this.#lanes
          .runBeside(this.ensureSsrEntries(retried, { crashRetry: true }))
          .catch(this.#lanes.slowLaneFailed("ssr-crash-retry"));
      },
      Math.max(0, crashedAt + SsrRegistry.#crashRetryMs - Date.now()),
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
      await this.withSsrLock(async () => {
        const generation = this.#links.generation();
        if (this.#ssrPatcher && !(await this.#runSsrPatcher(this.#ssrPatcher, [], { batchGeneration: generation })))
          return;
        await this.#runSsrWorker(generation);
      }).catch((err: unknown) => {
        this.#logger.error(
          `ssr-registry boot build failed; the next save retries it: ${ApplicationBuildReporter.formatError(err, this.#app.workspace.workspaceRoot)}`,
        );
      });
    const arming = this.#lanes.runBeside(
      (async () => {
        await arm();
        //? A boot build whose worker was killed (a small container's OOM) is tried once more before `boot-armed` lets
        //? the next app boot: retried after that, the two biggest workers of a boot would run side by side.
        const crashedAt = this.#ssrCrashedAt;
        if (crashedAt === null) return;
        while (!this.#lanes.shuttingDown && Date.now() < crashedAt + SsrRegistry.#crashRetryMs) await Bun.sleep(250);
        if (!this.#lanes.shuttingDown) await arm();
      })(),
    );
    this.#ssrArming = arming;
    await arming;
    this.#ssrArming = null;
  }

  async withSsrLock<T>(fn: () => Promise<T>): Promise<T> {
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
      result = await this.#links.runBatch({ generation, needs: ["ssr"], changedFiles: [] });
    } finally {
      this.#ssrPatcher?.forget();
    }
    this.noteSsrWorker(result);
    if (result.errors.ssr) throw new Error(result.errors.ssr);
  }

  noteSsrWorker(result: BuildBatchResult): void {
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
          `ssr-patch handed to a build worker (${this.#links.countDelegation("ssr", result.reason)}): ${result.reason}`,
        );
        return true;
      }
      //? A route build's check reports only a failure: it compiles the roots the registry lacks and nothing else, so
      //? its ok, of the builder's current generation, would read as the fix of a save that broke something else.
      if (!onlyRoots) {
        this.#ssrBroken = false;
        this.#ssrCrashedAt = null;
        sendBuildStatus("ssr", { generation: batchGeneration, ok: true, files });
      }
      this.#logger.verbose(
        result.kind === "unchanged"
          ? `ssr-patch unchanged (${Date.now() - started}ms)`
          : `ssr-patch generation=${result.update.generation} ${result.update.reload ? `reload (${result.update.reason})` : `patch modules=${result.update.changedIds.length}`} (${Date.now() - started}ms)`,
      );
      return false;
    } catch (err) {
      const message = ApplicationBuildReporter.formatError(err, this.#app.workspace.workspaceRoot);
      if (isCompileError(err)) {
        sendBuildStatus("ssr", { generation: batchGeneration, ok: false, files, message });
        return false;
      }
      this.#logger.verbose(`ssr-patch threw; a build worker takes it: ${message}`);
      patcher.forget();
      return true;
    } finally {
      await rm(marker, { force: true });
    }
  }
}
