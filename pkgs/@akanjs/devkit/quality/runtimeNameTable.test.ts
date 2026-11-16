import { beforeAll, describe, expect, test } from "bun:test";
import { type RuntimeFamily, RuntimeNameTable } from "./runtimeNameTable";
import { runtimeFixtureLayer, runtimeFixtureTables } from "./runtimeTable.fixture";

let demo: RuntimeNameTable;
let kit: RuntimeNameTable;

beforeAll(async () => {
  ({ demo, kit } = await runtimeFixtureTables());
});

const entryOf = (table: RuntimeNameTable, family: RuntimeFamily, key: string) => {
  const entry = table.lookup(family, key);
  if (!entry) return null;
  const ids = (owners: { scope: string; module: string }[]) => owners.map(({ scope, module }) => `${scope}/${module}`);
  return { owners: ids(entry.owners), definedBy: ids(entry.definedBy), base: entry.base };
};

describe("RuntimeNameTable", () => {
  test("gives a lib's name to the app module that extends it, and keeps the lib's own module when nothing does", () => {
    expect(entryOf(demo, "st.use", "noteCount")).toEqual({
      owners: ["apps/demo/note"],
      definedBy: ["libs/kit/note"],
      base: false,
    });
    expect(entryOf(demo, "st.do", "setBodyOnNote")?.owners).toEqual(["apps/demo/note"]);
    expect(entryOf(demo, "st.slice", "noteInKit")?.owners).toEqual(["apps/demo/note"]);
    expect(entryOf(demo, "fetch", "getNoteInitInKit")?.owners).toEqual(["apps/demo/note"]);
    expect(entryOf(demo, "st.do", "pickLabel")?.owners).toEqual(["libs/kit/util"]);
    expect(entryOf(kit, "st.use", "noteCount")?.owners).toEqual(["libs/kit/note"]);
    expect(entryOf(kit, "st.do", "clearDraft")).toBeNull();
  });

  test("reads the generated store, form, slice and fetch names a module declares", () => {
    const owned = (family: RuntimeFamily, keys: string[]) =>
      keys.map((key) => entryOf(demo, family, key)?.owners.join(",") ?? `${family}.${key} missing`);
    expect(owned("st.use", ["memo", "memoForm", "draft", "draftLength", "memoListInBoard"])).toEqual(
      Array(5).fill("apps/demo/memo"),
    );
    expect(
      owned("st.do", ["clearDraft", "setDraft", "setTitleOnMemo", "addTagsOnMemo", "setIdOnMemo", "initMemoInBoard"]),
    ).toEqual(Array(6).fill("apps/demo/memo"));
    expect(
      owned("fetch", ["memoNote", "memoTyping", "listenMemoTyping", "subscribeMemoLiveInBoard", "lightMemo"]),
    ).toEqual(Array(5).fill("apps/demo/memo"));
    expect(owned("fetch.slice", ["memoInBoard"])).toEqual(["apps/demo/memo"]);
    expect(owned("sig", ["memo"])).toEqual(["apps/demo/memo"]);
  });

  test("leaves out the fetch name of a verb the slice denies, not the store action", () => {
    expect(entryOf(demo, "fetch", "removeMemo")).toBeNull();
    expect(entryOf(demo, "fetch", "removeNote")?.owners).toEqual(["apps/demo/note"]);
    expect(entryOf(demo, "st.do", "removeMemo")?.owners).toEqual(["apps/demo/memo"]);
  });

  test("marks the framework's own names with no owner", () => {
    expect(entryOf(demo, "st.do", "setPath")).toEqual({ owners: [], definedBy: [], base: true });
    expect(entryOf(demo, "fetch", "ping")).toEqual({ owners: [], definedBy: [], base: true });
  });

  test("names its scope and layers, innermost first, and reads no table for a scope with no generated runtime", async () => {
    expect([demo.scope, ...demo.layers.map(({ scope }) => scope)]).toEqual(["apps/demo", "libs/kit", "apps/demo"]);
    expect(demo.approximations).toEqual([]);
    expect(await RuntimeNameTable.read(import.meta.dir, "apps/none")).toBeNull();
  });

  test("says which declarations it reads approximately", () => {
    const layer = runtimeFixtureLayer("apps/odd", {
      "apps/odd/lib/odd/odd.signal.ts": `import { endpoint, slice } from "akanjs/signal";

export class OddSlice extends slice(srv.odd, { guards: guardsOf("odd") }, (init) => ({ ...shared })) {}

export class OddEndpoint extends endpoint(srv.odd, ({ query }) => ({ [name]: query(String) })) {}
`,
      "apps/odd/lib/odd/odd.store.ts": `import { store } from "akanjs/store";

export class OddStore extends store(sig.odd, () => ({ ...initial, count: 0 })) {}
`,
    });
    expect(layer.approximations).toEqual([
      "apps/odd/lib/odd/odd.store.ts:3:55: a state key is spread or computed",
      "apps/odd/lib/odd/odd.signal.ts:5:70: a signal key is spread or computed",
      "apps/odd/lib/odd/odd.signal.ts:3:88: a signal key is spread or computed",
      "apps/odd/lib/odd/odd.signal.ts:3:31: slice guards are not an object literal",
    ]);
  });
});
