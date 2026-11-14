import { describe, expect, test } from "bun:test";
import { chmod, mkdir, rm, stat, utimes, writeFile } from "node:fs/promises";
import path from "node:path";
import type { App } from "../commandDecorators";
import { tempDirs } from "../test/testHelpers";
import { FontOptimizer } from "./fontOptimizer";

const SOURCE_FONT = path.resolve(import.meta.dir, "../../../../libs/shared/public/fonts/Assistant-Regular.woff2");

const tempRoot = tempDirs("akan-devkit-font-");

const makeApp = async (layoutSource: string) => {
  const root = await tempRoot();
  const cwdPath = path.join(root, "apps/demo");
  await mkdir(path.join(cwdPath, "page"), { recursive: true });
  await mkdir(path.join(cwdPath, "public/fonts"), { recursive: true });
  await writeFile(path.join(cwdPath, "page/_layout.tsx"), layoutSource);
  await Bun.write(path.join(cwdPath, "public/fonts/Assistant-Regular.woff2"), Bun.file(SOURCE_FONT));
  const warnings: string[] = [];
  const verboses: string[] = [];
  const app = {
    cwdPath,
    dist: { cwdPath: path.join(root, "dist/apps/demo") },
    workspace: { workspaceRoot: root },
    getPageKeys: async () => ["./_layout.tsx"],
    verbose: (message: string) => verboses.push(message),
    logger: { warn: (message: string) => warnings.push(message) },
  } as unknown as App;
  const reusedCount = () => verboses.filter((message) => message.startsWith("[font] reused")).length;
  return { app, cwdPath, root, warnings, reusedCount };
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

const chainLayoutWith = (declaration: string) => `
import { rootLayout } from "akanjs/client";

export default rootLayout()
  .fonts(${declaration})
  .theme("dark")
  .render(({ children }) => children);
`;

const chainFontEntry = (extra = "") => `{
      name: "Assistant",${extra}
      paths: [{ src: "/fonts/Assistant-Regular.woff2", weight: 400 }],
    }`;

const chainFontList = (extra = "") => `[\n    ${chainFontEntry(extra)},\n  ]`;

const optimize = (app: App) => new FontOptimizer(app, "start").optimize();

const sizeAdjusts = (css: string) => [...css.matchAll(/size-adjust: ([^;]+);/g)].map((match) => match[1]);

const renameSfntTable = (bytes: Uint8Array, from: string, to: string) => {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let index = 0; index < view.getUint16(4); index++) {
    const offset = 12 + index * 16;
    if (new TextDecoder().decode(bytes.subarray(offset, offset + 4)) === from)
      bytes.set(new TextEncoder().encode(to), offset);
  }
  return bytes;
};

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

  test("reuses the subset on the next akan start, which wipes the artifact folder", async () => {
    const { app, cwdPath, reusedCount } = await makeApp(layoutWith());
    const first = await optimize(app);
    const firstBytes = await Bun.file(first.files[0]).bytes();
    await rm(path.join(cwdPath, ".akan/artifact"), { recursive: true, force: true });

    const second = await optimize(app);
    expect(reusedCount()).toBe(1);
    expect(second.files).toEqual(first.files);
    expect(second.css).toBe(first.css);
    expect(await Bun.file(second.files[0]).bytes()).toEqual(firstBytes);
  });

  test.each(["akanjs", "bun"])("resubsets when the cache was written by another %s version", async (field) => {
    const { app, cwdPath, reusedCount } = await makeApp(layoutWith());
    await optimize(app);
    const indexPath = path.join(cwdPath, ".akan/cache/fontCache.json");
    const index = await Bun.file(indexPath).json();
    await Bun.write(indexPath, JSON.stringify({ ...index, [field]: "0.0.1-other" }));

    await optimize(app);
    expect(reusedCount()).toBe(0);
    expect((await Bun.file(indexPath).json())[field]).toBe(index[field]);
  });

  test("resubsets when the lockfile changes, since a font tool version may have moved", async () => {
    const { app, root, reusedCount } = await makeApp(layoutWith());
    await writeFile(path.join(root, "bun.lock"), '{ "lockfileVersion": 1 }\n');
    await optimize(app);
    await optimize(app);
    expect(reusedCount()).toBe(1);

    await writeFile(path.join(root, "bun.lock"), '{ "lockfileVersion": 1, "packages": {} }\n');
    await optimize(app);
    expect(reusedCount()).toBe(1);
  });

  test("rebuilds a cached font file that was cut short", async () => {
    const { app, cwdPath, reusedCount } = await makeApp(layoutWith());
    const first = await optimize(app);
    const firstBytes = await Bun.file(first.files[0]).bytes();
    const cachedPath = path.join(
      cwdPath,
      ".akan/cache",
      path.relative(path.join(cwdPath, ".akan/artifact"), first.files[0]),
    );
    await Bun.write(cachedPath, firstBytes.subarray(0, firstBytes.byteLength / 2));
    await rm(path.join(cwdPath, ".akan/artifact"), { recursive: true, force: true });

    const second = await optimize(app);
    expect(reusedCount()).toBe(0);
    expect(await Bun.file(second.files[0]).bytes()).toEqual(firstBytes);
    expect(await Bun.file(cachedPath).bytes()).toEqual(firstBytes);
  });

  test("replaces an artifact copy that was cut short with the cached font", async () => {
    const { app, reusedCount } = await makeApp(layoutWith());
    const first = await optimize(app);
    const firstBytes = await Bun.file(first.files[0]).bytes();
    await Bun.write(first.files[0], firstBytes.subarray(0, 16));

    const second = await optimize(app);
    expect(reusedCount()).toBe(1);
    expect(await Bun.file(second.files[0]).bytes()).toEqual(firstBytes);
  });

  test("rebuilds when the cache index was cut short", async () => {
    const { app, cwdPath, reusedCount } = await makeApp(layoutWith());
    const first = await optimize(app);
    const indexPath = path.join(cwdPath, ".akan/cache/fontCache.json");
    const index = await Bun.file(indexPath).text();
    await Bun.write(indexPath, index.slice(0, index.length / 2));

    const second = await optimize(app);
    expect(reusedCount()).toBe(0);
    expect(second.css).toBe(first.css);
    expect(await Bun.file(indexPath).text()).toBe(index);
  });

  test("drops cached font files the current entry no longer lists", async () => {
    const { app, cwdPath } = await makeApp(layoutWith());
    const first = await optimize(app);
    const stalePath = path.join(cwdPath, ".akan/cache/fonts/Assistant-400-normal-stale.woff2");
    await Bun.write(stalePath, "stale");

    await writeFile(path.join(cwdPath, "page/_layout.tsx"), layoutWith(`\n    className: "font-brand",`));
    await optimize(app);
    expect(await Bun.file(stalePath).exists()).toBe(false);
    expect(
      await Bun.file(
        path.join(cwdPath, ".akan/cache", path.relative(path.join(cwdPath, ".akan/artifact"), first.files[0])),
      ).exists(),
    ).toBe(true);
  });

  test("still writes the fonts when the cache folder cannot be written", async () => {
    const { app, cwdPath } = await makeApp(layoutWith());
    const cacheDir = path.join(cwdPath, ".akan/cache");
    await mkdir(cacheDir, { recursive: true });
    await chmod(cacheDir, 0o500);
    try {
      const result = await optimize(app);
      expect(result.files).toHaveLength(1);
      expect(await Bun.file(result.files[0]).exists()).toBe(true);
    } finally {
      await chmod(cacheDir, 0o700);
    }
  });

  test("resubsets when the source font is replaced by one of the same size and mtime", async () => {
    const { app, cwdPath, reusedCount } = await makeApp(`
export const fonts = [{ name: "Gilda", paths: [{ src: "/fonts/Gilda.ttf", weight: 400 }] }];
export default function Layout() {
  return null;
}
`);
    const sourcePath = path.join(cwdPath, "public/fonts/Gilda.ttf");
    const source = await Bun.file(path.resolve(path.dirname(SOURCE_FONT), "GildaDisplay-Regular.ttf")).bytes();
    await Bun.write(sourcePath, source);
    await optimize(app);
    const { mtime } = await stat(sourcePath);

    await Bun.write(sourcePath, renameSfntTable(source.slice(), "OS/2", "XS/2"));
    await utimes(sourcePath, mtime, mtime);
    await optimize(app);
    expect(reusedCount()).toBe(0);
  });

  test("leaves a temporary file another start is still writing in the cache folder", async () => {
    const { app, cwdPath } = await makeApp(layoutWith());
    await optimize(app);
    const tempPath = path.join(cwdPath, ".akan/cache/fonts/Assistant-400-normal-abc.woff2.123.abc.tmp");
    await Bun.write(tempPath, "in progress");

    await writeFile(path.join(cwdPath, "page/_layout.tsx"), layoutWith(`\n    className: "font-brand",`));
    await optimize(app);
    expect(await Bun.file(tempPath).exists()).toBe(true);
  });

  test("skips route files that never mention fonts", async () => {
    const { app } = await makeApp("export default function Layout() {\n  return null;\n}\n");
    const result = await optimize(app);
    expect(result.fonts).toEqual([]);
    expect(result.files).toEqual([]);
  });
});

describe("FontOptimizer fallback", () => {
  test("writes a metric-adjusted fallback face next to the optimized face", async () => {
    const { app } = await makeApp(layoutWith());

    const { css } = await optimize(app);

    expect(css).toContain('font-family: "Assistant fallback"');
    expect(sizeAdjusts(css).length).toBeGreaterThan(0);
    expect(css).toMatch(/ascent-override: [\d.]+%/);
    expect(css).toMatch(/descent-override: [\d.]+%/);
  });

  test("sizes the fallback from the source font, so a subset without Latin letters keeps the same size", async () => {
    const { app: latinApp } = await makeApp(layoutWith());
    const { app: digitsApp } = await makeApp(layoutWith(`\n    subsets: [],\n    subsetText: "0123456789",`));

    const latin = sizeAdjusts((await optimize(latinApp)).css);
    const digits = sizeAdjusts((await optimize(digitsApp)).css);

    expect(latin.length).toBeGreaterThan(0);
    expect(digits).toEqual(latin);
  });

  test("still writes the face, with no fallback, when the source font's metrics cannot be read", async () => {
    const { app, cwdPath } = await makeApp(`
export const fonts = [{ name: "Gilda", paths: [{ src: "/fonts/Gilda.ttf", weight: 400 }] }];
export default function Layout() {
  return null;
}
`);
    const source = await Bun.file(path.resolve(path.dirname(SOURCE_FONT), "GildaDisplay-Regular.ttf")).bytes();
    // capsize reads the average width from the OS/2 table, so without one the metrics read throws.
    await Bun.write(path.join(cwdPath, "public/fonts/Gilda.ttf"), renameSfntTable(source, "OS/2", "XS/2"));

    const result = await optimize(app);

    expect(result.files).toHaveLength(1);
    expect(result.css).toContain('font-family: "Gilda"');
    expect(result.css).not.toContain('font-family: "Gilda fallback"');
  });
});

describe("FontOptimizer discovery", () => {
  test("reads the .fonts() stage of a rootLayout() chain", async () => {
    const { app, warnings } = await makeApp(chainLayoutWith(chainFontList()));

    const result = await optimize(app);

    expect(result.fonts.map((font) => font.name)).toEqual(["Assistant"]);
    expect(result.files).toHaveLength(1);
    expect(result.css).toContain("@font-face");
    expect(warnings).toEqual([]);
  });

  test("keeps reading the legacy fonts export", async () => {
    const { app } = await makeApp(layoutWith());
    const result = await optimize(app);
    expect(result.fonts.map((font) => font.name)).toEqual(["Assistant"]);
    expect(result.files).toHaveLength(1);
  });

  test("picks up a config field the chain declares, so the cache key sees it", async () => {
    const { app, cwdPath } = await makeApp(chainLayoutWith(chainFontList()));
    const first = await optimize(app);

    await writeFile(
      path.join(cwdPath, "page/_layout.tsx"),
      chainLayoutWith(chainFontList(`\n      className: "font-brand",`)),
    );

    const second = await optimize(app);
    expect(second.css).not.toBe(first.css);
    expect(second.css).toContain(".font-brand");
  });

  test("warns when the chain is handed a font list it cannot read", async () => {
    const { app, warnings } = await makeApp(chainLayoutWith("brandFonts"));

    const result = await optimize(app);

    expect(result.fonts).toEqual([]);
    expect(result.files).toEqual([]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain(path.join("page", "_layout.tsx"));
  });

  test("warns about an entry it cannot read and keeps the ones it can", async () => {
    const { app, warnings } = await makeApp(chainLayoutWith(`[...brandFonts, ${chainFontEntry()}]`));

    const result = await optimize(app);

    expect(result.fonts.map((font) => font.name)).toEqual(["Assistant"]);
    expect(warnings).toHaveLength(1);
  });
});
