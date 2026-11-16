import { beforeAll, describe, expect, test } from "bun:test";
import { runtimeFixtureTables } from "./runtimeTable.fixture";
import { RuntimeUse, type RuntimeUseOptions, type RuntimeUseVerdict } from "./runtimeUse";

let tableOf: Awaited<ReturnType<typeof runtimeFixtureTables>>["tableOf"];

beforeAll(async () => {
  ({ tableOf } = await runtimeFixtureTables());
});

const appImport = 'import { fetch, sig, st } from "@apps/demo/client";\n';

const summaryOf = (verdict: RuntimeUseVerdict) =>
  verdict.resolvable
    ? [
        ...verdict.owners.map(({ scope, module, needs }) => `${scope}/${module} ${needs}`),
        ...(verdict.base ? ["base"] : []),
      ]
    : `${verdict.reason}: ${verdict.text}`;

const analyze = (text: string, fileName = "apps/demo/ui/Card.tsx", options?: RuntimeUseOptions) =>
  summaryOf(RuntimeUse.analyze({ fileName, text }, tableOf, options));

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

  test("owns a descriptor read by the signal module and a store read by the store module, a lib name by the lib", () => {
    expect(
      analyze(
        `${appImport}export const load = () => [fetch.slice.memoInBoard, sig.note, fetch.memoNote(), st.do.pickLabel("x")];\n`,
      ),
    ).toEqual(["apps/demo/memo descriptor", "apps/demo/note descriptor", "libs/kit/util store"]);
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
    expect(analyze(`${appImport}export const go = () => st.do.setPath("/");\n`)).toEqual(["base"]);
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
    ).toBe("whole-runtime-import: st.do.clearDraft");
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
      tableOf,
    );
    expect(
      verdict.resolvable ? [] : verdict.problems.map(({ reason, line, column }) => `${reason} ${line}:${column}`),
    ).toEqual(["computed-access 2:33", "passed-on 3:36"]);
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
      null,
      null,
    ]);
  });
});
