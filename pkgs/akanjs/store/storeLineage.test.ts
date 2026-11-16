import { describe, expect, test } from "bun:test";
import type { RootStoreCls } from "./rootStore";
import { type StoreCls, store } from "./store";
import { StoreLineage } from "./storeLineage";
import { StoreRegistry } from "./storeRegistry";

interface Setter {
  set(state: Record<string, unknown>): void;
}

const libStoreOf = (tag: string, version = "lib") => {
  class LibStore extends store(tag, () => ({ [`${tag}Count`]: 1, [`${tag}Seen`]: "", [`${tag}Draft`]: { text: "" } })) {
    [`${tag}Mark`]() {
      (this as unknown as Setter).set({ [`${tag}Seen`]: version });
    }
    [`${tag}LibOnly`]() {
      (this as unknown as Setter).set({ [`${tag}Seen`]: `${version} only` });
    }
  }
  return StoreRegistry.register(LibStore as unknown as StoreCls);
};

const appStoreOf = (tag: string, lib: StoreCls, version = "app") => {
  class AppStore extends store(tag, () => ({ [`${tag}Count`]: 2, [`${tag}Note`]: "note" }), lib) {
    [`${tag}Mark`]() {
      (this as unknown as Setter).set({ [`${tag}Seen`]: version });
    }
    [`set${tag.charAt(0).toUpperCase()}${tag.slice(1)}Note`](value: string) {
      (this as unknown as Setter).set({ [`${tag}Note`]: `${value} by ${version}` });
    }
  }
  return StoreRegistry.register(AppStore as unknown as StoreCls);
};

const build = (refName: string, ...stores: (StoreCls | RootStoreCls)[]) =>
  StoreRegistry.build(StoreRegistry.merge(refName, ...stores));

const read = async (tag: string) => {
  const { instance } = StoreRegistry;
  const actions = instance.do as unknown as Record<string, (...args: unknown[]) => Promise<void>>;
  await actions[`${tag}Mark`]();
  await actions[`set${tag.charAt(0).toUpperCase()}${tag.slice(1)}Note`]("typed");
  const state = instance.get() as unknown as Record<string, unknown>;
  return { count: state[`${tag}Count`], seen: state[`${tag}Seen`], note: state[`${tag}Note`] };
};

const extension = { count: 2, seen: "app", note: "typed by app" };

describe("an app store that extends a lib store", () => {
  test("wins when the lib store arrives first", async () => {
    const lib = libStoreOf("first");
    build("first", lib);
    expect((StoreRegistry.instance.get() as unknown as Record<string, unknown>).firstCount).toBe(1);
    const app = appStoreOf("first", lib);
    build("first", app);
    expect(await read("first")).toEqual(extension);
    expect(StoreRegistry.get("first")).toBe(app);
  });

  test("wins when the lib store arrives after it, alone or inside the lib's whole root", async () => {
    const lib = libStoreOf("later");
    const app = appStoreOf("later", lib);
    build("later", app);
    StoreRegistry.register(lib);
    build("later", lib);
    expect(await read("later")).toEqual(extension);
    expect(StoreRegistry.get("later")).toBe(app);

    const neighbour = libStoreOf("laterNeighbour");
    const libRoot = StoreRegistry.merge("laterLib", lib, neighbour);
    StoreRegistry.build(libRoot);
    expect(await read("later")).toEqual(extension);
    expect("laterNeighbourCount" in StoreRegistry.instance.get()).toBe(true);
    build("laterApp", libRoot, app);
    expect(await read("later")).toEqual(extension);
  });

  test("wins inside one root whichever of the two the root lists first", async () => {
    const lib = libStoreOf("listed");
    const app = appStoreOf("listed", lib);
    build("listed", app, lib);
    expect(await read("listed")).toEqual(extension);
  });

  test("keeps a value the page already changed, and the lib's actions it does not redefine", async () => {
    const lib = libStoreOf("kept");
    build("kept", lib);
    StoreRegistry.instance.set({ keptCount: 9 } as never);
    build("kept", appStoreOf("kept", lib));
    expect((await read("kept")).count).toBe(9);
    const actions = StoreRegistry.instance.do as unknown as Record<string, () => Promise<void>>;
    await actions.keptLibOnly();
    expect((StoreRegistry.instance.get() as unknown as Record<string, unknown>).keptSeen).toBe("lib only");
  });

  test("is replaced by its own reloaded class, and a reloaded lib store never replaces it", async () => {
    const lib = libStoreOf("reload");
    build("reload", lib);
    build("reload", appStoreOf("reload", lib));
    const reloadedLib = libStoreOf("reload", "lib reloaded");
    const reloadedApp = appStoreOf("reload", reloadedLib, "app reloaded");
    build("reload", reloadedApp);
    build("reload", reloadedLib);
    expect(await read("reload")).toEqual({ count: 2, seen: "app reloaded", note: "typed by app reloaded" });

    const libAgain = libStoreOf("reload", "lib again");
    build("reload", libAgain);
    build("reload", appStoreOf("reload", libAgain, "app again"));
    expect(await read("reload")).toEqual({ count: 2, seen: "app again", note: "typed by app again" });
    const actions = StoreRegistry.instance.do as unknown as Record<string, () => Promise<void>>;
    await actions.reloadLibOnly();
    expect((StoreRegistry.instance.get() as unknown as Record<string, unknown>).reloadSeen).toBe("lib again only");
  });
});

describe("a store's lineage", () => {
  test("reads every store a store extends, through each level", () => {
    const base = libStoreOf("chainBase");
    const middle = appStoreOf("chainBase", base);
    const top = appStoreOf("chainBase", middle);
    expect([...StoreLineage.ancestorsOf(top)]).toEqual([middle, base]);
    expect(StoreLineage.partsOf(StoreRegistry.merge("chain", StoreRegistry.merge("inner", base), top))).toEqual([
      base,
      top,
    ]);
  });

  test("compares default values by content", () => {
    expect(StoreLineage.sameValue({ a: [1, { b: null }] }, { a: [1, { b: null }] })).toBe(true);
    expect(StoreLineage.sameValue({ a: 1 }, { a: 1, b: undefined })).toBe(false);
    expect(StoreLineage.sameValue(new Date(5), new Date(5))).toBe(true);
    expect(StoreLineage.sameValue(new Map(), new Map())).toBe(false);
  });
});
