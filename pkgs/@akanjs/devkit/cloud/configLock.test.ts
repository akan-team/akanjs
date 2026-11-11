import { describe, expect, test } from "bun:test";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { tempDirs } from "../test/testHelpers";
import { ConfigLock } from "./configLock";

const makeRoot = tempDirs("akan-config-lock-");
/** A pid that cannot be alive: `kill(0)` on it is ESRCH on every platform this runs on. */
const deadPid = 0x7ffffff;
const lockIn = async () => path.join(await makeRoot(), ".akan", "config.json.lock");

const withWaitTimeout = async <T>(ms: number, fn: () => Promise<T>) => {
  const waitTimeoutMs = ConfigLock.waitTimeoutMs;
  Object.defineProperty(ConfigLock, "waitTimeoutMs", { value: ms, configurable: true });
  try {
    return await fn();
  } finally {
    Object.defineProperty(ConfigLock, "waitTimeoutMs", { value: waitTimeoutMs, configurable: true });
  }
};

describe("ConfigLock", () => {
  test("runs one caller at a time, in the same process too", async () => {
    const lockPath = await lockIn();
    const order: string[] = [];
    const body = async (name: string) => {
      order.push(`${name}:in`);
      await Bun.sleep(30);
      order.push(`${name}:out`);
    };
    await Promise.all(["a", "b", "c"].map((name) => ConfigLock.run(lockPath, () => body(name))));
    for (const name of ["a", "b", "c"]) expect(order.indexOf(`${name}:out`)).toBe(order.indexOf(`${name}:in`) + 1);
  });

  test("releases the lock when the body throws", async () => {
    const lockPath = await lockIn();
    await expect(ConfigLock.run(lockPath, async () => Promise.reject(new Error("boom")))).rejects.toThrow("boom");
    expect(await Bun.file(lockPath).exists()).toBe(false);
  });

  test("reclaims a lock whose holder died", async () => {
    const lockPath = await lockIn();
    await ConfigLock.run(lockPath, async () => undefined);
    await writeFile(lockPath, JSON.stringify({ pid: deadPid, at: Date.now() }));
    const holder = await ConfigLock.run(lockPath, async () => JSON.parse(await readFile(lockPath, "utf8")));
    expect(holder.pid).toBe(process.pid);
  });

  test("waits out a live holder and then fails, rather than going ahead without the lock", async () => {
    const lockPath = await lockIn();
    await ConfigLock.run(lockPath, async () => undefined);
    await writeFile(lockPath, JSON.stringify({ pid: process.pid, at: Date.now() }));
    let ran = false;
    await withWaitTimeout(150, async () => {
      await expect(
        ConfigLock.run(lockPath, async () => {
          ran = true;
        }),
      ).rejects.toThrow(lockPath);
    });
    expect(ran).toBe(false);
    expect(JSON.parse(await readFile(lockPath, "utf8")).pid).toBe(process.pid);
  });
});
