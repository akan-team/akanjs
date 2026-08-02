import { afterEach, describe, expect, test } from "bun:test";
import { chmod, mkdir, mkdtemp, readdir, rm, stat, utimes, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { SourceMtimeIndex } from "./sourceMtimeIndex";

const roots: string[] = [];

const makeRoot = async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "akan-mtime-index-"));
  roots.push(root);
  return root;
};

const seed = async (root: string, rel: string, content = "export const x = 1;\n") => {
  const abs = path.join(root, rel);
  await mkdir(path.dirname(abs), { recursive: true });
  await writeFile(abs, content);
  return abs;
};

/**
 * mtime comparison needs the write to land on a different timestamp than the baseline. APFS records
 * nanoseconds so same-millisecond writes normally still differ, but size is compared too and a
 * same-length rewrite inside one tick would tie both — so tests vary content length rather than sleep.
 */
const rewrite = (abs: string, marker: string) => writeFile(abs, `export const x = ${marker};\n`);

/**
 * `rm` cannot traverse a directory a test left unreadable, and a throw here fails the *next* test rather
 * than the one that caused it — so permissions are restored on the way down before giving up.
 */
const forceRemove = async (target: string): Promise<void> => {
  await rm(target, { recursive: true, force: true }).catch(async () => {
    await chmod(target, 0o755).catch(() => undefined);
    const entries = await readdir(target, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) if (entry.isDirectory()) await forceRemove(path.join(target, entry.name));
    await rm(target, { recursive: true, force: true });
  });
};

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => forceRemove(root)));
});

describe("SourceMtimeIndex", () => {
  test("reports nothing on a quiet tree", async () => {
    const root = await makeRoot();
    await seed(root, "lib/a.ts");
    const index = new SourceMtimeIndex({ roots: [root] });
    await index.prime();

    expect(index.trackedFileCount).toBe(1);
    expect(await index.collectChanges()).toEqual([]);
    expect(await index.collectChanges()).toEqual([]);
  });

  test("reports every file of a save-all, which is what fs.watch loses", async () => {
    const root = await makeRoot();
    const files = await Promise.all([0, 1, 2, 3, 4].map((i) => seed(root, `lib/File${i}.ts`)));
    const index = new SourceMtimeIndex({ roots: [root] });
    await index.prime();

    // No gaps: exactly the burst Bun collapses to a single reported path.
    for (const [i, abs] of files.entries()) await rewrite(abs, `${i}00`);

    expect((await index.collectChanges()).sort()).toEqual([...files].sort());
  });

  test("reports a change once, then stops reporting it", async () => {
    const root = await makeRoot();
    const abs = await seed(root, "lib/a.ts");
    const index = new SourceMtimeIndex({ roots: [root] });
    await index.prime();

    await rewrite(abs, "222");
    expect(await index.collectChanges()).toEqual([abs]);
    expect(await index.collectChanges()).toEqual([]);
  });

  test("reports a created file, found through its directory's mtime", async () => {
    const root = await makeRoot();
    await seed(root, "lib/a.ts");
    const index = new SourceMtimeIndex({ roots: [root] });
    await index.prime();

    const created = await seed(root, "lib/b.ts");
    expect(await index.collectChanges()).toEqual([created]);
    expect(await index.collectChanges()).toEqual([]);
  });

  test("reports a created directory's files", async () => {
    const root = await makeRoot();
    await seed(root, "lib/a.ts");
    const index = new SourceMtimeIndex({ roots: [root] });
    await index.prime();

    const created = await seed(root, "lib/user/user.constant.ts");
    expect(await index.collectChanges()).toEqual([created]);
    expect(await index.collectChanges()).toEqual([]);
  });

  /**
   * Linux stamps directory mtimes from a coarse clock, so a mutation landing in the same tick as the
   * value the index recorded leaves that value byte-identical: measured under Docker, 319 of 400
   * back-to-back `mkdir`s never moved the parent's mtime on overlayfs and 324 of 400 on ext4, while APFS
   * missed none. `utimes` reproduces that here rather than leaving it to the host's clock resolution —
   * otherwise this passes on macOS for the wrong reason and is flaky on the Linux fleet.
   *
   * `dirSettleMs` is pinned wide so the assertion is about the mechanism, not about how many milliseconds
   * the lines above happened to take.
   */
  test("finds a created directory even when the clock never moves the parent's mtime", async () => {
    const root = await makeRoot();
    await seed(root, "lib/a.ts");
    const dir = path.join(root, "lib");
    // Pinned before priming too: `utimes` keeps whole milliseconds but drops APFS's sub-millisecond part,
    // so stamping both sides is what makes "the mtime did not move" exact rather than 0.5ms apart.
    const frozen = new Date();
    await utimes(dir, frozen, frozen);
    const index = new SourceMtimeIndex({ roots: [root], dirSettleMs: 60_000 });
    await index.prime();

    const created = await seed(root, "lib/user/user.constant.ts");
    await utimes(dir, frozen, frozen);
    expect((await stat(dir)).mtimeMs).toBe(frozen.getTime());

    expect(index.hasUnsettledDirs).toBe(true);
    expect(await index.collectChanges()).toEqual([created]);
  });

  test("stops re-reading a directory once its mtime is old enough to trust", async () => {
    const root = await makeRoot();
    await seed(root, "lib/a.ts");
    const index = new SourceMtimeIndex({ roots: [root], dirSettleMs: 60_000 });
    await index.prime();
    expect(index.hasUnsettledDirs).toBe(true);

    // The retry compensates for a timestamp that is too fresh to trust; it must not become a standing
    // full walk once the tree settles.
    const settled = new Date(Date.now() - 120_000);
    for (const dir of [root, path.join(root, "lib")]) await utimes(dir, settled, settled);

    expect(await index.collectChanges()).toEqual([]);
    expect(index.hasUnsettledDirs).toBe(false);
  });

  test("reports a deleted file and a deleted directory's files", async () => {
    const root = await makeRoot();
    const kept = await seed(root, "lib/a.ts");
    const removed = await seed(root, "lib/gone/b.ts");
    const index = new SourceMtimeIndex({ roots: [root] });
    await index.prime();

    await rm(path.join(root, "lib/gone"), { recursive: true, force: true });
    expect(await index.collectChanges()).toEqual([removed]);
    expect(await index.collectChanges()).toEqual([]);
    expect(await index.collectChanges()).not.toContain(kept);
  });

  test("ignores build output and node_modules", async () => {
    const root = await makeRoot();
    await seed(root, "lib/a.ts");
    const index = new SourceMtimeIndex({ roots: [root] });
    await index.prime();
    expect(index.trackedFileCount).toBe(1);

    await seed(root, ".akan/artifact/server/pages-1.js");
    await seed(root, "node_modules/dep/index.ts");
    expect(await index.collectChanges()).toEqual([]);
    expect(index.trackedFileCount).toBe(1);
  });

  test("ignores files no classifier kind applies to", async () => {
    const root = await makeRoot();
    await seed(root, "lib/a.ts");
    const index = new SourceMtimeIndex({ roots: [root] });
    await index.prime();

    await seed(root, "public/logo.svg", "<svg/>");
    expect(await index.collectChanges()).toEqual([]);
  });

  test("absorb adopts a write instead of reporting it", async () => {
    const root = await makeRoot();
    const abs = await seed(root, "lib/index.ts");
    const index = new SourceMtimeIndex({ roots: [root] });
    await index.prime();

    await rewrite(abs, "333");
    await index.absorb([abs]);
    expect(await index.collectChanges()).toEqual([]);
  });

  test("absorb of an unknown path does not start tracking a change", async () => {
    const root = await makeRoot();
    await seed(root, "lib/a.ts");
    const index = new SourceMtimeIndex({ roots: [root] });
    await index.prime();

    const created = await seed(root, "lib/generated.ts");
    await index.absorb([created]);
    expect(await index.collectChanges()).toEqual([]);
  });

  test("counts a file once when a root is nested inside another root", async () => {
    const root = await makeRoot();
    await seed(root, "page/_index.tsx");
    const nested = new SourceMtimeIndex({ roots: [root, path.join(root, "page")] });
    await nested.prime();
    const flat = new SourceMtimeIndex({ roots: [root] });
    await flat.prime();

    expect(nested.trackedFileCount).toBe(flat.trackedFileCount);
  });

  test("concurrent scans do not invent a change", async () => {
    const root = await makeRoot();
    await Promise.all([0, 1, 2, 3, 4].map((i) => seed(root, `lib/File${i}.ts`)));
    const index = new SourceMtimeIndex({ roots: [root] });
    await index.prime();

    // Overlapping scans used to corrupt each other's view of the baseline: one pruned an entry the other
    // had already snapshotted, and the path came back as a change nothing had written.
    const rounds = await Promise.all([1, 2, 3, 4].map(() => index.collectChanges()));
    expect(rounds.flat()).toEqual([]);
  });

  test("concurrent scans report a real change exactly once between them", async () => {
    const root = await makeRoot();
    const abs = await seed(root, "lib/a.ts");
    const index = new SourceMtimeIndex({ roots: [root] });
    await index.prime();

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
    /**
     * `chmod 000` does not stop root, so these would assert the opposite of what they mean when the suite
     * runs as root (CI containers commonly do).
     */
    const asRoot = process.getuid?.() === 0;

    test.skipIf(asRoot)("is reported as a gap instead of silently skipped", async () => {
      const root = await makeRoot();
      await seed(root, "open/a.ts");
      const hidden = await seed(root, "locked/b.ts");
      await chmod(path.dirname(hidden), 0o000);

      const index = new SourceMtimeIndex({ roots: [root] });
      await index.prime();

      // Priming still succeeds — it just cannot see everything, and that is the part that must be said out
      // loud rather than inferred from a file count nobody is checking.
      expect(index.primed).toBe(true);
      expect(index.trackedFileCount).toBe(1);
      expect(index.coverageGaps).toEqual([{ path: path.dirname(hidden), code: "EACCES" }]);
    });

    test.skipIf(asRoot)("becomes visible again once it is readable, and clears the gap", async () => {
      const root = await makeRoot();
      const hidden = await seed(root, "locked/b.ts");
      const locked = path.dirname(hidden);
      await chmod(locked, 0o000);
      const index = new SourceMtimeIndex({ roots: [root] });
      await index.prime();

      await chmod(locked, 0o755);

      // Before the fix this stayed empty forever: the directory had been forgotten, so nothing re-stat'd
      // it, and its parent's mtime never moves when a child merely becomes readable again.
      expect(await index.collectChanges()).toEqual([hidden]);
      expect(index.coverageGaps).toEqual([]);
      await rewrite(hidden, "999");
      expect(await index.collectChanges()).toEqual([hidden]);
    });

    test.skipIf(asRoot)("does not report the files under it as deleted while it is unreadable", async () => {
      const root = await makeRoot();
      const abs = await seed(root, "locked/b.ts");
      const locked = path.dirname(abs);
      const index = new SourceMtimeIndex({ roots: [root] });
      await index.prime();
      expect(index.trackedFileCount).toBe(1);

      await chmod(locked, 0o000);

      // A phantom deletion would rebuild for nothing and, worse, drop the file so a later real edit to it
      // goes unreported.
      expect(await index.collectChanges()).toEqual([]);
      expect(index.trackedFileCount).toBe(1);
      // The locked directory joins the list too whenever this scan happened to re-read it — which depends
      // on how fresh its mtime still was (see `dirSettleMs`) — so assert what the gap is about rather than
      // how many entries happen to describe it.
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
      const index = new SourceMtimeIndex({ roots: [root] });
      await index.prime();

      await rm(path.dirname(abs), { recursive: true, force: true });

      expect(await index.collectChanges()).toEqual([abs]);
      expect(index.coverageGaps).toEqual([]);
      expect(await index.collectChanges()).toEqual([]);
    });
  });
});
