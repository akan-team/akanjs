import type { Redis, RedisOptions } from "ioredis";
import { adapt } from "../adapt";
import type { AkanJob, AkanJobOptions, AkanWorker } from "../ipcTypes";
import { RedisCache } from "./cache.adaptor";

interface BullEmitter {
  on(event: "error", listener: (error: Error) => void): unknown;
  waitUntilReady(): Promise<unknown>;
  close(): Promise<void>;
}
interface QueueLike extends BullEmitter {
  add(name: string, args: unknown[], options?: AkanJobOptions): Promise<unknown>;
}
type WorkerLike = AkanWorker & BullEmitter;
interface BullOptions {
  connection: Redis | RedisOptions;
  prefix: string;
}
type WorkerConstructor = new (
  name: string,
  handler: (job: AkanJob) => Promise<unknown>,
  options: BullOptions,
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

export interface QueueAdaptor {
  registerProcessWorker(key: string, handler: (job: AkanJob) => Promise<unknown>): AkanWorker;
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
    // A worker closed while its connections are still opening leaves bullmq with a rejection nobody holds, so it gets
    // a moment to finish opening — bounded, since a Redis that is down never lets it.
    const settle = async (worker: WorkerLike) => {
      await Promise.race([worker.waitUntilReady().catch(() => undefined), Bun.sleep(2_000)]);
      await worker.close();
    };
    await Promise.all(this.#workers.splice(0).map(settle));
    await Promise.all([...this.#queues.values()].map(async (queue) => await queue.close()));
    this.#queues.clear();
  }
  // bullmq scopes a Worker to a *queue* name, not a job name, so producer and consumer must agree on the queue.
  // One queue per process key keeps each worker consuming only its own jobs, mirroring SolidQueue's per-name workers.
  // The app and environment ride bullmq's `prefix`, because a queue name may not contain `:`.
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
  registerProcessWorker(key: string, handler: (job: AkanJob) => Promise<unknown>): WorkerLike {
    // Options rather than the cache's client: a worker blocks on its connections waiting for jobs, bullmq refuses one
    // that gives up on a command after a few retries as the cache's client does, and connections bullmq opened itself
    // are ones it closes itself — even when the worker closes before they finished opening.
    const connection = { ...this.redis.options, maxRetriesPerRequest: null };
    const worker = new this.#Worker(key, handler, { connection, prefix: this.prefix });
    worker.on("error", (error) => this.logger.warn(`Worker ${key} error: ${error.message}`));
    this.#workers.push(worker);
    return worker;
  }
  async registerProcessQueue(key: string, args: unknown[], jobOptions?: AkanJobOptions): Promise<AkanJob> {
    const job = await this.getQueue(key).add(key, args, jobOptions);
    return job as unknown as AkanJob;
  }
}
