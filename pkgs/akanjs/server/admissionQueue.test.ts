import { describe, expect, test } from "bun:test";
import { type AdmissionOutcome, AdmissionQueue } from "./admissionQueue";

const settled = async (pending: Promise<AdmissionOutcome>): Promise<AdmissionOutcome | "waiting"> =>
  await Promise.race([pending, Promise.resolve().then(() => Promise.resolve("waiting" as const))]);

describe("AdmissionQueue", () => {
  test("admits up to the limit at once and the rest in the order they came", async () => {
    const queue = new AdmissionQueue({ limit: 2, maxQueue: 0, maxWaitMs: 0 });
    expect(await queue.enter("a")).toEqual({ admitted: true, queued: false, waitedMs: 0 });
    expect(await queue.enter("b")).toMatchObject({ admitted: true, queued: false });
    const order: string[] = [];
    const waiting = ["c", "d", "e"].map((key) => queue.enter(key).then(() => order.push(key)));
    expect([queue.inFlight, queue.waiting]).toEqual([2, 3]);

    queue.leave("b");
    queue.leave("a");
    queue.leave("c");
    await Promise.all(waiting);
    expect(order).toEqual(["c", "d", "e"]);
    expect([queue.inFlight, queue.waiting]).toEqual([2, 0]);
  });

  test("never lets a newcomer pass a waiter when a slot frees", async () => {
    const queue = new AdmissionQueue({ limit: 1, maxQueue: 0, maxWaitMs: 0 });
    await queue.enter("first");
    const waiter = queue.enter("waiter");
    queue.leave("first");
    const newcomer = queue.enter("newcomer");
    expect(await settled(waiter)).toMatchObject({ admitted: true, queued: true });
    expect(await settled(newcomer)).toBe("waiting");
    queue.leave("waiter");
    expect(await newcomer).toMatchObject({ admitted: true, queued: true });
  });

  test("a waiter that leaves is gone at once and never takes a slot", async () => {
    const queue = new AdmissionQueue({ limit: 1, maxQueue: 0, maxWaitMs: 0 });
    await queue.enter("holder");
    const gone = queue.enter("gone");
    const next = queue.enter("next");
    queue.leave("gone");
    expect(await gone).toMatchObject({ admitted: false, reason: "left" });
    expect(queue.waiting).toBe(1);

    queue.leave("holder");
    expect(await next).toMatchObject({ admitted: true });
    expect([queue.inFlight, queue.waiting]).toEqual([1, 0]);
    queue.leave("next");
    expect(queue.inFlight).toBe(0);
  });

  test("leaving twice, or without having entered, frees one slot at most", async () => {
    const queue = new AdmissionQueue({ limit: 1, maxQueue: 0, maxWaitMs: 0 });
    await queue.enter("a");
    const b = queue.enter("b");
    const c = queue.enter("c");
    queue.leave("a");
    queue.leave("a");
    queue.leave("stranger");
    expect(await b).toMatchObject({ admitted: true });
    expect(await settled(c)).toBe("waiting");
    expect(queue.inFlight).toBe(1);
  });

  test("a holder entering again keeps its one slot", async () => {
    const queue = new AdmissionQueue({ limit: 1, maxQueue: 0, maxWaitMs: 0 });
    await queue.enter("a");
    expect(await queue.enter("a")).toMatchObject({ admitted: true, queued: false });
    queue.leave("a");
    expect(queue.inFlight).toBe(0);
  });

  test("refuses past the depth limit without queueing, and admits again once the queue drains", async () => {
    const queue = new AdmissionQueue({ limit: 1, maxQueue: 2, maxWaitMs: 0 });
    await queue.enter("holder");
    const first = queue.enter("first");
    void queue.enter("second");
    expect(await queue.enter("third")).toEqual({ admitted: false, reason: "queue-full", waitedMs: 0 });
    expect(queue.waiting).toBe(2);

    queue.leave("holder");
    await first;
    expect(await settled(queue.enter("fourth"))).toBe("waiting");
  });

  test("refuses a waiter that waited past the wait limit and keeps the others in order", async () => {
    const queue = new AdmissionQueue({ limit: 1, maxQueue: 0, maxWaitMs: 30 });
    await queue.enter("holder");
    const late = await queue.enter("late");
    expect(late).toMatchObject({ admitted: false, reason: "wait-timeout" });
    expect(late.waitedMs).toBeGreaterThanOrEqual(25);
    expect(queue.waiting).toBe(0);

    const next = queue.enter("next");
    queue.leave("holder");
    expect(await next).toMatchObject({ admitted: true, queued: true });
  });

  test("with no limit everything is admitted and still counted", async () => {
    const queue = new AdmissionQueue({ limit: 0, maxQueue: 1, maxWaitMs: 1 });
    for (const key of ["a", "b", "c"]) expect(await queue.enter(key)).toMatchObject({ admitted: true, queued: false });
    expect([queue.inFlight, queue.waiting]).toEqual([3, 0]);
    for (const key of ["a", "b", "c"]) queue.leave(key);
    expect(queue.inFlight).toBe(0);
  });
});
