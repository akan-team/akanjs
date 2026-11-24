import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import { realpath } from "node:fs/promises";
import path from "node:path";
import { tempDirs, writeText } from "../test/testHelpers";
import { ClientEntriesBundler } from "./clientEntriesBundler";

const makeTempRoot = tempDirs("akan-client-entries-");
//? Bun's metafile names real paths, and macOS's temp dir sits behind the /var symlink.
const realTempRoot = async () => fs.realpathSync(await makeTempRoot());

const vendorApp = async () => {
  const root = await realTempRoot();
  const appDir = path.join(root, "apps/demo");
  const vendor = path.join(root, "vendor/facet.ts");
  await writeText(path.join(root, "vendor/lib.ts"), "export const real = 1;\nexport const other = 2;\n");
  await writeText(vendor, 'export * from "./lib";\n');
  const app = {
    name: "demo",
    cwdPath: appDir,
    dist: { cwdPath: path.join(root, "dist/apps/demo") },
    workspace: { workspaceRoot: root },
    getConfig: async () => ({ optimizeImports: [] }),
    getPublicEnv: () => ({}),
  } as never;
  const bundle = (command: "build" | "start", entryExports?: Record<string, string[]>) =>
    new ClientEntriesBundler({ app, entries: [vendor], command, entryExports }).bundle();
  return { appDir, vendor, bundle };
};

describe("ClientEntriesBundler narrowed entries", () => {
  test("fails the build, naming each name a route imports that its vendor does not export", async () => {
    const { vendor, bundle } = await vendorApp();

    await expect(bundle("build", { [vendor]: ["real", "notThere"] })).rejects.toThrow("facet.ts: notThere");
    await expect(bundle("build", { [vendor]: ["real"] })).resolves.toBeDefined();
  }, 30_000);

  test("writes a narrowed alias apart from the whole one `akan start` keeps for the same entry", async () => {
    const { appDir, vendor, bundle } = await vendorApp();
    await bundle("start");
    await bundle("build", { [vendor]: ["real"] });

    const aliasDir = path.join(appDir, ".akan/generated/client-entry-alias/client");
    const aliases = await Promise.all(
      [...new Bun.Glob("*.tsx").scanSync(aliasDir)].map((file) => Bun.file(path.join(aliasDir, file)).text()),
    );

    expect(aliases).toHaveLength(2);
    expect(aliases).toContain(ClientEntriesBundler.narrowedAliasSource(vendor, ["real"]));
  }, 30_000);
});

describe("ClientEntriesBundler", () => {
  test("takes a package's production build in a build and its default one under start", async () => {
    const root = await realpath(await makeTempRoot());
    await writeText(
      path.join(root, "node_modules/twobuild/package.json"),
      '{ "name": "twobuild", "exports": { ".": { "production": "./prod.js", "default": "./switch.js" } } }\n',
    );
    await writeText(path.join(root, "node_modules/twobuild/prod.js"), 'export const mark = "prod-build";\n');
    await writeText(path.join(root, "node_modules/twobuild/switch.js"), 'export const mark = "switch-build";\n');
    const entry = path.join(root, "Mark.tsx");
    await writeText(entry, '"use client";\nimport { mark } from "twobuild";\nexport const Mark = () => mark;\n');
    const app = {
      name: "probe",
      cwdPath: path.join(root, "app"),
      dist: { cwdPath: path.join(root, "dist") },
      workspace: { workspaceRoot: root },
      getConfig: async () => ({ optimizeImports: [] }),
      getPublicEnv: () => ({}),
    };
    const bundle = async (command: "build" | "start") => {
      const result = await new ClientEntriesBundler({ app: app as never, entries: [entry], command }).bundle();
      const output = result.entryOutputAbsByAbsPath.get(entry);
      return output ? await Bun.file(output).text() : "";
    };

    expect(await bundle("build")).toContain("prod-build");
    expect(await bundle("start")).toContain("switch-build");
  });
});

describe("ClientEntriesBundler worker chunks", () => {
  const drawApp = async () => {
    const root = await realpath(await makeTempRoot());
    const lib = (file: string, source: string) => writeText(path.join(root, "node_modules/drawlib", file), source);
    await lib("package.json", '{ "name": "drawlib", "type": "module", "exports": "./index.js" }\n');
    await lib("shared.js", "export const scale = (value) => value * 2;\n");
    await lib(
      "index.js",
      [
        'import { useState } from "react";',
        'import { scale } from "./shared.js";',
        "const ratio = window.devicePixelRatio;",
        "export const useRatio = () => useState(scale(ratio));",
        'export const loadWorker = () => import("./worker.js");',
        'export const loadLazy = () => import("./lazy.js");',
        "",
      ].join("\n"),
    );
    await lib(
      "worker.js",
      [
        'import { scale } from "./shared.js";',
        "export const WorkerUrl = new URL(import.meta.url);",
        'if (typeof window === "undefined") self.onmessage = (event) => self.postMessage(scale(event.data));',
        "",
      ].join("\n"),
    );
    await lib(
      "lazy.js",
      'import { scale } from "./shared.js";\nexport const own = new URL(import.meta.url);\nexport const big = scale(4);\n',
    );
    const entry = path.join(root, "Draw.tsx");
    await writeText(
      entry,
      '"use client";\nimport { loadLazy, loadWorker, useRatio } from "drawlib";\nexport const Draw = () => [useRatio, loadLazy, loadWorker];\n',
    );
    const app = {
      name: "probe",
      cwdPath: path.join(root, "app"),
      dist: { cwdPath: path.join(root, "dist") },
      workspace: { workspaceRoot: root },
      getConfig: async () => ({ optimizeImports: [] }),
      getPublicEnv: () => ({}),
    };
    const result = await new ClientEntriesBundler({
      app: app as never,
      entries: [entry],
      command: "build",
      external: ["react"],
    }).bundle();
    const outdir = path.join(root, "dist/.akan/artifact/client");
    const chunks = await Promise.all(
      [...new Bun.Glob("chunks/*.js").scanSync(outdir)].map(async (file) => ({
        file: path.join(outdir, file),
        text: await Bun.file(path.join(outdir, file)).text(),
      })),
    );
    return { result, chunks };
  };
  const staticImportsOf = (text: string) =>
    [...text.matchAll(/(?:\bfrom|\bimport)\s*["']([^"']+)["']/g)].map((m) => m[1]);

  test("rebuilds a module that hands its own URL to a worker into its chunk alone, so a worker can load it", async () => {
    const { result, chunks } = await drawApp();
    const worker = chunks.find((chunk) => chunk.text.includes("onmessage"));
    expect(worker && staticImportsOf(worker.text)).toEqual([]);
    expect(result.graph.importsByChunk.get(worker?.file ?? "")).toEqual([]);
    const loaded = (await import(worker?.file ?? "")) as { WorkerUrl: URL };
    expect(loaded.WorkerUrl.href).toEndWith(path.basename(worker?.file ?? ""));
    expect(typeof (globalThis as { onmessage?: unknown }).onmessage).toBe("function");
  }, 30_000);

  test("leaves a lazy chunk that only reads its own URL sharing what the page loaded", async () => {
    const { chunks } = await drawApp();
    const lazy = chunks.find((chunk) => chunk.text.includes("own"));
    expect(lazy && staticImportsOf(lazy.text).length).toBeGreaterThan(0);
  }, 30_000);
});
