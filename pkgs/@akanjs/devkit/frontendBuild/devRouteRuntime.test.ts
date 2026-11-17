import { describe, expect, test } from "bun:test";
import { realpath } from "node:fs/promises";
import path from "node:path";
import type { App } from "../commandDecorators";
import { tempDirs, writeText as write } from "../test/testHelpers";
import { CsrDevModuleCompiler } from "./csrDevModuleCompiler";
import { CsrDevPatcher } from "./csrDevPatcher";
import { CsrDevPaths } from "./csrDevPaths";
import { CsrDevResolver } from "./csrDevResolver";
import { DevRouteRuntime } from "./devRouteRuntime";
import { SsrDevBundler } from "./ssrDevBundler";

const makeTempRoot = tempDirs("akan-dev-route-runtime-");
const tsPaths = { "@apps/*": ["./apps/*"] };

const storeSource = (name: string, keys: string[]) =>
  `import { store } from "akanjs/store";\nexport class ${name}Store extends store("${name}" as const, () => ({ ${keys.map((key) => `${key}: 0`).join(", ")} })) {}\n`;
const piece = (name: string) => `(globalThis as { pieces?: string[] }).pieces?.push("piece:${name}");\nexport {};\n`;
const reader = (name: string, read: string) =>
  `"use client";\nimport { st } from "@apps/demo/client";\nexport const ${name} = () => [${read}, "${name}-ui"];\n`;

const routeWorkspace = async () => {
  const root = await realpath(await makeTempRoot());
  const file = (relative: string) => path.join(root, "apps/demo", relative);
  const files: Record<string, string> = {
    "client.ts": 'export { st } from "./lib/st";\nexport { usePage } from "./lib/useClient";\n',
    "lib/st.ts": 'export const st = { mark: "whole-store" };\n',
    "lib/cnst.ts": 'export const constants = "every-constant";\n',
    "lib/useClient.ts": 'export const usePage = () => "whole-client";\n',
    "lib/usePage.ts":
      'export const st = { use: {} as Record<string, () => unknown> };\nexport const usePage = () => "page";\n',
    "lib/__client/_useClient.ts": 'export const usePage = () => "assembled-client";\n',
    "lib/__client/_st.ts": 'export const st = { mark: "assembled-store" };\n',
    "lib/__client/_base.fetch.ts": 'export const base = "base-descriptors";\n',
    "lib/__client/refs.ts": "export {};\n",
    "lib/_draft/draft.store.ts": storeSource("draft", ["draftText"]),
    "lib/__client/draft.st.ts": piece("draft.st"),
    "lib/_tally/tally.store.ts": storeSource("tally", ["tallyCount"]),
    "lib/__client/tally.st.ts": piece("tally.st"),
    "ui/Draft.tsx": reader("Draft", "st.use.draftText()"),
    "ui/Tally.tsx": reader("Tally", "st.use.tallyCount()"),
    "ui/Note.tsx": reader("Note", "st.use.noteText()"),
    "ui/Pick.tsx":
      '"use client";\nimport { st } from "@apps/demo/client";\nexport const Pick = (name: string) => st.use[name];\n',
  };
  for (const [relative, text] of Object.entries(files)) await write(file(relative), text);
  await write(path.join(root, "tsconfig.json"), JSON.stringify({ compilerOptions: { baseUrl: ".", paths: tsPaths } }));
  const akanjsRoot = path.dirname(Bun.resolveSync("akanjs/package.json", import.meta.dir));
  for (const base of ["package.json", "store/baseSt.ts", "signal/base.signal.ts", "signal/agent.signal.ts"])
    await write(path.join(root, "node_modules/akanjs", base), await Bun.file(path.join(akanjsRoot, base)).text());
  const app = {
    name: "demo",
    cwdPath: path.join(root, "apps/demo"),
    dist: { cwdPath: path.join(root, "dist/apps/demo") },
    workspace: { workspaceRoot: root },
    basePaths: new Set<string>(),
    getConfig: async () => ({
      clientRuntime: "route",
      optimizeImports: [],
      barrelImports: ["@apps/demo/client", "akanjs/common"],
      basePaths: new Set<string>(),
    }),
    getTsConfig: async () => ({ compilerOptions: { paths: tsPaths } }),
    getPublicEnv: () => ({}),
    verbose: () => undefined,
    logger: { error: () => undefined },
  } as unknown as App;
  return { root, file, app };
};

const writeMemoModel = async (file: (relative: string) => string) => {
  const files: Record<string, string> = {
    "client.ts": [
      'export * as cnst from "./lib/cnst";',
      'export { usePage } from "./lib/usePage";',
      'export { fetch } from "./lib/useClient";',
      'export { st } from "./lib/st";',
      'export { Memo } from "./lib/memo";',
      "",
    ].join("\n"),
    "lib/useClient.ts": 'export const usePage = () => "whole-client";\nexport const fetch = {};\n',
    "lib/memo/index.ts": 'import * as Zone from "./Memo.Zone";\nexport const Memo = { Zone };\n',
    "lib/memo/Memo.Zone.tsx": '"use client";\nexport const View = () => "memo-view";\n',
    "lib/memo/memo.constant.ts": 'export const MemoStatus = ["active"] as const;\n',
    "lib/memo/memo.store.ts": storeSource("memo", ["memoText"]),
    "lib/__client/memo.cnst.ts":
      'import * as cnst from "../memo/memo.constant";\nexport const memo = { cnst };\nexport { memo as loaded };\n',
    "lib/__client/memo.fetch.ts": 'import { loaded as cnst0 } from "./memo.cnst";\nexport const loaded = [cnst0];\n',
    "lib/__client/memo.st.ts":
      'import { loaded as cnst0 } from "./memo.cnst";\nimport { loaded as fetch0 } from "./memo.fetch";\nexport const memo = [cnst0, fetch0];\n',
  };
  for (const [relative, text] of Object.entries(files)) await write(file(relative), text);
};

const sortedIds = (modules: { id: string }[]) =>
  modules.map((module) => module.id).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

describe("DevRouteRuntime", () => {
  test("a file naming one module's state imports the tab's store and that module's store piece by a relative path", async () => {
    const { root, file } = await routeWorkspace();
    const runtime = await DevRouteRuntime.read(root, "apps/demo");
    const source = await Bun.file(file("ui/Draft.tsx")).text();

    const routed = runtime?.transform(source, file("ui/Draft.tsx"));

    expect(routed?.perModule).toBe(true);
    expect(routed?.contents).toContain('import { st } from "akanjs/store";');
    expect(routed?.contents).toContain('"../lib/__client/draft.st.ts"');
    expect(routed?.contents).not.toContain('"@apps/');
    expect(routed?.contents).not.toContain("tally.st");
  });

  test("a model's reference file takes that model's store piece by a relative path, by a name it passes to `loadedAfter`", async () => {
    const { root, file } = await routeWorkspace();
    const source = '"use client";\n\nexport const reference = "draft";\n';
    await write(file("lib/__client/draft.ref.ts"), source);
    await write(file("lib/_draft/draft.store.ts"), storeSource("draft", ["draft", "draftText"]));
    const runtime = await DevRouteRuntime.read(root, "apps/demo");

    const routed = runtime?.transform(source, file("lib/__client/draft.ref.ts"));

    expect(routed?.perModule).toBe(true);
    expect(routed?.contents).toBe(
      '"use client";\nimport { loadedAfter as __akanLoadedAfter } from "akanjs/base";\nimport { draft as __akanLoaded0 } from "./draft.st.ts";\n__akanLoadedAfter(__akanLoaded0);\n\nexport const reference = "draft";\n',
    );
  });

  test("lists each store key under the module whose store declares it", async () => {
    const { root } = await routeWorkspace();
    const runtime = await DevRouteRuntime.read(root, "apps/demo");

    expect(runtime?.owners.use["draft (apps/demo)"]).toContain("draftText");
    expect(runtime?.owners.use["tally (apps/demo)"]).toContain("tallyCount");
    expect(runtime?.ownersSource()).toContain('[Symbol.for("akanjs.store.owners")] = {"use":{');
  });

  test("a store save that declares a name a file reads moves the inputs, the digest and that file's stamp", async () => {
    const { root, file } = await routeWorkspace();
    const source = await Bun.file(file("ui/Note.tsx")).text();
    const inputs = DevRouteRuntime.inputsOf(root, ["apps/demo"]);
    const before = await DevRouteRuntime.read(root, "apps/demo");
    const unknown = before?.transform(source, file("ui/Note.tsx"));

    await write(file("lib/_draft/draft.store.ts"), storeSource("draft", ["draftText", "noteText"]));
    const after = await DevRouteRuntime.read(root, "apps/demo");
    const known = after?.transform(source, file("ui/Note.tsx"));

    expect(DevRouteRuntime.inputsOf(root, ["apps/demo"])).not.toBe(inputs);
    expect(after?.digest).not.toBe(before?.digest);
    expect(unknown?.contents).not.toContain("draft.st");
    expect(known?.contents).toContain('"../lib/__client/draft.st.ts"');
    expect(known?.stamp).not.toBe(unknown?.stamp);
  });

  test("a file edited to read a store by a name picked at run time takes the assembled runtime instead of pieces", async () => {
    const { root, file } = await routeWorkspace();
    const runtime = await DevRouteRuntime.read(root, "apps/demo");

    const routed = runtime?.transform(await Bun.file(file("ui/Pick.tsx")).text(), file("ui/Pick.tsx"));

    expect(routed?.perModule).toBe(false);
    expect(routed?.contents).toContain(`${root}/apps/demo/lib/__client/_useClient.ts`);
    expect(routed?.contents).toContain(`${root}/apps/demo/lib/__client/_st.ts`);
  });

  test("a lib's store, store piece or assembled store names the loaded app piece of that module and the app's assembled store to run after it", async () => {
    const { root } = await routeWorkspace();
    const runtime = await DevRouteRuntime.read(root, "apps/demo");
    const loaded: Record<string, string[]> = {
      "apps/demo/lib/__client/draft.st.ts": ["apps/demo/lib/_draft/draft.store.ts"],
      "apps/demo/lib/__client/_st.ts": ["apps/demo/lib/__client/draft.st.ts"],
      "apps/demo/lib/_draft/draft.store.ts": [],
    };
    const depsOf = (id: string) => loaded[id];

    expect(runtime?.appStoresAfter("libs/shared/lib/__client/draft.st.ts", depsOf)).toEqual([
      "apps/demo/lib/__client/draft.st.ts",
      "apps/demo/lib/__client/_st.ts",
    ]);
    expect(runtime?.appStoresAfter("libs/shared/lib/_draft/draft.store.ts", depsOf)).toEqual([
      "apps/demo/lib/__client/draft.st.ts",
      "apps/demo/lib/__client/_st.ts",
    ]);
    expect(runtime?.appStoresAfter("libs/shared/lib/st.ts", depsOf)).toEqual(["apps/demo/lib/__client/_st.ts"]);
    expect(runtime?.appStoresAfter("libs/shared/lib/__client/_st.ts", depsOf)).toEqual([
      "apps/demo/lib/__client/_st.ts",
    ]);
    expect(runtime?.appStoresAfter("libs/shared/lib/_tally/tally.store.ts", depsOf)).toEqual([
      "apps/demo/lib/__client/_st.ts",
    ]);
    expect(runtime?.appStoresAfter("apps/demo/lib/__client/draft.st.ts", depsOf)).toEqual([]);
    expect(runtime?.appStoresAfter("libs/shared/lib/__lib/lib.store.ts", depsOf)).toEqual([]);
  });

  test("a lib's store the app's store of that model extends names that app store first", async () => {
    const { root } = await routeWorkspace();
    const runtime = await DevRouteRuntime.read(root, "apps/demo");
    const loaded: Record<string, string[]> = {
      "apps/demo/lib/__client/draft.st.ts": ["apps/demo/lib/_draft/draft.store.ts"],
      "apps/demo/lib/__client/_st.ts": ["apps/demo/lib/__client/draft.st.ts"],
      "apps/demo/lib/_draft/draft.store.ts": ["apps/demo/lib/__lib/lib.store.ts"],
      "apps/demo/lib/__lib/lib.store.ts": ["libs/shared/lib/_draft/draft.store.ts"],
    };

    expect(runtime?.appStoresAfter("libs/shared/lib/_draft/draft.store.ts", (id) => loaded[id])).toEqual([
      "apps/demo/lib/_draft/draft.store.ts",
      "apps/demo/lib/__client/draft.st.ts",
      "apps/demo/lib/__client/_st.ts",
    ]);
  });
});

describe("the dev registry under clientRuntime route", () => {
  const compile = async (app: App, root: string, roots: string[]) => {
    const context = await new SsrDevBundler(app).context();
    const paths = new CsrDevPaths(root);
    const resolver = new CsrDevResolver({ paths, context, entryFiles: roots });
    await resolver.prepass();
    const compiler = new CsrDevModuleCompiler({
      app,
      paths,
      resolver,
      context,
      outDir: path.join(root, "out"),
      routePrefix: "/_akan/ssr-dev/",
    });
    return (await compiler.compile(roots, new Set())).modules;
  };

  test("compiles each page's own store pieces once, never the scope's whole store, client runtime or client barrel", async () => {
    const { root, file, app } = await routeWorkspace();

    const modules = await compile(app, root, [file("ui/Draft.tsx"), file("ui/Tally.tsx")]);

    expect(sortedIds(modules)).toEqual([
      "apps/demo/lib/__client/draft.st.ts",
      "apps/demo/lib/__client/tally.st.ts",
      "apps/demo/ui/Draft.tsx",
      "apps/demo/ui/Tally.tsx",
    ]);
    const piece = modules.find((module) => module.id === "apps/demo/lib/__client/draft.st.ts");
    expect(piece?.factory).toContain("module.hot.accept()");
    expect(modules.find((module) => module.id === "apps/demo/ui/Draft.tsx")?.routed).toBeString();
  });

  test("a scope's lib/st.ts and lib/useClient.ts load as their assembled pieces", async () => {
    const { root, file, app } = await routeWorkspace();

    const modules = await compile(app, root, [file("client.ts"), file("ui/Pick.tsx")]);

    expect(sortedIds(modules)).toEqual([
      "apps/demo/client.ts",
      "apps/demo/lib/__client/_st.ts",
      "apps/demo/lib/__client/_useClient.ts",
      "apps/demo/lib/cnst.ts",
      "apps/demo/lib/st.ts",
      "apps/demo/lib/useClient.ts",
      "apps/demo/ui/Pick.tsx",
    ]);
    const code = modules.map((module) => module.factory).join("\n");
    expect(code).not.toContain("whole-store");
    expect(code).not.toContain("whole-client");
  });

  test("a store file picking an endpoint at run time takes its handle from the page runtime and loads no store, and each file naming its store loads the assembled runtime", async () => {
    const { root, file, app } = await routeWorkspace();
    for (const client of ["lib/useClient.ts", "lib/usePage.ts"])
      await write(file(client), "export const fetch = {};\n");
    const before = await DevRouteRuntime.read(root, "apps/demo");
    await write(
      file("lib/_draft/draft.store.ts"),
      'import { store } from "akanjs/store";\nimport { fetch } from "../useClient";\nexport class DraftStore extends store("draft" as const, () => ({ draftText: 0 })) {\n  run(name: string) {\n    return (fetch as Record<string, () => unknown>)[name]?.();\n  }\n}\n',
    );

    const modules = await compile(app, root, [file("lib/_draft/draft.store.ts")]);
    const runtime = await DevRouteRuntime.read(root, "apps/demo");
    const [draft, tally] = await Promise.all(
      ["ui/Draft.tsx", "ui/Tally.tsx"].map(async (ui) => runtime?.transform(await Bun.file(file(ui)).text(), file(ui))),
    );

    expect(sortedIds(modules)).toEqual(["apps/demo/lib/_draft/draft.store.ts", "apps/demo/lib/usePage.ts"]);
    expect(draft?.perModule).toBe(false);
    expect(draft?.contents).toContain('/apps/demo/lib/__client/_useClient.ts";');
    expect(draft?.contents).toContain('/apps/demo/lib/__client/_st.ts";');
    expect(tally?.perModule).toBe(true);
    expect(runtime?.digest).not.toBe(before?.digest);
  });

  test("a lib's lib/st.ts loads as the lib's assembled store followed by the app's", async () => {
    const { root, file, app } = await routeWorkspace();
    const lib = (relative: string) => path.join(root, "libs/shared", relative);
    await write(file("lib/st.ts"), 'export { st as shared } from "@libs/shared/client";\nexport const st = {};\n');
    await write(lib("lib/st.ts"), 'export const st = { mark: "whole-lib-store" };\n');
    await write(lib("lib/__client/_st.ts"), 'export const st = { mark: "assembled-lib-store" };\n');
    await write(lib("lib/_shelf/shelf.store.ts"), storeSource("shelf", ["shelfSize"]));
    await write(lib("lib/__client/shelf.st.ts"), piece("shelf.st"));

    const modules = await compile(app, root, [lib("lib/st.ts")]);

    expect(sortedIds(modules)).toEqual([
      "apps/demo/lib/__client/_st.ts",
      "libs/shared/lib/__client/_st.ts",
      "libs/shared/lib/st.ts",
    ]);
    expect(modules.map((module) => module.factory).join("\n")).not.toContain("whole-lib-store");
  });

  test.each([
    ["the object first", "Memo, cnst"],
    ["the constants first", "cnst, Memo"],
  ])(
    "a file naming one component of an object and one constant, %s, compiles that component's file and that model's registration, never every constant",
    async (_, names) => {
      const { root, file, app } = await routeWorkspace();
      await writeMemoModel(file);
      await write(
        file("ui/Status.tsx"),
        `"use client";\nimport { ${names} } from "@apps/demo/client";\nexport const Status = () => [Memo.Zone.View, cnst.MemoStatus];\n`,
      );

      const modules = await compile(app, root, [file("ui/Status.tsx")]);

      expect(sortedIds(modules)).toEqual([
        "apps/demo/lib/__client/memo.cnst.ts",
        "apps/demo/lib/memo/Memo.Zone.tsx",
        "apps/demo/lib/memo/memo.constant.ts",
        "apps/demo/lib/usePage.ts",
        "apps/demo/ui/Status.tsx",
      ]);
    },
  );

  class RouteRegistry extends SsrDevBundler {
    roots: string[] = [];
    protected override async rootFiles(entryFiles: string[]) {
      return [...entryFiles, ...this.roots];
    }
    override async metadataFingerprint() {
      return "same";
    }
  }

  test("a store save that gives a read name an owner recompiles the file reading it, whose own text did not change", async () => {
    const { file, app } = await routeWorkspace();
    const bundler = new RouteRegistry(app);
    bundler.roots = [file("ui/Note.tsx")];
    expect(await bundler.update([])).toMatchObject({ reload: true, first: true });
    const patcher = new CsrDevPatcher(bundler, { resident: true });
    expect(await patcher.update([])).toEqual({ kind: "unchanged" });
    const appJs = async () => await Bun.file(path.join(bundler.outDir, "app.js")).text();
    expect(await appJs()).not.toContain('__akan.define("apps/demo/lib/__client/draft.st.ts"');

    await write(file("lib/_draft/draft.store.ts"), storeSource("draft", ["draftText", "noteText"]));
    const saved = await patcher.update([file("lib/_draft/draft.store.ts")]);

    expect(saved.kind).toBe("update");
    expect(saved.kind === "update" ? saved.update.changedIds : []).toContain("apps/demo/ui/Note.tsx");
    expect(await appJs()).toContain('__akan.define("apps/demo/lib/__client/draft.st.ts"');
    expect(await patcher.update([])).toEqual({ kind: "unchanged" });
  });

  test("a constant file's save reloads the tab, whose boot runs that model's registration before its fetch piece and both before its store piece", async () => {
    const { file, app } = await routeWorkspace();
    await writeMemoModel(file);
    await write(
      file("ui/MemoText.tsx"),
      '"use client";\nimport { st, cnst } from "@apps/demo/client";\nexport const MemoText = () => [st.use.memoText(), cnst.MemoStatus];\n',
    );
    const bundler = new RouteRegistry(app);
    bundler.roots = [file("ui/MemoText.tsx")];
    await bundler.update([]);
    const patcher = new CsrDevPatcher(bundler, { resident: true });
    expect(await patcher.update([])).toEqual({ kind: "unchanged" });

    await write(file("lib/memo/memo.constant.ts"), 'export const MemoStatus = ["active", "done"] as const;\n');
    const saved = await patcher.update([file("lib/memo/memo.constant.ts")]);

    const update = saved.kind === "update" ? saved.update : null;
    expect(update).toMatchObject({ reload: true, reason: "memo.constant.ts changed" });
    const appJs = await Bun.file(path.join(bundler.outDir, "app.js")).text();
    const factoryOf = (id: string) =>
      appJs.slice(appJs.indexOf(`__akan.define("${id}"`)).split("\n__akan.define(")[0] ?? "";
    const required = (id: string) =>
      [...factoryOf(id).matchAll(/require\("([^"]+)"\)/g)].map(([, dep]) => dep?.replace(/^.*\/lib\//, "lib/"));
    expect(factoryOf("apps/demo/lib/__client/memo.cnst.ts")).toContain("lib/memo/memo.constant.ts");
    expect(required("apps/demo/lib/__client/memo.fetch.ts")).toEqual(["lib/__client/memo.cnst.ts"]);
    expect(required("apps/demo/lib/__client/memo.st.ts")).toEqual([
      "lib/__client/memo.cnst.ts",
      "lib/__client/memo.fetch.ts",
    ]);
    expect(appJs).toContain('"done"');
    expect(appJs).not.toContain('__akan.define("apps/demo/lib/cnst.ts"');
  });

  test("a store save that adds a key patches the owners table, which takes its own update, and leaves the bootstrap as it was", async () => {
    const { file, app } = await routeWorkspace();
    const bundler = new RouteRegistry(app);
    bundler.roots = [file("ui/Draft.tsx")];
    await bundler.update([]);
    const patcher = new CsrDevPatcher(bundler, { resident: true });
    expect(await patcher.update([])).toEqual({ kind: "unchanged" });
    const ownersId = "apps/demo/.akan/generated/ssr-dev/storeOwners.ts";

    await write(file("lib/_draft/draft.store.ts"), storeSource("draft", ["draftText", "draftNote"]));
    const saved = await patcher.update([file("lib/_draft/draft.store.ts")]);

    const update = saved.kind === "update" ? saved.update : null;
    expect(update?.reload).toBe(false);
    expect(update?.changedIds).toEqual([ownersId]);
    const patch = await Bun.file(path.join(bundler.outDir, `patch-${update?.generation}.js`)).text();
    const owners = patch.slice(patch.indexOf(`"${ownersId}": function`));
    expect(owners).toContain('"draftNote"');
    expect(owners).toContain("module.hot.accept()");
  });

  test("a lib store piece's save runs the app's piece of that module and the app's assembled store again after it", async () => {
    const { root, file, app } = await routeWorkspace();
    const libPiece = path.join(root, "libs/shared/lib/__client/draft.st.ts");
    await write(libPiece, piece("shared-draft.st"));
    await write(
      file("lib/__client/draft.st.ts"),
      `import "../../../../libs/shared/lib/__client/draft.st";\n${piece("draft.st")}`,
    );
    const bundler = new RouteRegistry(app);
    bundler.roots = [file("ui/Draft.tsx"), file("ui/Tally.tsx"), file("client.ts")];
    await bundler.update([]);
    const patcher = new CsrDevPatcher(bundler, { resident: true });
    expect(await patcher.update([])).toEqual({ kind: "unchanged" });

    await write(libPiece, piece("shared-draft.st-saved"));
    const saved = await patcher.update([libPiece]);

    const update = saved.kind === "update" ? saved.update : null;
    expect(update?.reload).toBe(false);
    expect(update?.changedIds.toSorted()).toEqual([
      "apps/demo/lib/__client/_st.ts",
      "apps/demo/lib/__client/draft.st.ts",
      "libs/shared/lib/__client/draft.st.ts",
    ]);
  });

  test("a lib store class save runs the app's store extending it, the app's piece of that module and the app's assembled store again after it", async () => {
    const { root, file, app } = await routeWorkspace();
    const lib = (relative: string) => path.join(root, "libs/shared", relative);
    await write(lib("lib/_draft/draft.store.ts"), storeSource("draft", ["draftText"]));
    await write(lib("lib/__client/draft.st.ts"), `import "../_draft/draft.store";\n${piece("shared-draft.st")}`);
    await write(
      file("lib/__lib/lib.store.ts"),
      'import "../../../../libs/shared/lib/_draft/draft.store";\nexport {};\n',
    );
    await write(
      file("lib/_draft/draft.store.ts"),
      `import "../__lib/lib.store";\n${storeSource("draft", ["draftText"])}`,
    );
    await write(
      file("lib/__client/draft.st.ts"),
      `import "../../../../libs/shared/lib/__client/draft.st";\nimport "../_draft/draft.store";\n${piece("draft.st")}`,
    );
    const bundler = new RouteRegistry(app);
    bundler.roots = [file("ui/Draft.tsx"), file("ui/Tally.tsx"), file("client.ts")];
    await bundler.update([]);
    const patcher = new CsrDevPatcher(bundler, { resident: true });
    expect(await patcher.update([])).toEqual({ kind: "unchanged" });

    await write(lib("lib/_draft/draft.store.ts"), storeSource("draft", ["draftText", "draftNote"]));
    const saved = await patcher.update([lib("lib/_draft/draft.store.ts")]);

    const update = saved.kind === "update" ? saved.update : null;
    expect(update?.reload).toBe(false);
    expect(update?.changedIds.toSorted()).toEqual([
      "apps/demo/lib/__client/_st.ts",
      "apps/demo/lib/__client/draft.st.ts",
      "apps/demo/lib/_draft/draft.store.ts",
      "libs/shared/lib/_draft/draft.store.ts",
    ]);
  });
});
