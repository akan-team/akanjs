import type { Redis, RedisOptions } from "ioredis";
import { adapt } from "../adapt";
import type { AkanJob, AkanJobOptions, AkanWorker } from "../ipcTypes";
import { RedisCache } from "./cache.adaptor";
import { QueueBackoff } from "./queueBackoff";

interface BullEmitter {
  on(event: "error", listener: (error: Error) => void): unknown;
  waitUntilReady(): Promise<unknown>;
  close(): Promise<void>;
}
interface QueueLike extends BullEmitter {
  add(name: string, args: unknown[], options?: AkanJobOptions): Promise<unknown>;
}
type WorkerLike = AkanWorker &
  BullEmitter & { on(event: "failed", listener: (job: AkanJob | undefined, error: Error) => void): unknown };
interface BullOptions {
  connection: Redis | RedisOptions;
  prefix: string;
}
type WorkerConstructor = new (
  name: string,
  handler: (job: AkanJob) => Promise<unknown>,
  options: BullOptions & { settings?: { backoffStrategy?: (attemptsMade: number, type?: string) => number } },
) => WorkerLike;
type QueueConstructor = new (
  name: string,
  options: BullOptions & { defaultJobOptions: AkanJobOptions | Record<string, unknown> },
) => QueueLike;
type BullmqModule = {
  Queue: QueueConstructor;
  Worker: WorkerConstructor;
};
const bullmqPackage = "bullmq";

export interface ProcessWorkerOptions {
  /** After the job's last attempt failed. */
  onFailed?: (job: AkanJob, error: unknown) => Promise<void> | void;
}

export interface QueueAdaptor {
  registerProcessWorker(
    key: string,
    handler: (job: AkanJob) => Promise<unknown>,
    options?: ProcessWorkerOptions,
  ): AkanWorker;
  registerProcessQueue(key: string, args: unknown[], jobOptions?: AkanJobOptions): Promise<AkanJob>;
}

export class BullQueue
  extends adapt("bullQueue", ({ plug }) => ({
    redis: plug(RedisCache, (redisCache) => redisCache.getClient()),
    prefix: plug(RedisCache, (redisCache) => `${redisCache.keyPrefix}queue`),
  }))
  implements QueueAdaptor
{
  // What SolidQueue keeps of a failed job: a week, and on Redis — which holds every key in memory — the newest 1000.
  static readonly #failedJobs = { age: 7 * 24 * 60 * 60, count: 1000 };
  #queues = new Map<string, QueueLike>();
  #workers: WorkerLike[] = [];
  #Queue!: QueueConstructor;
  #Worker!: WorkerConstructor;

  override async onInit(): Promise<void> {
    const { Queue, Worker } = (await import(bullmqPackage)) as BullmqModule;
    this.#Queue = Queue;
    this.#Worker = Worker;
  }
  override async onDestroy() {
    // A worker closed mid-connect leaves bullmq an unheld rejection, so it gets a bounded moment to finish opening.
    const settle = async (worker: WorkerLike) => {
      await Promise.race([worker.waitUntilReady().catch(() => undefined), Bun.sleep(2_000)]);
      await worker.close();
    };
    await Promise.all(this.#workers.splice(0).map(settle));
    await Promise.all([...this.#queues.values()].map(async (queue) => await queue.close()));
    this.#queues.clear();
  }
  // bullmq scopes a Worker to a queue, not a job name, so one queue per key keeps each worker on its own jobs. App and
  // environment ride bullmq's `prefix`, as a queue name may not contain `:`.
  getQueue(key: string): QueueLike {
    const queue = this.#queues.get(key);
    if (queue) return queue;
    const newQueue = new this.#Queue(key, {
      connection: this.redis,
      prefix: this.prefix,
      defaultJobOptions: { removeOnComplete: true, removeOnFail: BullQueue.#failedJobs },
    });
    newQueue.on("error", (error) => this.logger.warn(`Queue ${key} error: ${error.message}`));
    this.#queues.set(key, newQueue);
    return newQueue;
  }
  registerProcessWorker(
    key: string,
    handler: (job: AkanJob) => Promise<unknown>,
    { onFailed }: ProcessWorkerOptions = {},
  ): WorkerLike {
    // Options, not the cache's client: bullmq refuses a client that gives up after a few retries, and it closes the
    // connections it opened itself even mid-open.
    const connection = { ...this.redis.options, maxRetriesPerRequest: null };
    const worker = new this.#Worker(key, handler, {
      connection,
      prefix: this.prefix,
      settings: { backoffStrategy: BullQueue.cappedBackoff },
    });
    worker.on("error", (error) => this.logger.warn(`Worker ${key} error: ${error.message}`));
    //? bullmq counts the attempt that just failed before it emits, so the last one reads attemptsMade === attempts.
    worker.on("failed", (job, error) => {
      if (!onFailed || !job || job.attemptsMade < Math.max(1, Number(job.opts?.attempts ?? 1))) return;
      Promise.resolve(onFailed(job, error)).catch((hookError: unknown) =>
        this.logger.warn(`onFailed of ${key} threw: ${hookError instanceof Error ? hookError.message : hookError}`),
      );
    });
    this.#workers.push(worker);
    return worker;
  }
  async registerProcessQueue(key: string, args: unknown[], jobOptions?: AkanJobOptions): Promise<AkanJob> {
    const job = await this.getQueue(key).add(key, args, BullQueue.#withCappedBackoff(jobOptions));
    return job as unknown as AkanJob;
  }
  //* bullmq hands a custom strategy only the backoff's type, so a cap travels in it: `akan:<type>:<delay>:<maxDelay>`.
  static #withCappedBackoff(jobOptions?: AkanJobOptions): AkanJobOptions | undefined {
    const backoff = jobOptions?.backoff;
    if (!jobOptions || typeof backoff !== "object" || backoff.maxDelay === undefined) return jobOptions;
    const type = `akan:${backoff.type ?? "fixed"}:${Number(backoff.delay ?? 0)}:${Number(backoff.maxDelay)}`;
    return { ...jobOptions, backoff: { type, delay: Number(backoff.delay ?? 0) } };
  }
  static cappedBackoff(attemptsMade: number, type?: string): number {
    const [prefix, base, delay, maxDelay] = (type ?? "").split(":");
    if (prefix !== "akan") return 0;
    return QueueBackoff.delayOf({ type: base, delay: Number(delay), maxDelay: Number(maxDelay) }, attemptsMade);
  }
}
