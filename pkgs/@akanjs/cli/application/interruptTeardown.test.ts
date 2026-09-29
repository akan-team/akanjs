import { describe, expect, test } from "bun:test";
import { InterruptTeardown } from "./interruptTeardown";

const harness = () => {
  const exits: number[] = [];
  const reports: string[] = [];
  let signal: (() => void) | null = null;
  let listeners = 0;
  const interrupt = new InterruptTeardown({
    exit: (code) => exits.push(code),
    listen: (onSignal) => {
      listeners += 1;
      signal = onSignal;
    },
    report: (message) => reports.push(message),
  });
  return {
    interrupt,
    exits,
    reports,
    get listeners() {
      return listeners;
    },
    press: () => signal?.(),
  };
};

// A macrotask: the exit runs in a `Promise.all`'s `finally`, too many microtask ticks deep to count.
const settle = async () => await new Promise<void>((resolve) => setTimeout(resolve, 0));

describe("InterruptTeardown", () => {
  test("exits after the teardown, so a registered teardown cannot leave Ctrl+C doing nothing", async () => {
    const { interrupt, exits, press } = harness();
    let closed = false;
    interrupt.add(async () => {
      closed = true;
    }, "abandoned");

    press();
    await settle();

    expect(closed).toBe(true);
    expect(exits).toEqual([0]);
  });

  test("installs one listener for every teardown and runs them all on a single interrupt", async () => {
    const h = harness();
    const ran: string[] = [];
    h.interrupt.add(async () => {
      ran.push("share");
    }, "share abandoned");
    h.interrupt.add(async () => {
      ran.push("database");
    }, "database abandoned");

    expect(h.listeners).toBe(1);

    h.press();
    await settle();

    expect(ran.toSorted((a, b) => a.localeCompare(b))).toEqual(["database", "share"]);
    expect(h.exits).toEqual([0]);
  });

  test("waits for the slow teardown instead of exiting when the first one finishes", async () => {
    const { interrupt, exits, press } = harness();
    const slow = Promise.withResolvers<void>();
    interrupt.add(async () => undefined, "fast abandoned");
    interrupt.add(async () => await slow.promise, "slow abandoned");

    press();
    await settle();
    expect(exits).toEqual([]);

    slow.resolve();
    await settle();
    expect(exits).toEqual([0]);
  });

  test("a teardown that throws neither stops the others nor the exit", async () => {
    const { interrupt, exits, press } = harness();
    let reached = false;
    interrupt.add(async () => {
      throw new Error("release refused");
    }, "failed abandoned");
    interrupt.add(async () => {
      reached = true;
    }, "other abandoned");

    press();
    await settle();

    expect(reached).toBe(true);
    expect(exits).toEqual([0]);
  });

  test("a second interrupt abandons only what is still running", async () => {
    const { interrupt, exits, reports, press } = harness();
    interrupt.add(async () => undefined, "fast abandoned");
    interrupt.add(async () => await new Promise<void>(() => undefined), "slow abandoned");

    press();
    await settle();
    press();

    expect(reports).toEqual(["slow abandoned"]);
    expect(exits).toEqual([130]);
  });

  test("runs every teardown once for a session that ended on its own, and never exits for it", async () => {
    const { interrupt, exits, press } = harness();
    const ran: string[] = [];
    interrupt.add(async () => {
      ran.push("session");
    }, "session abandoned");
    interrupt.add(async () => {
      ran.push("dev server");
    }, "dev server abandoned");

    await interrupt.runAll();
    await interrupt.runAll();
    expect(exits).toEqual([]);
    press();
    await settle();

    expect(ran).toEqual(["session", "dev server"]);
    expect(exits).toEqual([0]);
  });

  test("leaves the exit to the supervisor when it does not own it", async () => {
    const { interrupt, exits, press } = harness();
    interrupt.ownsExit = false;
    let closed = false;
    interrupt.add(async () => {
      closed = true;
    }, "abandoned");

    press();
    await settle();

    expect(closed).toBe(true);
    expect(exits).toEqual([]);
  });
});
