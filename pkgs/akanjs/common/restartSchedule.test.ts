import { describe, expect, test } from "bun:test";
import { RestartSchedule } from "./restartSchedule";

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("RestartSchedule", () => {
  test("doubles the wait after each failed attempt up to the max, with no jitter by default", () => {
    const schedule = new RestartSchedule({ min: 200, max: 1_000 });
    expect([1, 2, 3, 4, 5].map(() => schedule.next())).toEqual([200, 400, 800, 1_000, 1_000]);
    expect(schedule.attempts).toBe(5);
  });

  test("starts over from the first wait after a reset", () => {
    const schedule = new RestartSchedule({ min: 1_000, max: 30_000 });
    schedule.next();
    schedule.next();
    schedule.reset();
    expect(schedule.attempts).toBe(0);
    expect(schedule.next()).toBe(1_000);
  });

  test("is exhausted once the failed attempts reach maxAttempts, and never without one", () => {
    const bounded = new RestartSchedule({ maxAttempts: 2 });
    expect(bounded.exhausted).toBe(false);
    bounded.next();
    expect(bounded.exhausted).toBe(false);
    bounded.next();
    expect(bounded.exhausted).toBe(true);
    bounded.reset();
    expect(bounded.exhausted).toBe(false);

    const unbounded = new RestartSchedule();
    for (let idx = 0; idx < 50; idx++) unbounded.next();
    expect(unbounded.exhausted).toBe(false);
  });

  test("runs the restart after its delay and is pending until then", async () => {
    const schedule = new RestartSchedule({ min: 10, max: 10 });
    let runs = 0;
    expect(schedule.schedule(() => runs++)).toBe(10);
    expect(schedule.pending).toBe(true);
    await wait(40);
    expect(runs).toBe(1);
    expect(schedule.pending).toBe(false);
  });

  test("a cancelled restart never runs, and arming again replaces the pending one", async () => {
    const schedule = new RestartSchedule({ min: 10, max: 10 });
    const runs: string[] = [];
    schedule.schedule(() => runs.push("first"));
    schedule.cancel();
    expect(schedule.pending).toBe(false);
    schedule.arm(10, () => runs.push("second"));
    schedule.arm(10, () => runs.push("third"));
    await wait(40);
    expect(runs).toEqual(["third"]);
  });
});
