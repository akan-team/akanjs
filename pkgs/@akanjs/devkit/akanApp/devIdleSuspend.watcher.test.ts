import { afterEach, beforeEach, expect, mock, test } from "bun:test";
import path from "node:path";
import type { Logger } from "akanjs/common";
import type { ChangeBatch } from "akanjs/server";
import type { App } from "../commandDecorators";
import { heldMtimeIndex, saveUntil, tempDirs, writeText } from "../test/testHelpers";

const held = heldMtimeIndex();
let root = "";
mock.module("../frontendBuild/sourceMtimeIndex", () => ({ SourceMtimeIndex: held.SourceMtimeIndex }));
mock.module("../frontendBuild/watchRootResolver", () => ({
  WatchRootResolver: class {
    async resolve() {
      return [root];
    }
  },
}));

const { DevIdleSuspend } = await import("./devIdleSuspend");

const logger = {
  info: () => undefined,
  verbose: () => undefined,
  warn: () => undefined,
  error: () => undefined,
} as unknown as Logger;
const tick = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));
const makeRoot = tempDirs("akan-idle-suspend-watcher-");

let previous: string | undefined;
beforeEach(() => {
  previous = process.env.AKAN_DEV_IDLE_SUSPEND_MS;
  process.env.AKAN_DEV_IDLE_SUSPEND_MS = "5";
});
afterEach(() => {
  if (previous === undefined) delete process.env.AKAN_DEV_IDLE_SUSPEND_MS;
  else process.env.AKAN_DEV_IDLE_SUSPEND_MS = previous;
});

test("a save while the idle watcher primes stays with the awake builder, and the next wake does not replay it", async () => {
  root = await makeRoot();
  const source = path.join(root, "lib/a.ts");
  await writeText(source, "export const x = 0;\n");
  let released = 0;
  const wokenWith: (ChangeBatch | null)[] = [];
  const idle = new DevIdleSuspend(
    {} as App,
    { logger },
    {
      readiness: () => ({ builderReady: true, backendReady: true, buildFailed: false, restartPending: false }),
      release: () => {
        released++;
      },
      wake: async (batch) => {
        wokenWith.push(batch);
      },
      wakeFailed: () => undefined,
      flushHeld: () => undefined,
      awake: () => undefined,
    },
  );
  idle.arm();
  expect(await saveUntil(source, () => held.scans.length > 0)).toBe(true);
  idle.markActivity();
  held.primes[0].resolve();
  await tick();
  expect(released).toBe(0);
  held.scans[0].resolve([]);
  await tick(20);
  expect(held.primes).toHaveLength(2);
  held.primes[1].resolve();
  await tick();
  expect(released).toBe(1);
  await idle.wake("a route request");
  expect(wokenWith).toEqual([null]);
  idle.stop();
}, 15_000);
