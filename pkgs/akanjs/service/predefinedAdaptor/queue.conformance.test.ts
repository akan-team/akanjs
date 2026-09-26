import { afterAll, afterEach, describe, expect, test } from "bun:test";
import path from "node:path";
import type { Redis } from "ioredis";
import { ConformanceEnv } from "../../test/conformance";
import type { AkanJob } from "../ipcTypes";
import { BullQueue, type QueueAdaptor } from "./queue.adaptor";
import { SolidQueue } from "./solidQueue.adaptor";
import { getSolidConfig } from "./solidSqlite";

// Solid's answers are the contract, except where `PLAN.md` decided otherwise (D9: priority reads the way bullmq reads
// it). A known divergence is `test.failingIf(<kind>)` with its id from `local/database-modes/01-multiple-redis.md`.

type QueueKind = "solid" | "bull";

interface OpenedQueue {
  queue: QueueAdaptor;
  close: () => Promise<void>;
}

/** One place both instances of a test meet: a SQLite file for Solid, a key prefix on the shared Redis for bullmq. */
const newBackend = async (kind: QueueKind) => {
  if (kind === "solid") {
    const { dir, remove } = await ConformanceEnv.tempDir("akan-queue");
    return { location: path.join(dir, "queue.db"), remove };
  }
  return {
    location: ConformanceEnv.uniqueName("queue-conformance").replaceAll("_", "-"),
    remove: async () => undefined,
  };
};

const openQueue = async (kind: QueueKind, location: string, { leaseMs = 30_000 } = {}): Promise<OpenedQueue> => {
  if (kind === "solid") {
    const queue = new SolidQueue();
    Object.assign(queue, {
      config: getSolidConfig({
        solid: { filePath: location, queuePollIntervalMs: 20, cleanupIntervalMs: 60_000, queueLeaseMs: leaseMs },
      }),
      queueName: "queue-conformance",
      workerId: ConformanceEnv.uniqueName("worker"),
      logger: { error: () => undefined, warn: () => undefined, verbose: () => undefined },
    });
    await queue.onInit();
    return { queue, close: async () => await queue.onDestroy() };
  }
  const { Redis } = await import("ioredis");
  const client: Redis = new Redis(ConformanceEnv.url("redis") as string, { lazyConnect: true });
  await client.connect();
  const queue = new BullQueue();
  Object.assign(queue, { redis: client, prefix: location });
  await queue.onInit();
  return {
    queue,
    close: async () => {
      await (queue as unknown as { onDestroy(): Promise<void> | void }).onDestroy();
      client.disconnect();
    },
  };
};

const until = async (condition: () => boolean, timeoutMs = 3_000) => {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error(`condition not met within ${timeoutMs}ms`);
    await Bun.sleep(10);
  }
};

const kinds: QueueKind[] = ["solid", ...(ConformanceEnv.has("queue conformance", "redis") ? (["bull"] as const) : [])];

for (const kind of kinds) {
  const onBull = kind === "bull";

  describe(`queue conformance (${kind})`, () => {
    const cleanups: (() => Promise<void>)[] = [];
    const open = async (location: string, options?: { leaseMs?: number }) => {
      const opened = await openQueue(kind, location, options);
      cleanups.push(opened.close);
      return opened.queue;
    };
    const backend = async () => {
      const created = await newBackend(kind);
      cleanups.push(created.remove);
      return created.location;
    };

    afterEach(async () => {
      for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
    });
    afterAll(async () => {
      for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
    });

    test("[Q-1][Q-2] a job reaches its worker with its arguments", async () => {
      const queue = await open(await backend());
      const received: unknown[] = [];
      queue.registerProcessWorker("mail", async (job: AkanJob) => {
        received.push(job.data);
      });
      await queue.registerProcessQueue("mail", ["to@example.com", 3]);
      await until(() => received.length === 1);
      expect(received).toEqual([["to@example.com", 3]]);
    });

    test("[Q-1] two instances on one backend run every job exactly once", async () => {
      const location = await backend();
      const [first, second] = [await open(location), await open(location)];
      const runs: string[] = [];
      const handler = async (job: AkanJob) => {
        runs.push(job.id);
        await Bun.sleep(5);
      };
      first.registerProcessWorker("mail", handler);
      second.registerProcessWorker("mail", handler);
      const ids: string[] = [];
      for (let idx = 0; idx < 20; idx++) ids.push((await first.registerProcessQueue("mail", [idx])).id);
      await until(() => runs.length >= 20);
      await Bun.sleep(50);
      expect(runs.sort((a, b) => a.localeCompare(b))).toEqual(ids.sort((a, b) => a.localeCompare(b)));
    });

    test("[Q-3] priority: no priority first, then the smallest number (D9)", async () => {
      const queue = await open(await backend());
      await queue.registerProcessQueue("mail", ["five"], { priority: 5 });
      await queue.registerProcessQueue("mail", ["none"]);
      await queue.registerProcessQueue("mail", ["one"], { priority: 1 });
      const order: unknown[] = [];
      queue.registerProcessWorker("mail", async (job: AkanJob) => {
        order.push((job.data as unknown[])[0]);
      });
      await until(() => order.length === 3);
      expect(order).toEqual(["none", "one", "five"]);
    });

    test("[Q-7] a destroyed adaptor stops taking jobs", async () => {
      const location = await backend();
      const worker = await openQueue(kind, location);
      const producer = await open(location);
      const received: unknown[] = [];
      worker.queue.registerProcessWorker("mail", async (job: AkanJob) => {
        received.push(job.data);
      });
      await worker.close();
      await producer.registerProcessQueue("mail", ["after-destroy"]);
      await Bun.sleep(200);
      expect(received).toEqual([]);
    });

    test("[Q-5] a failing job retries on bullmq's exponential schedule", async () => {
      const queue = await open(await backend());
      const attempts: number[] = [];
      queue.registerProcessWorker("mail", async () => {
        attempts.push(Date.now());
        throw new Error("try again");
      });
      await queue.registerProcessQueue("mail", ["retry"], {
        attempts: 3,
        backoff: { type: "exponential", delay: 100 },
      });
      await until(() => attempts.length === 3, 5_000);
      const [first, second, third] = attempts as [number, number, number];
      expect(second - first).toBeGreaterThanOrEqual(90);
      expect(third - second).toBeGreaterThanOrEqual(190);
    });

    test.skipIf(onBull)("a job whose worker stopped answering is picked up once its lease runs out", async () => {
      const location = await backend();
      const stuck = await open(location, { leaseMs: 100 });
      const rescuer = await open(location, { leaseMs: 100 });
      let release!: () => void;
      const hang = new Promise<void>((resolve) => {
        release = resolve;
      });
      cleanups.push(async () => release());
      const rescued: string[] = [];
      stuck.registerProcessWorker("mail", async () => await hang);
      await stuck.registerProcessQueue("mail", ["stuck"]);
      await Bun.sleep(20);
      rescuer.registerProcessWorker("mail", async (job: AkanJob) => {
        rescued.push(job.id);
      });
      await until(() => rescued.length === 1);
      expect(rescued).toHaveLength(1);
    });
  });
}
