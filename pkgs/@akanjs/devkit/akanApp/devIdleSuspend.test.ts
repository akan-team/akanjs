import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import type { Logger } from "akanjs/common";
import type { BuilderMessage } from "akanjs/server";
import type { App } from "../commandDecorators";
import type { IncrementalBuilderHost } from "../incrementalBuilder";
import { BuilderRequestRelay } from "./builderRequestRelay";

const watchers: { stopped: number; started: PromiseWithResolvers<void> }[] = [];
const releaseStart = () => watchers.at(-1)?.started.resolve();

mock.module("../frontendBuild/watchRootResolver", () => ({
  WatchRootResolver: class {
    async resolve() {
      return ["/repo"];
    }
  },
}));
mock.module("../frontendBuild/hmrWatcher", () => ({
  HmrWatcher: class {
    readonly #record = { stopped: 0, started: Promise.withResolvers<void>() };
    constructor() {
      watchers.push(this.#record);
    }
    start() {
      return this.#record.started.promise;
    }
    stop() {
      this.#record.stopped++;
    }
    async close() {
      this.#record.stopped++;
      return null;
    }
  },
}));

const { DevIdleSuspend } = await import("./devIdleSuspend");

const logger = { info: () => undefined, verbose: () => undefined, warn: () => undefined, error: () => undefined };
const tick = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));

const suspendOf = () => {
  const calls = { readiness: 0, release: 0, wake: 0, awake: 0 };
  const readiness = { builderReady: true, backendReady: true, buildFailed: false, restartPending: false };
  let finishWake: () => void = () => undefined;
  const idle = new DevIdleSuspend(
    {} as App,
    { logger: logger as unknown as Logger },
    {
      readiness: () => {
        calls.readiness++;
        return { ...readiness };
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
  return { idle, calls, readiness, finishWake: () => finishWake() };
};

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

describe("DevIdleSuspend after stop", () => {
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
    expect(calls.readiness).toBe(2);
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

describe("DevIdleSuspend while the idle watcher starts", () => {
  const suspendOnNextIdle = async (calls: { release: number }) => {
    await tick(20);
    expect(watchers).toHaveLength(2);
    releaseStart();
    await tick(0);
    expect(calls.release).toBe(1);
    expect(watchers[1].stopped).toBe(0);
  };

  test("a builder request that lands meanwhile keeps the builder, and a later idle period still suspends", async () => {
    const { idle, calls } = suspendOf();
    const sent: BuilderMessage[] = [];
    const builder = {
      status: "ready",
      send: (message: BuilderMessage) => {
        sent.push(message);
        return true;
      },
    };
    const relay = new BuilderRequestRelay(
      { logger: logger as unknown as Logger, env: {} },
      {
        builder: () => builder as unknown as IncrementalBuilderHost,
        toBackend: () => undefined,
        markActivity: () => idle.markActivity(),
        away: () => idle.away,
        wake: (reason) => void idle.wake(reason),
      },
    );
    idle.arm();
    await tick(20);
    expect(watchers).toHaveLength(1);
    relay.send({ type: "build-graph", id: 1 } as BuilderMessage);
    releaseStart();
    await tick(0);
    expect(sent).toHaveLength(1);
    expect(calls.release).toBe(0);
    expect(watchers[0].stopped).toBe(1);
    await suspendOnNextIdle(calls);
  });

  test("a backend that went down meanwhile keeps the builder", async () => {
    const { idle, calls, readiness } = suspendOf();
    idle.arm();
    await tick(20);
    readiness.backendReady = false;
    releaseStart();
    await tick(0);
    expect(calls.release).toBe(0);
    expect(watchers[0].stopped).toBe(1);
    readiness.backendReady = true;
    await suspendOnNextIdle(calls);
  });

  test("a stop that lands as the start settles stops that watcher and releases nothing", async () => {
    const { idle, calls } = suspendOf();
    idle.arm();
    await tick(20);
    //? Queued behind the start's own await, so the stop lands after the start settles and before the suspend resumes.
    void watchers[0].started.promise.then(() => idle.stop());
    releaseStart();
    await tick(0);
    expect(calls.release).toBe(0);
    expect(watchers[0].stopped).toBe(1);
  });

  test("a watcher that fails to start stops only itself, not the one a later suspend committed", async () => {
    const { idle, calls } = suspendOf();
    idle.arm();
    await tick(20);
    idle.markActivity();
    await tick(20);
    expect(watchers).toHaveLength(2);
    releaseStart();
    await tick(0);
    expect(calls.release).toBe(1);
    watchers[0].started.reject(new Error("no watch roots"));
    await tick(0);
    expect(watchers[0].stopped).toBe(1);
    expect(watchers[1].stopped).toBe(0);
    idle.stop();
  });
});
