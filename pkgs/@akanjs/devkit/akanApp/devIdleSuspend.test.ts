import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import type { Logger } from "akanjs/common";
import type { App } from "../commandDecorators";

const watchers: { stopped: number }[] = [];
let releaseStart: () => void = () => undefined;

mock.module("../frontendBuild/watchRootResolver", () => ({
  WatchRootResolver: class {
    async resolve() {
      return ["/repo"];
    }
  },
}));
mock.module("../frontendBuild/hmrWatcher", () => ({
  HmrWatcher: class {
    readonly #record = { stopped: 0 };
    constructor() {
      watchers.push(this.#record);
    }
    start() {
      return new Promise<void>((resolve) => {
        releaseStart = resolve;
      });
    }
    stop() {
      this.#record.stopped++;
    }
  },
}));

const { DevIdleSuspend } = await import("./devIdleSuspend");

const logger = { info: () => undefined, verbose: () => undefined, warn: () => undefined, error: () => undefined };
const tick = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));

const suspendOf = () => {
  const calls = { readiness: 0, release: 0, wake: 0, awake: 0 };
  let finishWake: () => void = () => undefined;
  const idle = new DevIdleSuspend(
    {} as App,
    { logger: logger as unknown as Logger },
    {
      readiness: () => {
        calls.readiness++;
        return { builderReady: true, backendReady: true, buildFailed: false, restartPending: false };
      },
      release: () => {
        calls.release++;
      },
      wake: () => {
        calls.wake++;
        return new Promise<void>((resolve) => {
          finishWake = resolve;
        });
      },
      wakeFailed: () => undefined,
      flushHeld: () => undefined,
      awake: () => {
        calls.awake++;
      },
    },
  );
  return { idle, calls, finishWake: () => finishWake() };
};

describe("DevIdleSuspend after stop", () => {
  let previous: string | undefined;
  beforeEach(() => {
    previous = process.env.AKAN_DEV_IDLE_SUSPEND_MS;
    process.env.AKAN_DEV_IDLE_SUSPEND_MS = "5";
    watchers.length = 0;
  });
  afterEach(() => {
    if (previous === undefined) delete process.env.AKAN_DEV_IDLE_SUSPEND_MS;
    else process.env.AKAN_DEV_IDLE_SUSPEND_MS = previous;
  });

  test("stops a watcher that finished starting after the host stopped, and suspends nothing", async () => {
    const { idle, calls } = suspendOf();
    idle.arm();
    await tick(20);
    expect(watchers).toHaveLength(1);
    idle.stop();
    releaseStart();
    await tick(20);
    expect(watchers[0].stopped).toBe(1);
    expect(calls.release).toBe(0);
    expect(calls.readiness).toBe(1);
  });

  test("a wake that settles after stop neither re-arms nor reports the host awake", async () => {
    const { idle, calls, finishWake } = suspendOf();
    idle.arm();
    await tick(20);
    releaseStart();
    await tick(0);
    expect(calls.release).toBe(1);
    const woken = idle.wake("an edit");
    idle.stop();
    finishWake();
    await woken;
    await tick(20);
    expect(calls.awake).toBe(0);
    expect(calls.readiness).toBe(1);
  });

  test("a suspended host stops being away once stopped, so a late request is refused instead of held", async () => {
    const { idle, calls } = suspendOf();
    idle.arm();
    await tick(20);
    releaseStart();
    await tick(0);
    expect(calls.release).toBe(1);
    expect(idle.away).toBe(true);
    idle.stop();
    expect(idle.away).toBe(false);
    await idle.wake("a route request");
    expect(calls.wake).toBe(0);
  });

  test("activity after stop arms nothing", async () => {
    const { idle, calls } = suspendOf();
    idle.stop();
    idle.markActivity();
    idle.arm();
    await tick(20);
    expect(calls.readiness).toBe(0);
  });
});
