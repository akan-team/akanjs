import { afterEach, describe, expect, setSystemTime, test } from "bun:test";
import { mkdir, mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { CliBuildLock } from "./cliBuildLock";

const roots: string[] = [];
afterEach(async () => {
  setSystemTime();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

const lockDirIn = async () => {
  const root = await mkdtemp(path.join(tmpdir(), "cli-build-lock-"));
  roots.push(root);
  return path.join(root, "dist.lock");
};
const holdAs = async (lockDir: string, owner: string) => {
  await mkdir(lockDir, { recursive: true });
  await Bun.write(path.join(lockDir, "owner"), owner);
};
const ownerOf = (lockDir: string) => Bun.file(path.join(lockDir, "owner")).text();
const ownerPidOf = async (lockDir: string) => (await ownerOf(lockDir)).split("\n")[0];
const deadPid = async () => {
  const proc = Bun.spawn(["true"]);
  await proc.exited;
  return proc.pid;
};
const letItPoll = () => Bun.sleep(250);

describe("CliBuildLock", () => {
  test("takes over a lock whose owner is gone, and releases only its own", async () => {
    const lockDir = await lockDirIn();
    await holdAs(lockDir, `${await deadPid()}\nstale`);
    const release = await CliBuildLock.acquire(lockDir);
    expect(await ownerPidOf(lockDir)).toBe(`${process.pid}`);
    await holdAs(lockDir, `${process.pid}\nsomeone-else`);
    await release();
    expect(await ownerOf(lockDir)).toBe(`${process.pid}\nsomeone-else`);
  });

  test("hands a dead lock to one waiter at a time, however many wait on it", async () => {
    const lockDir = await lockDirIn();
    for (let round = 0; round < 3; round++) {
      await holdAs(lockDir, `${await deadPid()}\nstale`);
      let holding = 0;
      let most = 0;
      await Promise.all(
        Array.from({ length: 6 }, async () => {
          const release = await CliBuildLock.acquire(lockDir);
          holding++;
          most = Math.max(most, holding);
          await Bun.sleep(20);
          holding--;
          await release();
        }),
      );
      expect(most).toBe(1);
    }
    expect(await readdir(path.dirname(lockDir))).toEqual([]);
  }, 20_000);

  test("counts the lease from when the current holder took the lock, not from when the wait began", async () => {
    const lockDir = await lockDirIn();
    const waitBegan = Date.now();
    setSystemTime(waitBegan);
    await holdAs(lockDir, `${process.pid}\nfirst\n${waitBegan}`);
    const acquired = CliBuildLock.acquire(lockDir);
    await letItPoll();
    const second = `${process.pid}\nsecond\n${waitBegan + 119_000}`;
    await holdAs(lockDir, second);
    setSystemTime(waitBegan + 121_000);
    await letItPoll();
    expect(await ownerOf(lockDir)).toBe(second);
    setSystemTime(waitBegan + 240_000);
    const release = await acquired;
    expect(await ownerPidOf(lockDir)).toBe(`${process.pid}`);
    expect(await ownerOf(lockDir)).not.toBe(second);
    await release();
  });

  test("takes over a lock with no owner only once it has outlived the lease", async () => {
    const lockDir = await lockDirIn();
    await mkdir(lockDir);
    const acquired = CliBuildLock.acquire(lockDir);
    await letItPoll();
    expect(await readdir(lockDir)).toEqual([]);
    setSystemTime(Date.now() + 121_000);
    const release = await acquired;
    expect(await ownerPidOf(lockDir)).toBe(`${process.pid}`);
    await release();
  });

  test("steps past the removal marker of a remover that died holding it", async () => {
    const lockDir = await lockDirIn();
    const stale = `${await deadPid()}\nstale`;
    await holdAs(lockDir, stale);
    await mkdir(`${lockDir}.removing-${Bun.hash(stale).toString(36)}.0`);
    const acquired = CliBuildLock.acquire(lockDir);
    await letItPoll();
    expect(await ownerOf(lockDir)).toBe(stale);
    setSystemTime(Date.now() + 11_000);
    const release = await acquired;
    expect(await ownerPidOf(lockDir)).toBe(`${process.pid}`);
    await release();
    expect(await readdir(path.dirname(lockDir))).toEqual([]);
  });
});
