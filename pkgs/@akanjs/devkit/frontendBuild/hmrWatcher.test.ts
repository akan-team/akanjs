import { afterEach, describe, expect, test } from "bun:test";
import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { Logger } from "akanjs/common";
import { type ChangeBatch, HmrWatcher } from "./hmrWatcher";

/**
 * These run against the real Bun watcher rather than a fake, because the behaviour under test only
 * exists there: Bun 1.3.14's recursive `fs.watch` reports about one path per ~200ms coalescing window and
 * discards the rest (`local/optimize-resource/06-watcher-dropped-event.md`). A fake that delivered every
 * event would pass no matter what the watcher did with them.
 */
const STREAM_WARMUP_MS = 600;
const SETTLE_MS = 1_500;
const TEST_TIMEOUT_MS = 15_000;

const started: HmrWatcher[] = [];
const roots: string[] = [];
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
/** Every level `HmrWatcher` can reach, so adding a log line cannot fail a test for the wrong reason. */
const silentLogger = {
  trace: () => undefined,
  verbose: () => undefined,
  debug: () => undefined,
  log: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
} as unknown as Logger;

const makeRoot = async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "akan-hmr-watcher-"));
  roots.push(root);
  return root;
};

const seed = async (root: string, rel: string, content = "export const x = 1;\n") => {
  const abs = path.join(root, rel);
  await mkdir(path.dirname(abs), { recursive: true });
  await writeFile(abs, content);
  return abs;
};

/** Start watching and let the FSEvents stream come up; events raised before it does are not delivered. */
const watch = async (root: string) => {
  const batches: ChangeBatch[] = [];
  const watcher = new HmrWatcher({
    roots: [root],
    logger: silentLogger,
    onBatch: (batch) => void batches.push(batch),
  });
  started.push(watcher);
  await watcher.start();
  await sleep(STREAM_WARMUP_MS);
  return { watcher, batches, seen: () => new Set(batches.flatMap((batch) => batch.files)) };
};

afterEach(async () => {
  for (const watcher of started.splice(0)) watcher.stop();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("HmrWatcher", () => {
  test(
    "reports every file of a save-all",
    async () => {
      const root = await makeRoot();
      const files = await Promise.all([0, 1, 2, 3, 4].map((i) => seed(root, `lib/File${i}.ts`)));
      const { batches, seen, watcher } = await watch(root);

      // No gaps between writes, so they share one coalescing window and Bun names at most one of them.
      for (const [i, abs] of files.entries()) await writeFile(abs, `export const x = ${i}00;\n`);
      await sleep(SETTLE_MS);

      expect(batches.length).toBeGreaterThan(0);
      for (const abs of files) expect([...seen()]).toContain(abs);
      // Not asserted as non-zero: the point is that the outcome above holds whether or not Bun drops
      // events, so this suite keeps passing if the upstream defect is ever fixed. The counter is the
      // signal for when the compensation can be removed.
      expect(watcher.unreportedChanges).toBeGreaterThanOrEqual(0);
    },
    TEST_TIMEOUT_MS,
  );

  test(
    "reports a save that lands in the same window as a build's artifact burst",
    async () => {
      const root = await makeRoot();
      const source = await seed(root, "lib/a.ts");
      const { seen, batches } = await watch(root);

      // What every build ends with: a burst under `.akan/`, which the classifier ignores. Before this
      // was handled, the burst was the one path Bun reported and the save right after it was invisible.
      const artifactDir = path.join(root, ".akan", "artifact", "server");
      await mkdir(artifactDir, { recursive: true });
      for (let i = 0; i < 60; i++) await writeFile(path.join(artifactDir, `chunk-${i}.js`), "x".repeat(8192));
      await writeFile(path.join(artifactDir, "pages.js"), "y".repeat(4 * 1024 * 1024));
      await writeFile(source, "export const x = 999;\n");
      await sleep(SETTLE_MS);

      expect([...seen()]).toContain(source);
      // Exactly one batch for one save. Bun does deliver a real event for some paths the scan has already
      // emitted, and counting both produced a second generation and a second build for no change.
      expect(batches.filter((batch) => batch.files.includes(source))).toHaveLength(1);
    },
    TEST_TIMEOUT_MS,
  );

  test(
    "raises no batch for build output alone",
    async () => {
      const root = await makeRoot();
      await seed(root, "lib/a.ts");
      const { batches } = await watch(root);

      const artifactDir = path.join(root, ".akan", "artifact");
      await mkdir(artifactDir, { recursive: true });
      for (let i = 0; i < 20; i++) await writeFile(path.join(artifactDir, `chunk-${i}.js`), "x".repeat(4096));
      await sleep(SETTLE_MS);

      // The verification scan is triggered by ignored paths, so it must not invent work from them either.
      expect(batches).toEqual([]);
    },
    TEST_TIMEOUT_MS,
  );

  test(
    "classifies a stylesheet edit as css and a config edit as config",
    async () => {
      const root = await makeRoot();
      const style = await seed(root, "ui/app.css", ".a{color:red}\n");
      const config = await seed(root, "akan.config.ts", "export default {};\n");
      const { batches } = await watch(root);

      await writeFile(style, ".a{color:blue}\n");
      await sleep(400);
      await writeFile(config, "export default { basePaths: [] };\n");
      await sleep(SETTLE_MS);

      const kinds = new Set(batches.flatMap((batch) => [...batch.kinds]));
      expect(kinds.has("css")).toBe(true);
      expect(kinds.has("config")).toBe(true);
    },
    TEST_TIMEOUT_MS,
  );

  test(
    "stops reporting after stop()",
    async () => {
      const root = await makeRoot();
      const source = await seed(root, "lib/a.ts");
      const { watcher, batches } = await watch(root);

      watcher.stop();
      await writeFile(source, "export const x = 5;\n");
      await sleep(SETTLE_MS);

      expect(batches).toEqual([]);
    },
    TEST_TIMEOUT_MS,
  );

  test.skipIf(process.getuid?.() === 0)(
    "warns at startup when part of the tree cannot be read",
    async () => {
      const root = await makeRoot();
      const hidden = await seed(root, "locked/b.ts");
      await chmod(path.dirname(hidden), 0o000);
      const warnings: string[] = [];

      const watcher = new HmrWatcher({
        roots: [root],
        logger: { ...silentLogger, warn: (msg: string) => void warnings.push(msg) } as unknown as Logger,
        onBatch: () => undefined,
      });
      started.push(watcher);
      await watcher.start();
      // Restored before asserting, not after: a failed assertion would otherwise leave a directory `rm`
      // cannot traverse, and the leak would fail the *next* test instead of this one.
      await chmod(path.dirname(hidden), 0o755);

      // At startup rather than at the first save, because an unreadable root means edits under it never
      // rebuild — waiting for a save to reveal that means waiting for the save that silently does nothing.
      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toContain("will not rebuild");
      expect(warnings[0]).toContain("EACCES");
    },
    TEST_TIMEOUT_MS,
  );
});
