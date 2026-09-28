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
    expect(queue.release(9)).toBe(0);
    expect(queue.release(10)).toBe(2);
    expect(generations()).toEqual([3, 4]);
    queue.push(update(6));
    expect(generations()).toEqual([3, 4]);
    expect(queue.release(12)).toBe(2);
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

  test("a reload drops what is held and goes out alone", () => {
    const { queue, sent } = makeQueue();
    queue.push(update(3, { hold: true, batchGeneration: 10 }));
    queue.push(update(4, { reload: true, reason: "the route table changed" }));
    expect(sent.map((message) => [message.generation, message.reload])).toEqual([[4, true]]);
    expect(queue.release(10)).toBe(0);
  });

  test("a pages build that never reports cannot strand held patches", async () => {
    const { queue, generations } = makeQueue({ maxHoldMs: 5 });
    queue.push(update(3, { hold: true, batchGeneration: 10 }));
    await Bun.sleep(20);
    expect(generations()).toEqual([3]);
  });
});
