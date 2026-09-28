import { describe, expect, test } from "bun:test";
import type { SsrUpdatedPayload } from "../artifact";
import { type SsrUpdateMessage, SsrUpdateQueue } from "./ssrUpdateQueue";

const update = (generation: number, extra: Partial<SsrUpdatedPayload> = {}): SsrUpdatedPayload => ({
  generation,
  reload: false,
  patchUrl: `/_akan/ssr-dev/patch-${generation}.js`,
  ...extra,
});

const makeQueue = (options?: { maxHoldMs?: number }) => {
  const sent: SsrUpdateMessage[] = [];
  const queue = new SsrUpdateQueue((message) => sent.push(message), options);
  return { queue, sent, generations: () => sent.map((message) => message.generation) };
};

describe("SsrUpdateQueue", () => {
  test("sends a patch at once when its save changed nothing the server renders", () => {
    const { queue, generations } = makeQueue();
    queue.push(update(3));
    expect(generations()).toEqual([3]);
  });

  test("holds a patch until the pages build of its batch, and queues later patches behind it in order", () => {
    const { queue, generations } = makeQueue();
    queue.push(update(3, { hold: true, batchGeneration: 10 }));
    queue.push(update(4));
    queue.push(update(5, { hold: true, batchGeneration: 12 }));
    expect(generations()).toEqual([]);
    expect(queue.release(9).released).toBe(0);
    expect(queue.release(10).released).toBe(2);
    expect(generations()).toEqual([3, 4]);
    queue.push(update(6));
    expect(generations()).toEqual([3, 4]);
    expect(queue.release(12).released).toBe(2);
    expect(generations()).toEqual([3, 4, 5, 6]);
    expect(queue.size).toBe(0);
  });

  test("a merged pages batch releases every held patch it covers", () => {
    const { queue, generations } = makeQueue();
    queue.push(update(3, { hold: true, batchGeneration: 10 }));
    queue.push(update(4, { hold: true, batchGeneration: 11 }));
    queue.release(11);
    expect(generations()).toEqual([3, 4]);
  });

  test("a reload drops the patches ahead of it and goes out alone", () => {
    const { queue, sent } = makeQueue();
    queue.push(update(3));
    queue.push(update(4, { reload: true, reason: "an npm module joined the graph" }));
    expect(sent.map((message) => [message.generation, message.reload])).toEqual([
      [3, false],
      [4, true],
    ]);
  });

  test("a reload takes over the hold of a patch it supersedes, so the page it reloads renders that save's build", () => {
    const { queue, sent } = makeQueue();
    queue.push(update(3, { hold: true, batchGeneration: 10 }));
    queue.push(update(4, { reload: true, reason: "an npm module joined the graph" }));
    expect(sent).toEqual([]);
    expect(queue.release(9).released).toBe(0);
    expect(queue.release(10)).toEqual({ released: 1, reload: true });
    expect(sent.map((message) => [message.generation, message.reload])).toEqual([[4, true]]);
  });

  test("a reload that holds for its own batch waits for the later of the two", () => {
    const { queue } = makeQueue();
    queue.push(update(3, { hold: true, batchGeneration: 12 }));
    queue.push(update(4, { reload: true, reason: "task.constant.ts changed", hold: true, batchGeneration: 11 }));
    expect(queue.release(11).released).toBe(0);
    expect(queue.release(12).released).toBe(1);
  });

  test("clearing for a batch that reloads the tabs keeps a later batch's hold", () => {
    const { queue, generations } = makeQueue();
    queue.push(update(3, { hold: true, batchGeneration: 10 }));
    queue.push(update(4, { hold: true, batchGeneration: 11 }));
    queue.clear(10);
    expect(queue.size).toBe(1);
    queue.release(11);
    expect(generations()).toEqual([4]);
  });

  test("a reload whose save changed server output waits for that build, and says so on release", () => {
    const { queue, sent } = makeQueue();
    queue.push(update(3, { hold: true, batchGeneration: 10 }));
    queue.push(update(4, { reload: true, reason: "task.constant.ts changed", hold: true, batchGeneration: 11 }));
    expect(sent).toEqual([]);
    expect(queue.release(10)).toEqual({ released: 0, reload: false });
    expect(queue.release(11)).toEqual({ released: 1, reload: true });
    expect(sent.map((message) => [message.generation, message.reload])).toEqual([[4, true]]);
  });

  test("a patch held after the first waits its own full time once the first is released", async () => {
    const { queue, generations } = makeQueue({ maxHoldMs: 80 });
    queue.push(update(3, { hold: true, batchGeneration: 10 }));
    await Bun.sleep(60);
    queue.push(update(4, { hold: true, batchGeneration: 11 }));
    queue.release(10);
    expect(generations()).toEqual([3]);
    await Bun.sleep(40);
    expect(generations()).toEqual([3]);
    await Bun.sleep(80);
    expect(generations()).toEqual([3, 4]);
  });

  test("a pages build that never reports cannot strand held patches", async () => {
    const { queue, generations } = makeQueue({ maxHoldMs: 5 });
    queue.push(update(3, { hold: true, batchGeneration: 10 }));
    await Bun.sleep(20);
    expect(generations()).toEqual([3]);
  });
});
