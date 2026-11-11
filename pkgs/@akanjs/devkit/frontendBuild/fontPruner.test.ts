import { describe, expect, test } from "bun:test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { App } from "../commandDecorators";
import { tempDirs } from "../test/testHelpers";
import { FontPruner } from "./fontPruner";

const tempRoot = tempDirs("akan-devkit-font-prune-");

interface Tree {
  layout?: string;
  publicFiles?: Record<string, string>;
  artifactFiles?: Record<string, string>;
  csrFiles?: Record<string, string>;
}

const write = async (root: string, files: Record<string, string>) => {
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(root, rel);
    await mkdir(path.dirname(abs), { recursive: true });
    await writeFile(abs, content);
  }
};

const makeApp = async ({ layout = layoutWith(), publicFiles = {}, artifactFiles = {}, csrFiles = {} }: Tree = {}) => {
  const root = await tempRoot();
  const cwdPath = path.join(root, "apps/demo");
  const distPath = path.join(root, "dist/apps/demo");
  await mkdir(path.join(cwdPath, "page"), { recursive: true });
  await writeFile(path.join(cwdPath, "page/_layout.tsx"), layout);
  await write(path.join(distPath, "public"), publicFiles);
  await write(path.join(distPath, ".akan/artifact"), artifactFiles);
  await write(path.join(distPath, "csr"), csrFiles);
  const app = {
    cwdPath,
    dist: { cwdPath: distPath },
    workspace: { workspaceRoot: root },
    getPageKeys: async () => ["./_layout.tsx"],
    getPageRoots: async () => [],
    verbose: () => undefined,
    logger: { info: () => undefined, warn: () => undefined },
  } as unknown as App;
  return { app, distPath };
};

const layoutWith = (extra = "") => `
export const fonts = [
  {
    name: "pretendard",${extra}
    paths: [{ src: "/libs/shared/fonts/Pretendard-Bold.woff2", weight: 700 }],
  },
];
export default function Layout() {
  return null;
}
`;

const exists = (distPath: string, rel: string) => Bun.file(path.join(distPath, "public", rel)).exists();

describe("FontPruner", () => {
  test("drops a subset font's source and reports the bytes freed", async () => {
    const { app, distPath } = await makeApp({
      publicFiles: { "libs/shared/fonts/Pretendard-Bold.woff2": "x".repeat(2048) },
    });

    const result = await new FontPruner(app).prune();

    expect(result.removed.map(({ file }) => file)).toEqual(["libs/shared/fonts/Pretendard-Bold.woff2"]);
    expect(result.freedBytes).toBe(2048);
    expect(await exists(distPath, "libs/shared/fonts/Pretendard-Bold.woff2")).toBe(false);
  });

  test("drops a font no declaration and no surface mentions", async () => {
    const { app, distPath } = await makeApp({
      publicFiles: { "libs/shared/fonts/NotoSansKR.ttf": "x" },
    });

    const result = await new FontPruner(app).prune();

    expect(result.removed.map(({ file }) => file)).toEqual(["libs/shared/fonts/NotoSansKR.ttf"]);
    expect(await exists(distPath, "libs/shared/fonts/NotoSansKR.ttf")).toBe(false);
  });

  test("keeps a font a stylesheet in public loads by url", async () => {
    const { app, distPath } = await makeApp({
      publicFiles: {
        "libs/shared/fonts/Assistant-Bold.woff2": "x",
        "libs/shared/excalidraw.css": '@font-face{src:url("/libs/shared/fonts/Assistant-Bold.woff2")}',
      },
    });

    const result = await new FontPruner(app).prune();

    expect(result.removed).toEqual([]);
    expect(result.kept).toEqual([
      {
        file: "libs/shared/fonts/Assistant-Bold.woff2",
        bytes: 1,
        reason: { kind: "referenced", referrer: "public/libs/shared/excalidraw.css" },
      },
    ]);
    expect(await exists(distPath, "libs/shared/fonts/Assistant-Bold.woff2")).toBe(true);
  });

  test("keeps a font whose filename a referrer percent-encodes", async () => {
    const { app } = await makeApp({
      publicFiles: {
        "fonts/Lemon Milk Pro Medium.otf": "x",
        "brand.css": "@font-face{src:url(/fonts/Lemon%20Milk%20Pro%20Medium.otf)}",
      },
    });

    const result = await new FontPruner(app).prune();

    expect(result.removed).toEqual([]);
    expect(result.kept[0]?.reason).toEqual({ kind: "referenced", referrer: "public/brand.css" });
  });

  test("keeps the source of a font declared with optimize: false", async () => {
    const { app, distPath } = await makeApp({
      layout: layoutWith("\n    optimize: false,"),
      publicFiles: { "libs/shared/fonts/Pretendard-Bold.woff2": "x" },
    });

    const result = await new FontPruner(app).prune();

    expect(result.removed).toEqual([]);
    expect(result.kept[0]?.reason).toEqual({ kind: "unoptimized" });
    expect(await exists(distPath, "libs/shared/fonts/Pretendard-Bold.woff2")).toBe(true);
  });

  test("keeps a font matched by an assets.keepFonts glob", async () => {
    const { app, distPath } = await makeApp({
      publicFiles: { "libs/shared/fonts/Assistant-Bold.woff2": "x" },
    });

    const result = await new FontPruner(app, { keepFonts: ["libs/shared/fonts/Assistant-*.woff2"] }).prune();

    expect(result.removed).toEqual([]);
    expect(result.kept[0]?.reason).toEqual({ kind: "declared", glob: "libs/shared/fonts/Assistant-*.woff2" });
    expect(await exists(distPath, "libs/shared/fonts/Assistant-Bold.woff2")).toBe(true);
  });

  test("ignores the declaration the build inlines into its own bundles", async () => {
    const { app } = await makeApp({
      artifactFiles: {
        "server/pages-abc.js": 'const fonts=[{paths:[{src:"/libs/shared/fonts/Pretendard-Bold.woff2"}]}]',
      },
      csrFiles: { "index.html": '<script>src:"/libs/shared/fonts/Pretendard-Bold.woff2"</script>' },
      publicFiles: { "libs/shared/fonts/Pretendard-Bold.woff2": "x" },
    });

    const result = await new FontPruner(app).prune();

    expect(result.removed.map(({ file }) => file)).toEqual(["libs/shared/fonts/Pretendard-Bold.woff2"]);
  });

  test("keeps a font a bundle loads that no declaration names", async () => {
    const { app } = await makeApp({
      artifactFiles: { "client/chunk-abc.js": 'new FontFace("x","url(/fonts/Runtime-Regular.woff2)")' },
      publicFiles: { "fonts/Runtime-Regular.woff2": "x" },
    });

    const result = await new FontPruner(app).prune();

    expect(result.removed).toEqual([]);
    expect(result.kept[0]?.reason).toEqual({ kind: "referenced", referrer: ".akan/artifact/client/chunk-abc.js" });
  });

  test("keeps a font the compiled stylesheet still points at", async () => {
    const { app } = await makeApp({
      artifactFiles: { "styles/root-abc.css": "@font-face{src:url(/libs/shared/fonts/Pretendard-Bold.woff2)}" },
      publicFiles: { "libs/shared/fonts/Pretendard-Bold.woff2": "x" },
    });

    const result = await new FontPruner(app).prune();

    expect(result.removed).toEqual([]);
    expect(result.kept[0]?.reason).toEqual({
      kind: "referenced",
      referrer: ".akan/artifact/styles/root-abc.css",
    });
  });

  test("leaves non-font assets alone", async () => {
    const { app, distPath } = await makeApp({
      publicFiles: { "logo.png": "x", "video.mp4": "x", "libs/shared/fonts/NotoSansKR.ttf": "x" },
    });

    await new FontPruner(app).prune();

    expect(await exists(distPath, "logo.png")).toBe(true);
    expect(await exists(distPath, "video.mp4")).toBe(true);
    expect(await exists(distPath, "libs/shared/fonts/NotoSansKR.ttf")).toBe(false);
  });

  test("does nothing when the build shipped no public directory", async () => {
    const { app } = await makeApp();
    await rm(path.join(app.dist.cwdPath, "public"), { recursive: true, force: true });

    const result = await new FontPruner(app).prune();

    expect(result).toEqual({ removed: [], kept: [], freedBytes: 0 });
  });

  test("removes a directory the prune emptied", async () => {
    const { app, distPath } = await makeApp({
      publicFiles: { "libs/shared/fonts/NotoSansKR.ttf": "x" },
    });

    await new FontPruner(app).prune();

    expect(await Bun.file(path.join(distPath, "public/libs/shared/fonts")).exists()).toBe(false);
  });
});
