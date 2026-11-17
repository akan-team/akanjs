import { beforeAll, describe, expect, test } from "bun:test";
import path from "node:path";
import type { RuntimeNameTable } from "../quality/runtimeNameTable";
import { runtimeFixtureTables } from "../quality/runtimeTable.fixture";
import { tempDirs, writeText as write } from "../test/testHelpers";
import { ModelReference } from "./modelReference";
import { RouteRuntime } from "./routeRuntime";

const makeTempRoot = tempDirs("akan-model-reference-");
const root = "/ws";
const onDisk = (model: string) => `\n"use client";\n\nexport const reference = "${model}";\n`;
const referenceOf = (model: string) => `${root}/apps/demo/lib/__client/${model}.ref.ts`;
const uiFile = (name: string) => `${root}/apps/demo/ui/${name}.tsx`;
const naming = (model: string) =>
  `"use client";\nimport { st } from "@apps/demo/client";\nexport const read = () => st.use.${model}();\n`;
const pickingRun = 'import { st } from "@apps/demo/client";\nexport const run = (name: string) => st.do[name]();\n';
const pickingStore = `import { store } from "akanjs/store";

import { st } from "../st";
import { fetch, sig } from "../useClient";

export class MemoStore extends store(sig.memo, () => ({ draft: "" })) {
  run(name: string) {
    return [fetch[name](), st.get().draft];
  }
}
`;
const appPieces = ["_useClient", "_st", "_base.fetch", "memo.fetch", "memo.st", "note.fetch", "note.st", "tag.fetch"];
const kitPieces = ["_useClient", "_st", "note.fetch", "note.st", "tag.fetch", "tag.st", "util.st"];
const pieces = new Set([
  ...appPieces.map((piece) => `apps/demo/lib/__client/${piece}`),
  ...kitPieces.map((piece) => `libs/kit/lib/__client/${piece}`),
]);
const memoPieces = ["apps/demo/lib/__client/memo.fetch", "apps/demo/lib/__client/memo.st"];
const wholeLoads =
  'import { loadedAfter as __akanLoadedAfter } from "akanjs/base"; import { sig as __akanLoaded0 } from "/ws/apps/demo/lib/__client/_useClient.ts"; import { st as __akanLoaded1 } from "/ws/apps/demo/lib/__client/_st.ts"; __akanLoadedAfter(__akanLoaded0, __akanLoaded1);';

let demo: RuntimeNameTable;
const runtimeOf = (files: Record<string, string> = {}) =>
  new RouteRuntime(root, demo, pieces, (absPath) => files[absPath] ?? null);
const transformed = (model: string, files?: Record<string, string>) =>
  runtimeOf(files).transform(onDisk(model), referenceOf(model));

beforeAll(async () => {
  demo = (await runtimeFixtureTables()).demo;
});

describe("a model's reference file in the per-route build", () => {
  test("imports the model's fetch piece as `loaded` and its store piece by the model's name, and passes both to `loadedAfter`", () => {
    expect(transformed("memo")).toEqual({
      source: `
"use client";
import { loadedAfter as __akanLoadedAfter } from "akanjs/base";
import { loaded as __akanLoaded0 } from "@apps/demo/lib/__client/memo.fetch";
import { memo as __akanLoaded1 } from "@apps/demo/lib/__client/memo.st";
__akanLoadedAfter(__akanLoaded0, __akanLoaded1);

export const reference = "memo";
`,
      perModule: true,
      pieces: memoPieces,
    });
  });

  test("loads the pieces a client file reading the model's store loads, for a model of the app, of a lib, and one the app extends", () => {
    for (const model of ["memo", "tag", "note"]) {
      const named = runtimeOf().transform(naming(model), uiFile("Card"));
      expect(named?.pieces.some((piece) => piece.endsWith(`/${model}.st`))).toBe(true);
      expect(transformed(model)?.pieces).toEqual(named?.pieces ?? []);
    }
    expect(transformed("tag")?.pieces).toEqual(["apps/demo/lib/__client/tag.fetch", "libs/kit/lib/__client/tag.st"]);
  });

  test("loads the stores the model's own store names too, as a file reading that store does", () => {
    const files = {
      [`${root}/apps/demo/lib/memo/memo.store.ts`]: `import { store } from "akanjs/store";

import { st } from "../st";
import { sig } from "../useClient";

export class MemoStore extends store(sig.memo, () => ({ draft: "" })) {
  relabel() {
    st.do.pickLabel(st.get().tagFilter);
  }
}
`,
    };
    expect(transformed("memo", files)?.pieces).toEqual([
      ...memoPieces,
      "libs/kit/lib/__client/tag.st",
      "libs/kit/lib/__client/util.st",
    ]);
  });

  test("loads the whole runtime where the model's store picks a name at run time", () => {
    const whole = transformed("memo", { [`${root}/apps/demo/lib/memo/memo.store.ts`]: pickingStore });
    expect(whole).toEqual({
      source: `\n"use client";\n${wholeLoads.split("; ").join(";\n")}\n\nexport const reference = "memo";\n`,
      perModule: false,
      pieces: [],
    });
  });

  test("holds no import made only for its effect, which a split bundle would move away from it", () => {
    for (const model of ["memo", "tag", "note"]) expect(transformed(model)?.source).not.toMatch(/import\s*"/);
  });

  test("stays as written for a model the app does not have, and is no reference file anywhere else", () => {
    expect(transformed("ghost")).toEqual({ source: onDisk("ghost"), perModule: true, pieces: [] });
    expect(ModelReference.modelOf("apps/demo/lib/__client/note.ref.ts")).toBe("note");
    expect(ModelReference.modelOf(referenceOf("note"))).toBe("note");
    for (const file of ["apps/demo/lib/__client/note.st.ts", "apps/demo/ui/note.ref.ts", "apps/demo/lib/refs.ts"]) {
      expect(ModelReference.modelOf(file)).toBeNull();
      expect(ModelReference.isFile(file)).toBe(false);
    }
    expect(ModelReference.sourceOf(onDisk("note"), [])).toBe(onDisk("note"));
  });
});

describe("a model's reference file in a build planned over the whole-runtime bundle", () => {
  const plan = (routes: Record<string, string[]>, files: Record<string, string>) => {
    const target = runtimeOf(files);
    const kept = target.plan({
      importsByModule: new Map(Object.keys(files).map((file) => [file, []])),
      entries: Object.keys(files),
      entriesByRoute: new Map(Object.entries(routes)),
    });
    const piecesOf = (file: string) => target.transform(files[file] ?? "", file)?.pieces ?? "as written";
    return { kept: [...kept].sort(), piecesOf };
  };
  const files = {
    [referenceOf("memo")]: onDisk("memo"),
    [uiFile("Plain")]: "export const Plain = 1;\n",
    [uiFile("Run")]: pickingRun,
  };

  test("is an entry narrowed to the model's pieces on a route that loads no whole runtime", () => {
    const { kept, piecesOf } = plan(
      { "/list": [uiFile("Plain"), referenceOf("memo")], "/run": [uiFile("Run")] },
      files,
    );
    expect(kept).toEqual([uiFile("Run")]);
    expect(piecesOf(referenceOf("memo"))).toEqual(memoPieces);
  });

  test("keeps its pieces beside the whole runtime of a page, where more routes without one hold it", () => {
    const routes = {
      "/list": [uiFile("Plain"), referenceOf("memo")],
      "/view": [uiFile("Plain"), referenceOf("memo")],
      "/run": [uiFile("Run"), referenceOf("memo")],
    };
    const { kept, piecesOf } = plan(routes, files);
    expect(kept).toEqual([uiFile("Run")]);
    expect(piecesOf(referenceOf("memo"))).toEqual(memoPieces);
  });

  test("stays as written where only whole-runtime routes hold it, whose pages already load every model", () => {
    const { kept, piecesOf } = plan(
      { "/run": [uiFile("Run"), referenceOf("memo")], "/plain": [uiFile("Plain")] },
      files,
    );
    expect(kept).toEqual([referenceOf("memo"), uiFile("Run")].sort());
    expect(piecesOf(referenceOf("memo"))).toBe("as written");
  });

  test("keeps the whole runtime as an entry where its model's store picks a name at run time", () => {
    const picking = { ...files, [`${root}/apps/demo/lib/memo/memo.store.ts`]: pickingStore };
    const target = runtimeOf(picking);
    const kept = target.plan({
      importsByModule: new Map([referenceOf("memo"), uiFile("Plain")].map((file) => [file, []])),
      entries: [referenceOf("memo"), uiFile("Plain")],
      entriesByRoute: new Map([["/list", [uiFile("Plain"), referenceOf("memo")]]]),
    });
    expect([...kept].sort()).toEqual([referenceOf("memo"), uiFile("Plain")]);
    expect(target.transform(onDisk("memo"), referenceOf("memo"))).toBeNull();
  });
});

describe("the reference files of an app", () => {
  test("are listed by model from the app's own folder, and are none before a sync wrote them", async () => {
    const tempRoot = await makeTempRoot();
    const dir = path.join(tempRoot, "apps/demo/lib/__client");
    for (const file of ["note.ref.ts", "memo.ref.ts", "memo.st.ts", "refs.ts"]) await write(path.join(dir, file), "");
    await write(path.join(tempRoot, "libs/kit/lib/__client/tag.ref.ts"), "");

    expect([...(await ModelReference.filesOf(tempRoot, "apps/demo"))]).toEqual([
      ["memo", path.join(dir, "memo.ref.ts")],
      ["note", path.join(dir, "note.ref.ts")],
    ]);
    expect([...(await ModelReference.filesOf(tempRoot, "apps/other"))]).toEqual([]);
  });

  test("are registered by the file the root layout imports", () => {
    expect(ModelReference.registrySpecifier("demo")).toBe("@apps/demo/lib/__client/refs");
  });
});
