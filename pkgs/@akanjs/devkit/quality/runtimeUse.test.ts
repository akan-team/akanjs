import { beforeAll, describe, expect, test } from "bun:test";
import { FetchClient } from "akanjs/fetch";
import type { RuntimeNameTable } from "./runtimeNameTable";
import { runtimeFixtureTables, runtimeUploadTable } from "./runtimeTable.fixture";
import { RuntimeUse, type RuntimeUseOptions, type RuntimeUseVerdict } from "./runtimeUse";

let demo: RuntimeNameTable;
let kit: RuntimeNameTable;
let fk: RuntimeNameTable;

beforeAll(async () => {
  ({ demo, kit } = await runtimeFixtureTables());
  fk = await runtimeUploadTable();
});

const ownTableOf = (fileName: string) =>
  fileName.startsWith("apps/demo/") ? demo : fileName.startsWith("libs/kit/") ? kit : null;

const appImport = 'import { fetch, sig, st } from "@apps/demo/client";\n';

const summaryOf = (verdict: RuntimeUseVerdict) =>
  verdict.resolvable
    ? [
        ...verdict.owners.map(({ scope, module, needs }) => `${scope}/${module} ${needs}`),
        ...(verdict.baseStore ? ["base store"] : []),
        ...(verdict.baseDescriptor ? ["base descriptor"] : []),
      ]
    : `${verdict.reason}: ${verdict.text}`;

const analyze = (
  text: string,
  fileName = "apps/demo/ui/Card.tsx",
  options?: RuntimeUseOptions,
  consumer = ownTableOf(fileName),
) => summaryOf(RuntimeUse.analyze({ fileName, text }, consumer, options));

interface UseCase {
  shape: string;
  text: string;
  file?: string;
  expected: string[] | string;
}

const cases: [UseCase, UseCase][] = [
  [
    {
      shape: "a read by a written-out name",
      text: `${appImport}export const Card = () => {
  st.do["clearDraft"]();
  return st.use.draft();
};
`,
      expected: ["apps/demo/memo store"],
    },
    {
      shape: "a read by a name picked at run time",
      text: `${appImport}export const run = (name: string) => st.do[name]();\n`,
      expected: "computed-access: st.do[name]",
    },
  ],
  [
    {
      shape: "destructuring that names each member, nested or renamed",
      text: `${appImport}const { clearDraft, setPinned: pin } = st.do;
const { use: { label } } = st;
export const reset = () => [clearDraft(), pin(false), label()];
`,
      expected: ["apps/demo/memo store", "apps/demo/note store", "libs/kit/util store"],
    },
    {
      shape: "destructuring with a rest element",
      text: `${appImport}const { clearDraft, ...rest } = st.do;\nexport const reset = () => [clearDraft(), rest];\n`,
      expected: "hidden-by-destructuring: ...rest",
    },
  ],
  [
    {
      shape: "a cast of a value read by name",
      text: `${appImport}export const draftOf = () => st.use.draft() as string;\n`,
      expected: ["apps/demo/memo store"],
    },
    {
      shape: "a cast of the runtime object",
      text: `${appImport}export const actions = () => st.do as unknown as Record<string, () => void>;\n`,
      expected: "cast: st.do as unknown",
    },
  ],
  [
    {
      shape: "a handler that reads by name",
      text: `${appImport}export const Save = () => <button onClick={() => st.do.clearDraft()} />;\n`,
      expected: ["apps/demo/memo store"],
    },
    {
      shape: "the runtime object handed to a component",
      text: `${appImport}export const Save = () => <Panel fetch={fetch} />;\n`,
      expected: "passed-on: fetch",
    },
  ],
  [
    {
      shape: "a re-export of a name that is not the runtime",
      text: 'export { usePage } from "@apps/demo/client";\n',
      expected: [],
    },
    {
      shape: "a re-export of the runtime object",
      text: 'export { sig } from "@apps/demo/client";\n',
      expected: "re-exported: sig",
    },
  ],
  [
    {
      shape: "a local alias kept in the file",
      text: `${appImport}const actions = st.do;\nexport const reset = () => actions.clearDraft();\n`,
      expected: ["apps/demo/memo store"],
    },
    {
      shape: "a local alias exported",
      text: `${appImport}export const actions = st.do;\n`,
      expected: "re-exported: actions = st.do",
    },
  ],
  [
    {
      shape: "a name the runtime answers",
      text: `${appImport}export const reset = () => st.do.clearDraft();\n`,
      expected: ["apps/demo/memo store"],
    },
    {
      shape: "a name the runtime does not answer",
      text: `${appImport}export const reset = () => st.do.clearEverything();\n`,
      expected: "unknown-name: st.do.clearEverything",
    },
  ],
  [
    {
      shape: "the store's own methods",
      text: `${appImport}export const reset = () => st.set({ draft: st.get().label });\n`,
      expected: ["apps/demo/memo store", "libs/kit/util store"],
    },
    {
      shape: "a store member that is not a method or a runtime object",
      text: `${appImport}export const reset = () => st.reset();\n`,
      expected: "unknown-name: st.reset",
    },
  ],
  [
    {
      shape: "a named import from the runtime",
      text: `${appImport}export const reset = () => st.do.clearDraft();\n`,
      expected: ["apps/demo/memo store"],
    },
    {
      shape: "the runtime import that reaches past module names",
      text: 'import { runtime } from "@apps/demo/client";\nexport const reset = () => runtime.st;\n',
      expected: "unknown-name: runtime",
    },
  ],
  [
    {
      shape: "a type-only import of the root store",
      text: 'import type { RootStore } from "@apps/demo/client";\nexport let root: RootStore | null = null;\n',
      expected: [],
    },
    {
      shape: "the store barrel read as a value",
      text: 'import { store } from "@apps/demo/client";\nexport const memoStore = () => store.memo;\n',
      expected: "whole-runtime-import: store",
    },
  ],
  [
    {
      shape: "a named import of the client barrel",
      text: `${appImport}export const reset = () => st.do.clearDraft();\n`,
      expected: ["apps/demo/memo store"],
    },
    {
      shape: "a namespace import of the client barrel",
      text: 'import * as client from "@apps/demo/client";\nexport const reset = () => client.st.do.clearDraft();\n',
      expected: "whole-runtime-import: client",
    },
  ],
  [
    {
      shape: "a static import of the client barrel",
      text: `${appImport}export const reset = () => st.do.clearDraft();\n`,
      expected: ["apps/demo/memo store"],
    },
    {
      shape: "a dynamic import of the client barrel",
      text: 'export const load = () => import("@apps/demo/client");\n',
      expected: 'whole-runtime-import: import("@apps/demo/client")',
    },
  ],
  [
    {
      shape: "a write whose keys are written out, through branches, spreads and an updater",
      text: `${appImport}export const save = (pin: boolean) => {
  st.set({ draft: "", ...(pin ? { pinned: true } : {}) });
  st.set((state) => ({ draft: state.draft.trim() }));
};
`,
      expected: ["apps/demo/memo store", "apps/demo/note store"],
    },
    {
      shape: "a write of an object built elsewhere",
      text: `${appImport}export const save = (patch: object) => st.set(patch);\n`,
      expected: "computed-access: patch",
    },
  ],
  [
    {
      shape: "a selector written inline",
      text: `${appImport}export const Draft = () => {
  const draft = st.sel((state) => state.draft);
  st.sub((state) => state.pinned, (pinned) => pinned);
  return draft;
};
`,
      expected: ["apps/demo/memo store", "apps/demo/note store"],
    },
    {
      shape: "a selector defined elsewhere",
      text: `${appImport}const pick = (state: { draft: string }) => state.draft;\nexport const Draft = () => st.sel(pick);\n`,
      expected: "passed-on: pick",
    },
  ],
  [
    {
      shape: "a cast to the root store, read by name",
      file: "apps/demo/lib/memo/memoDraft.ts",
      text: `import type { RootStore } from "../st";

export const resetDraft = (self: unknown) => {
  const root = self as RootStore;
  root.clearDraft();
  return root.get().pinned;
};
`,
      expected: ["apps/demo/memo store", "apps/demo/note store"],
    },
    {
      shape: "the root store used as a value",
      file: "apps/demo/lib/memo/memoDraft.ts",
      text: 'import { RootStore } from "../st";\n\nexport const make = () => new RootStore();\n',
      expected: "whole-runtime-import: RootStore",
    },
  ],
  [
    {
      shape: "a const alias read in a function declared above it",
      text: `${appImport}export const save = () => actions.clearDraft();\nconst actions = st.do;\n`,
      expected: ["apps/demo/memo store"],
    },
    {
      shape: "a reassignable alias",
      text: `${appImport}let actions = st.do;\nexport const save = () => actions.clearDraft();\n`,
      expected: "passed-on: actions = st.do",
    },
  ],
  [
    {
      shape: "a parameter that shadows the runtime name",
      text: `${appImport}export const run = (st: Record<string, () => void>, name: string) => st[name]?.();\n`,
      expected: [],
    },
    {
      shape: "the runtime name itself read by a computed key",
      text: `${appImport}export const run = (name: "do" | "use") => st[name];\n`,
      expected: "computed-access: st[name]",
    },
  ],
];

describe("RuntimeUse.analyze", () => {
  for (const [resolvable, whole] of cases)
    test(`resolves ${resolvable.shape}, and loads the whole runtime for ${whole.shape}`, () => {
      expect(analyze(resolvable.text, resolvable.file)).toEqual(resolvable.expected);
      expect(analyze(whole.text, whole.file)).toEqual(whole.expected);
    });

  test("owns a slice, a signal handle and a store name by the store module, a lib name by the lib", () => {
    expect(
      analyze(
        `${appImport}export const load = () => [fetch.slice.memoInBoard, sig.note.refName, fetch.memoNote(), st.do.pickLabel("x")];\n`,
      ),
    ).toEqual(["apps/demo/memo store", "apps/demo/note store", "libs/kit/util store"]);
    expect(analyze(`${appImport}export const count = () => [fetch.memoNote(), st.use.memo()];\n`)).toEqual([
      "apps/demo/memo store",
    ]);
  });

  test("answers a name of the scope that loads the file, the framework's own names with no owner", () => {
    const count = "export const count = () => st.use.noteCount();\n";
    expect(analyze(`${appImport}${count}`)).toEqual(["apps/demo/note store"]);
    expect(analyze(`import { st } from "@libs/kit/client";\n${count}`, "libs/kit/ui/Count.tsx")).toEqual([
      "libs/kit/note store",
    ]);
    expect(analyze(`import { st } from "akanjs/store";\n${count}`)).toEqual(["apps/demo/note store"]);
    expect(analyze(`${appImport}export const go = () => st.do.setPath("/");\n`)).toEqual(["base store"]);
  });

  test("tells the framework's own store keys, which every page has, from its own descriptors", () => {
    expect(analyze(`${appImport}export const a = () => st.use.theme();\n`)).toEqual(["base store"]);
    expect(analyze(`${appImport}export const a = () => fetch.ping();\n`)).toEqual(["base descriptor"]);
    expect(analyze(`${appImport}export const a = () => [st.do.setTheme("dark"), fetch.ping()];\n`)).toEqual([
      "base store",
      "base descriptor",
    ]);
  });

  test("needs a module's store for every fetch value that framework UI drives the store with", () => {
    const remove =
      '"use client";\nimport { fetch } from "@apps/demo/client";\nimport { Model } from "akanjs/ui";\nexport const Remove = ({ memoId }: { memoId: string }) => <Model.Remove modelId={memoId} slice={fetch.slice.memoInBoard}>x</Model.Remove>;\n';
    expect(analyze(remove)).toEqual(["apps/demo/memo store"]);
    expect(
      [
        "fetch.slice.memoInBoard",
        "fetch.initMemoInBoard()",
        "fetch.getMemoInitInBoard()",
        "fetch.memoListInBoard()",
        "fetch.memoInsightInBoard()",
        "fetch.subscribeMemoLiveInBoard(() => undefined)",
        "fetch.viewMemo(id)",
        "fetch.getMemoView(id)",
        "fetch.editMemo(id)",
        "fetch.getMemoEdit(id)",
        "fetch.serializedSignal.memo",
        "sig.memo.refName",
        "sig.memo.fetch.memoNote()",
      ].map((use) => analyze(`${appImport}export const a = (id: string) => ${use};\n`)),
    ).toEqual(Array(13).fill(["apps/demo/memo store"]));
  });

  test("needs only a module's descriptor for a plain endpoint, a generated read or write, and a socket", () => {
    expect(
      [
        "fetch.memoNote()",
        "fetch.memoTyping(true)",
        "fetch.listenMemoTyping(() => undefined)",
        "fetch.memo(id)",
        "fetch.lightMemo(id)",
        "fetch.createMemo({})",
        "fetch.updateMemo(id, {})",
        "fetch.mergeMemo(id, {})",
      ].map((use) => analyze(`${appImport}export const a = (id: string) => ${use};\n`)),
    ).toEqual(Array(8).fill(["apps/demo/memo descriptor"]));
  });

  test("reads the fetch client's own members as no module's name, and the ones a name is picked through as the whole runtime", () => {
    const own = [
      "ws",
      "http",
      "origin",
      "jwt",
      "logger",
      "setJwt",
      "setTimeout",
      "connect",
      "connectOnUse",
      "disconnect",
    ];
    expect(own.map((member) => analyze(`${appImport}export const a = fetch.${member};\n`))).toEqual(
      Array(own.length).fill([]),
    );
    expect(analyze(`${appImport}export const a = () => fetch.configureWs({});\n`)).toEqual([]);
    expect(analyze(`${appImport}export const a = () => [fetch.ws, fetch.memoNote()];\n`)).toEqual([
      "apps/demo/memo descriptor",
    ]);
    for (const member of ["handler", "instance", "clone"])
      expect(analyze(`${appImport}export const a = fetch.${member};\n`)).toBeString();
    const methods = Object.getOwnPropertyNames(FetchClient.prototype).filter((name) => name !== "constructor");
    const picking = ["ownSerializedSignal", "applySignal", "clone"];
    expect(methods.filter((name) => !picking.includes(name) && !own.includes(name))).toEqual(["configureWs"]);
  });

  test("needs the file-upload module's descriptor for an upload, which reads it as it runs", () => {
    expect(
      analyze(
        'import { fetch, st } from "@libs/fk/client";\nexport const up = (files: File[]) => [st.do.uploadImageOnUser(files), fetch.addUserFiles(files)];\n',
        "libs/fk/ui/Upload.tsx",
        undefined,
        fk,
      ),
    ).toEqual(["libs/fk/file descriptor", "libs/fk/user store"]);
  });

  test("loads the whole runtime when a spread argument hides which argument lands where", () => {
    expect(
      [
        "st.sub((s, prev) => prev.memoForm.content.length, ...([] as []))",
        "st.sel(...([(s: { draft: string }) => s.draft] as const))",
        "st.ref(...([(s: { draft: string }) => s.draft] as const))",
        "st.set(...([{ draft: '' }] as const))",
      ].map((use) => analyze(`${appImport}export const a = () => ${use};\n`).slice(0, 15)),
    ).toEqual(Array(4).fill("computed-access"));
    expect(
      analyze(
        'import { store } from "akanjs/store";\n\nexport class MemoStore extends store("memo" as const, () => ({ draft: "" })) {\n  read() {\n    return this.pick(...(["draft"] as const));\n  }\n}\n',
        "apps/demo/lib/memo/memo.store.ts",
      ).slice(0, 15),
    ).toBe("computed-access");
  });

  test("leaves the global fetch, an agentic member and a file with no runtime import alone", () => {
    expect(analyze(`${appImport}export const ping = () => globalThis.fetch("/ping").then(() => st.tool);\n`)).toEqual(
      [],
    );
    expect(analyze('export const ping = () => fetch("/ping");\n')).toEqual([]);
  });

  test("loads the whole runtime of a scope with no generated runtime, and for a bare import of one", () => {
    expect(
      analyze(
        'import { st } from "@apps/other/client";\nexport const reset = () => st.do.clearDraft();\n',
        "apps/other/ui/X.tsx",
      ),
    ).toBe('whole-runtime-import: "@apps/other/client"');
    expect(analyze('import "@apps/demo/client";\n')).toBe('whole-runtime-import: import "@apps/demo/client";');
  });

  test("resolves a specifier the caller maps to a runtime, and reports every problem in source order", () => {
    const runtimeOf = (specifier: string) =>
      specifier === "~/client" ? { scope: "apps/demo", kind: "client" as const } : null;
    expect(
      analyze('import { st } from "~/client";\nexport const reset = () => st.do.clearDraft();\n', undefined, {
        runtimeOf,
      }),
    ).toEqual(["apps/demo/memo store"]);
    const verdict = RuntimeUse.analyze(
      {
        fileName: "apps/demo/ui/Card.tsx",
        text: `${appImport}export const a = (k: string) => st.do[k];\nexport const b = () => <Panel sig={sig} />;\n`,
      },
      demo,
    );
    expect(
      verdict.resolvable ? [] : verdict.problems.map(({ reason, line, column }) => `${reason} ${line}:${column}`),
    ).toEqual(["computed-access 2:33", "passed-on 3:36"]);
  });

  test("follows the framework's own fetch and sig as it follows the scope's", () => {
    expect(
      analyze(
        'import { st } from "@apps/demo/client";\nimport { fetch as f } from "akanjs/client";\nexport const x = () => [st.use.draft(), f.noteCount()];\n',
      ),
    ).toEqual(["apps/demo/memo store", "apps/demo/note descriptor"]);
    expect(analyze('import { sig as s } from "akanjs/client";\nexport const ref = () => s.memo.refName;\n')).toEqual([
      "apps/demo/memo store",
    ]);
  });

  test("follows a store's `this` only as itself or through the sanctioned cast to its RootStore", () => {
    const file = "apps/demo/lib/memo/memo.store.ts";
    const storeOf = (body: string, head = 'import type { RootStore } from "../st";\n') =>
      analyze(
        `import { store } from "akanjs/store";\n${head}import { sig } from "../useClient";\n\nexport class MemoStore extends store(sig.memo, () => ({ draft: "" })) {\n${body}\n}\n`,
        file,
      );
    expect(
      storeOf(
        "  clearDraft() {\n    this.set({ draft: '' });\n    (this as unknown as RootStore).setPinned(true);\n  }",
      ),
    ).toEqual(["apps/demo/memo store", "apps/demo/note store"]);
    const memoOnly = ["apps/demo/memo store"];
    const mergeOf = (write: string, head?: string) =>
      storeOf(
        `  #recount = (state: { draft: string; pinned: boolean }) => {\n    state.draft = String(state.pinned);\n  };\n  merge(patch: { draft: string }, ready: boolean) {\n    ${write};\n  }`,
        head,
      );
    expect(
      [
        "this.set({ ...patch })",
        "this.set({ ...(ready ? patch : { draft: '' }) })",
        "this.set({ ...patch, draft: '' })",
      ].map((write) => mergeOf(write)),
    ).toEqual([memoOnly, memoOnly, memoOnly]);
    expect(mergeOf("this.set((state) => {\n      state.draft = String(state.pinned);\n    })")).toEqual([
      "apps/demo/memo store",
      "apps/demo/note store",
    ]);
    const recount =
      'import type { RootStore } from "../st";\nconst recount = (state: { draft: string; pinned: boolean }) => {\n  state.draft = String(state.pinned);\n};\nconst build = () => recount;\n';
    expect(
      [
        "this.set(patch)",
        "this.set(recount)",
        "this.set(this.#recount)",
        "this.set(build())",
        "this.set(ready ? { draft: '' } : patch)",
        "this.set(ready && recount)",
        "this.set(() => patch)",
      ].map((write) => mergeOf(write, recount)),
    ).toEqual([
      "computed-access: patch",
      "computed-access: recount",
      "computed-access: this.#recount",
      "computed-access: build()",
      "computed-access: patch",
      "computed-access: recount",
      "computed-access: patch",
    ]);
    expect(
      [
        "(this as unknown as RootStore).set({ ...patch })",
        "(this as unknown as RootStore).set(patch)",
        "this.set({ [key]: '' })",
      ].map((write) => storeOf(`  merge(patch: { draft: string }, key: string) {\n    ${write};\n  }`)),
    ).toEqual([expect.any(String), expect.any(String), expect.any(String)]);
    expect(analyze(`${appImport}export const a = (patch: object) => st.set({ ...patch });\n`)).toBeString();
    expect(storeOf("  pin() {\n    this.setPinned(true);\n  }")).toEqual([
      "apps/demo/memo store",
      "apps/demo/note store",
    ]);
    expect([
      storeOf("  pin() {\n    (this as any).setPinned(true);\n  }"),
      storeOf(
        "  pin() {\n    (this as unknown as Root).setPinned(true);\n  }",
        'import type { RootStore } from "../st";\ntype Root = RootStore;\n',
      ),
      storeOf("  pin() {\n    (this as unknown as RootStore & {}).setPinned(true);\n  }"),
      storeOf(
        "  pin() {\n    (this as unknown as RootStore).setPinned(true);\n  }",
        'import type { RootStore } from "akanjs/store";\n',
      ),
      storeOf(
        "  pin() {\n    (this as unknown as RootStore).setPinned(true);\n  }",
        'import type { RootStore } from "./root";\n',
      ),
      storeOf("  pin() {\n    pin(this);\n  }"),
      storeOf("  pin() {\n    return (this.get() as any).pinned;\n  }"),
      storeOf("  static pin() {\n    return this.name;\n  }"),
      storeOf("  pin() {\n    return this.pinEverything();\n  }"),
    ]).toEqual([
      "cast: this as any",
      "cast: this as unknown",
      "cast: this as unknown",
      "cast: this as unknown",
      "cast: this as unknown",
      "passed-on: this",
      "cast: this.get() as any",
      "unknown-name: this",
      "unknown-name: this.pinEverything",
    ]);
  });

  test("reads a runtime import written with an extension, an index or a specifier the caller maps", () => {
    expect(analyze('import { st } from "@apps/demo/client.js";\nexport const r = () => st.do.clearDraft();\n')).toEqual(
      ["apps/demo/memo store"],
    );
    expect(
      analyze(
        'import { fetch } from "../useClient.js";\nexport const r = () => fetch.memoNote();\n',
        "apps/demo/lib/memo/memoNote.ts",
      ),
    ).toEqual(["apps/demo/memo descriptor"]);
    const runtimeOf = (specifier: string) =>
      specifier === "#app" ? { scope: "apps/demo", kind: "client" as const } : null;
    expect(
      analyze('import { st } from "#app";\nexport const r = () => st.do.clearDraft();\n', undefined, { runtimeOf }),
    ).toEqual(["apps/demo/memo store"]);
  });

  test("follows an alias chain to its end, however many aliases sit below their use", () => {
    expect(
      analyze(`${appImport}export const run = () => {
  const inner = () => y6.clearEverything();
  return inner();
};
const y6 = y5;
const y5 = y4;
const y4 = y3;
const y3 = y2;
const y2 = y1;
const y1 = st.do;
`),
    ).toBe("unknown-name: y6.clearEverything");
  });

  test("loads the whole runtime for a reach it cannot follow, and follows a name a method parameter does not hide", () => {
    expect(analyze('export const n = () => require("@apps/demo/client").fetch.noteCount();\n')).toBe(
      'whole-runtime-import: require("@apps/demo/client")',
    );
    expect(
      analyze(`${appImport}export const Pinned = () => st.sel(function () {\n  return arguments[0].pinned;\n});\n`),
    ).toBe("hidden-by-destructuring: arguments");
    expect(
      analyze(`${appImport}export class Pins {\n  [st.do.setPinned.name](st: unknown) {\n    return st;\n  }\n}\n`),
    ).toEqual(["apps/demo/note store"]);
    expect(analyze('import {} from "@apps/demo/client";\n')).toBe(
      'whole-runtime-import: import {} from "@apps/demo/client";',
    );
  });

  test("answers a lib file's names from the scope that loads it, and refuses a runtime that scope does not load", () => {
    const file = "libs/kit/ui/AddNote.tsx";
    const text =
      'import { fetch, st } from "../client";\nexport const add = () => [st.do.createNote(), fetch.tagCount()];\n';
    expect(analyze(text, file, undefined, demo)).toEqual(["apps/demo/note store", "libs/kit/tag descriptor"]);
    expect(analyze(text, file, undefined, kit)).toEqual(["libs/kit/note store", "libs/kit/tag descriptor"]);
    expect(analyze('import { st } from "@apps/demo/client";\nexport const a = () => st.do.clearDraft();\n', file)).toBe(
      'whole-runtime-import: "@apps/demo/client"',
    );
    expect(analyze(text, file, undefined, null)).toBe('whole-runtime-import: "../client"');
  });

  test("loads the whole runtime for every reach past a named import", () => {
    expect(
      [
        'export * from "@apps/demo/client";\n',
        'export * as client from "@apps/demo/client";\n',
        'export { RootStore } from "@apps/demo/client";\n',
        'import client = require("@apps/demo/client");\n',
        "export const load = (name: string) => import(name);\n",
        "const load = require;\nexport const n = () => load('x');\n",
        'export const n = () => import.meta.require("@apps/demo/lib/useClient");\n',
        'export const n = () => globalThis["require"]("@apps/demo/client");\n',
        'export const worker = () => new Worker("@apps/demo/client");\n',
        'import { st as root } from "akanjs/store/baseSt";\nexport const n = () => root;\n',
        'import { StoreRegistry } from "akanjs/store";\nexport const n = () => StoreRegistry.build;\n',
        'import * as framework from "akanjs/store";\nexport const n = () => framework.StoreRegistry;\n',
        'import { RootStore } from "../st";\nexport const n = (self: unknown) => (self as RootStore).clearDraft();\n',
        'import { runtime } from "@apps/demo/lib/usePage";\nexport const n = () => runtime;\n',
        'import { memo } from "../st";\nexport const n = () => memo;\n',
      ].map((text) => analyze(text, "apps/demo/lib/memo/memoLoad.ts")),
    ).toEqual([
      're-exported: export * from "@apps/demo/client";',
      're-exported: export * as client from "@apps/demo/client";',
      "re-exported: RootStore",
      'whole-runtime-import: import client = require("@apps/demo/client");',
      "whole-runtime-import: import(name)",
      "whole-runtime-import: require",
      'whole-runtime-import: import.meta.require("@apps/demo/lib/useClient")',
      'whole-runtime-import: globalThis["require"]("@apps/demo/client")',
      'whole-runtime-import: "@apps/demo/client"',
      "whole-runtime-import: st as root",
      "whole-runtime-import: StoreRegistry",
      "whole-runtime-import: framework.StoreRegistry",
      "whole-runtime-import: RootStore",
      "unknown-name: runtime",
      "whole-runtime-import: memo",
    ]);
  });

  test("follows a namespace of the framework, a signal handed to its store, and a function typed to the root store", () => {
    const head = 'import * as framework from "akanjs/client";\nimport { store } from "akanjs/store";\n';
    expect(
      analyze(
        `${head}import type { RootStore } from "../st";
import { sig } from "../useClient";
export class Draft extends store(sig.memo, () => ({ draftOf: "" })) {}
export function pin(this: RootStore) {
  this.setPinned(this.pick("draft").draft === "");
}
export const n = () => [framework.fetch.memoNote(), framework.cn, sig.note.fetch.noteCount()];
`,
        "apps/demo/lib/memo/memoPin.ts",
      ),
    ).toEqual(["apps/demo/memo store", "apps/demo/note store"]);
    expect(analyze('import { sig } from "@apps/demo/client";\nexport const n = () => sig.memo.fetch;\n')).toBe(
      "passed-on: sig.memo.fetch",
    );
  });

  test("leaves `this` alone outside a store class, and loads the whole runtime when a store file's helper may be the store", () => {
    expect(
      analyze(
        `${appImport}export class Timer {\n  tick() {\n    return this.anything();\n  }\n}\nexport const n = () => st.do.clearDraft();\n`,
      ),
    ).toEqual(["apps/demo/memo store"]);
    expect(
      analyze(
        'import { store } from "akanjs/store";\n\nfunction pinAll(this: { setPinned: (pin: boolean) => void }) {\n  this.setPinned(true);\n}\n\nexport class MemoStore extends store("memo" as const, () => ({ draft: "" })) {\n  pinAll = pinAll;\n}\n',
        "apps/demo/lib/memo/memo.store.ts",
      ),
    ).toBe("passed-on: this");
    expect(
      analyze(
        'import { store } from "akanjs/store";\n\nexport class MemoStore extends store("memo" as const, () => ({ draft: "" })) {\n  reset() {\n    super.set({ draft: "" });\n    return [this.reset, this.slice.memoInBoard];\n  }\n}\n',
        "apps/demo/lib/memo/memo.store.ts",
      ),
    ).toEqual(["apps/demo/memo store"]);
  });

  test("reads the generated runtime pieces as the whole runtime and `st` from the page runtime as the scope's `st`", () => {
    const file = "apps/demo/lib/memo/memoDraft.ts";
    expect(
      [
        'import { st } from "../__client/_st";\nexport const n = () => st.do.clearDraft();\n',
        'import { fetch } from "../__client/_useClient";\nexport const n = () => fetch.memoNote();\n',
        'import { memo } from "../__client/memo.st";\nexport const n = () => memo;\n',
        'import "../__client/memo.fetch";\nexport const n = () => 1;\n',
        'import "../__client/_base.fetch";\nexport const n = () => 1;\n',
      ].map((text) => analyze(text, file)),
    ).toEqual([
      "whole-runtime-import: st",
      "whole-runtime-import: fetch",
      "whole-runtime-import: memo",
      'whole-runtime-import: import "../__client/memo.fetch";',
      'whole-runtime-import: import "../__client/_base.fetch";',
    ]);
    expect(
      analyze(
        'import type { RootStore } from "../__client/_st";\n\nexport const reset = (self: unknown) => (self as RootStore).clearDraft();\n',
        file,
      ),
    ).toEqual(["apps/demo/memo store"]);
    const read = "export const n = () => [st.do.clearDraft(), st.use.theme()];\n";
    expect(analyze(`import { st } from "@apps/demo/lib/usePage";\n${read}`)).toEqual(
      analyze(`import { st } from "@apps/demo/client";\n${read}`),
    );
    expect(analyze(`import { st } from "@apps/demo/lib/usePage";\n${read}`)).toEqual([
      "apps/demo/memo store",
      "base store",
    ]);
  });

  test("reads the scope and runtime kind of an import specifier", () => {
    const file = "apps/demo/lib/memo/Memo.Zone.tsx";
    expect(
      [
        "../useClient",
        "../st.ts",
        "@libs/kit/client",
        "@apps/demo/lib/usePage",
        "akanjs/store",
        "akanjs/client",
        "./client",
      ].map((specifier) => RuntimeUse.targetOf(specifier, file)),
    ).toEqual([
      { scope: "apps/demo", kind: "useClient" },
      { scope: "apps/demo", kind: "st" },
      { scope: "libs/kit", kind: "client" },
      { scope: "apps/demo", kind: "usePage" },
      { scope: "apps/demo", kind: "framework-store" },
      { scope: "apps/demo", kind: "framework-client" },
      null,
    ]);
  });
});
