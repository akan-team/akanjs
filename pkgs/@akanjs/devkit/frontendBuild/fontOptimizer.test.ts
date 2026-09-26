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
  const warnings: string[] = [];
  const app = {
    cwdPath,
    dist: { cwdPath: path.join(root, "dist/apps/demo") },
    workspace: { workspaceRoot: root },
    getPageKeys: async () => ["./_layout.tsx"],
    verbose: () => undefined,
    logger: { warn: (message: string) => warnings.push(message) },
  } as unknown as App;
  return { app, cwdPath, warnings };
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

  // A list the build cannot read subsets nothing while the runtime still preloads /_akan/fonts, so the 404s
  // have to be announced at build time rather than found in a browser console.
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
