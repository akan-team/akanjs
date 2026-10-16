import { describe, expect, test } from "bun:test";
import { chmod, mkdir, readdir, rm, stat, utimes, writeFile } from "node:fs/promises";
import path from "node:path";
import { tempDirs } from "../testHelpers";
import { SourceMtimeIndex } from "./sourceMtimeIndex";

const seed = async (root: string, rel: string, content = "export const x = 1;\n") => {
  const abs = path.join(root, rel);
  await mkdir(path.dirname(abs), { recursive: true });
  await writeFile(abs, content);
  return abs;
};

const primed = async (indexRoots: string[], dirSettleMs?: number) => {
  const index = new SourceMtimeIndex({ roots: indexRoots, dirSettleMs });
  await index.prime();
  return index;
};

// Varies content length rather than sleeping: a same-length rewrite inside one mtime tick would tie both mtime and size.
const rewrite = (abs: string, marker: string) => writeFile(abs, `export const x = ${marker};\n`);

// `rm` cannot traverse a directory a test left unreadable, and a throw here fails the next test, so restore permissions.
const forceRemove = async (target: string): Promise<void> => {
  await rm(target, { recursive: true, force: true }).catch(async () => {
    await chmod(target, 0o755).catch(() => undefined);
    const entries = await readdir(target, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) if (entry.isDirectory()) await forceRemove(path.join(target, entry.name));
    await rm(target, { recursive: true, force: true });
  });
};

const makeRoot = tempDirs("akan-mtime-index-", forceRemove);

describe("SourceMtimeIndex", () => {
  test("reports nothing on a quiet tree", async () => {
    const root = await makeRoot();
    await seed(root, "lib/a.ts");
    const index = await primed([root]);

    expect(index.trackedFileCount).toBe(1);
    expect(await index.collectChanges()).toEqual([]);
    expect(await index.collectChanges()).toEqual([]);
  });

  test("reports every file of a save-all, which is what fs.watch loses", async () => {
    const root = await makeRoot();
    const files = await Promise.all([0, 1, 2, 3, 4].map((i) => seed(root, `lib/File${i}.ts`)));
    const index = await primed([root]);

    for (const [i, abs] of files.entries()) await rewrite(abs, `${i}00`);

    expect((await index.collectChanges()).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))).toEqual([...files].sort());
  });

  test("reports a change once, then stops reporting it", async () => {
    const root = await makeRoot();
    const abs = await seed(root, "lib/a.ts");
    const index = await primed([root]);

    await rewrite(abs, "222");
    expect(await index.collectChanges()).toEqual([abs]);
    expect(await index.collectChanges()).toEqual([]);
  });

  test("reports a created file, found through its directory's mtime", async () => {
    const root = await makeRoot();
    await seed(root, "lib/a.ts");
    const index = await primed([root]);

    const created = await seed(root, "lib/b.ts");
    expect(await index.collectChanges()).toEqual([created]);
    expect(await index.collectChanges()).toEqual([]);
  });

  test("reports a created directory's files", async () => {
    const root = await makeRoot();
    await seed(root, "lib/a.ts");
    const index = await primed([root]);

    const created = await seed(root, "lib/user/user.constant.ts");
    expect(await index.collectChanges()).toEqual([created]);
    expect(await index.collectChanges()).toEqual([]);
  });

  // `utimes` pins the parent's mtime to reproduce Linux's coarse directory clock on any host; `dirSettleMs` is
  // pinned wide so the assertion does not depend on how long the lines above took.
  test("finds a created directory even when the clock never moves the parent's mtime", async () => {
    const root = await makeRoot();
    await seed(root, "lib/a.ts");
    const dir = path.join(root, "lib");
    // Stamped before priming too: `utimes` drops APFS's sub-millisecond part, so both sides must be whole ms.
    const frozen = new Date();
    await utimes(dir, frozen, frozen);
    const index = await primed([root], 60_000);

    const created = await seed(root, "lib/user/user.constant.ts");
    await utimes(dir, frozen, frozen);
    expect((await stat(dir)).mtimeMs).toBe(frozen.getTime());

    expect(index.hasUnsettledDirs).toBe(true);
    expect(await index.collectChanges()).toEqual([created]);
  });

  test("stops re-reading a directory once its mtime is old enough to trust", async () => {
    const root = await makeRoot();
    await seed(root, "lib/a.ts");
    const index = await primed([root], 60_000);
    expect(index.hasUnsettledDirs).toBe(true);

    const settled = new Date(Date.now() - 120_000);
    for (const dir of [root, path.join(root, "lib")]) await utimes(dir, settled, settled);

    expect(await index.collectChanges()).toEqual([]);
    expect(index.hasUnsettledDirs).toBe(false);
  });

  test("reports a deleted file and a deleted directory's files", async () => {
    const root = await makeRoot();
    const kept = await seed(root, "lib/a.ts");
    const removed = await seed(root, "lib/gone/b.ts");
    const index = await primed([root]);

    await rm(path.join(root, "lib/gone"), { recursive: true, force: true });
    expect(await index.collectChanges()).toEqual([removed]);
    expect(await index.collectChanges()).toEqual([]);
    expect(await index.collectChanges()).not.toContain(kept);
  });

  test("ignores build output and node_modules", async () => {
    const root = await makeRoot();
    await seed(root, "lib/a.ts");
    const index = await primed([root]);
    expect(index.trackedFileCount).toBe(1);

    await seed(root, ".akan/artifact/server/pages-1.js");
    await seed(root, "node_modules/dep/index.ts");
    expect(await index.collectChanges()).toEqual([]);
    expect(index.trackedFileCount).toBe(1);
  });

  test("ignores files no classifier kind applies to", async () => {
    const root = await makeRoot();
    await seed(root, "lib/a.ts");
    const index = await primed([root]);

    await seed(root, "public/logo.svg", "<svg/>");
    expect(await index.collectChanges()).toEqual([]);
  });

  test("absorb adopts a write instead of reporting it", async () => {
    const root = await makeRoot();
    const abs = await seed(root, "lib/index.ts");
    const index = await primed([root]);

    await rewrite(abs, "333");
    await index.absorb([abs]);
    expect(await index.collectChanges()).toEqual([]);
  });

  test("absorb of an unknown path does not start tracking a change", async () => {
    const root = await makeRoot();
    await seed(root, "lib/a.ts");
    const index = await primed([root]);

    const created = await seed(root, "lib/generated.ts");
    await index.absorb([created]);
    expect(await index.collectChanges()).toEqual([]);
  });

  test("counts a file once when a root is nested inside another root", async () => {
    const root = await makeRoot();
    await seed(root, "page/_index.tsx");
    const nested = await primed([root, path.join(root, "page")]);
    const flat = await primed([root]);

    expect(nested.trackedFileCount).toBe(flat.trackedFileCount);
  });

  test("concurrent scans do not invent a change", async () => {
    const root = await makeRoot();
    await Promise.all([0, 1, 2, 3, 4].map((i) => seed(root, `lib/File${i}.ts`)));
    const index = await primed([root]);

    const rounds = await Promise.all([1, 2, 3, 4].map(() => index.collectChanges()));
    expect(rounds.flat()).toEqual([]);
  });

  test("concurrent scans report a real change exactly once between them", async () => {
    const root = await makeRoot();
    const abs = await seed(root, "lib/a.ts");
    const index = await primed([root]);

    await rewrite(abs, "444");
    const rounds = await Promise.all([1, 2, 3].map(() => index.collectChanges()));
    expect(rounds.flat()).toEqual([abs]);
  });

  test("reports nothing before priming rather than treating the tree as new", async () => {
    const root = await makeRoot();
    await seed(root, "lib/a.ts");
    const index = new SourceMtimeIndex({ roots: [root] });

    expect(index.primed).toBe(false);
    expect(await index.collectChanges()).toEqual([]);
  });

  describe("a directory it cannot read", () => {
    // `chmod 000` does not stop root (CI containers often run as root), and on Windows it leaves a directory listable.
    const cannotLock = process.getuid?.() === 0 || process.platform === "win32";

    test.skipIf(cannotLock)("is reported as a gap instead of silently skipped", async () => {
      const root = await makeRoot();
      await seed(root, "open/a.ts");
      const hidden = await seed(root, "locked/b.ts");
      await chmod(path.dirname(hidden), 0o000);

      const index = await primed([root]);

      expect(index.primed).toBe(true);
      expect(index.trackedFileCount).toBe(1);
      expect(index.coverageGaps).toEqual([{ path: path.dirname(hidden), code: "EACCES" }]);
    });

    test.skipIf(cannotLock)("becomes visible again once it is readable, and clears the gap", async () => {
      const root = await makeRoot();
      const hidden = await seed(root, "locked/b.ts");
      const locked = path.dirname(hidden);
      await chmod(locked, 0o000);
      const index = await primed([root]);

      await chmod(locked, 0o755);

      expect(await index.collectChanges()).toEqual([hidden]);
      expect(index.coverageGaps).toEqual([]);
      await rewrite(hidden, "999");
      expect(await index.collectChanges()).toEqual([hidden]);
    });

    test.skipIf(cannotLock)("does not report the files under it as deleted while it is unreadable", async () => {
      const root = await makeRoot();
      const abs = await seed(root, "locked/b.ts");
      const locked = path.dirname(abs);
      const index = await primed([root]);
      expect(index.trackedFileCount).toBe(1);

      await chmod(locked, 0o000);

      expect(await index.collectChanges()).toEqual([]);
      expect(index.trackedFileCount).toBe(1);
      // Whether the locked directory itself is listed depends on its mtime freshness, so assert membership, not count.
      expect(index.coverageGaps.map((gap) => gap.path)).toContain(abs);
      expect(index.coverageGaps.every((gap) => gap.code === "EACCES")).toBe(true);

      await chmod(locked, 0o755);
      await rewrite(abs, "1234");
      expect(await index.collectChanges()).toEqual([abs]);
      expect(index.coverageGaps).toEqual([]);
    });

    test("is still forgotten when it is genuinely deleted, with no gap left behind", async () => {
      const root = await makeRoot();
      const abs = await seed(root, "lib/a.ts");
      const index = await primed([root]);

      await rm(path.dirname(abs), { recursive: true, force: true });

      expect(await index.collectChanges()).toEqual([abs]);
      expect(index.coverageGaps).toEqual([]);
      expect(await index.collectChanges()).toEqual([]);
    });
  });
});
