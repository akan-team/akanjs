import { describe, expect, mock, test } from "bun:test";
import path from "node:path";
import type { Logger } from "akanjs/common";
import { heldMtimeIndex, saveUntil, tempDirs, writeText } from "../test/testHelpers";
import type { ChangeBatch } from "./hmrWatcher";

const held = heldMtimeIndex();
mock.module("./sourceMtimeIndex", () => ({ SourceMtimeIndex: held.SourceMtimeIndex }));

const { HmrWatcher } = await import("./hmrWatcher");

const logger = {
  verbose: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
} as unknown as Logger;
const makeRoot = tempDirs("akan-hmr-watcher-stop-");
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("HmrWatcher stopped while a scan runs", () => {
  test("hands over no batch, though the scan settles with an edit made while it primed", async () => {
    const root = await makeRoot();
    const source = path.join(root, "lib/a.ts");
    await writeText(source, "export const x = 0;\n");
    const batches: ChangeBatch[] = [];
    const watcher = new HmrWatcher({ roots: [root], logger, onBatch: (batch) => void batches.push(batch) });
    const starting = watcher.start();
    expect(await saveUntil(source, () => held.scans.length > 0)).toBe(true);
    watcher.stop();
    held.primes[0].resolve();
    await starting;
    held.scans[0].resolve([]);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(batches).toEqual([]);
  }, 15_000);

  test("close hands back what the scan it interrupted found, though a later scan settles first", async () => {
    held.primes.length = 0;
    held.scans.length = 0;
    const root = await makeRoot();
    const source = path.join(root, "lib/a.ts");
    const config = path.join(root, "akan.config.ts");
    await writeText(source, "export const x = 0;\n");
    const batches: ChangeBatch[] = [];
    const watcher = new HmrWatcher({ roots: [root], logger, onBatch: (batch) => void batches.push(batch) });
    const starting = watcher.start();
    held.primes[0].resolve();
    await starting;
    expect(await saveUntil(source, () => held.scans.length > 0)).toBe(true);
    const closing = watcher.close();
    const settleLaterScans = async () => {
      await tick();
      for (const scan of held.scans.slice(1)) scan.resolve([]);
      await tick();
    };
    await settleLaterScans();
    held.scans[0].resolve([config]);
    await settleLaterScans();
    expect(await closing).toEqual({ files: [config], kinds: new Set(["config"]) });
    expect(batches).toEqual([]);
  }, 15_000);
});
