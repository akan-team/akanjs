import { ApplicationBuildReporter } from "@akanjs/devkit/app/applicationBuildReporter";
import type { App } from "@akanjs/devkit/commandDecorators";
import type { Logger } from "akanjs/common";
import type { BatchWork, BuildBatchResult } from "./buildBatchProtocol";
import { sendBuildStatus } from "./builderBuildStatus";
import { BuilderChannel } from "./builderChannel";
import { type BatchJob, BuilderWorkQueue } from "./builderWorkQueue";

interface BuilderLanesLinks {
  generation: () => number;
  runQueuedBatch: (batch: BatchJob) => Promise<void>;
  runBatch: (work: BatchWork) => Promise<BuildBatchResult>;
}

export class BuilderLanes {
  readonly #app: App;
  readonly #logger: Logger;
  readonly #links: BuilderLanesLinks;
  /** Arming and the route entries deferred behind it run beside both lanes; a recycle waits for them too. */
  readonly #beside = new Set<Promise<void>>();
  //* Two lanes: a save's codegen and CSR patch in the fast one, which the watcher waits for; build workers, route
  //* builds and discovery in the slow one, which folds queued batches. A save no longer waits behind pages and css.
  #fastQueue: Promise<void> = Promise.resolve();
  readonly #workQueue: BuilderWorkQueue;
  #inFlight = 0;
  #workCount = 0;
  #shuttingDown = false;
  #cssRebuildQueue: Promise<void> = Promise.resolve();
  #cssRebuildTimer: ReturnType<typeof setTimeout> | null = null;
  #pendingCssRebuild: { generation?: number; changedFiles?: string[] } | null = null;

  constructor(app: App, { logger }: { logger: Logger }, links: BuilderLanesLinks) {
    this.#app = app;
    this.#logger = logger;
    this.#links = links;
    this.#workQueue = new BuilderWorkQueue({
      runBatch: async (batch) => await this.#links.runQueuedBatch(batch),
      onSettled: (label, ms) => {
        this.#workCount += 1;
        this.#logger.verbose(`[work-queue] ${label} finished in ${ms}ms`);
        this.#reportMetrics();
      },
    });
  }

  get workQueue(): BuilderWorkQueue {
    return this.#workQueue;
  }

  get inFlight(): number {
    return this.#inFlight;
  }

  get shuttingDown(): boolean {
    return this.#shuttingDown;
  }

  markShuttingDown(): void {
    this.#shuttingDown = true;
  }

  async enqueueFast<T>(label: string, fn: () => Promise<T>): Promise<T> {
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
  runBeside(work: Promise<void>): Promise<void> {
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
      data: { rssBytes: process.memoryUsage.rss(), generation: this.#links.generation(), workCount: this.#workCount },
    });
  }

  async drain(): Promise<void> {
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
  }

  // Voided so the fast lane need not wait; unhandled, a rejection would exit the builder and drop the watcher with it.
  slowLaneFailed(label: string) {
    return (error: unknown) =>
      this.#logger.error(
        `${label} failed in the slow lane: ${ApplicationBuildReporter.formatError(error, this.#app.workspace.workspaceRoot)}`,
      );
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
          await this.#links.runBatch({
            generation: next.generation ?? this.#links.generation(),
            needs: ["css"],
            changedFiles: next.changedFiles ?? [],
          });
        })
        .catch((err) => {
          const message = err instanceof Error ? err.message : String(err);
          this.#logger.error(`css-rebuild failed: ${message}`);
          sendBuildStatus("css", {
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
}
