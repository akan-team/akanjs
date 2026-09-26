import { Database } from "bun:sqlite";
import { afterEach, describe, expect, test } from "bun:test";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { AkanJob } from "../ipcTypes";
import { SolidQueue } from "./solidQueue.adaptor";
import { getSolidConfig, type SolidConfig } from "./solidSqlite";

const queueName = "queue-test-app-testing-local";
const filePaths: string[] = [];
const openQueues = new Set<SolidQueue>();

const newFilePath = () => {
  const filePath = path.join(tmpdir(), `solid-queue-test-${crypto.randomUUID()}.db`);
  filePaths.push(filePath);
  return filePath;
};

const openQueue = async (filePath: string, solid: SolidConfig = {}) => {
  const queue = new SolidQueue();
  Object.assign(queue, {
    config: getSolidConfig({ solid: { queuePollIntervalMs: 60_000, cleanupIntervalMs: 60_000, ...solid, filePath } }),
    queueName,
    workerId: "test-worker",
    logger: { error: () => undefined, warn: () => undefined, verbose: () => undefined },
  });
  await queue.onInit();
  openQueues.add(queue);
  return queue;
};

const closeQueue = async (queue: SolidQueue) => {
  openQueues.delete(queue);
  await queue.onDestroy();
};

const rowsOf = (filePath: string) => {
  const db = new Database(filePath, { readonly: true });
  try {
    return db.query(`SELECT "id", "status" FROM "_akan_solid_jobs" ORDER BY "createdAt" ASC`).all() as {
      id: string;
      status: string;
    }[];
  } finally {
    db.close();
  }
};

const runOne = async (queue: SolidQueue, name: string, handler: (job: AkanJob) => Promise<unknown>) => {
  const job = queue.claimJob(name);
  if (!job) throw new Error(`no job to claim for ${name}`);
  await queue.runJob(job, handler);
};

const succeed = async () => "ok";
const fail = async () => {
  throw new Error("job failed on purpose");
};

afterEach(async () => {
  for (const queue of [...openQueues]) await closeQueue(queue);
  for (const filePath of filePaths.splice(0))
    for (const suffix of ["", "-wal", "-shm"]) rmSync(`${filePath}${suffix}`, { force: true });
});

describe("SolidQueue job retention", () => {
  test("drops a completed job by default", async () => {
    const filePath = newFilePath();
    const queue = await openQueue(filePath);
    await queue.registerProcessQueue("mail", ["a"]);
    await runOne(queue, "mail", succeed);
    expect(rowsOf(filePath)).toEqual([]);
  });

  test("keeps a completed job when removeOnComplete is false", async () => {
    const filePath = newFilePath();
    const queue = await openQueue(filePath);
    const { id } = await queue.registerProcessQueue("mail", ["a"], { removeOnComplete: false });
    await runOne(queue, "mail", succeed);
    expect(rowsOf(filePath)).toEqual([{ id, status: "completed" }]);
  });

  test("keeps only the newest N completed jobs when removeOnComplete is a number", async () => {
    const filePath = newFilePath();
    const queue = await openQueue(filePath);
    const ids: string[] = [];
    for (const arg of ["a", "b", "c"]) {
      ids.push((await queue.registerProcessQueue("mail", [arg], { removeOnComplete: 2 })).id);
      await runOne(queue, "mail", succeed);
      await Bun.sleep(2);
    }
    expect(rowsOf(filePath).map(({ id }) => id)).toEqual(ids.slice(1));
  });

  test("keeps a failed job by default", async () => {
    const filePath = newFilePath();
    const queue = await openQueue(filePath);
    const { id } = await queue.registerProcessQueue("mail", ["a"]);
    await runOne(queue, "mail", fail);
    expect(rowsOf(filePath)).toEqual([{ id, status: "failed" }]);
  });

  test("drops a failed job when removeOnFail is true", async () => {
    const filePath = newFilePath();
    const queue = await openQueue(filePath);
    await queue.registerProcessQueue("mail", ["a"], { removeOnFail: true });
    await runOne(queue, "mail", fail);
    expect(rowsOf(filePath)).toEqual([]);
  });

  test("settles a retried job only after its last attempt", async () => {
    const filePath = newFilePath();
    const queue = await openQueue(filePath);
    const { id } = await queue.registerProcessQueue("mail", ["a"], { attempts: 2 });
    await runOne(queue, "mail", fail);
    expect(rowsOf(filePath)).toEqual([{ id, status: "pending" }]);
    await runOne(queue, "mail", succeed);
    expect(rowsOf(filePath)).toEqual([]);
  });

  test("boot cleanup drops completed rows from earlier versions and expired failures", async () => {
    const filePath = newFilePath();
    await closeQueue(await openQueue(filePath));
    const db = new Database(filePath);
    const insert = db.query(
      `INSERT INTO "_akan_solid_jobs" ("id", "queue", "name", "payload", "status", "priority", "runAt", "attempts", "maxAttempts", "createdAt", "updatedAt")
       VALUES (?, ?, 'mail', ?, ?, 0, 0, 1, 1, ?, ?)`,
    );
    const old = Date.now() - 60_000;
    const now = Date.now();
    const payload = (opts: object) => JSON.stringify({ args: [], opts });
    insert.run("legacy-completed", queueName, payload({}), "completed", old, old);
    insert.run("kept-completed", queueName, payload({ removeOnComplete: false }), "completed", old + 1, old + 1);
    insert.run("expired-failed", queueName, payload({}), "failed", old + 2, old + 2);
    insert.run("kept-failed", queueName, payload({ removeOnFail: false }), "failed", old + 3, old + 3);
    insert.run("fresh-failed", queueName, payload({}), "failed", now, now);
    db.close();

    await openQueue(filePath, { queueFailedRetentionMs: 1_000 });
    await Bun.sleep(20);
    expect(rowsOf(filePath).map(({ id }) => id)).toEqual(["kept-completed", "kept-failed", "fresh-failed"]);
  });
});
