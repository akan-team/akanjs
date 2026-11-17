import { beforeAll, describe, expect, test } from "bun:test";
import { runtimeFixtureTables } from "../quality/runtimeTable.fixture";
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
    ...pieces.map(([name, specifier], index) => `import { ${name} as __akanLoaded${index} } from "${specifier}";`),
    `__akanLoadedAfter(${pieces.map((_, index) => `__akanLoaded${index}`).join(", ")});`,
  ].join(" ");

const whole = `${bound(["sig", "/ws/apps/demo/lib/__client/_useClient.ts"], ["st", "/ws/apps/demo/lib/__client/_st.ts"])} `;

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
