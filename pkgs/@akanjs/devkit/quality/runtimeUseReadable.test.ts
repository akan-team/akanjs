import { beforeAll, describe, expect, test } from "bun:test";
import type { RuntimeNameEntry, RuntimeNameTable } from "./runtimeNameTable";
import { runtimeFixtureTables } from "./runtimeTable.fixture";
import { RuntimeUse, type RuntimeUseVerdict } from "./runtimeUse";

let demo: RuntimeNameTable;
let kit: RuntimeNameTable;

beforeAll(async () => {
  ({ demo, kit } = await runtimeFixtureTables());
});

const head = 'import { fetch, st } from "@apps/demo/client";\n';
const sliceHead = `import { capitalize } from "akanjs/common";\nimport type { SliceMeta } from "akanjs/fetch";\n${head}`;
const memo = ["apps/demo/memo store"];
const memoAndNote = ["apps/demo/memo store", "apps/demo/note store"];

const summaryOf = (verdict: RuntimeUseVerdict) =>
  verdict.resolvable
    ? verdict.owners.map(({ scope, module, needs }) => `${scope}/${module} ${needs}`)
    : `${verdict.reason}: ${verdict.text}`;

const analyze = (text: string, fileName = "apps/demo/ui/Card.tsx", table: RuntimeNameTable = demo) =>
  summaryOf(RuntimeUse.analyze({ fileName, text }, table));

const storeOf = (body: string, lead = "") =>
  analyze(
    `import { store } from "akanjs/store";\nimport { sig } from "../useClient";\n${lead}\nexport class MemoStore extends store(sig.memo, () => ({ draft: "" })) {\n${body}\n}\n`,
    "apps/demo/lib/memo/memo.store.ts",
  );

describe("RuntimeUse.analyze, names read through a cast", () => {
  test("reads a name written after a cast as it reads it with no cast", () => {
    const loose = "{ [key: string]: () => unknown }";
    expect([
      analyze(`${head}export const a = () => (st.use as unknown as ${loose}).draft();\n`),
      analyze(`${head}const use = st.use as ${loose};\nexport const a = () => use.draft();\n`),
      analyze(`${head}export const a = () => {\n  const { draft } = st.get() as unknown as { draft: string };\n};\n`),
      analyze(`${head}export const a = () => (st.do satisfies object).clearDraft();\n`),
      analyze(`${head}export const a = () => st.do!.clearDraft();\n`),
      analyze(`${head}export const a = () => (<any>st.do).clearDraft();\n`, "apps/demo/webkit/clear.ts"),
      analyze(`${head}export const a = () => (st.get() as any).pinned;\n`),
    ]).toEqual([memo, memo, memo, memo, memo, memo, ["apps/demo/note store"]]);
    expect(
      analyze(`${head}export const a = () => (fetch as unknown as { memoNote: () => void }).memoNote();\n`),
    ).toEqual(["apps/demo/memo descriptor"]);
  });

  test("reads the framework's fetch cast to the app's as the app's, and a store's state read taken off it once", () => {
    expect(
      analyze(
        'import { fetch as runtimeFetch } from "akanjs/client";\nimport type { fetch } from "@apps/demo/client";\nconst live = runtimeFetch as unknown as typeof fetch;\nexport const a = () => live.memoNote();\n',
      ),
    ).toEqual(["apps/demo/memo descriptor"]);
    expect(
      analyze(
        `${head}const get = st.get as unknown as <T>() => { [key: string]: T };\nexport const a = () => get<string>().draft;\n`,
      ),
    ).toEqual(memo);
    expect(analyze(`${head}const get = st.get;\nexport const a = (run: (get: unknown) => void) => run(get);\n`)).toBe(
      "passed-on: get",
    );
  });

  test("keeps the whole runtime for every read a cast does not make visible", () => {
    expect([
      analyze(`${head}export const a = (name: string) => (st.use as any)[name]();\n`),
      analyze(`${head}export const a = () => (fetch as unknown as { notThere: () => void }).notThere();\n`),
      analyze(`${head}export const a = () => ({ ...(st.do as object) });\n`),
      analyze(`${head}export const a = (run: (all: unknown) => void) => run(st.do as any);\n`),
      analyze(`${head}export const a = () => (st as any).everything;\n`),
      analyze(`${head}export const a = () => (st.get() as any).nothing;\n`),
    ]).toEqual([
      "computed-access: (st.use as any)[name]",
      "unknown-name: (fetch as unknown as { notThere: () => void }).notThere",
      "passed-on: (st.do as object)",
      "passed-on: st.do as any",
      "unknown-name: (st as any).everything",
      "unknown-name: (st.get() as any).nothing",
    ]);
  });
});

describe("RuntimeUse.analyze, a key asserted as a name", () => {
  test("reads a computed key asserted as a name, directly or through a const, as that name", () => {
    expect([
      analyze(`${head}export const a = (key: string) => st.use[key as "draft"]();\n`),
      analyze(`${head}export const a = (key: string) => st.use[<"draft">key]();\n`, "apps/demo/webkit/draft.ts"),
      analyze(
        `${head}export const a = (name: string) => {\n  const key = name.replace("x", "draft") as "draft";\n  return st.get()[key];\n};\n`,
      ),
      analyze(`${head}const key = "draft";\nexport const a = () => st.use[key]();\n`),
      analyze(`${head}export const a = (key: string) => st.slice[key as "memoInBoard"].use.memoList();\n`),
    ]).toEqual([memo, memo, memo, memo, memo]);
    expect(analyze(`${head}export const a = (key: string) => st.use[key as "draft" | "pinned"]();\n`)).toEqual(
      memoAndNote,
    );
  });

  test("reads an asserted key of a destructuring, a state write and a pick in a store", () => {
    const key = '    const key = slice.replace("x", "pinned") as "pinned";\n';
    expect([
      storeOf(`  show(slice: string) {\n${key}    const { [key]: value } = this.get();\n    return value;\n  }`),
      storeOf(`  show(slice: string) {\n${key}    this.set({ [key]: true });\n  }`),
      storeOf(`  show(slice: string) {\n${key}    return this.pick(key);\n  }`),
    ]).toEqual([memoAndNote, memoAndNote, memoAndNote]);
  });

  test("reports an asserted name the runtime does not have, and keeps the whole runtime for a key nothing asserts", () => {
    expect([
      analyze(`${head}export const a = (key: string) => st.use[key as "nothing"]();\n`),
      analyze(`${head}export const a = (key: string) => st.use[key as string]();\n`),
      analyze(
        `${head}export const a = (key: string) => {\n  let name = key as "draft";\n  return st.use[name]();\n};\n`,
      ),
      analyze(`${head}export const a = (key: string) => st[key as "do" | "use"];\n`),
      storeOf("  show(key: string) {\n    const { [key]: value } = this.get();\n    return value;\n  }"),
      storeOf("  show(key: string) {\n    this.set({ [key]: true });\n  }"),
    ]).toEqual([
      'unknown-name: st.use[key as "nothing"]',
      "computed-access: st.use[key as string]",
      "computed-access: st.use[name]",
      'computed-access: st[key as "do" | "use"]',
      "hidden-by-destructuring: [key]: value",
      "computed-access: [key]: true",
    ]);
  });
});

describe("RuntimeUse.analyze, a name built from a slice the function is handed", () => {
  const props = "interface Props {\n  className?: string;\n  slice: SliceMeta;\n}\n";

  test("reads a name built from the sliceName or refName of a slice parameter, loading nothing the slice brought", () => {
    expect([
      analyze(
        `${sliceHead}${props}export const Search = ({ slice }: Props) => {\n  const { sliceName } = slice;\n  const use = st.use as unknown as { [key: string]: () => unknown };\n  return () => use[\`queryArgsOf\${capitalize(sliceName)}\`]();\n};\n`,
      ),
      analyze(
        `${sliceHead}export const More = ({ slice }: { slice?: SliceMeta }) => {\n  const SliceName = capitalize(slice.sliceName);\n  return (st.do as any)["loadMoreOf" + SliceName]();\n};\n`,
      ),
      analyze(`${sliceHead}export const sliceOf = (slice: SliceMeta | null) => st.slice[slice.sliceName];\n`),
      analyze(
        `${sliceHead}type Handed = SliceMeta & { title: string };\nexport const uploadOf = (slice: Handed) => (fetch as any)[\`add\${capitalize(slice.refName)}Files\`];\n`,
      ),
    ]).toEqual([[], [], [], []]);
    expect(
      analyze(
        `import { capitalize } from "akanjs/common";\nimport type { SliceMeta } from "akanjs/fetch";\nimport { fetch } from "@libs/kit/client";\nexport const uploadOf = (slice: SliceMeta) => (fetch as any)[\`add\${capitalize(slice.sliceName)}Files\`];\n`,
        "libs/kit/ui/upload.ts",
        kit,
      ),
    ).toEqual([]);
  });

  test("keeps the whole runtime where the name's parts are not one handed slice's", () => {
    const built = `st.use[\`queryArgsOf\${capitalize(sliceName)}\`]`;
    const read = `  return ${built}();\n};\n`;
    expect([
      analyze(`${sliceHead}export const a = (sliceName: string) => {\n${read}`),
      analyze(
        `${sliceHead}export const a = (slice: { sliceName: string }) => {\n  const { sliceName } = slice;\n${read}`,
      ),
      analyze(
        `import { capitalize } from "akanjs/common";\nimport type { SliceMeta } from "./slice";\n${head}export const a = (slice: SliceMeta) => {\n  const { sliceName } = slice;\n${read}`,
      ),
      analyze(
        `import type { SliceMeta } from "akanjs/fetch";\n${head}const capitalize = (text: string) => text;\nexport const a = (slice: SliceMeta) => {\n  const { sliceName } = slice;\n${read}`,
      ),
      analyze(
        `${sliceHead}export const a = (slice: SliceMeta) => {\n  const { sliceName = "memoInBoard" } = slice;\n${read}`,
      ),
      analyze(`${sliceHead}export const a = (slice: SliceMeta) => {\n  let { sliceName } = slice;\n${read}`),
      analyze(
        `${sliceHead}export const a = (one: SliceMeta, other: SliceMeta) => st.use[\`\${one.refName}ListIn\${other.sliceName}\`]();\n`,
      ),
      analyze(
        `${sliceHead}export const a = (slice: SliceMeta) => st.use[\`nothingOf\${capitalize(slice.sliceName)}\`]();\n`,
      ),
      analyze(`${sliceHead}export const a = (slice: SliceMeta) => st[slice.refName];\n`),
    ]).toEqual([
      `computed-access: ${built}`,
      `computed-access: ${built}`,
      `computed-access: ${built}`,
      `computed-access: ${built}`,
      `computed-access: ${built}`,
      `computed-access: ${built}`,
      `computed-access: st.use[\`\${one.refName}ListIn\${other.sliceName}\`]`,
      `computed-access: st.use[\`nothingOf\${capitalize(slice.sliceName)}\`]`,
      "computed-access: st[slice.refName]",
    ]);
  });

  test("keeps the whole runtime where the slice parameter is reassigned or defaulted", () => {
    const built = `st.use[\`queryArgsOf\${capitalize(slice.sliceName)}\`]`;
    const read = `${built}()`;
    const inFunction = (parameters: string, before: string) =>
      analyze(`${sliceHead}export const a = (${parameters}) => {\n${before}  return ${read};\n};\n`);
    expect([
      inFunction("slice: SliceMeta, other: any", "  slice = other;\n"),
      inFunction("slice: SliceMeta, other: any", "  ({ slice } = other);\n"),
      inFunction("slice: SliceMeta, other: any", "  [slice] = other;\n"),
      inFunction("slice: SliceMeta, other: any", "  (slice as any) = other;\n"),
      inFunction("slice: SliceMeta", "  for (slice of []) break;\n"),
      inFunction("slice: SliceMeta", "  slice ||= slice;\n"),
      inFunction("slice = (undefined as unknown) as SliceMeta", ""),
      inFunction("{ slice }: { slice: SliceMeta }, other: any", "  slice = other;\n"),
      inFunction("{ slice = other as SliceMeta }: { slice?: SliceMeta }, other: any", ""),
      inFunction("{ slice }: { slice: SliceMeta } = { slice: {} as SliceMeta }", ""),
      inFunction("slice: SliceMeta", "  const other = { slice };\n"),
    ]).toEqual([...Array.from({ length: 10 }, () => `computed-access: ${built}`), []]);
  });

  test("loads a module the slice's own arrival does not, for every slice the name may stand for", () => {
    const entry = (scope: string, module: string): RuntimeNameEntry => ({
      owners: [{ scope, module }],
      definedBy: [{ scope, module }],
      base: null,
      needs: "store",
      uses: [],
    });
    const names: Record<string, RuntimeNameEntry> = {
      "fetch.slice/postInFeed": entry("libs/base", "post"),
      "st.slice/postInFeed": entry("apps/blog", "post"),
      "st.use/post": entry("apps/blog", "post"),
      "st.use/queryArgsOfPostInFeed": entry("apps/blog", "post"),
      "fetch.slice/tagInFeed": entry("libs/base", "tag"),
      "st.use/tag": entry("libs/base", "tag"),
      "st.use/queryArgsOfTagInFeed": entry("libs/base", "tag"),
    };
    const blog = {
      scope: "apps/blog",
      layers: [{ scope: "libs/base" }, { scope: "apps/blog" }],
      lookup: (family: string, key: string) => names[`${family}/${key}`] ?? null,
      keysOf: (family: string) =>
        Object.keys(names).flatMap((name) => (name.startsWith(`${family}/`) ? [name.slice(family.length + 1)] : [])),
    } as unknown as RuntimeNameTable;
    expect(
      analyze(
        `import { capitalize } from "akanjs/common";\nimport type { SliceMeta } from "akanjs/fetch";\nimport { st } from "@apps/blog/client";\nexport const a = (slice: SliceMeta) => st.use[\`queryArgsOf\${capitalize(slice.sliceName)}\`]();\n`,
        "apps/blog/ui/Search.tsx",
        blog,
      ),
    ).toEqual(["apps/blog/post store"]);
  });

  test("reads a slice written out by hand as naming its model, and keeps the whole runtime where its name is not written", () => {
    expect([
      analyze('export const slice = { refName: "memo", sliceName: "memoInBoard", argLength: 0 };\n'),
      analyze(
        "export const sliceOf = (refName: string, sliceName: string) => ({ refName, sliceName, argLength: 0 });\n",
      ),
      analyze('export const slice = { refName: "memo", sliceName: "nothing", argLength: 0 };\n'),
      analyze('export const names = { sliceName: "memoInBoard" };\n'),
    ]).toEqual([memo, "computed-access: sliceName", 'unknown-name: sliceName: "nothing"', []]);
  });
});

describe("RuntimeUse.analyze, state handed to a function of the same file", () => {
  test("reads the names a function of the file reads from the state it is handed", () => {
    expect([
      storeOf(
        "  static announce({ draft, pinned }: { draft: string; pinned: boolean }) {\n    return [draft, pinned];\n  }\n  show() {\n    return MemoStore.announce(this.get());\n  }",
      ),
      analyze(
        `${head}const labelOf = (state: { draft: string }) => state.draft;\nexport const a = () => labelOf(st.get());\n`,
      ),
      analyze(
        `${head}export const a = () => labelOf(1, st.get() as never);\nfunction labelOf(this: void, count: number, state: { draft: string }) {\n  return state.draft.repeat(count);\n}\n`,
      ),
      analyze(
        `${head}const inner = ({ pinned }: { pinned: boolean }) => pinned;\nconst outer = (state: { draft: string }) => [state.draft, inner(state as never)];\nexport const a = () => outer(st.get());\n`,
      ),
    ]).toEqual([memoAndNote, memo, memo, memoAndNote]);
  });

  test("keeps the whole runtime where the function hands the state on, picks a name at run time or is not the file's", () => {
    expect([
      analyze(
        `${head}const labelOf = (state: object, run: (all: object) => void) => run(state);\nexport const a = () => labelOf(st.get(), () => {});\n`,
      ),
      analyze(
        `${head}const labelOf = (state: Record<string, string>, key: string) => state[key];\nexport const a = () => labelOf(st.get(), "draft");\n`,
      ),
      analyze(`${head}const labelOf = (...states: object[]) => states;\nexport const a = () => labelOf(st.get());\n`),
      analyze(
        `${head}function labelOf(state: object) {\n  return arguments[0];\n}\nexport const a = () => labelOf(st.get());\n`,
      ),
      analyze(`${head}import { labelOf } from "./label";\nexport const a = () => labelOf(st.get());\n`),
      analyze(
        `${head}let labelOf = (state: { draft: string }) => state.draft;\nexport const a = () => labelOf(st.get());\n`,
      ),
      analyze(
        `${head}const labelOf = (state: { draft: string }) => state.draft;\nexport const a = () => labelOf(st.do);\n`,
      ),
      storeOf(
        "  label(state: { draft: string }) {\n    return state.draft;\n  }\n  show() {\n    return this.label(this.get());\n  }",
      ),
    ]).toEqual([
      "passed-on: state",
      "computed-access: state[key]",
      "passed-on: st.get()",
      "passed-on: st.get()",
      "passed-on: st.get()",
      "passed-on: st.get()",
      "passed-on: st.do",
      "passed-on: this.get()",
    ]);
  });
});

describe("RuntimeUse.analyze, the agent entry of the framework store", () => {
  test("reads the screen and cursor exports as no runtime, and the ones holding the root store as the whole runtime", () => {
    expect([
      analyze(
        'import { ScreenSettle, ScreenTarget } from "akanjs/store/agent";\nexport const a = [ScreenSettle, ScreenTarget];\n',
      ),
      analyze('import { AgentBridge } from "akanjs/store/agent";\nexport const a = AgentBridge;\n'),
      analyze('import * as agent from "akanjs/store/agent";\nexport const a = agent;\n'),
      analyze('import { ScreenSettle } from "akanjs/store/agent/ScreenSettle";\nexport const a = ScreenSettle;\n'),
    ]).toEqual([
      [],
      "whole-runtime-import: AgentBridge",
      "whole-runtime-import: agent",
      "whole-runtime-import: ScreenSettle",
    ]);
  });
});

describe("RuntimeUse.analyze, the note of a read that keeps the whole runtime", () => {
  test("ends with what to write instead, where there is a usual answer", () => {
    const answerOf = (text: string) => {
      const verdict = RuntimeUse.analyze({ fileName: "apps/demo/ui/Card.tsx", text }, demo);
      return verdict.resolvable ? null : (verdict.message.split("; ")[1] ?? null);
    };
    const assertKey = 'assert the key as the name it stands for (`key as "name"`)';
    expect([
      answerOf(`${head}export const a = (name: string) => st.use[name]();\n`),
      answerOf(`${head}export const a = (name: string) => fetch[name]();\n`),
      answerOf(`${head}export const a = (sliceName: string) => st.slice[sliceName];\n`),
      answerOf(`${head}export const a = (run: (all: unknown) => void) => run(fetch);\n`),
      answerOf(`${head}export const a = (run: (all: unknown) => void) => run(st.get());\n`),
      answerOf(`${head}export const a = (key: string) => {\n  const { [key]: value } = st.get();\n};\n`),
      answerOf(`${head}export const a = () => st.use.nothing();\n`),
    ]).toEqual([
      assertKey,
      `name the endpoint, or ${assertKey}`,
      `take the slice as a \`SliceMeta\` parameter, or ${assertKey}`,
      "name the endpoint here and pass that",
      "read the names here",
      assertKey,
      null,
    ]);
  });
});
