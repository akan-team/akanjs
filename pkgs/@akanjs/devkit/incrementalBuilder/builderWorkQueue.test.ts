import { describe, expect, test } from "bun:test";
import { type BatchJob, BuilderWorkQueue } from "./builderWorkQueue";

const gate = () => {
  const { promise: opened, resolve: open } = Promise.withResolvers<void>();
  return { open, opened };
};

describe("BuilderWorkQueue", () => {
  test("runs jobs one at a time, in the order they were queued", async () => {
    const order: string[] = [];
    const queue = new BuilderWorkQueue({ runBatch: async () => undefined });
    const first = gate();
    const a = queue.enqueue("a", async () => {
      await first.opened;
      order.push("a");
    });
    const b = queue.enqueue("b", async () => {
      order.push("b");
      return 2;
    });
    expect(queue.size).toBe(2);
    first.open();
    await a;
    expect(await b).toBe(2);
    expect(order).toEqual(["a", "b"]);
    expect(queue.size).toBe(0);
  });

  test("folds a batch queued behind another batch into it, for the newest generation", async () => {
    const ran: BatchJob[] = [];
    const running = gate();
    const queue = new BuilderWorkQueue({
      runBatch: async (batch) => {
        ran.push(batch);
        if (ran.length === 1) await running.opened;
      },
    });
    const first = queue.enqueueBatch({ generation: 1, needs: ["pages", "css"], changedFiles: ["a.tsx"] });
    const second = queue.enqueueBatch({
      generation: 2,
      needs: ["pages", "css"],
      changedFiles: ["b.tsx"],
      discovery: { files: ["b.tsx"], refresh: false, generation: 2 },
    });
    const third = queue.enqueueBatch({ generation: 3, needs: ["csr", "pages"], changedFiles: ["a.tsx", "c.tsx"] });
    expect(second).toBe(third);
    running.open();
    await Promise.all([first, second, third]);
    expect(ran).toHaveLength(2);
    expect(ran[1]).toEqual({
      generation: 3,
      needs: ["pages", "css", "csr"],
      changedFiles: ["b.tsx", "a.tsx", "c.tsx"],
      discovery: { files: ["b.tsx"], refresh: false, generation: 2 },
    });
  });

  test("keeps a batch queued after a task behind that task", async () => {
    const order: string[] = [];
    const running = gate();
    const queue = new BuilderWorkQueue({
      runBatch: async (batch) => {
        order.push(`batch:${batch.generation}`);
        if (batch.generation === 1) await running.opened;
      },
    });
    const first = queue.enqueueBatch({ generation: 1, needs: ["pages"], changedFiles: [] });
    const route = queue.enqueue("route", async () => {
      order.push("route");
    });
    const second = queue.enqueueBatch({ generation: 2, needs: ["pages"], changedFiles: [] });
    running.open();
    await Promise.all([first, route, second]);
    expect(order).toEqual(["batch:1", "route", "batch:2"]);
  });

  test("drains jobs queued while it waits, and survives a job that throws", async () => {
    const queue = new BuilderWorkQueue({ runBatch: async () => undefined });
    const failing = queue.enqueue("fails", async () => {
      throw new Error("boom");
    });
    let late = false;
    void queue.enqueue("queues-more", async () => {
      void queue.enqueue("late", async () => {
        late = true;
      });
    });
    await expect(failing).rejects.toThrow("boom");
    await queue.drain();
    expect(late).toBe(true);
    expect(queue.size).toBe(0);
  });
});
