import type { HmrTrace } from "akanjs/server";
import type { BuildBatchNeed } from "./buildBatchProtocol";

export interface DiscoveryJob {
  files: string[];
  refresh: boolean;
  /** The newest batch these files came from: a route build that starts after has taken it in. */
  generation: number;
}

export interface BatchJob {
  generation: number;
  needs: BuildBatchNeed[];
  changedFiles: string[];
  trace?: HmrTrace;
  /** Code files whose client-entry discovery goes stale before this batch builds; `refresh` rebuilds it whole. */
  discovery?: DiscoveryJob;
}

interface QueuedJob {
  label: string;
  batch: BatchJob | null;
  run: () => Promise<void>;
  settle: PromiseWithResolvers<void>;
}

export interface BuilderWorkQueueOptions {
  runBatch: (batch: BatchJob) => Promise<void>;
  onSettled?: (label: string, ms: number) => void;
}

//* The builder's slow lane: build-worker batches, route builds and full CSR builds run here one at a time, so a save's
//* CSR patch never waits behind them. A batch queued behind another batch folds into it: a burst of saves builds pages
//* and css once for the newest generation instead of once per save.
export class BuilderWorkQueue {
  readonly #runBatch: BuilderWorkQueueOptions["runBatch"];
  readonly #onSettled: BuilderWorkQueueOptions["onSettled"];
  readonly #pending: QueuedJob[] = [];
  #running: QueuedJob | null = null;
  #idle: Promise<void> = Promise.resolve();
  #wakeIdle: (() => void) | null = null;

  constructor({ runBatch, onSettled }: BuilderWorkQueueOptions) {
    this.#runBatch = runBatch;
    this.#onSettled = onSettled;
  }

  /** Jobs waiting or running. */
  get size(): number {
    return this.#pending.length + (this.#running ? 1 : 0);
  }

  enqueueBatch(batch: BatchJob): Promise<void> {
    const tail = this.#pending.at(-1);
    if (tail?.batch) {
      tail.batch = BuilderWorkQueue.merge(tail.batch, batch);
      return tail.settle.promise;
    }
    const job = this.#job("batch", batch, async () => undefined);
    job.run = async () => await this.#runBatch(job.batch ?? batch);
    return this.#push(job);
  }

  enqueue<T>(label: string, run: () => Promise<T>): Promise<T> {
    let result: T | undefined;
    const job = this.#job(label, null, async () => {
      result = await run();
    });
    return this.#push(job).then(() => result as T);
  }

  /** Resolves once nothing is waiting or running, including jobs queued while it waits. */
  async drain(): Promise<void> {
    while (this.size > 0) await this.#idle;
  }

  static merge(into: BatchJob, next: BatchJob): BatchJob {
    const discovery =
      into.discovery || next.discovery
        ? {
            files: [...new Set([...(into.discovery?.files ?? []), ...(next.discovery?.files ?? [])])],
            refresh: !!into.discovery?.refresh || !!next.discovery?.refresh,
            generation: Math.max(into.discovery?.generation ?? 0, next.discovery?.generation ?? 0),
          }
        : undefined;
    return {
      generation: Math.max(into.generation, next.generation),
      needs: [...new Set([...into.needs, ...next.needs])],
      changedFiles: [...new Set([...into.changedFiles, ...next.changedFiles])],
      trace: next.trace ?? into.trace,
      ...(discovery ? { discovery } : {}),
    };
  }

  #job(label: string, batch: BatchJob | null, run: () => Promise<void>): QueuedJob {
    return { label, batch, run, settle: Promise.withResolvers<void>() };
  }

  #push(job: QueuedJob): Promise<void> {
    if (this.size === 0)
      this.#idle = new Promise<void>((resolve) => {
        this.#wakeIdle = resolve;
      });
    this.#pending.push(job);
    if (!this.#running) void this.#pump();
    return job.settle.promise;
  }

  async #pump(): Promise<void> {
    for (let job = this.#pending.shift(); job; job = this.#pending.shift()) {
      this.#running = job;
      const started = Date.now();
      try {
        await job.run();
        job.settle.resolve();
      } catch (error) {
        job.settle.reject(error);
      } finally {
        this.#running = null;
        this.#onSettled?.(job.label, Date.now() - started);
      }
    }
    this.#wakeIdle?.();
    this.#wakeIdle = null;
  }
}
