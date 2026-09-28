import { afterAll, describe, expect, test } from "bun:test";
import fs from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { CSR_DEV_MANIFEST_FILE, type CsrDevManifest } from "akanjs/server/hmr/csrDevManifest";
import { isAkanRuntimeMetadataFile } from "akanjs/server/hmr/runtimeMetadataFile";
import type { App } from "../commandDecorators";
import { CsrDevArtifactWriter } from "./csrDevArtifactWriter";
import { CsrDevPatcher } from "./csrDevPatcher";
import { CsrDevPaths } from "./csrDevPaths";
import type { CsrDevContext, CsrDevGraph } from "./csrDevTypes";
import { DevRegistryBundler } from "./devRegistryBundler";

const dirs: string[] = [];
const context: CsrDevContext = {
  pageEntries: [],
  basePaths: [],
  htmlBasePaths: [],
  define: {},
  optimizeImports: [],
  configKey: "key",
  refreshFile: null,
};

//? Only what an update touches before it compiles anything: a registry with no modules has nothing to patch.
const makeRegistry = async (metadata: string | undefined) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "akan-csr-dev-patcher-"));
  dirs.push(dir);
  const writer = new CsrDevArtifactWriter(dir, { routePrefix: "/_akan/ssr-dev/" });
  const graph: CsrDevGraph = {
    version: 1,
    configKey: "key",
    refresh: "refresh.js",
    entries: {},
    modules: {},
    resolution: {},
    pending: [],
    ...(metadata ? { metadata } : {}),
  };
  const manifest: CsrDevManifest = { version: 1, generation: 4, appGeneration: 4, vendorFile: "v.js", entries: {} };
  await writer.writeState(graph, manifest);
  const stamp = { current: metadata ?? "" };
  const bundler = {
    context: async () => context,
    writer,
    paths: new CsrDevPaths(dir),
    reloadsOnEntryChange: false,
    isMetadataFile: isAkanRuntimeMetadataFile,
    metadataFingerprint: async () => stamp.current,
    writeEntries: async () => ({ files: {}, changed: [] }),
    entryIds: () => ({}),
  } as unknown as DevRegistryBundler;
  return { bundler, stamp, dir };
};

afterAll(async () => {
  await Promise.all(dirs.map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("CsrDevPatcher", () => {
  test("hands a registry read from disk back to a whole build once a signal save moved its metadata", async () => {
    const { bundler, stamp } = await makeRegistry("before");
    stamp.current = "after";
    const result = await new CsrDevPatcher(bundler).update([]);
    expect(result).toMatchObject({ kind: "delegate", generation: 5 });
    expect(result.kind === "delegate" ? result.reason : "").toContain("metadata");
  });

  test("patches a registry whose metadata still matches, and one built before the stamp existed is rebuilt", async () => {
    const matching = await makeRegistry("same");
    expect(await new CsrDevPatcher(matching.bundler).update([])).toEqual({ kind: "unchanged" });
    const unstamped = await makeRegistry(undefined);
    unstamped.stamp.current = "now";
    expect((await new CsrDevPatcher(unstamped.bundler).update([])).kind).toBe("delegate");
  });

  test("a resident patcher checks the stamp once, when it reads the registry", async () => {
    const { bundler, stamp } = await makeRegistry("same");
    const patcher = new CsrDevPatcher(bundler, { resident: true });
    expect(await patcher.update([])).toEqual({ kind: "unchanged" });
    stamp.current = "moved";
    expect(await patcher.update([])).toEqual({ kind: "unchanged" });
    patcher.forget();
    expect((await patcher.update([])).kind).toBe("delegate");
  });

  test("a saved metadata file goes to a whole build even when the stamp matches", async () => {
    const { bundler } = await makeRegistry("same");
    const result = await new CsrDevPatcher(bundler).update(["/repo/apps/demo/lib/user/user.signal.ts"]);
    expect(result).toMatchObject({ kind: "delegate", reason: "user.signal.ts changed" });
  });

  test("a whole build cut short between its writes goes to another whole build, not to a patch", async () => {
    const { bundler, dir } = await makeRegistry("same");
    await Bun.write(path.join(dir, ".building"), "123");
    expect(await new CsrDevPatcher(bundler, { resident: true }).update([])).toMatchObject({
      kind: "delegate",
      reason: "the last whole build was cut short",
      generation: 5,
    });
  });

  //? Compiled for real: a move resolves through what is on disk now, which a resident process's resolver cache is not.
  class MovedRegistry extends DevRegistryBundler {
    readonly reloadsOnEntryChange = false;
    readonly #entry: string;
    constructor(root: string, entry: string) {
      const app = {
        workspace: { workspaceRoot: root },
        cwdPath: path.join(root, "apps/demo"),
        verbose: () => undefined,
      };
      super(app as unknown as App, { dirName: "registry", routePrefix: "/_akan/registry/", library: true });
      this.#entry = entry;
    }
    async context() {
      return context;
    }
    async writeEntries() {
      return { files: { "": this.#entry }, changed: [] };
    }
    protected async rootFiles(entryFiles: string[]) {
      return entryFiles;
    }
    override async metadataFingerprint() {
      return "same";
    }
    wanted: Set<string> | null = null;
    override async wantedRoots(files: string[]) {
      return new Set(files.filter((file) => !this.wanted || this.wanted.has(file)));
    }
  }

  const movedRegistry = async (files: Record<string, string>) => {
    const root = await mkdtemp(path.join(os.tmpdir(), "akan-csr-dev-move-"));
    dirs.push(root);
    const file = (relative: string) => path.join(CsrDevPaths.realpath(root), "apps/demo", relative);
    for (const [relative, text] of Object.entries(files)) await Bun.write(file(relative), text);
    const bundler = new MovedRegistry(root, file("entry.ts"));
    expect(await bundler.update([])).toMatchObject({ generation: 1, reload: true, first: true });
    const patcher = new CsrDevPatcher(bundler, { resident: true });
    expect(await patcher.update([])).toEqual({ kind: "unchanged" });
    const app = async () => await Bun.file(path.join(bundler.outDir, "app.js")).text();
    const changedIds = (result: Awaited<ReturnType<CsrDevPatcher["update"]>>) =>
      result.kind === "update" ? result.update.changedIds.sort((a, b) => a.localeCompare(b)) : [];
    return { bundler, patcher, file, app, changedIds };
  };

  test("a dependency moved into a folder or renamed recompiles its importer, so app.js defines the new file", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "akan-csr-dev-move-"));
    dirs.push(root);
    const file = (relative: string) => path.join(root, "apps/demo", relative);
    await Bun.write(file("ui/Foo.tsx"), 'export const foo = () => "foo";\n');
    await Bun.write(file("ui/util.ts"), 'export const util = () => "util";\n');
    await Bun.write(
      file("ui/Page.tsx"),
      'import { foo } from "./Foo";\nimport { util } from "./util";\nexport const page = () => foo() + util();\n',
    );
    await Bun.write(file("entry.ts"), 'import { page } from "./ui/Page";\nexport const run = page;\n');
    const bundler = new MovedRegistry(root, file("entry.ts"));
    expect(await bundler.update([])).toMatchObject({ generation: 1, reload: true, first: true });
    const patcher = new CsrDevPatcher(bundler, { resident: true });
    expect(await patcher.update([])).toEqual({ kind: "unchanged" });

    await rm(file("ui/Foo.tsx"));
    await Bun.write(file("ui/Foo/index.tsx"), 'export const foo = () => "moved";\n');
    await rm(file("ui/util.ts"));
    await Bun.write(file("ui/util.tsx"), 'export const util = () => "renamed";\n');
    const moved = await patcher.update([
      file("ui/Foo.tsx"),
      file("ui/Foo/index.tsx"),
      file("ui/util.ts"),
      file("ui/util.tsx"),
    ]);

    expect(moved.kind).toBe("update");
    expect(moved.kind === "update" ? moved.update.changedIds.sort((a, b) => a.localeCompare(b)) : []).toEqual([
      "apps/demo/ui/Foo/index.tsx",
      "apps/demo/ui/Page.tsx",
      "apps/demo/ui/util.tsx",
    ]);
    const app = await Bun.file(path.join(bundler.outDir, "app.js")).text();
    expect(app).toContain('__akan.define("apps/demo/ui/Foo/index.tsx"');
    expect(app).toContain('__akan.define("apps/demo/ui/util.tsx"');
    expect(app).not.toContain('__akan.define("apps/demo/ui/Foo.tsx"');
    expect(app).not.toContain('__akan.define("apps/demo/ui/util.ts"');
  });

  test("a rename that changes only the case moves the module to its new id, and later saves leave it alone", async () => {
    const { patcher, file, app, changedIds } = await movedRegistry({
      "ui/card.tsx": 'export const card = () => "v1";\n',
      "ui/Page.tsx": 'import { card } from "./Card";\nexport const page = () => card();\n',
      "entry.ts": 'import { page } from "./ui/Page";\nexport const run = page;\n',
    });
    fs.renameSync(file("ui/card.tsx"), file("ui/Card.tsx"));
    await Bun.write(file("ui/Page.tsx"), 'import { card } from "./Card";\nexport const page = () => card() + "!";\n');
    const renamed = await patcher.update([file("ui/card.tsx"), file("ui/Card.tsx"), file("ui/Page.tsx")]);
    expect(changedIds(renamed)).toEqual(["apps/demo/ui/Card.tsx", "apps/demo/ui/Page.tsx"]);
    expect(await app()).toContain('__akan.define("apps/demo/ui/Card.tsx"');
    expect(await app()).not.toContain('__akan.define("apps/demo/ui/card.tsx"');
    expect(await patcher.update([])).toEqual({ kind: "unchanged" });
    await Bun.write(file("ui/Card.tsx"), 'export const card = () => "v2";\n');
    expect(changedIds(await patcher.update([file("ui/Card.tsx")]))).toEqual(["apps/demo/ui/Card.tsx"]);
    expect(await app()).toContain('"v2"');
  });

  test("a new root that fails to compile holds no later save, and leaves pending once no route reaches it", async () => {
    const { bundler, patcher, file, changedIds } = await movedRegistry({
      "ui/Card.tsx": 'export const card = () => "v1";\n',
      "ui/Broken.tsx": 'import { gone } from "./missingHelper";\nexport const broken = () => gone;\n',
      "entry.ts": 'import { card } from "./ui/Card";\nexport const run = card;\n',
    });
    await expect(patcher.update([], { roots: [file("ui/Broken.tsx")], onlyRoots: true })).rejects.toThrow();

    await Bun.write(file("ui/Card.tsx"), 'export const card = () => "v2";\n');
    const announced: string[][] = [];
    await expect(
      patcher.update([file("ui/Card.tsx")], { announce: (update) => announced.push(update.changedIds) }),
    ).rejects.toThrow();
    expect(announced).toEqual([["apps/demo/ui/Card.tsx"]]);

    bundler.wanted = new Set();
    await Bun.write(file("ui/Card.tsx"), 'export const card = () => "v3";\n');
    expect(changedIds(await patcher.update([file("ui/Card.tsx")]))).toEqual(["apps/demo/ui/Card.tsx"]);
    const graph = (await bundler.writer.readJson<CsrDevGraph>("graph.json")) as CsrDevGraph;
    expect(graph.pending).toEqual([]);
  });

  test("a module whose factory file is missing is compiled again instead of failing every read", async () => {
    const { bundler, patcher, app, changedIds } = await movedRegistry({
      "ui/Page.tsx": 'export const page = () => "page";\n',
      "entry.ts": 'import { page } from "./ui/Page";\nexport const run = page;\n',
    });
    const manifest = (await bundler.writer.readJson<CsrDevManifest>(CSR_DEV_MANIFEST_FILE)) as CsrDevManifest;
    await bundler.writer.writeJson(CSR_DEV_MANIFEST_FILE, { ...manifest, generation: 2, appGeneration: 1 });
    await rm(path.join(bundler.outDir, "modules"), { recursive: true, force: true });
    patcher.forget();
    const healed = await patcher.update([]);
    expect(changedIds(healed)).toEqual(["apps/demo/entry.ts", "apps/demo/ui/Page.tsx"]);
    expect(await app()).toContain('__akan.define("apps/demo/ui/Page.tsx"');
  });

  test("a file created beside a folder a relative import resolved to takes that import over", async () => {
    const { patcher, file, app, changedIds } = await movedRegistry({
      "ui/Foo/index.tsx": 'export const foo = () => "folder";\n',
      "ui/Page.tsx": 'import { foo } from "./Foo";\nexport const page = () => foo();\n',
      "entry.ts": 'import { page } from "./ui/Page";\nexport const run = page;\n',
    });
    await Bun.write(file("ui/Foo.tsx"), 'export const foo = () => "file";\n');
    expect(changedIds(await patcher.update([file("ui/Foo.tsx")]))).toEqual([
      "apps/demo/ui/Foo.tsx",
      "apps/demo/ui/Page.tsx",
    ]);
    expect(await app()).toContain('__akan.define("apps/demo/ui/Foo.tsx"');
  });

  test("a registry with no manifest is a first build, which no tab holds a module of", async () => {
    const { bundler, dir } = await makeRegistry("same");
    await rm(path.join(dir, CSR_DEV_MANIFEST_FILE), { force: true });
    expect(await new CsrDevPatcher(bundler).update([])).toMatchObject({
      kind: "delegate",
      reason: "first build",
      generation: 1,
      first: true,
    });
  });
});
