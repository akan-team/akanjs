import { afterEach, describe, expect, mock, setSystemTime, spyOn, test } from "bun:test";
import * as fsPromises from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const realMkdir = fsPromises.mkdir;
const realRename = fsPromises.rename;
const realRm = fsPromises.rm;
const inject: {
  beforeMkdir?: (dir: string) => Promise<void>;
  beforeRename?: (from: string) => Promise<void> | void;
  beforeRm?: (target: string) => void;
} = {};
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
  rm: async (...args: Parameters<typeof fsPromises.rm>) => {
    inject.beforeRm?.(String(args[0]));
    return await realRm(...args);
  },
}));
const { CliBuildLock } = await import("./cliBuildLock");

const { mkdir, mkdtemp, readdir, rm, stat } = fsPromises;
const roots: string[] = [];
afterEach(async () => {
  inject.beforeMkdir = undefined;
  inject.beforeRename = undefined;
  inject.beforeRm = undefined;
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
const fsClockProbed = () => {
  const probed = Promise.withResolvers<void>();
  const before = inject.beforeRm;
  inject.beforeRm = (target) => {
    if (target.includes(".clock-")) probed.resolve();
    before?.(target);
  };
  return probed.promise;
};
const refusal = (code: string) => Object.assign(new Error(`${code}: refused`), { code });
const mostHoldersOfTwoRacingWaiters = async (lockDir: string) => {
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
  return most;
};

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
    expect(await mostHoldersOfTwoRacingWaiters(lockDir)).toBe(1);
  });

  test("ages a removal marker by the filesystem's clock when it runs minutes behind this process's", async () => {
    const lockDir = await lockDirIn();
    await holdAs(lockDir, `${await deadPid()}\nstale`);
    setSystemTime(Date.now() + 200_000);
    expect(await mostHoldersOfTwoRacingWaiters(lockDir)).toBe(1);
  });

  test("leaves a lock that a fresh holder took while the waiter was getting to its removal", async () => {
    const lockDir = await lockDirIn();
    await holdAs(lockDir, `${await deadPid()}\nstale`);
    const fresh = `${process.pid}\nfresh\n${Date.now()}`;
    const replaced = Promise.withResolvers<void>();
    inject.beforeMkdir = async (dir) => {
      if (!dir.includes(".removing-")) return;
      inject.beforeMkdir = undefined;
      await rm(lockDir, { recursive: true });
      await holdAs(lockDir, fresh);
      replaced.resolve();
    };
    const acquired = CliBuildLock.acquire(lockDir);
    await replaced.promise;
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
    const warn = spyOn(console, "warn").mockImplementation(() => undefined);
    const release = await CliBuildLock.acquire(lockDir);
    expect(warn.mock.calls.flat().join("\n")).toContain("ms ahead of this clock");
    warn.mockRestore();
    expect(await ownerOf(lockDir)).not.toBe(taken);
    await release();
  });

  test("takes over a lock with no owner only once it has outlived the lease", async () => {
    const lockDir = await lockDirIn();
    await mkdir(lockDir);
    const probed = fsClockProbed();
    const acquired = CliBuildLock.acquire(lockDir);
    await probed;
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
    await mkdir(`${lockDir}.clock-left-by-a-crash`);
    await mkdir(path.join(path.dirname(lockDir), "other.lock.removed-not-ours"));
    const probed = fsClockProbed();
    const acquired = CliBuildLock.acquire(lockDir);
    await probed;
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

  test("leaves an ownerless lock that another ownerless lock replaced while the waiter got to its removal", async () => {
    const lockDir = await lockDirIn();
    await realMkdir(lockDir);
    let freshIno = -1;
    inject.beforeMkdir = async (dir) => {
      if (!dir.includes(".removing-")) return;
      inject.beforeMkdir = undefined;
      await realRm(lockDir, { recursive: true });
      await Bun.sleep(5);
      await realMkdir(lockDir);
      freshIno = (await stat(lockDir)).ino;
      setSystemTime();
    };
    const probed = fsClockProbed();
    const acquired = CliBuildLock.acquire(lockDir);
    await probed;
    setSystemTime(Date.now() + 121_000);
    await letItPoll();
    expect((await stat(lockDir)).ino).toBe(freshIno);
    expect(await readdir(lockDir)).toEqual([]);
    await rm(lockDir, { recursive: true });
    await (await acquired)();
  });

  test("keys a lock whose owner file is still empty by its inode and birth time", async () => {
    const lockDir = await lockDirIn();
    await holdAs(lockDir, "");
    const info = await stat(lockDir);
    const markers: string[] = [];
    inject.beforeMkdir = async (dir) => {
      if (dir.includes(".removing-")) markers.push(dir);
    };
    const probed = fsClockProbed();
    const acquired = CliBuildLock.acquire(lockDir);
    await probed;
    setSystemTime(Date.now() + 121_000);
    const release = await acquired;
    const key = Bun.hash(`${info.ino}:${info.birthtimeMs || info.mtimeMs}`).toString(36);
    expect(markers[0]).toBe(`${lockDir}.removing-${key}.0`);
    await release();
  });

  test("keeps a takeover whose removal marker the OS would not delete", async () => {
    const lockDir = await lockDirIn();
    await holdAs(lockDir, `${await deadPid()}\nstale`);
    inject.beforeRm = (target) => {
      if (target.includes(".removing-")) throw refusal("EBUSY");
    };
    const release = await CliBuildLock.acquire(lockDir);
    expect(await ownerPidOf(lockDir)).toBe(`${process.pid}`);
    inject.beforeRm = undefined;
    await release();
  });

  test("waits out an EPERM from a path still pending deletion, and fails once it persists", async () => {
    const lockDir = await lockDirIn();
    let refusals = 3;
    inject.beforeMkdir = async (dir) => {
      if (dir === lockDir && refusals-- > 0) throw refusal("EPERM");
    };
    await (await CliBuildLock.acquire(lockDir))();
    expect(refusals).toBeLessThan(0);
    inject.beforeMkdir = async (dir) => {
      if (dir !== lockDir) return;
      setSystemTime(Date.now() + 1_000);
      throw refusal("EPERM");
    };
    await expect(CliBuildLock.acquire(lockDir)).rejects.toMatchObject({ code: "EPERM" });
  });

  test("retries a refused release until the rename goes through", async () => {
    const lockDir = await lockDirIn();
    const release = await CliBuildLock.acquire(lockDir);
    let refusals = 3;
    inject.beforeRename = () => {
      if (refusals-- > 0) throw refusal("EBUSY");
    };
    await release();
    expect(await readdir(path.dirname(lockDir))).toEqual([]);
  });

  test("resolves a release that cannot make its removal marker, and keeps the lock", async () => {
    const lockDir = await lockDirIn();
    const release = await CliBuildLock.acquire(lockDir);
    const token = await ownerOf(lockDir);
    inject.beforeMkdir = async (dir) => {
      if (dir.includes(".removing-")) throw refusal("ENOSPC");
    };
    const warn = spyOn(console, "warn").mockImplementation(() => undefined);
    expect(await release()).toBeUndefined();
    warn.mockRestore();
    expect(await ownerOf(lockDir)).toBe(token);
  });

  test("removes every stale marker its release stepped past", async () => {
    const lockDir = await lockDirIn();
    await holdAs(lockDir, `${await deadPid()}\nstale`);
    const release = await CliBuildLock.acquire(lockDir);
    await mkdir(`${lockDir}.removing-${Bun.hash(await ownerOf(lockDir)).toString(36)}.0`);
    setSystemTime(Date.now() + 121_000);
    await release();
    expect(await readdir(path.dirname(lockDir))).toEqual([]);
  });

  test("leaves a live older CLI's lock alone when the filesystem's clock runs minutes behind this process's", async () => {
    const lockDir = await lockDirIn();
    const older = `${process.pid}\nolder-cli`;
    await holdAs(lockDir, older);
    setSystemTime(Date.now() + 200_000);
    const acquired = CliBuildLock.acquire(lockDir);
    await letItPoll();
    expect(await ownerOf(lockDir)).toBe(older);
    await rm(lockDir, { recursive: true });
    await (await acquired)();
  });

  test("keeps a fresh removal marker through the sweep when the filesystem's clock runs minutes behind", async () => {
    const lockDir = await lockDirIn();
    const fresh = `${lockDir}.removing-someone-else.0`;
    await mkdir(fresh);
    setSystemTime(Date.now() + 200_000);
    const release = await CliBuildLock.acquire(lockDir);
    expect(await readdir(path.dirname(lockDir))).toContain(path.basename(fresh));
    await release();
  });

  test("probes the filesystem's clock again after a probe fails, and ages files by what it measures", async () => {
    const lockDir = await lockDirIn();
    const older = `${process.pid}\nolder-cli`;
    await holdAs(lockDir, older);
    setSystemTime(Date.now() + 200_000);
    const secondProbe = Promise.withResolvers<void>();
    let probes = 0;
    inject.beforeMkdir = async (dir) => {
      if (!dir.includes(".clock-")) return;
      probes++;
      if (probes === 1) throw refusal("ENOSPC");
      secondProbe.resolve();
    };
    const acquired = CliBuildLock.acquire(lockDir);
    await secondProbe.promise;
    await letItPoll();
    expect(probes).toBe(2);
    expect(await ownerOf(lockDir)).toBe(older);
    setSystemTime(Date.now() + 121_000);
    const release = await acquired;
    expect(await ownerOf(lockDir)).not.toBe(older);
    await release();
  });

  test("spends one 3 s budget across all the tries of a release the OS keeps refusing", async () => {
    const lockDir = await lockDirIn();
    const release = await CliBuildLock.acquire(lockDir);
    let refusals = 0;
    inject.beforeMkdir = async (dir) => {
      if (!dir.includes(".removing-")) return;
      refusals++;
      setSystemTime(Date.now() + 1_000);
      throw refusal("EPERM");
    };
    const warn = spyOn(console, "warn").mockImplementation(() => undefined);
    await release();
    warn.mockRestore();
    expect(refusals).toBeLessThan(10);
  });
});
