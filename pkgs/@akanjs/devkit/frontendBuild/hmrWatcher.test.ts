import { afterEach, describe, expect, test } from "bun:test";
import { chmod, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Logger } from "akanjs/common";
import { tempDirs } from "../testHelpers";
import { type ChangeBatch, HmrWatcher } from "./hmrWatcher";

// The real Bun watcher, not a fake: the dropped-event behaviour under test only exists there.
const STREAM_WARMUP_MS = 600;
const SETTLE_MS = 1_500;
const TEST_TIMEOUT_MS = 15_000;

const started: HmrWatcher[] = [];
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const silentLogger = {
  trace: () => undefined,
  verbose: () => undefined,
  debug: () => undefined,
  log: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
} as unknown as Logger;

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

afterEach(() => {
  for (const watcher of started.splice(0)) watcher.stop();
});
const makeRoot = tempDirs("akan-hmr-watcher-");

describe("HmrWatcher", () => {
  test(
    "marks when a batch's window opened and when it was handed over",
    async () => {
      const root = await makeRoot();
      const source = await seed(root, "lib/a.ts");
      const { batches } = await watch(root);

      const writtenAt = Date.now();
      await writeFile(source, "export const x = 2;\n");
      await sleep(SETTLE_MS);

      const trace = batches.filter((batch) => batch.files.includes(source)).at(-1)?.trace;
      expect(trace?.eventAt).toBeGreaterThanOrEqual(writtenAt);
      expect(trace?.flushAt).toBeGreaterThanOrEqual(trace?.eventAt ?? Number.POSITIVE_INFINITY);
    },
    TEST_TIMEOUT_MS,
  );

  test(
    "takes its debounce window from AKAN_DEV_WATCH_DEBOUNCE_MS when no option names one",
    async () => {
      const previous = process.env.AKAN_DEV_WATCH_DEBOUNCE_MS;
      process.env.AKAN_DEV_WATCH_DEBOUNCE_MS = "400";
      try {
        const root = await makeRoot();
        const source = await seed(root, "lib/a.ts");
        const batches: ChangeBatch[] = [];
        // Without the verification scan, which would otherwise hand the batch over at 250ms.
        const watcher = new HmrWatcher({
          roots: [root],
          logger: silentLogger,
          verifyDelayMs: 0,
          onBatch: (batch) => void batches.push(batch),
        });
        started.push(watcher);
        await watcher.start();
        await sleep(STREAM_WARMUP_MS);

        await writeFile(source, "export const x = 3;\n");
        await sleep(SETTLE_MS);

        const trace = batches.find((batch) => batch.files.includes(source))?.trace;
        expect((trace?.flushAt ?? 0) - (trace?.eventAt ?? 0)).toBeGreaterThanOrEqual(395);
      } finally {
        if (previous === undefined) delete process.env.AKAN_DEV_WATCH_DEBOUNCE_MS;
        else process.env.AKAN_DEV_WATCH_DEBOUNCE_MS = previous;
      }
    },
    TEST_TIMEOUT_MS,
  );

  test(
    "reports every file of a save-all",
    async () => {
      const root = await makeRoot();
      const files = await Promise.all([0, 1, 2, 3, 4].map((i) => seed(root, `lib/File${i}.ts`)));
      const { batches, seen, watcher } = await watch(root);

      for (const [i, abs] of files.entries()) await writeFile(abs, `export const x = ${i}00;\n`);
      await sleep(SETTLE_MS);

      expect(batches.length).toBeGreaterThan(0);
      for (const abs of files) expect([...seen()]).toContain(abs);
      // Not `> 0`: the suite must keep passing if Bun ever stops dropping events.
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

      const artifactDir = path.join(root, ".akan", "artifact", "server");
      await mkdir(artifactDir, { recursive: true });
      for (let i = 0; i < 60; i++) await writeFile(path.join(artifactDir, `chunk-${i}.js`), "x".repeat(8192));
      await writeFile(path.join(artifactDir, "pages.js"), "y".repeat(4 * 1024 * 1024));
      await writeFile(source, "export const x = 999;\n");
      await sleep(SETTLE_MS);

      expect([...seen()]).toContain(source);
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

  test.skipIf(process.getuid?.() === 0 || process.platform === "win32")(
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
      // Restored before asserting: a failed assertion would leave a directory `rm` cannot traverse.
      await chmod(path.dirname(hidden), 0o755);

      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toContain("will not rebuild");
      expect(warnings[0]).toContain("EACCES");
    },
    TEST_TIMEOUT_MS,
  );
});
