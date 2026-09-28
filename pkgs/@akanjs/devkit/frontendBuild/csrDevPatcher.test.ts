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
//? A rename that changes only the case is one only where the disk folds case (APFS, NTFS); ext4 keeps both names.
const foldsCase = (() => {
  const probe = fs.mkdtempSync(path.join(os.tmpdir(), "akan-case-"));
  try {
    return fs.existsSync(path.join(path.dirname(probe), path.basename(probe).toUpperCase()));
  } finally {
    fs.rmSync(probe, { recursive: true, force: true });
  }
})();
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
    //? Roots beside the entries, as the SSR registry takes every client entry a route reaches.
    extraRoots: string[] = [];
    protected async rootFiles(entryFiles: string[]) {
      return [...entryFiles, ...this.extraRoots];
    }
    override async metadataFingerprint() {
      return "same";
    }
    wanted: Set<string> | null = null;
    override async wantedRoots(files: string[], graph: CsrDevGraph) {
      if (!this.wanted) return await super.wantedRoots(files, graph);
      const wanted = this.wanted;
      return new Set(files.filter((file) => wanted.has(file)));
    }
  }

  const movedRegistry = async (files: Record<string, string>, { roots = [] }: { roots?: string[] } = {}) => {
    const root = await mkdtemp(path.join(os.tmpdir(), "akan-csr-dev-move-"));
    dirs.push(root);
    const file = (relative: string) => path.join(CsrDevPaths.realpath(root), "apps/demo", relative);
    for (const [relative, text] of Object.entries(files)) await Bun.write(file(relative), text);
    const bundler = new MovedRegistry(root, file("entry.ts"));
    bundler.extraRoots = roots.map((relative) => file(relative));
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

  test.skipIf(!foldsCase)(
    "a rename that changes only the case moves the module to its new id, and later saves leave it alone",
    async () => {
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
    },
  );

  test("a new root that fails to compile holds no later save, and leaves pending once no route reaches it", async () => {
    const { bundler, patcher, file, changedIds } = await movedRegistry({
      "ui/Card.tsx": 'export const card = () => "v1";\n',
      "ui/Broken.tsx": 'import { gone } from "./missingHelper";\nexport const broken = () => gone;\n',
      "entry.ts": 'import { card } from "./ui/Card";\nexport const run = card;\n',
    });
    //? Named by a route, as a route build's check names the entries it asks for.
    bundler.wanted = new Set([file("ui/Broken.tsx")]);
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

  test("a pending root whose fix needs a whole-app build goes to a worker with it, still pending", async () => {
    //? Written before the first build: Bun's resolver keeps a directory's listing, so a node_modules made later is missed.
    const { bundler, patcher, file } = await movedRegistry({
      "ui/Card.tsx": 'export const card = () => "v1";\n',
      "ui/Broken.tsx": 'import { gone } from "./missingHelper";\nexport const broken = () => gone;\n',
      "entry.ts": 'import { card } from "./ui/Card";\nexport const run = card;\n',
      "../../node_modules/fake-pkg/package.json": '{"name":"fake-pkg","main":"index.js"}',
      "../../node_modules/fake-pkg/index.js": "export const gone = 1;\n",
    });
    bundler.wanted = new Set([file("ui/Broken.tsx")]);
    await expect(patcher.update([], { roots: [file("ui/Broken.tsx")], onlyRoots: true })).rejects.toThrow();
    await Bun.write(file("ui/Broken.tsx"), 'import { gone } from "fake-pkg";\nexport const broken = () => gone;\n');
    await Bun.write(file("ui/Card.tsx"), 'export const card = () => "v2";\n');
    const result = await patcher.update([file("ui/Card.tsx"), file("ui/Broken.tsx")]);
    expect(result.kind).toBe("delegate");
    const graph = (await bundler.writer.readJson<CsrDevGraph>("graph.json")) as CsrDevGraph;
    expect(graph.pending).toContain("apps/demo/ui/Broken.tsx");
  });

  test("a broken file no module imports any more stops failing saves, even brought back after its importer moved on", async () => {
    const { patcher, file, changedIds } = await movedRegistry({
      "ui/X.tsx": "export const x = 1;\n",
      "ui/Card.tsx": 'export const card = () => "v1";\n',
      "ui/Page.tsx":
        'import { x } from "./X";\nimport { card } from "./Card";\nexport const page = () => x + card();\n',
      "entry.ts": 'import { page } from "./ui/Page";\nexport const run = page;\n',
    });
    await rm(file("ui/X.tsx"));
    await expect(patcher.update([file("ui/X.tsx")])).rejects.toThrow();
    await Bun.write(file("ui/X.tsx"), "export const x = ;\n");
    await expect(patcher.update([file("ui/X.tsx")])).rejects.toThrow();

    await Bun.write(file("ui/Page.tsx"), 'import { card } from "./Card";\nexport const page = () => card();\n');
    const announced: string[][] = [];
    await patcher
      .update([file("ui/Page.tsx")], { announce: (update) => announced.push(update.changedIds) })
      .catch(() => undefined);
    expect(announced[0]).toContain("apps/demo/ui/Page.tsx");

    await Bun.write(file("ui/Card.tsx"), 'export const card = () => "v2";\n');
    expect(changedIds(await patcher.update([file("ui/Card.tsx")]))).toEqual(["apps/demo/ui/Card.tsx"]);
  });

  test("a broken module in the graph whose last importer drops it leaves the graph instead of failing every save", async () => {
    const { bundler, patcher, file, changedIds } = await movedRegistry({
      "ui/X.tsx": "export const x = 1;\n",
      "ui/C.tsx": 'export const C = () => "c1";\n',
      "ui/I.tsx": 'import { x } from "./X";\nexport const I = () => x;\n',
      "entry.ts": 'import { C } from "./ui/C";\nimport { I } from "./ui/I";\nexport const run = [C, I];\n',
    });
    await Bun.write(file("ui/X.tsx"), "export const x = ;\n");
    await expect(patcher.update([file("ui/X.tsx")])).rejects.toThrow();
    await Bun.write(file("ui/I.tsx"), 'import { x } from "./X";\nexport const I = () => x + 1;\n');
    await expect(patcher.update([file("ui/I.tsx")])).rejects.toThrow();

    await Bun.write(file("ui/I.tsx"), "export const I = () => 0;\n");
    expect(changedIds(await patcher.update([file("ui/I.tsx")]))).toEqual(["apps/demo/ui/I.tsx"]);
    expect(((await bundler.writer.readJson<CsrDevGraph>("graph.json")) as CsrDevGraph).pending).toEqual([]);
    await Bun.write(file("ui/C.tsx"), 'export const C = () => "c2";\n');
    expect(changedIds(await patcher.update([file("ui/C.tsx")]))).toEqual(["apps/demo/ui/C.tsx"]);
    const graph = (await bundler.writer.readJson<CsrDevGraph>("graph.json")) as CsrDevGraph;
    expect(graph.modules["apps/demo/ui/X.tsx"]).toBeUndefined();
    expect(graph.pending).toEqual([]);
  });

  test("a broken module left behind by a detached importer, or in a cycle, leaves with everything unreachable", async () => {
    for (const shape of ["detached", "cycle"] as const) {
      const { bundler, patcher, file, changedIds } = await movedRegistry({
        "ui/X.tsx":
          shape === "cycle" ? 'import { y } from "./Y";\nexport const x = () => y;\n' : "export const x = 1;\n",
        "ui/Y.tsx": 'import { x } from "./X";\nexport const y = () => x;\n',
        "ui/C.tsx": 'export const C = () => "c1";\n',
        "ui/I.tsx": 'import { y } from "./Y";\nexport const I = () => y;\n',
        "entry.ts": 'import { C } from "./ui/C";\nimport { I } from "./ui/I";\nexport const run = [C, I];\n',
      });
      await Bun.write(file("ui/X.tsx"), "export const x = ;\n");
      await expect(patcher.update([file("ui/X.tsx")])).rejects.toThrow();
      await Bun.write(file("ui/I.tsx"), "export const I = () => 0;\n");
      expect(changedIds(await patcher.update([file("ui/I.tsx")]))).toEqual(["apps/demo/ui/I.tsx"]);
      await Bun.write(file("ui/C.tsx"), 'export const C = () => "c2";\n');
      expect(changedIds(await patcher.update([file("ui/C.tsx")]))).toEqual(["apps/demo/ui/C.tsx"]);
      const graph = (await bundler.writer.readJson<CsrDevGraph>("graph.json")) as CsrDevGraph;
      expect(Object.keys(graph.modules).sort()).toEqual([
        "apps/demo/entry.ts",
        "apps/demo/ui/C.tsx",
        "apps/demo/ui/I.tsx",
      ]);
    }
  });

  test("a broken client entry no page names any more leaves the registry, though its last importer was a server file", async () => {
    const { bundler, patcher, file, changedIds } = await movedRegistry(
      {
        "ui/X.tsx": 'export const X = () => "x";\n',
        "ui/Y.tsx": 'export const Y = () => "y1";\n',
        "entry.ts": "export {};\n",
      },
      { roots: ["ui/X.tsx", "ui/Y.tsx"] },
    );
    await Bun.write(file("ui/X.tsx"), "export const X = () => ;\n");
    await expect(patcher.update([file("ui/X.tsx")])).rejects.toThrow();
    bundler.extraRoots = [file("ui/Y.tsx")];
    await Bun.write(file("page/P.tsx"), "export default () => null;\n");
    expect(await patcher.update([file("page/P.tsx")])).toEqual({ kind: "unchanged" });
    const graph = (await bundler.writer.readJson<CsrDevGraph>("graph.json")) as CsrDevGraph;
    expect(graph.modules["apps/demo/ui/X.tsx"]).toBeUndefined();
    expect(graph.pending).toEqual([]);
    await Bun.write(file("ui/Y.tsx"), 'export const Y = () => "y2";\n');
    expect(changedIds(await patcher.update([file("ui/Y.tsx")]))).toEqual(["apps/demo/ui/Y.tsx"]);
  });

  test("a require.resolve call weighs extensions as a require does", async () => {
    const { bundler } = await movedRegistry({
      "ui/pair/x.mjs": "export const x = 1;\n",
      "ui/pair/x.js": "exports.x = 2;\n",
      "ui/R.ts": 'export const where = require.resolve("./pair/x");\n',
      "entry.ts": 'import { where } from "./ui/R";\nexport const run = where;\n',
    });
    const graph = (await bundler.writer.readJson<CsrDevGraph>("graph.json")) as CsrDevGraph;
    expect(graph.resolution["apps/demo/ui/R.ts"]?.["./pair/x"]).toBe("apps/demo/ui/pair/x.js");
  });

  test("two routes' checks that both fail keep both roots pending", async () => {
    const { bundler, patcher, file } = await movedRegistry({
      "ui/Card.tsx": 'export const card = () => "v1";\n',
      "ui/E1.tsx": 'import { gone } from "./missing1";\nexport const e1 = () => gone;\n',
      "ui/E4.tsx": 'import { gone } from "./missing4";\nexport const e4 = () => gone;\n',
      "entry.ts": 'import { card } from "./ui/Card";\nexport const run = card;\n',
    });
    bundler.wanted = new Set([file("ui/E1.tsx"), file("ui/E4.tsx")]);
    await expect(patcher.update([], { roots: [file("ui/E1.tsx")], onlyRoots: true })).rejects.toThrow();
    await expect(patcher.update([], { roots: [file("ui/E4.tsx")], onlyRoots: true })).rejects.toThrow();
    const graph = (await bundler.writer.readJson<CsrDevGraph>("graph.json")) as CsrDevGraph;
    expect(graph.pending.sort()).toEqual(["apps/demo/ui/E1.tsx", "apps/demo/ui/E4.tsx"]);
  });

  test("a route's check that adds its own root leaves another route's failed root pending", async () => {
    const { bundler, patcher, file, changedIds } = await movedRegistry({
      "ui/Card.tsx": 'export const card = () => "v1";\n',
      "ui/E1.tsx": 'import { gone } from "./missingHelper";\nexport const e1 = () => gone;\n',
      "ui/E3.tsx": "export const e3 = 3;\n",
      "entry.ts": 'import { card } from "./ui/Card";\nexport const run = card;\n',
    });
    bundler.wanted = new Set([file("ui/E1.tsx"), file("ui/E3.tsx")]);
    await expect(patcher.update([], { roots: [file("ui/E1.tsx")], onlyRoots: true })).rejects.toThrow();
    await patcher.update([], { roots: [file("ui/E3.tsx")], onlyRoots: true });
    const graph = (await bundler.writer.readJson<CsrDevGraph>("graph.json")) as CsrDevGraph;
    expect(graph.pending).toEqual(["apps/demo/ui/E1.tsx"]);

    await Bun.write(file("ui/E1.tsx"), "export const e1 = () => 1;\n");
    expect(changedIds(await patcher.update([file("ui/E1.tsx")]))).toEqual(["apps/demo/ui/E1.tsx"]);
  });

  test("a pending root a worker failed on waits for an edit of its own or of a file its failure named", async () => {
    const { bundler, patcher, file, changedIds } = await movedRegistry({
      "ui/Card.tsx": 'export const card = () => "v1";\n',
      "ui/Other.tsx": 'export const other = () => "o1";\n',
      "ui/Broken.tsx": 'import { gone } from "./missingHelper";\nexport const broken = () => gone;\n',
      "entry.ts":
        'import { card } from "./ui/Card";\nimport { other } from "./ui/Other";\nexport const run = [card, other];\n',
      "../../node_modules/fake-pkg/package.json": '{"name":"fake-pkg","main":"index.js"}',
      "../../node_modules/fake-pkg/index.js": "export const gone = 1;\n",
    });
    bundler.wanted = new Set([file("ui/Broken.tsx")]);
    await expect(patcher.update([], { roots: [file("ui/Broken.tsx")], onlyRoots: true })).rejects.toThrow();
    const broken =
      'import { gone } from "fake-pkg";\nimport { nope } from "./Card";\nexport const broken = () => gone + nope;\n';
    await Bun.write(file("ui/Broken.tsx"), broken);
    expect((await patcher.update([file("ui/Broken.tsx")])).kind).toBe("delegate");
    //? The worker the builder runs next fails in Broken, naming Card: the resident patcher reads the graph it wrote.
    await expect(bundler.update([file("ui/Broken.tsx")])).rejects.toThrow();
    patcher.forget();

    await Bun.write(file("ui/Other.tsx"), 'export const other = () => "o2";\n');
    expect(changedIds(await patcher.update([file("ui/Other.tsx")]))).toEqual(["apps/demo/ui/Other.tsx"]);
    expect(await patcher.update([], { roots: [file("ui/Broken.tsx")], onlyRoots: true })).toEqual({
      kind: "unchanged",
    });

    await Bun.write(file("ui/Card.tsx"), 'export const card = () => "v2";\nexport const nope = 1;\n');
    expect((await patcher.update([file("ui/Card.tsx")])).kind).toBe("delegate");
    //? Its worker has not run yet: a route's check waits for it rather than handing the root over again.
    expect(await patcher.update([], { roots: [file("ui/Broken.tsx")], onlyRoots: true })).toEqual({
      kind: "unchanged",
    });
  });

  test("a root handed to a worker that died before writing its failure is handed over again", async () => {
    const { bundler, patcher, file } = await movedRegistry({
      "ui/Card.tsx": 'export const card = () => "v1";\n',
      "entry.ts": 'import { card } from "./ui/Card";\nexport const run = card;\n',
      "../../node_modules/fake-pkg/package.json": '{"name":"fake-pkg","main":"index.js"}',
      "../../node_modules/fake-pkg/index.js": "export const gone = 1;\n",
    });
    await Bun.write(file("ui/B.tsx"), 'import { gone } from "fake-pkg";\nexport const b = () => gone;\n');
    bundler.wanted = new Set([file("ui/B.tsx")]);
    const check = async () => await patcher.update([], { roots: [file("ui/B.tsx")], onlyRoots: true });
    expect((await check()).kind).toBe("delegate");
    expect(await check()).toEqual({ kind: "unchanged" });
    //? What the builder does when that worker is killed (an OOM) before it writes anything.
    patcher.releaseHandedOver();
    patcher.forget();
    expect((await check()).kind).toBe("delegate");
  });

  test("a pending root a worker failed on because of another file is tried again once that file is fixed", async () => {
    const { bundler, patcher, file } = await movedRegistry({
      "ui/Card.tsx": 'export const card = () => "v1";\n',
      "ui/C.tsx": 'export const c = () => "c1";\n',
      "entry.ts": 'import { card } from "./ui/Card";\nimport { c } from "./ui/C";\nexport const run = [card, c];\n',
      "../../node_modules/fake-pkg/package.json": '{"name":"fake-pkg","main":"index.js"}',
      "../../node_modules/fake-pkg/index.js": "export const gone = 1;\n",
    });
    await Bun.write(file("ui/B.tsx"), 'import { gone } from "fake-pkg";\nexport const b = () => gone;\n');
    bundler.wanted = new Set([file("ui/B.tsx")]);
    await Bun.write(file("ui/C.tsx"), "export const c = () => ;\n");
    await expect(patcher.update([file("ui/C.tsx")])).rejects.toThrow();
    expect((await patcher.update([], { roots: [file("ui/B.tsx")], onlyRoots: true })).kind).toBe("delegate");
    await expect(bundler.update([], { roots: [file("ui/B.tsx")] })).rejects.toThrow();
    patcher.forget();

    await Bun.write(file("ui/C.tsx"), 'export const c = () => "c2";\n');
    expect((await patcher.update([file("ui/C.tsx")])).kind).toBe("delegate");
  });

  test.skipIf(!foldsCase)(
    "an importer still naming the old spelling compiles with the new one, so app.js defines what it requires",
    async () => {
      const { patcher, file, app, changedIds } = await movedRegistry({
        "ui/card.tsx": 'export const card = () => "v1";\n',
        "ui/Page.tsx": 'import { card } from "./card";\nexport const page = () => card();\n',
        "entry.ts": 'import { page } from "./ui/Page";\nexport const run = page;\n',
      });
      fs.renameSync(file("ui/card.tsx"), file("ui/Card.tsx"));
      await Bun.write(file("ui/Card.tsx"), 'export const card = () => "v2";\n');
      expect(changedIds(await patcher.update([file("ui/Card.tsx")]))).toEqual([
        "apps/demo/ui/Card.tsx",
        "apps/demo/ui/Page.tsx",
      ]);
      expect(await app()).toContain('__akan.define("apps/demo/ui/Card.tsx"');
      expect(await app()).not.toContain('__akan.define("apps/demo/ui/card.tsx"');
      await Bun.write(file("ui/Other.tsx"), "export const other = 1;\n");
      expect(await patcher.update([file("ui/Other.tsx")])).toEqual({ kind: "unchanged" });
    },
  );

  test.skipIf(!foldsCase)(
    "a case-only rename the patcher never saw moves the module once, and later saves leave it alone",
    async () => {
      for (const resident of [false, true]) {
        const { bundler, patcher, file, changedIds } = await movedRegistry({
          "ui/card.tsx": 'export const card = () => "v1";\n',
          "ui/Page.tsx": 'import { card } from "./card";\nexport const page = () => card();\n',
          "entry.ts": 'import { page } from "./ui/Page";\nexport const run = page;\n',
        });
        fs.renameSync(file("ui/card.tsx"), file("ui/Card.tsx"));
        await Bun.write(file("ui/Page.tsx"), 'import { card } from "./Card";\nexport const page = () => card();\n');
        const later = resident ? patcher : new CsrDevPatcher(bundler, { resident: true });
        expect(changedIds(await later.update([file("ui/Page.tsx")]))).toEqual([
          "apps/demo/ui/Card.tsx",
          "apps/demo/ui/Page.tsx",
        ]);
        await Bun.write(file("ui/Card.tsx"), 'export const card = () => "v2";\n');
        expect(changedIds(await later.update([file("ui/Card.tsx")]))).toEqual(["apps/demo/ui/Card.tsx"]);
        await Bun.write(file("ui/Other.tsx"), "export const other = 1;\n");
        expect(await later.update([file("ui/Other.tsx")])).toEqual({ kind: "unchanged" });
        const graph = (await bundler.writer.readJson<CsrDevGraph>("graph.json")) as CsrDevGraph;
        expect(graph.modules["apps/demo/ui/card.tsx"]).toBeUndefined();
      }
    },
  );

  test("by default a pending root counts as reached only while an entry or a module imports it", async () => {
    const { bundler, patcher, file, changedIds } = await movedRegistry({
      "ui/Card.tsx": 'export const card = () => "v1";\n',
      "ui/Broken.tsx": "export const broken = ;\n",
      "entry.ts": 'import { card } from "./ui/Card";\nexport const run = card;\n',
    });
    await expect(patcher.update([], { roots: [file("ui/Broken.tsx")], onlyRoots: true })).rejects.toThrow();
    await Bun.write(file("ui/Card.tsx"), 'export const card = () => "v2";\n');
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
