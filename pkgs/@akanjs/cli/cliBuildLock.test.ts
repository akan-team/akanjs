import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { CliBuildLock } from "./cliBuildLock";

const roots: string[] = [];
afterEach(async () => {
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
const deadPid = async () => {
  const proc = Bun.spawn(["true"]);
  await proc.exited;
  return proc.pid;
};

describe("CliBuildLock", () => {
  test("takes over a lock whose owner is gone, and releases only its own", async () => {
    const lockDir = await lockDirIn();
    await holdAs(lockDir, `${await deadPid()}\nstale`);
    const release = await CliBuildLock.acquire(lockDir);
    expect((await ownerOf(lockDir)).split("\n")[0]).toBe(`${process.pid}`);
    await holdAs(lockDir, `${process.pid}\nsomeone-else`);
    await release();
    expect(await ownerOf(lockDir)).toBe(`${process.pid}\nsomeone-else`);
  });

  test("a late waiter puts back the lock an earlier waiter took over in the meantime", async () => {
    const lockDir = await lockDirIn();
    const stale = `${await deadPid()}\nstale`;
    await holdAs(lockDir, `${process.pid}\nearlier-waiter`);
    await CliBuildLock.takeOver(lockDir, stale);
    expect(await ownerOf(lockDir)).toBe(`${process.pid}\nearlier-waiter`);
    expect(await readdir(path.dirname(lockDir))).toEqual(["dist.lock"]);
  });

  test("removes the lock it judged abandoned when it is still that one", async () => {
    const lockDir = await lockDirIn();
    const stale = `${await deadPid()}\nstale`;
    await holdAs(lockDir, stale);
    await CliBuildLock.takeOver(lockDir, stale);
    expect(await readdir(path.dirname(lockDir))).toEqual([]);
    await CliBuildLock.takeOver(lockDir, stale);
    expect(await readdir(path.dirname(lockDir))).toEqual([]);
  });
});
