import { afterEach, describe, expect, mock, setSystemTime, test } from "bun:test";
import * as fsPromises from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const realMkdir = fsPromises.mkdir;
const realRename = fsPromises.rename;
const inject: { beforeMkdir?: (dir: string) => Promise<void>; beforeRename?: (from: string) => Promise<void> | void } =
  {};
mock.module("node:fs/promises", () => ({
  ...fsPromises,
  mkdir: async (...args: Parameters<typeof fsPromises.mkdir>) => {
    await inject.beforeMkdir?.(String(args[0]));
    return await realMkdir(...args);
  },
  rename: async (...args: Parameters<typeof fsPromises.rename>) => {
    await inject.beforeRename?.(String(args[0]));
    return await realRename(...args);
  },
}));
const { CliBuildLock } = await import("./cliBuildLock");

const { mkdir, mkdtemp, readdir, rm } = fsPromises;
const roots: string[] = [];
afterEach(async () => {
  inject.beforeMkdir = undefined;
  inject.beforeRename = undefined;
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
const refusal = (code: string) => Object.assign(new Error(`${code}: refused`), { code });

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

  test("keeps a second waiter that judged the same dead lock from moving away the lock the first one made", async () => {
    const lockDir = await lockDirIn();
    await holdAs(lockDir, `${await deadPid()}\nstale`);
    const secondRename = Promise.withResolvers<void>();
    let renames = 0;
    inject.beforeRename = async (from) => {
      if (from !== lockDir) return;
      renames++;
      if (renames === 1) {
        await Promise.race([secondRename.promise, letItPoll()]);
        return;
      }
      if (renames > 2) return;
      secondRename.resolve();
      while (!(await ownerOf(lockDir).catch(() => "")).startsWith(`${process.pid}\n`)) await Bun.sleep(5);
    };
    let holding = 0;
    let most = 0;
    await Promise.all(
      [0, 1].map(async () => {
        const release = await CliBuildLock.acquire(lockDir);
        holding++;
        most = Math.max(most, holding);
        await letItPoll();
        holding--;
        await release();
      }),
    );
    expect(most).toBe(1);
  });

  test("leaves a lock that a fresh holder took while the waiter was getting to its removal", async () => {
    const lockDir = await lockDirIn();
    await holdAs(lockDir, `${await deadPid()}\nstale`);
    const fresh = `${process.pid}\nfresh\n${Date.now()}`;
    inject.beforeMkdir = async (dir) => {
      if (!dir.includes(".removing-")) return;
      inject.beforeMkdir = undefined;
      await rm(lockDir, { recursive: true });
      await holdAs(lockDir, fresh);
    };
    const acquired = CliBuildLock.acquire(lockDir);
    await letItPoll();
    expect(await ownerOf(lockDir)).toBe(fresh);
    await rm(lockDir, { recursive: true });
    await (await acquired)();
  });

  test("waits on a lock an older CLI made just before it, instead of replacing it", async () => {
    const lockDir = await lockDirIn();
    const olderCliMade = Promise.withResolvers<void>();
    inject.beforeMkdir = async (dir) => {
      if (dir !== lockDir) return;
      inject.beforeMkdir = undefined;
      await realMkdir(lockDir);
      olderCliMade.resolve();
    };
    const acquired = CliBuildLock.acquire(lockDir);
    await olderCliMade.promise;
    await Bun.write(path.join(lockDir, "owner"), `${process.pid}\nolder-cli`);
    await letItPoll();
    expect(await ownerOf(lockDir)).toBe(`${process.pid}\nolder-cli`);
    await rm(lockDir, { recursive: true });
    await (await acquired)();
  });

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

  test("takes over a live holder's lock when the clock was set back past the lease", async () => {
    const lockDir = await lockDirIn();
    const taken = `${process.pid}\nbefore-the-clock-moved\n${Date.now()}`;
    await holdAs(lockDir, taken);
    setSystemTime(Date.now() - 121_000);
    const release = await CliBuildLock.acquire(lockDir);
    expect(await ownerOf(lockDir)).not.toBe(taken);
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

  test("steps past the removal marker of a remover that died holding it, and sweeps old leftovers", async () => {
    const lockDir = await lockDirIn();
    const stale = `${await deadPid()}\nstale`;
    await holdAs(lockDir, stale);
    await mkdir(`${lockDir}.removing-${Bun.hash(stale).toString(36)}.0`);
    await mkdir(`${lockDir}.removed-left-by-a-crash`);
    await mkdir(path.join(path.dirname(lockDir), "other.lock.removed-not-ours"));
    const acquired = CliBuildLock.acquire(lockDir);
    await letItPoll();
    expect(await ownerOf(lockDir)).toBe(stale);
    setSystemTime(Date.now() + 121_000);
    const release = await acquired;
    expect(await ownerPidOf(lockDir)).toBe(`${process.pid}`);
    await release();
    expect(await readdir(path.dirname(lockDir))).toEqual(["other.lock.removed-not-ours"]);
  });

  test("retries a takeover the OS refused to rename, and gives up a refused release without throwing", async () => {
    const lockDir = await lockDirIn();
    await holdAs(lockDir, `${await deadPid()}\nstale`);
    let refusals = 2;
    inject.beforeRename = () => {
      if (refusals-- > 0) throw refusal("EPERM");
    };
    const release = await CliBuildLock.acquire(lockDir);
    expect(refusals).toBeLessThan(0);
    const token = await ownerOf(lockDir);
    expect(token.split("\n")[0]).toBe(`${process.pid}`);
    inject.beforeRename = () => {
      throw refusal("EBUSY");
    };
    expect(await release()).toBeUndefined();
    expect(await ownerOf(lockDir)).toBe(token);
  });

  test("fails rather than waits when the lock or its removal marker cannot be made", async () => {
    const lockDir = await lockDirIn();
    inject.beforeMkdir = async (dir) => {
      if (dir === lockDir) throw refusal("EACCES");
    };
    await expect(CliBuildLock.acquire(lockDir)).rejects.toMatchObject({ code: "EACCES" });
    inject.beforeMkdir = undefined;
    await holdAs(lockDir, `${await deadPid()}\nstale`);
    inject.beforeMkdir = async (dir) => {
      if (dir.includes(".removing-")) throw refusal("ENOSPC");
    };
    await expect(CliBuildLock.acquire(lockDir)).rejects.toMatchObject({ code: "ENOSPC" });
  });
});
