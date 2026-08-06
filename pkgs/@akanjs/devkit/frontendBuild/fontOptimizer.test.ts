import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { App } from "../commandDecorators";
import { FontOptimizer } from "./fontOptimizer";

const SOURCE_FONT = path.resolve(import.meta.dir, "../../../../libs/shared/public/fonts/Assistant-Regular.woff2");

const tempRoots: string[] = [];

const makeApp = async (layoutSource: string) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "akan-devkit-font-"));
  tempRoots.push(root);
  const cwdPath = path.join(root, "apps/demo");
  await mkdir(path.join(cwdPath, "page"), { recursive: true });
  await mkdir(path.join(cwdPath, "public/fonts"), { recursive: true });
  await writeFile(path.join(cwdPath, "page/_layout.tsx"), layoutSource);
  await Bun.write(path.join(cwdPath, "public/fonts/Assistant-Regular.woff2"), Bun.file(SOURCE_FONT));
  const app = {
    cwdPath,
    dist: { cwdPath: path.join(root, "dist/apps/demo") },
    workspace: { workspaceRoot: root },
    getPageKeys: async () => ["./_layout.tsx"],
    verbose: () => undefined,
    logger: { warn: () => undefined },
  } as unknown as App;
  return { app, cwdPath };
};

const layoutWith = (extra = "") => `
export const fonts = [
  {
    name: "Assistant",${extra}
    paths: [{ src: "/fonts/Assistant-Regular.woff2", weight: 400 }],
  },
];
export default function Layout() {
  return null;
}
`;

const optimize = (app: App) => new FontOptimizer(app, "start").optimize();

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("FontOptimizer cache", () => {
  test("reuses subset output instead of resubsetting an unchanged font", async () => {
    const { app } = await makeApp(layoutWith());

    const first = await optimize(app);
    expect(first.files).toHaveLength(1);
    expect(first.css).toContain("@font-face");
    const writtenAt = (await stat(first.files[0])).mtimeMs;

    const second = await optimize(app);
    expect(second.files).toEqual(first.files);
    expect(second.css).toBe(first.css);
    expect(second.fonts).toEqual(first.fonts);
    // The output was reused, not rewritten — the whole point of the cache.
    expect((await stat(second.files[0])).mtimeMs).toBe(writtenAt);
  });

  test("resubsets when the source font file changes", async () => {
    const { app, cwdPath } = await makeApp(layoutWith());
    const first = await optimize(app);
    const firstBytes = await Bun.file(first.files[0]).bytes();

    // Swapped for a different real font rather than corrupted, so the resubset itself still succeeds.
    const sourcePath = path.join(cwdPath, "public/fonts/Assistant-Regular.woff2");
    await Bun.write(sourcePath, Bun.file(path.resolve(path.dirname(SOURCE_FONT), "Assistant-Bold.woff2")));

    const second = await optimize(app);
    expect(second.files).toEqual(first.files);
    expect(await Bun.file(second.files[0]).bytes()).not.toEqual(firstBytes);
  });

  test("resubsets when a config field changes without changing the output filename", async () => {
    const { app, cwdPath } = await makeApp(layoutWith());
    const first = await optimize(app);
    const writtenAt = (await stat(first.files[0])).mtimeMs;

    // `className` never feeds the output filename hash, so only the cache key can catch it.
    await writeFile(path.join(cwdPath, "page/_layout.tsx"), layoutWith(`\n    className: "font-brand",`));

    const second = await optimize(app);
    expect(second.files).toEqual(first.files);
    expect(second.css).not.toBe(first.css);
    expect(second.css).toContain(".font-brand");
    expect((await stat(second.files[0])).mtimeMs).not.toBe(writtenAt);
  });

  test("ignores a cache whose output file is gone", async () => {
    const { app } = await makeApp(layoutWith());
    const first = await optimize(app);
    await rm(first.files[0]);

    const second = await optimize(app);
    expect(second.files).toEqual(first.files);
    expect(await Bun.file(second.files[0]).exists()).toBe(true);
  });

  test("skips route files that never mention fonts", async () => {
    const { app } = await makeApp("export default function Layout() {\n  return null;\n}\n");
    const result = await optimize(app);
    expect(result.fonts).toEqual([]);
    expect(result.files).toEqual([]);
  });
});
