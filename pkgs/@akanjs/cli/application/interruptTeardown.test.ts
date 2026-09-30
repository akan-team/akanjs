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

  test("installs one listener for every teardown and runs them all, newest first, on a single interrupt", async () => {
    const h = harness();
    const ran: string[] = [];
    h.interrupt.add(async () => {
      ran.push("database");
    }, "database abandoned");
    h.interrupt.add(async () => {
      ran.push("dev server");
    }, "dev server abandoned");
    h.interrupt.add(async () => {
      ran.push("session");
    }, "session abandoned");

    expect(h.listeners).toBe(1);

    h.press();
    await settle();

    expect(ran).toEqual(["session", "dev server", "database"]);
    expect(h.exits).toEqual([0]);
  });

  test("starts a teardown only once the newer one has finished", async () => {
    const { interrupt, press } = harness();
    const events: string[] = [];
    const devServer = Promise.withResolvers<void>();
    interrupt.add(async () => {
      events.push("database down");
    }, "database abandoned");
    interrupt.add(async () => {
      events.push("dev server stopping");
      await devServer.promise;
      events.push("dev server stopped");
    }, "dev server abandoned");

    press();
    await settle();
    expect(events).toEqual(["dev server stopping"]);

    devServer.resolve();
    await settle();
    expect(events).toEqual(["dev server stopping", "dev server stopped", "database down"]);
  });

  test("exits with the code a teardown asked for, as that session's own Ctrl+C did", async () => {
    const { interrupt, exits, press } = harness();
    interrupt.add(async () => undefined, "dev server abandoned");
    interrupt.add(async () => undefined, "session abandoned", 130);

    press();
    await settle();

    expect(exits).toEqual([130]);
  });

  test("waits for the slow teardown instead of exiting when another one finishes", async () => {
    const { interrupt, exits, press } = harness();
    const slow = Promise.withResolvers<void>();
    interrupt.add(async () => await slow.promise, "slow abandoned");
    interrupt.add(async () => undefined, "fast abandoned");

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
      reached = true;
    }, "other abandoned");
    interrupt.add(async () => {
      throw new Error("release refused");
    }, "failed abandoned");

    press();
    await settle();

    expect(reached).toBe(true);
    expect(exits).toEqual([0]);
  });

  test("a second interrupt abandons what has not finished, running or still waiting its turn", async () => {
    const { interrupt, exits, reports, press } = harness();
    interrupt.add(async () => undefined, "database abandoned");
    interrupt.add(async () => await new Promise<void>(() => undefined), "dev server abandoned");
    interrupt.add(async () => undefined, "session abandoned");

    press();
    await settle();
    press();

    expect(reports).toEqual(["database abandoned", "dev server abandoned"]);
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

    expect(ran).toEqual(["dev server", "session"]);
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
