import { beforeAll, describe, expect, test } from "bun:test";
import { runtimeFixtureTables } from "../quality/runtimeTable.fixture";
import { RuntimeUse, type RuntimeUseReason } from "../quality/runtimeUse";
import { RouteRuntime } from "./routeRuntime";

const root = "/ws";
const appPieces = ["_useClient", "_st", "_base.fetch", "memo.fetch", "memo.st", "note.fetch", "note.st", "tag.fetch"];
const kitPieces = ["_useClient", "_st", "note.fetch", "note.st", "tag.fetch", "tag.st", "util.st"];
const piecesOf = (app = appPieces, kit = kitPieces) =>
  new Set([
    ...app.map((piece) => `apps/demo/lib/__client/${piece}`),
    ...kit.map((piece) => `libs/kit/lib/__client/${piece}`),
  ]);

let runtime: RouteRuntime;
let withoutTagStore: RouteRuntime;
let withStores: (stores: Record<string, string>) => RouteRuntime;

beforeAll(async () => {
  const { demo } = await runtimeFixtureTables();
  runtime = new RouteRuntime(root, demo, piecesOf());
  withStores = (stores) => new RouteRuntime(root, demo, piecesOf(), (absPath) => stores[absPath] ?? null);
  withoutTagStore = new RouteRuntime(
    root,
    demo,
    piecesOf(
      appPieces,
      kitPieces.filter((piece) => piece !== "tag.st"),
    ),
  );
});

const transform = (source: string, file = "apps/demo/ui/Card.tsx", target = runtime) =>
  target.transform(source, `${root}/${file}`);

const bound = (...pieces: [name: string, specifier: string][]) =>
  [
    'import { loadedAfter as __akanLoadedAfter } from "akanjs/base";',
    ...pieces.map(([name, specifier], index) =>
      name === "*"
        ? `import * as __akanLoaded${index} from "${specifier}";`
        : `import { ${name} as __akanLoaded${index} } from "${specifier}";`,
    ),
    `__akanLoadedAfter(${pieces.map((_, index) => `__akanLoaded${index}`).join(", ")});`,
  ].join(" ");

const whole = `${bound(
  ["*", "/ws/apps/demo/lib/cnst.ts"],
  ["sig", "/ws/apps/demo/lib/__client/_useClient.ts"],
  ["st", "/ws/apps/demo/lib/__client/_st.ts"],
)} `;

describe("a client file under the per-route runtime", () => {
  test("takes its handles from the page runtime and gains the pieces of the modules it names", () => {
    const source = `"use client";
import { fetch, Memo, st } from "@apps/demo/client";

export const Card = () => {
  void fetch.memoNote();
  return [st.use.draft(), st.use.label(), Memo];
};
`;
    const result = transform(source);
    expect(result?.perModule).toBe(true);
    expect(result?.pieces).toEqual([
      "apps/demo/lib/__client/memo.fetch",
      "apps/demo/lib/__client/memo.st",
      "libs/kit/lib/__client/util.st",
    ]);
    expect(result?.source.split("\n").slice(0, 2)).toEqual([
      '"use client";',
      `${bound(
        ["loaded", "@apps/demo/lib/__client/memo.fetch"],
        ["memo", "@apps/demo/lib/__client/memo.st"],
        ["util", "@libs/kit/lib/__client/util.st"],
      )} import { fetch } from "@apps/demo/lib/usePage"; import { st } from "akanjs/store"; import { Memo } from "@apps/demo/client";`,
    ]);
    expect(result?.source.split("\n").length).toBe(source.split("\n").length);
  });

  test("keeps every line where it was when the import spans several", () => {
    const source = `import {
  fetch,
  type cnst,
} from "@apps/demo/client";
export const count = (value: cnst.Memo) => [fetch.memoNote(), value];
`;
    const result = transform(source);
    expect(
      result?.source,
    ).toBe(`${bound(["loaded", "@apps/demo/lib/__client/memo.fetch"])} import { fetch } from "@apps/demo/lib/usePage"; import type { cnst } from "@apps/demo/client";



export const count = (value: cnst.Memo) => [fetch.memoNote(), value];
`);
  });

  test("loads a lib file's modules from the app's pieces, and a store the app does not extend from the lib's", () => {
    const source =
      'import { fetch, st } from "@libs/kit/client";\nexport const read = () => [st.use.noteCount(), st.use.tagFilter(), fetch.tagCount()];\n';
    const result = transform(source, "libs/kit/ui/Count.tsx");
    expect(result?.pieces).toEqual([
      "apps/demo/lib/__client/note.fetch",
      "apps/demo/lib/__client/tag.fetch",
      "apps/demo/lib/__client/note.st",
      "libs/kit/lib/__client/tag.st",
    ]);
    expect(result?.source).toContain('import { loaded as __akanLoaded0 } from "@apps/demo/lib/__client/note.fetch";');
    expect(result?.source).toContain('import { tag as __akanLoaded3 } from "@libs/kit/lib/__client/tag.st";');
    expect(result?.source).toContain(
      'import { fetch } from "@libs/kit/lib/usePage"; import { st } from "akanjs/store";',
    );
  });

  test("points a whole-runtime file import at the page runtime and the tab's store", () => {
    const result = transform(
      'import { st } from "../lib/st";\nimport { fetch } from "@apps/demo/lib/useClient";\nexport const read = () => [st.use.draft(), fetch.memoNote()];\n',
    );
    expect(result?.source).toContain('import { st } from "akanjs/store";');
    expect(result?.source).toContain('import { fetch } from "@apps/demo/lib/usePage";');
    expect(result?.pieces).toEqual(["apps/demo/lib/__client/memo.fetch", "apps/demo/lib/__client/memo.st"]);
  });

  test("gives a store file its own descriptors and never its own store piece", () => {
    const source = `import { store } from "akanjs/store";

import { sig } from "../useClient";

export class MemoStore extends store(sig.memo, () => ({ draft: "" })) {}
`;
    const result = transform(source, "apps/demo/lib/memo/memo.store.ts");
    expect(result?.pieces).toEqual(["apps/demo/lib/__client/memo.fetch"]);
    expect(result?.source).toContain('import { sig } from "@apps/demo/lib/usePage";');
    expect(result?.source).not.toContain("memo.st");
  });

  test("gives a lib store file the app extends its descriptors, and not the app's store piece that imports it", () => {
    const source = `import { store } from "akanjs/store";

import { sig } from "../useClient";

export class NoteStore extends store(sig.note, () => ({ noteCount: 0 })) {}
`;
    const result = transform(source, "libs/kit/lib/note/note.store.ts");
    expect(result?.pieces).toEqual(["apps/demo/lib/__client/note.fetch"]);
    expect(result?.source).not.toContain("note.st");
  });

  test("loads, in each file naming a store, the store pieces that store's own code names", () => {
    const naming = withStores({
      "/ws/apps/demo/lib/memo/memo.store.ts": `import { store } from "akanjs/store";

import { st } from "../st";
import { sig } from "../useClient";

export class MemoStore extends store(sig.memo, () => ({ draft: "" })) {
  relabel() {
    st.do.pickLabel(st.get().tagFilter);
  }
}
`,
    });
    const source = 'import { st } from "@apps/demo/client";\nexport const read = () => st.use.draft();\n';
    expect(transform(source)?.pieces).toEqual(["apps/demo/lib/__client/memo.fetch", "apps/demo/lib/__client/memo.st"]);
    expect(transform(source, "apps/demo/ui/Card.tsx", naming)?.pieces).toEqual([
      "apps/demo/lib/__client/memo.fetch",
      "apps/demo/lib/__client/memo.st",
      "libs/kit/lib/__client/tag.st",
      "libs/kit/lib/__client/util.st",
    ]);
  });

  test("gives a store file no piece of a store it names, which that store's piece would import back", () => {
    const source = `import { store } from "akanjs/store";

import { st } from "../st";
import { sig } from "../useClient";

export class MemoStore extends store(sig.memo, () => ({ draft: "" })) {
  relabel() {
    st.do.pickLabel(st.get().tagFilter);
  }
}
`;
    const result = transform(source, "apps/demo/lib/memo/memo.store.ts");
    expect(result?.pieces).toEqual(["apps/demo/lib/__client/memo.fetch", "apps/demo/lib/__client/tag.fetch"]);
    expect(result?.source).toContain('import { st } from "akanjs/store";');
    expect(result?.source).not.toMatch(/__client\/[\w.]+\.st"/);
  });

  test("loads the framework's own descriptors for a call to one of them", () => {
    const result = transform('import { fetch } from "@apps/demo/client";\nexport const check = () => fetch.ping();\n');
    expect(result?.pieces).toEqual(["apps/demo/lib/__client/_base.fetch"]);
  });

  test("leaves a file that reaches no runtime as it is", () => {
    const source = 'import { cn } from "akanjs/client";\nexport const box = cn("p-2");\n';
    expect(transform(source)).toEqual({ source, perModule: true, pieces: [] });
  });
});

const pickingStore = `import { store } from "akanjs/store";

import { st } from "../st";
import { fetch, sig } from "../useClient";

export class MemoStore extends store(sig.memo, () => ({ draft: "" })) {
  run(name: string) {
    return [fetch[name](), st.get().draft];
  }
}
`;

describe("a client file whose modules cannot be told", () => {
  test("loads the app's whole runtime after its directive when a name is picked at run time", () => {
    const source =
      '"use client";\nimport { st } from "@apps/demo/client";\nexport const run = (name: string) => st.do[name]();\n';
    const result = transform(source);
    expect(result).toEqual({
      source: `"use client";\n${whole}import { st } from "@apps/demo/client";\nexport const run = (name: string) => st.do[name]();\n`,
      perModule: false,
      pieces: [],
    });
  });

  test("loads the whole runtime when the import also takes the barrel's default export, and leaves that import as written", () => {
    const source = 'import Kit, { st } from "@apps/demo/client";\nexport const read = () => [st.use.draft(), Kit];\n';
    expect(transform(source)).toEqual({ source: `${whole}${source}`, perModule: false, pieces: [] });
  });

  test("loads the whole runtime when a piece it needs was not generated", () => {
    const source = 'import { st } from "@apps/demo/client";\nexport const read = () => st.use.tagFilter();\n';
    expect(transform(source)?.pieces).toEqual(["apps/demo/lib/__client/tag.fetch", "libs/kit/lib/__client/tag.st"]);
    const result = transform(source, "apps/demo/ui/Card.tsx", withoutTagStore);
    expect(result?.perModule).toBe(false);
    expect(result?.source).toBe(`${whole}${source}`);
  });

  test("gives a store file that picks a name at run time its own descriptors and the page runtime's handles, and no store piece", () => {
    const result = transform(pickingStore, "apps/demo/lib/memo/memo.store.ts");
    expect(result?.perModule).toBe(true);
    expect(result?.pieces).toEqual(["apps/demo/lib/__client/memo.fetch"]);
    expect(result?.source).toBe(
      `${bound(["loaded", "@apps/demo/lib/__client/memo.fetch"])} ${pickingStore
        .replace('"../useClient"', '"@apps/demo/lib/usePage"')
        .replace('"../st"', '"akanjs/store"')}`,
    );
  });

  test("leaves a store file's import of the whole store root as written where it takes more than the handle", () => {
    const source = pickingStore.replace('import { st } from "../st";', 'import * as root from "../st";');
    const result = transform(source, "apps/demo/lib/memo/memo.store.ts");
    expect(result?.source).toContain('import * as root from "../st";');
    expect(result?.source).toContain('import { fetch, sig } from "@apps/demo/lib/usePage";');
  });

  test("loads the whole runtime in each file naming a store whose own code picks a name at run time", () => {
    const picking = withStores({ "/ws/apps/demo/lib/memo/memo.store.ts": pickingStore });
    const source = 'import { st } from "@apps/demo/client";\nexport const read = () => st.use.draft();\n';
    expect(transform(source)?.perModule).toBe(true);
    expect(transform(source, "apps/demo/ui/Card.tsx", picking)).toEqual({
      source: `${whole}${source}`,
      perModule: false,
      pieces: [],
    });
  });

  test("loads the whole runtime in a lib file too, as the app's", () => {
    const source = 'import { st } from "@libs/kit/client";\nexport const run = (name: string) => st.do[name]();\n';
    expect(transform(source, "libs/kit/ui/Run.tsx")?.source).toBe(`${whole}${source}`);
  });
});

const namingRead = 'import { st } from "@apps/demo/client";\nexport const read = () => st.use.draft();\n';
const namingSide = 'import { st } from "@apps/demo/client";\nexport const side = () => st.use.tagFilter();\n';
const pickingRun = 'import { st } from "@apps/demo/client";\nexport const run = (name: string) => st.do[name]();\n';
const uiFile = (name: string) => `${root}/apps/demo/ui/${name}.tsx`;
const memoStoreFile = `${root}/apps/demo/lib/memo/memo.store.ts`;
const relabelFile = `${root}/apps/demo/webkit/relabel.ts`;

interface PlannedBundle {
  files: Record<string, string>;
  imports?: Record<string, (string | { lazy: string })[]>;
  entries: string[];
  routes?: Record<string, string[]>;
}

const plan = ({ files, imports = {}, entries, routes }: PlannedBundle) => {
  const target = withStores(files);
  const importsByModule = new Map(
    Object.keys(files).map((file) => [
      file,
      (imports[file] ?? []).map((imported) =>
        typeof imported === "string" ? { path: imported, lazy: false } : { path: imported.lazy, lazy: true },
      ),
    ]),
  );
  const kept = target.plan({
    importsByModule,
    entries,
    entriesByRoute: routes ? new Map(Object.entries(routes)) : undefined,
  });
  const piecesOf = (file: string) => {
    const result = target.transform(files[file] ?? "", file);
    return result ? result.pieces : "as written";
  };
  return { target, kept: [...kept].sort(), piecesOf };
};

describe("a build planned over the bundle that loads the whole runtime everywhere", () => {
  const memoPieces = ["apps/demo/lib/__client/memo.fetch", "apps/demo/lib/__client/memo.st"];
  const tagPieces = ["apps/demo/lib/__client/tag.fetch", "libs/kit/lib/__client/tag.st"];

  test("keeps the whole runtime in an entry reaching a file whose modules cannot be told, and leaves the files only it reaches as written", () => {
    const { target, kept, piecesOf } = plan({
      files: {
        [uiFile("Frame")]:
          'import { run } from "./Run";\nimport { side } from "./Side";\nexport const Frame = [run, side];\n',
        [uiFile("Run")]: pickingRun,
        [uiFile("Side")]: namingSide,
        [uiFile("Card")]: `import { side } from "./Side";\n${namingRead}export const Card = side;\n`,
        [uiFile("Lone")]: namingSide,
      },
      imports: {
        [uiFile("Frame")]: [uiFile("Run"), uiFile("Side"), uiFile("Lone")],
        [uiFile("Card")]: [uiFile("Side")],
      },
      entries: [uiFile("Frame"), uiFile("Card")],
    });
    expect(kept).toEqual([uiFile("Frame")]);
    expect([...target.wholeReaders]).toEqual([uiFile("Run")]);
    expect(["Frame", "Run", "Lone"].map((name) => piecesOf(uiFile(name)))).toEqual([
      "as written",
      "as written",
      "as written",
    ]);
    expect(piecesOf(uiFile("Side"))).toEqual(tagPieces);
    expect(piecesOf(uiFile("Card"))).toEqual(memoPieces);
    expect(target.redirectOf(`${root}/apps/demo/lib/st.ts`)).toBeNull();
  });

  test("keeps the whole runtime in an entry only whole-runtime routes hold, and narrows one another route holds too", () => {
    const files = { [uiFile("Run")]: pickingRun, [uiFile("Card")]: namingRead, [uiFile("Side")]: namingSide };
    const entries = Object.keys(files);
    const routes = {
      "/picked": [uiFile("Run"), uiFile("Card")],
      "/read": [uiFile("Card")],
      "/side": [uiFile("Run"), uiFile("Side")],
    };
    const byRoute = plan({ files, entries, routes });
    expect(byRoute.kept).toEqual([uiFile("Run"), uiFile("Side")]);
    expect(byRoute.piecesOf(uiFile("Side"))).toBe("as written");
    expect(byRoute.piecesOf(uiFile("Card"))).toEqual(memoPieces);
    const alone = plan({ files, entries });
    expect(alone.kept).toEqual([uiFile("Run")]);
    expect(alone.piecesOf(uiFile("Side"))).toEqual(tagPieces);
  });

  test("keeps the whole runtime in an entry naming a module that more whole-runtime routes hold than others, and narrows one naming none", () => {
    const plain = "export const Plain = 1;\n";
    const files = { [uiFile("Run")]: pickingRun, [uiFile("Card")]: namingRead, [uiFile("Plain")]: plain };
    const entries = Object.keys(files);
    const shared = [uiFile("Card"), uiFile("Plain")];
    const mostlyWhole = plan({
      files,
      entries,
      routes: { "/a": [uiFile("Run"), ...shared], "/b": [uiFile("Run"), ...shared], "/read": shared },
    });
    expect(mostlyWhole.kept).toEqual([uiFile("Card"), uiFile("Plain"), uiFile("Run")]);
    expect(mostlyWhole.piecesOf(uiFile("Card"))).toBe("as written");
    const evenly = plan({
      files,
      entries,
      routes: { "/a": [uiFile("Run"), ...shared], "/read": shared, "/plain": [uiFile("Plain")] },
    });
    expect(evenly.kept).toEqual([uiFile("Run")]);
    expect(evenly.piecesOf(uiFile("Card"))).toEqual(memoPieces);
    const plainOnly = plan({
      files,
      entries,
      routes: {
        "/a": [uiFile("Run"), uiFile("Plain")],
        "/b": [uiFile("Run"), uiFile("Plain")],
        "/c": [uiFile("Plain")],
      },
    });
    expect(plainOnly.kept).toEqual([uiFile("Run")]);
  });

  test("keeps the whole runtime in an entry asking with `import()` for a file that needs every module, and in a file only such entries ask for", () => {
    const files = {
      [uiFile("Card")]: namingRead,
      [uiFile("Run")]: pickingRun,
      [uiFile("Side")]: namingSide,
      [uiFile("Other")]: namingRead,
    };
    const asking = { [uiFile("Card")]: [{ lazy: uiFile("Run") }, { lazy: uiFile("Side") }] };
    const entries = [uiFile("Card"), uiFile("Other")];
    const lazy = plan({ files, imports: asking, entries });
    expect(lazy.kept).toEqual([uiFile("Card"), uiFile("Run"), uiFile("Side")]);
    expect(lazy.piecesOf(uiFile("Other"))).toEqual(memoPieces);
    const shared = plan({ files, imports: { ...asking, [uiFile("Other")]: [{ lazy: uiFile("Side") }] }, entries });
    expect(shared.kept).toEqual([uiFile("Card"), uiFile("Run")]);
    expect(shared.piecesOf(uiFile("Side"))).toEqual(tagPieces);
  });

  test("gives a file a store file imports no store piece, and loads the stores its code names in each file outside importing it or naming that store", () => {
    const files = {
      [memoStoreFile]: `import { store } from "akanjs/store";

import { relabel } from "../../webkit/relabel";
import { sig } from "../useClient";

export class MemoStore extends store(sig.memo, () => ({ draft: "" })) {
  relabel() {
    relabel();
  }
}
`,
      [relabelFile]:
        'import { st } from "@apps/demo/client";\nexport const relabel = () => st.do.pickLabel(st.get().tagFilter);\n',
      [uiFile("Card")]: namingRead,
      [uiFile("Other")]: 'import { relabel } from "../webkit/relabel";\nexport const Other = () => relabel();\n',
    };
    const imports = { [memoStoreFile]: [relabelFile], [uiFile("Other")]: [relabelFile] };
    const { target, kept, piecesOf } = plan({ files, imports, entries: [uiFile("Card"), uiFile("Other")] });
    const named = ["libs/kit/lib/__client/tag.st", "libs/kit/lib/__client/util.st"];
    expect(kept).toEqual([]);
    expect(piecesOf(relabelFile)).toEqual(["apps/demo/lib/__client/tag.fetch"]);
    expect(target.transform(files[relabelFile] ?? "", relabelFile)?.source).toContain(
      'import { st } from "akanjs/store";',
    );
    expect(piecesOf(memoStoreFile)).toEqual(["apps/demo/lib/__client/memo.fetch"]);
    expect(piecesOf(uiFile("Card"))).toEqual([...memoPieces, ...named]);
    expect(piecesOf(uiFile("Other"))).toEqual(named);
    expect(plan({ files, imports, entries: [relabelFile] }).kept).toEqual([relabelFile]);
  });
});

const memoConstant = `import { enumOf, via } from "akanjs/constant";

export const MemoStatus = enumOf("memoStatus", ["draft", "done"] as const);
export class MemoInput extends via((field) => ({ title: field(String), status: field(MemoStatus) })) {}
export class MemoObject extends via(MemoInput, (field) => ({})) {}
export class LightMemo extends via(MemoObject, ["title"] as const, (resolve) => ({})) {}
export class Memo extends via(MemoObject, LightMemo, (resolve) => ({})) {}
`;
const boardConstant = `import { via } from "akanjs/constant";
import { cnst } from "@libs/kit";

export class BoardInput extends via((field) => ({ note: field(cnst.Note) })) {}
export class BoardObject extends via(BoardInput, (field) => ({})) {}
export class LightBoard extends via(BoardObject, [] as const, (resolve) => ({})) {}
export class Board extends via(BoardObject, LightBoard, (resolve) => ({})) {}
`;

describe("the constants a file reads under the per-route runtime", () => {
  let constants: RouteRuntime;
  let constantsOf: (pieces: Set<string>) => RouteRuntime;
  beforeAll(async () => {
    const files = {
      "apps/demo/lib/memo/memo.constant.ts": memoConstant,
      "apps/demo/lib/board/board.constant.ts": boardConstant,
    };
    const { demo } = await runtimeFixtureTables({ demo: files });
    constantsOf = (pieces) =>
      new RouteRuntime(
        root,
        demo,
        pieces,
        (absPath) => files[absPath.slice(`${root}/`.length) as keyof typeof files] ?? null,
      );
    constants = constantsOf(
      piecesOf([...appPieces, "memo.cnst", "board.cnst"], [...kitPieces, "note.cnst", "tag.cnst"]),
    );
  });
  const read = (source: string, file = "apps/demo/ui/Card.tsx") => constants.transform(source, `${root}/${file}`);
  const cnstImports = (...lines: [name: string, specifier: string][]) =>
    lines.map(([name, specifier], index) => `import { ${name} as __akanCnst${index} } from "${specifier}";`).join(" ");

  test("takes each constant from the file declaring it, and a model from its registration piece, which loads first", () => {
    const source = `import { cnst, fetch } from "@apps/demo/client";
export const read = () => [cnst.MemoStatus, cnst.memo, cnst.kit.Note, fetch.memoNote()];
`;
    const result = read(source);
    expect(result?.pieces).toEqual([
      "apps/demo/lib/__client/memo.cnst",
      "libs/kit/lib/__client/note.cnst",
      "apps/demo/lib/__client/memo.fetch",
    ]);
    expect(result?.source).toBe(`${bound(
      ["memo", "@apps/demo/lib/__client/memo.cnst"],
      ["note", "@libs/kit/lib/__client/note.cnst"],
      ["loaded", "@apps/demo/lib/__client/memo.fetch"],
    )} ${cnstImports(
      ["MemoStatus", "../lib/memo/memo.constant"],
      ["memo", "@apps/demo/lib/__client/memo.cnst"],
      ["Note", "../../../libs/kit/lib/note/note.constant"],
    )} import { fetch } from "@apps/demo/lib/usePage"; import type { cnst } from "@apps/demo/client";
export const read = () => [__akanCnst0, __akanCnst1, __akanCnst2, fetch.memoNote()];
`);
  });

  test("takes the names a destructuring of the constants holds, and the whole-runtime file's constants likewise", () => {
    const destructured = read(
      'import { cnst } from "@apps/demo/client";\nconst { MemoStatus, memo } = cnst;\nexport const pick = (value: cnst.Memo) => [MemoStatus, memo, value];\n',
    );
    expect(destructured?.pieces).toEqual(["apps/demo/lib/__client/memo.cnst"]);
    expect(destructured?.source.split("\n").slice(0, 2)).toEqual([
      `${bound(["memo", "@apps/demo/lib/__client/memo.cnst"])} ${cnstImports(
        ["MemoStatus", "../lib/memo/memo.constant"],
        ["memo", "@apps/demo/lib/__client/memo.cnst"],
      )} import type { cnst } from "@apps/demo/client";`,
      'const { MemoStatus, memo } = { "MemoStatus": __akanCnst0, "memo": __akanCnst1 };',
    ]);
    const namespace = read('import * as cnst from "../lib/cnst";\nexport const model = () => cnst.memo;\n');
    expect(namespace?.source).toContain('import type * as cnst from "../lib/cnst";');
    expect(namespace?.source).toContain("export const model = () => __akanCnst0;");
  });

  test("keeps a lib file's constants from the lib, and leaves a constant used only as a type to the type checker", () => {
    expect(
      read('import { cnst } from "@libs/kit/client";\nexport const note = () => cnst.Note;\n', "libs/kit/ui/Note.tsx")
        ?.pieces,
    ).toEqual(["libs/kit/lib/__client/note.cnst"]);
    const typed = 'import { cnst } from "@apps/demo/client";\nexport const same = (value: cnst.Memo) => value;\n';
    expect(read(typed)).toEqual({
      source: typed.replace("import { cnst }", "import type { cnst }"),
      perModule: true,
      pieces: [],
    });
  });

  test.each<[string, string, RuntimeUseReason]>([
    ["a computed member", "export const pick = (name: string) => cnst[name];", "computed-access"],
    ["the constants handed on", "export const names = () => Object.keys(cnst);", "passed-on"],
    ["a spread", "export const all = { ...cnst };", "passed-on"],
    ["a name the scope does not hand out", "export const none = () => cnst.Nope;", "unknown-name"],
    [
      "a rest in a destructuring",
      "const { memo, ...rest } = cnst;\nexport const both = [memo, rest];",
      "hidden-by-destructuring",
    ],
  ])("keeps every constant for %s, and says why", (_, body, reason) => {
    const source = `import { cnst } from "@apps/demo/client";\n${body}\n`;
    expect(read(source)).toEqual({ source, perModule: true, pieces: [], wholeConstants: true });
    expect(constants.wholeConstantReaders).toContain(`${root}/apps/demo/ui/Card.tsx`);
    const { constants: use } = RuntimeUse.analyze({ fileName: "apps/demo/ui/Card.tsx", text: source }, constants.table);
    expect(use.problems.map((problem) => problem.reason)).toEqual([reason]);
  });

  test("takes a lib model a constant file reads from that lib's registration piece, never the barrel's whole constants", () => {
    const result = read(boardConstant, "apps/demo/lib/board/board.constant.ts");
    expect(result?.pieces).toEqual(["libs/kit/lib/__client/note.cnst"]);
    expect(result?.source.split("\n").slice(0, 2)).toEqual([
      `${bound(["note", "@libs/kit/lib/__client/note.cnst"])} ${cnstImports([
        "Note",
        "../../../../libs/kit/lib/note/note.constant",
      ])} import { via } from "akanjs/constant";`,
      'import type { cnst } from "@libs/kit";',
    ]);
    expect(result?.source).toContain("field(__akanCnst0)");
  });

  test("registers a model per page only where a page loading no whole runtime reaches it, and takes it from the constants of every model elsewhere", async () => {
    const files: Record<string, string> = {
      "apps/demo/lib/memo/memo.constant.ts": memoConstant,
      "apps/demo/lib/board/board.constant.ts": boardConstant,
      "apps/demo/lib/__client/memo.cnst.ts":
        'import * as cnst from "../memo/memo.constant";\nexport const memo = cnst;\n',
      "apps/demo/lib/__client/board.cnst.ts":
        'import * as cnst from "../board/board.constant";\nexport const board = cnst;\n',
      "libs/kit/lib/__client/note.cnst.ts":
        'import * as cnst from "../note/note.constant";\nexport const note = cnst;\n',
      "apps/demo/ui/Card.tsx": 'import { cnst } from "@apps/demo/client";\nexport const card = () => cnst.memo;\n',
      "apps/demo/ui/Lone.tsx": 'import { cnst } from "@apps/demo/client";\nexport const lone = () => cnst.board;\n',
    };
    const { demo } = await runtimeFixtureTables({ demo: files });
    const pieces = piecesOf([...appPieces, "memo.cnst", "board.cnst"], [...kitPieces, "note.cnst", "tag.cnst"]);
    const planned = (routes: Record<string, string[]>) => {
      const target = new RouteRuntime(root, demo, pieces, (absPath) => files[absPath.slice(`${root}/`.length)] ?? null);
      const entries = [uiFile("Card"), uiFile("Lone")];
      target.plan({
        importsByModule: new Map(entries.map((entry) => [entry, []])),
        entries,
        entriesByRoute: new Map(Object.entries(routes)),
      });
      return (file: string) => target.transform(files[file] ?? "", `${root}/${file}`);
    };
    const lone = planned({ "/card": [uiFile("Card")] });
    expect(lone("apps/demo/ui/Lone.tsx")?.pieces).toEqual([
      "apps/demo/lib/__client/board.cnst",
      "libs/kit/lib/__client/note.cnst",
    ]);
    expect(lone("apps/demo/lib/__client/memo.cnst.ts")).toBeNull();
    expect(lone("apps/demo/lib/__client/board.cnst.ts")).toEqual({
      source: 'export { board } from "../cnst";\n',
      perModule: true,
      pieces: [],
      wholeConstants: true,
    });
    expect(lone("libs/kit/lib/__client/note.cnst.ts")?.source).toBe('export { note } from "../cnst";\n');
    expect(lone("apps/demo/lib/board/board.constant.ts")).toBeNull();
    const both = planned({ "/card": [uiFile("Card")], "/lone": [uiFile("Lone")] });
    expect(both("apps/demo/lib/__client/board.cnst.ts")).toBeNull();
    expect(both("apps/demo/lib/board/board.constant.ts")?.pieces).toEqual(["libs/kit/lib/__client/note.cnst"]);
    expect(both("libs/kit/lib/__client/note.cnst.ts")).toBeNull();
  });

  test("keeps every constant where a piece it would load was not generated", () => {
    const source = 'import { cnst } from "@apps/demo/client";\nexport const model = () => cnst.memo;\n';
    const withoutMemo = constantsOf(piecesOf([...appPieces, "board.cnst"], [...kitPieces, "note.cnst", "tag.cnst"]));
    expect(withoutMemo.transform(source, `${root}/apps/demo/ui/Card.tsx`)).toEqual({
      source,
      perModule: true,
      pieces: [],
      wholeConstants: true,
    });
  });
});

describe("a file the per-route runtime does not touch", () => {
  const source = 'import { st } from "@apps/demo/client";\nexport const read = () => st.use.draft();\n';

  test.each([
    ["a file outside every app and lib", "pkgs/akanjs/ui/Card.tsx"],
    ["a generated file", "apps/demo/lib/st.ts"],
    ["a generated entry", "apps/demo/.akan/generated/client-entry-bootstrap-route/Card.tsx"],
    ["a hand-kept piece", "apps/demo/lib/__client/memo.st.ts"],
    ["a server-only file", "apps/demo/srvkit/guards.ts"],
    ["a module's constant", "apps/demo/lib/memo/memo.constant.ts"],
    ["a test", "apps/demo/ui/Card.test.tsx"],
  ])("%s", (_, file) => {
    expect(transform(source, file)).toBeNull();
  });

  test("a macro host", () => {
    expect(transform(`import { read } from "./read" with { type: "macro" };\n${source}`)).toBeNull();
  });

  test("a file that does not parse", () => {
    expect(transform(`${source}export const = ;\n`)).toBeNull();
  });
});

describe("a scope's whole runtime file", () => {
  test("is answered from the scope's assembled pieces", () => {
    expect(runtime.redirectOf("/ws/apps/demo/lib/useClient.ts")).toBe('export * from "./__client/_useClient";\n');
    expect(runtime.redirectOf("/ws/apps/demo/lib/st.ts")).toBe('export * from "./__client/_st";\n');
    expect(runtime.redirectOf("/ws/libs/kit/lib/useClient.ts")).toBe('export * from "./__client/_useClient";\n');
  });

  test("is followed by the app's store root when it is a lib's, so an app store keeps its actions over the lib's", () => {
    expect(runtime.redirectOf("/ws/libs/kit/lib/st.ts")).toBe(
      'export * from "./__client/_st";\nimport "/ws/apps/demo/lib/__client/_st.ts";\n',
    );
  });

  test("stays as written where the scope has no assembled piece, and for every other file", () => {
    expect(runtime.redirectOf("/ws/libs/other/lib/st.ts")).toBeNull();
    expect(runtime.redirectOf("/ws/apps/demo/lib/usePage.ts")).toBeNull();
    expect(runtime.redirectOf("/ws/apps/demo/lib/memo/memo.store.ts")).toBeNull();
  });

  test("is imported by absolute path, each piece by a name the importer uses", () => {
    expect(runtime.wholeSource).toBe(`${whole.trim().split("; ").join(";\n")}\n`);
  });
});
