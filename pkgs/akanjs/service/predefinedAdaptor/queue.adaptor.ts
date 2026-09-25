import type { BaseEnv } from "akanjs/base";
import { adapt } from "../adapt";
import type { AkanJob, AkanJobOptions, AkanWorker } from "../ipcTypes";
import { RedisCache } from "./cache.adaptor";

type QueueLike = {
  add(name: string, args: unknown[], options?: AkanJobOptions): Promise<unknown>;
};
type WorkerLike = AkanWorker;
type WorkerConstructor = new (
  name: string,
  handler: (job: AkanJob) => Promise<unknown>,
  options: { connection: unknown },
) => WorkerLike;
type QueueConstructor = new (
  name: string,
  options: { connection: unknown; defaultJobOptions: { removeOnComplete: boolean; removeOnFail: boolean } },
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
  extends adapt("bullQueue", ({ plug, env }) => ({
    redis: plug(RedisCache, (redisCache) => redisCache.getClient()),
    prefix: env((env: BaseEnv) => `queue-${env.repoName}-${env.appName}-${env.environment}-${env.operationMode}`),
  }))
  implements QueueAdaptor
{
  #queues = new Map<string, QueueLike>();
  #Queue!: QueueConstructor;
  #Worker!: WorkerConstructor;

  override async onInit(): Promise<void> {
    const { Queue, Worker } = (await import(bullmqPackage)) as BullmqModule;
    this.#Queue = Queue;
    this.#Worker = Worker;
  }
  // bullmq scopes a Worker to a *queue* name, not a job name, so producer and consumer must agree on the queue.
  // One queue per process key keeps each worker consuming only its own jobs, mirroring SolidQueue's per-name workers.
  #queueName(key: string) {
    return `${this.prefix}:${key}`;
  }
  getQueue(key: string): QueueLike {
    const name = this.#queueName(key);
    const queue = this.#queues.get(name);
    if (queue) return queue;
    const newQueue = new this.#Queue(name, {
      connection: this.redis,
      defaultJobOptions: { removeOnComplete: true, removeOnFail: true },
    });
    this.#queues.set(name, newQueue);
    return newQueue;
  }
  registerProcessWorker(key: string, handler: (job: AkanJob) => Promise<unknown>): WorkerLike {
    const worker = new this.#Worker(this.#queueName(key), handler, {
      connection: this.redis,
    });
    return worker;
  }
  async registerProcessQueue(key: string, args: unknown[], jobOptions?: AkanJobOptions): Promise<AkanJob> {
    const job = await this.getQueue(key).add(key, args, jobOptions);
    return job as unknown as AkanJob;
  }
}
