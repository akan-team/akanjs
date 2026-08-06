import { describe, expect, mock, test } from "bun:test";
import { ACTION_META, DataList, Int, SLICE_META, STATE_DERIVED_META, STATE_INIT_META, STATE_META } from "akanjs/base";
import { Translator } from "akanjs/client/translator";
import { ConstantRegistry, via } from "akanjs/constant";
import type { ClientSignal } from "akanjs/fetch";
import type { SerializedSignal } from "akanjs/signal";
import type { RootStoreCls } from "./rootStore";
import { type StoreCls, store } from "./store";
import { StoreInstance } from "./storeInstance";
import { StoreRegistry } from "./storeRegistry";

const StoreTestInput = via((f) => ({
  title: f(String),
  count: f(Int, { default: 0 }),
  tags: f([String]),
}));
const StoreTestObject = via(StoreTestInput, (f) => ({
  memo: f(String).optional(),
}));
const StoreTestLight = via(StoreTestObject, ["title"] as const, () => ({}));
const StoreTestFull = via(StoreTestObject, StoreTestLight, () => ({}));
const StoreTestInsight = via(StoreTestFull, (f) => ({
  count: f(Int, { default: 0 }),
}));
const storeTestConstant = ConstantRegistry.buildModel(
  "storeTestItem",
  StoreTestInput,
  StoreTestObject,
  StoreTestFull,
  StoreTestLight,
  StoreTestInsight,
  { StoreTestInput, StoreTestObject, StoreTestFull, StoreTestLight, StoreTestInsight },
);
const setupEnv = () => {
  process.env.AKAN_PUBLIC_APP_NAME = "storetest";
  process.env.AKAN_PUBLIC_REPO_NAME = "storetest";
  process.env.AKAN_PUBLIC_SERVE_DOMAIN = "localhost";
  process.env.AKAN_PUBLIC_ENV = "testing";
};

class MemoryStorage implements Storage {
  #values = new Map<string, string>();
  get length() {
    return this.#values.size;
  }
  clear() {
    this.#values.clear();
  }
  getItem(key: string) {
    return this.#values.get(key) ?? null;
  }
  key(index: number) {
    return [...this.#values.keys()][index] ?? null;
  }
  removeItem(key: string) {
    this.#values.delete(key);
  }
  setItem(key: string, value: string) {
    this.#values.set(key, value);
  }
}

const installBrowser = (searchParams: Record<string, string | string[]> = {}) => {
  const localStorage = new MemoryStorage();
  const sessionStorage = new MemoryStorage();
  const win = {
    localStorage,
    sessionStorage,
    location: { pathname: "/store-test", protocol: "http:", hostname: "localhost", host: "localhost" },
  };
  Object.defineProperty(globalThis, "window", { value: win, configurable: true });
  Object.defineProperty(globalThis, "localStorage", { value: localStorage, configurable: true });
  Object.defineProperty(globalThis, "sessionStorage", { value: sessionStorage, configurable: true });
  return { localStorage, sessionStorage, searchParams };
};

const uninstallBrowser = () => {
  Reflect.deleteProperty(globalThis, "window");
  Reflect.deleteProperty(globalThis, "localStorage");
  Reflect.deleteProperty(globalThis, "sessionStorage");
};

const makeRoot = (refName: string, ...stores: (StoreCls | RootStoreCls)[]) => StoreRegistry.merge(refName, ...stores);

const makeSignal = () => {
  const calls: Record<string, ReturnType<typeof mock>> = {
    createStoreTestItem: mock(
      async (data: Record<string, unknown>) => new StoreTestFull({ id: "aaaaaaaaaaaaaaaaaaaaaaaa", ...data }),
    ),
    updateStoreTestItem: mock(async (id: string, data: Record<string, unknown>) => new StoreTestFull({ id, ...data })),
    removeStoreTestItem: mock(
      async (id: string) => new StoreTestFull({ id, title: "removed", removedAt: new Date() } as never),
    ),
    storeTestItem: mock(async (id: string) => new StoreTestFull({ id, title: "loaded" })),
    storeTestItemList: mock(async () => [
      new StoreTestLight({ id: "aaaaaaaaaaaaaaaaaaaaaaaa", title: "Ada" }),
      new StoreTestLight({ id: "bbbbbbbbbbbbbbbbbbbbbbbb", title: "Ben" }),
    ]),
    storeTestItemInsight: mock(async () => new StoreTestInsight({ count: 2 })),
    storeTestItemListByTitle: mock(async () => [
      new StoreTestLight({ id: "aaaaaaaaaaaaaaaaaaaaaaaa", title: "Ada" }),
      new StoreTestLight({ id: "bbbbbbbbbbbbbbbbbbbbbbbb", title: "Ben" }),
    ]),
    storeTestItemInsightByTitle: mock(async () => new StoreTestInsight({ count: 2 })),
  };
  const fetch = new Proxy(calls, {
    get(target, key: string) {
      target[key] ??= mock(async () => null);
      return target[key];
    },
  });
  const serializedSignal: SerializedSignal = {
    prefix: "storeTestItem",
    endpoint: {},
    slice: {
      "": { args: [{ type: "search", name: "query", refName: "String", nullable: true }] },
      byTitle: { args: [{ type: "param", name: "title", refName: "String" }] },
      byTags: { args: [{ type: "search", name: "tags", refName: "String", arrDepth: 1, nullable: true }] },
    },
  };
  return {
    refName: "storeTestItem",
    _slice: { [SLICE_META]: {} },
    cnst: storeTestConstant,
    fetch,
    serializedSignal,
    slices: [],
    calls,
  } as unknown as ClientSignal<"storeTestItem"> & { calls: typeof calls };
};

describe("store factory", () => {
  test("creates state metadata, initializer metadata, action metadata, and derived metadata", () => {
    setupEnv();
    class PreferenceStore extends store(
      "preference" as const,
      ({ persist, session }) => ({
        count: persist(Int, { default: 1 }),
        draft: session(String, { default: "hello" }),
        flag: false,
      }),
      ({ computed, search }) => ({
        countLabel: computed(["count"], (count) => `count:${count}`),
        query: search("q", String, { default: "" }),
      }),
    ) {
      increment() {
        const { count } = this.get();
        this.set({ count: count + 1 });
      }
    }
    StoreRegistry.register(PreferenceStore);

    expect(PreferenceStore.refName).toBe("preference");
    expect(PreferenceStore[STATE_META]).toMatchObject({ count: 1, draft: "hello", flag: false, query: "" });
    expect(PreferenceStore[STATE_INIT_META].count()).toBe(1);
    expect(PreferenceStore[STATE_DERIVED_META].persistSession.count.kind).toBe("persist");
    expect(PreferenceStore[STATE_DERIVED_META].persistSession.draft.kind).toBe("session");
    expect(PreferenceStore[STATE_DERIVED_META].computed.countLabel.selector(3)).toBe("count:3");
    expect(PreferenceStore[ACTION_META].increment).toBeInstanceOf(Function);
  });

  test("merges lib store state, actions, and derived metadata while rejecting duplicate derived keys", () => {
    setupEnv();
    class LibStore extends store(
      "storeLib" as const,
      () => ({ libCount: 1 }),
      ({ computed }) => ({ libLabel: computed(["libCount"], (count) => `lib:${count}`) }),
    ) {
      setLibCount(value: number) {
        this.set({ libCount: value });
      }
    }
    StoreRegistry.register(LibStore);

    class MainStore extends store("storeMain" as const, () => ({ mainCount: 2 }), LibStore) {}

    expect(MainStore[STATE_META]).toMatchObject({ libCount: 1, mainCount: 2 });
    expect(MainStore[STATE_DERIVED_META].computed.libLabel.selector(4)).toBe("lib:4");
    expect(MainStore[ACTION_META].setLibCount).toBeInstanceOf(Function);

    expect(() =>
      store(
        "storeDuplicate" as const,
        () => ({ value: 1 }),
        ({ computed }) => ({ libLabel: computed(["value"], (value) => value) }),
        LibStore,
      ),
    ).toThrow("Derived state key conflicts with writable state: libLabel");
  });

  test("rejects the old non-factory state shape", () => {
    setupEnv();

    expect(() => store("legacy" as const, { count: 1 } as never)).toThrow(
      "store() now requires a state factory: store(sig, ({ persist, session }) => ({ ... }))",
    );
  });
});

describe("StoreInstance runtime", () => {
  test("supports get, set, immer updates, pick, subscriptions, selector subscriptions, and derived protection", async () => {
    setupEnv();
    class RuntimeStore extends store(
      "runtime" as const,
      () => ({
        count: 1,
        countCopy: 0,
        nested: { value: "a" },
      }),
      ({ computed }) => ({
        label: computed(["count"], (count) => `count:${count}`),
      }),
    ) {
      copyCount() {
        this.set({ countCopy: this.pick("count").count as number });
      }
    }
    StoreRegistry.register(RuntimeStore);
    const instance = new StoreInstance(makeRoot("runtimeRoot", RuntimeStore));
    const rootEvents: [unknown, unknown][] = [];
    const selectorEvents: [unknown, unknown][] = [];
    const unsubscribeRoot = instance.sub((state, prev) => rootEvents.push([state.count, prev.count]));
    const unsubscribeSelector = instance.sub(
      (state) => state.count,
      (count, prev) => selectorEvents.push([count, prev]),
      {
        fireImmediately: true,
      },
    );

    expect(instance.get()).toMatchObject({ count: 1, label: "count:1" });
    instance.set({ count: 2 });
    instance.set((state) => {
      (state.nested as { value: string }).value = "b";
      state.count = 3;
    });

    expect(instance.get()).toMatchObject({ count: 3, nested: { value: "b" }, label: "count:3" });
    await instance.do.copyCount();
    expect(instance.get().countCopy).toBe(3);
    expect(rootEvents.map(([count, prev]) => [count, prev])).toEqual([
      [2, 1],
      [3, 2],
      [3, 3],
    ]);
    expect(selectorEvents).toEqual([
      [1, 1],
      [2, 1],
      [3, 2],
    ]);

    unsubscribeRoot();
    unsubscribeSelector();
    instance.set({ count: 4 });
    expect(rootEvents).toHaveLength(3);
    expect(selectorEvents).toHaveLength(3);
    expect(() => instance.set({ label: "manual" })).toThrow("Cannot set derived state directly: label");
  });

  test("shows translated error messages when actions reject", async () => {
    setupEnv();
    Translator.seed("en", {
      actionTest: { error: { blocked: { t: "Blocked {name}" } } },
    });
    Translator.setActiveLocale("en");
    class RuntimeMessageStore extends store("runtimeMessage" as const, () => ({
      messages: [] as { content: string; type: string; key: string; duration: number }[],
    })) {
      showMessage(message: { content: string; type: string; key: string; duration: number }) {
        const { messages } = this.get();
        this.set({ messages: [...messages, message] });
      }
      async failWithTranslatedError() {
        const error = new Error("actionTest.error.blocked") as Error & { data: { name: string } };
        error.data = { name: "Ada" };
        throw error;
      }
    }
    StoreRegistry.register(RuntimeMessageStore);
    const instance = new StoreInstance(makeRoot("runtimeMessageRoot", RuntimeMessageStore));

    await expect(instance.do.failWithTranslatedError()).rejects.toThrow("actionTest.error.blocked");
    expect(instance.get().messages).toEqual([
      { content: "Blocked Ada", type: "error", key: "failWithTranslatedError", duration: 3 },
    ]);
  });

  test("hydrates and syncs persist/session storage and materializes search params only in browser", () => {
    setupEnv();
    const browser = installBrowser();
    class BrowserStore extends store(
      "browser" as const,
      ({ persist, session }) => ({
        count: persist(Int, { default: 1, key: "count" }),
        draft: session(String, { default: "empty", key: "draft" }),
        searchParams: {} as Record<string, string | string[]>,
      }),
      ({ search }) => ({
        q: search("q", String, { default: "default" }),
      }),
    ) {}
    const countKey = BrowserStore[STATE_DERIVED_META].persistSession.count.storageKey;
    const draftKey = BrowserStore[STATE_DERIVED_META].persistSession.draft.storageKey;
    browser.localStorage.setItem(countKey, JSON.stringify(5));
    browser.sessionStorage.setItem(draftKey, JSON.stringify("saved"));

    const instance = new StoreInstance(makeRoot("browserRoot", BrowserStore));
    expect(instance.get()).toMatchObject({ count: 5, draft: "saved", q: "default" });
    instance.set({ count: 6, draft: "next", searchParams: { q: "from-url" } });
    expect(browser.localStorage.getItem(countKey)).toBe("6");
    expect(browser.sessionStorage.getItem(draftKey)).toBe('"next"');
    expect(instance.get().q).toBe("from-url");

    uninstallBrowser();
    const serverInstance = new StoreInstance(makeRoot("serverBrowserRoot", BrowserStore));
    serverInstance.set({ searchParams: { q: "ignored" } });
    expect(serverInstance.get().q).toBe("default");
  });
});

describe("signal generated store contract", () => {
  test("injects model and slice state, form setters, model actions, and slice actions", async () => {
    setupEnv();
    const signal = makeSignal();
    class ItemStore extends store(signal, () => ({ customReady: true })) {}
    StoreRegistry.register(ItemStore);
    const instance = new StoreInstance(makeRoot("itemRoot", ItemStore));

    expect(ItemStore[STATE_META]).toHaveProperty("storeTestItemForm");
    expect(ItemStore[STATE_META]).toHaveProperty("storeTestItemListByTitle");
    expect(ItemStore[ACTION_META]).toHaveProperty("newStoreTestItem");
    expect(ItemStore[ACTION_META]).toHaveProperty("initStoreTestItemByTitle");
    expect(instance.get().storeTestItemForm).toBeInstanceOf(StoreTestInput);
    expect(instance.get().storeTestItemListByTitle).toBeInstanceOf(DataList);
    expect(instance.get()).toMatchObject({
      queryArgsOfStoreTestItem: [],
      queryArgsOfStoreTestItemByTitle: [],
      queryArgsOfStoreTestItemByTags: [],
    });
    expect(instance.slice.storeTestItemByTitle).toMatchObject({
      sliceName: "storeTestItemByTitle",
      refName: "storeTestItem",
      argLength: 1,
    });

    await instance.do.newStoreTestItem({ title: "draft", tags: ["x"] }, { modal: "edit", setDefault: true });
    expect(instance.get()).toMatchObject({ storeTestItem: null, storeTestItemModal: "edit" });
    expect(instance.get().storeTestItemForm).toMatchObject({ title: "draft", tags: ["x"] });
    await instance.do.setTitleOnStoreTestItem("patched");
    expect(instance.get().storeTestItemForm).toMatchObject({ title: "patched" });
    await instance.do.addTagsOnStoreTestItem("y");
    expect(instance.get().storeTestItemForm).toMatchObject({ tags: ["x", "y"] });
    await instance.do.subTagsOnStoreTestItem(0);
    expect(instance.get().storeTestItemForm).toMatchObject({ tags: ["y"] });
    await instance.do.writeOnStoreTestItem("memo", "note");
    expect(instance.get().storeTestItemForm).toMatchObject({ memo: "note" });

    await instance.do.createStoreTestItem({ title: "created", count: 0, tags: [] });
    expect(signal.calls.createStoreTestItem).toHaveBeenCalled();
    expect(instance.get().storeTestItem).toBeInstanceOf(StoreTestFull);
    expect(instance.get().storeTestItemList).toBeInstanceOf(DataList);

    await instance.do.updateStoreTestItem("aaaaaaaaaaaaaaaaaaaaaaaa", { title: "updated", count: 0, tags: [] });
    expect(signal.calls.updateStoreTestItem).toHaveBeenCalled();
    await instance.do.removeStoreTestItem("aaaaaaaaaaaaaaaaaaaaaaaa");
    expect(signal.calls.removeStoreTestItem).toHaveBeenCalled();
    await instance.do.resetStoreTestItem();
    expect(instance.get()).toMatchObject({ storeTestItem: null, storeTestItemModal: null });

    await instance.do.initStoreTestItemByTitle("Ada", { default: { title: "base" } });
    expect(signal.calls.storeTestItemListByTitle).toHaveBeenCalledWith("Ada", 0, 20, "latest", expect.any(Object));
    expect(instance.get()).toMatchObject({
      queryArgsOfStoreTestItemByTitle: ["Ada"],
      pageOfStoreTestItemByTitle: 1,
      limitOfStoreTestItemByTitle: 20,
      lastPageOfStoreTestItemByTitle: 1,
    });
    expect(instance.get().storeTestItemListByTitle).toBeInstanceOf(DataList);

    await instance.do.selectStoreTestItemByTitle(new StoreTestLight({ id: "aaaaaaaaaaaaaaaaaaaaaaaa", title: "Ada" }));
    expect(instance.get().storeTestItemSelectionByTitle).toBeInstanceOf(DataList);
    await instance.do.setPageOfStoreTestItemByTitle(2);
    await instance.do.addPageOfStoreTestItemByTitle(3);
    await instance.do.setLimitOfStoreTestItemByTitle(10);
    await instance.do.setQueryArgsOfStoreTestItemByTitle("Ben");
    await instance.do.setQueryArgsOfStoreTestItemByTitle((prev: string) => [`${prev}!`]);
    await instance.do.setSortOfStoreTestItemByTitle("titleAsc");
    expect(instance.get()).toMatchObject({
      pageOfStoreTestItemByTitle: 1,
      limitOfStoreTestItemByTitle: 10,
      queryArgsOfStoreTestItemByTitle: ["Ben!"],
      sortOfStoreTestItemByTitle: "titleAsc",
    });
  });

  test("stamps every sibling slice stale on create and clears it on refresh", async () => {
    setupEnv();
    const signal = makeSignal();
    class StaleStore extends store(signal, () => ({})) {}
    StoreRegistry.register(StaleStore);
    const instance = new StoreInstance(makeRoot("staleRoot", StaleStore));

    const staleAtKeys = ["storeTestItemStaleAt", "storeTestItemStaleAtByTitle", "storeTestItemStaleAtByTags"];
    staleAtKeys.forEach((key) => {
      expect((instance.get()[key] as Date).getTime()).toBe(0);
    });

    const before = Date.now();
    await instance.do.createStoreTestItem(
      { title: "created", count: 0, tags: [] },
      { sliceName: "storeTestItemByTitle" },
    );
    // The issuing slice got the optimistic splice, so only its siblings are marked stale.
    expect((instance.get().storeTestItemStaleAtByTitle as Date).getTime()).toBe(0);
    expect((instance.get().storeTestItemStaleAt as Date).getTime()).toBeGreaterThanOrEqual(before);
    expect((instance.get().storeTestItemStaleAtByTags as Date).getTime()).toBeGreaterThanOrEqual(before);

    // A refresh restamps initAt past staleAt, which is what Load.Units reads to stop refetching.
    await instance.do.refreshStoreTestItem({ invalidate: true });
    expect((instance.get().storeTestItemInitAt as Date).getTime()).toBeGreaterThanOrEqual(
      (instance.get().storeTestItemStaleAt as Date).getTime(),
    );

    const staleAtByTags = instance.get().storeTestItemStaleAtByTags as Date;
    await instance.do.newStoreTestItem({ title: "formed", tags: [] });
    await instance.do.createStoreTestItemInForm({ sliceName: "storeTestItemByTags" });
    expect(instance.get().storeTestItemStaleAtByTags).toBe(staleAtByTags);
    expect((instance.get().storeTestItemStaleAtByTitle as Date).getTime()).toBeGreaterThanOrEqual(before);
  });
});

describe("StoreRegistry and root assembly", () => {
  test("registers prototype actions, merges roots, and builds a singleton with use/do/slice facades", async () => {
    setupEnv();
    class FirstStore extends store("firstStore" as const, () => ({ firstValue: 1 })) {
      setFirstToTwo() {
        this.set({ firstValue: 2 });
      }
    }
    class SecondStore extends store("secondStore" as const, () => ({ secondValue: "a" })) {
      setSecond(value: string) {
        this.set({ secondValue: value });
      }
    }
    StoreRegistry.register(FirstStore);
    StoreRegistry.register(SecondStore);
    const FirstRoot = StoreRegistry.merge("firstRoot" as const, FirstStore);
    const Root = StoreRegistry.merge("combinedRoot" as const, FirstRoot, SecondStore);

    expect(StoreRegistry.get("firstStore")).toBe(FirstStore);
    expect(FirstStore[ACTION_META].setFirstToTwo).toBeInstanceOf(Function);
    expect(Root[STATE_META]).toMatchObject({ firstValue: 1, secondValue: "a" });
    expect(Root[ACTION_META]).toHaveProperty("setFirstToTwo");
    expect(Root[ACTION_META]).toHaveProperty("setSecond");

    const built = StoreRegistry.build(Root);
    const same = StoreRegistry.build(Root);
    expect(same).toBe(built);
    await built.do.setFirstToTwo();
    await built.do.setSecond("b");
    expect(built.get()).toMatchObject({ firstValue: 2, secondValue: "b" });
    await built.do.setFirstValue(3);
    expect(built.get().firstValue).toBe(3);
    expect(built.use).toHaveProperty("firstValue");
  });

  test("builds slice facades from root slice metadata", async () => {
    setupEnv();
    const signal = makeSignal();
    class SliceStore extends store(signal, () => ({})) {}
    StoreRegistry.register(SliceStore);
    const instance = new StoreInstance(makeRoot("sliceRoot", SliceStore));
    const slice = instance.slice.storeTestItemByTitle as {
      do: Record<string, (...args: unknown[]) => Promise<void>>;
      get: () => Record<string, unknown>;
      use: Record<string, () => unknown>;
    };

    expect(slice.get()).toMatchObject({
      pageOfStoreTestItem: 1,
      limitOfStoreTestItem: 20,
      sortOfStoreTestItem: "latest",
    });
    await slice.do.initStoreTestItem("Ada");
    expect(signal.calls.storeTestItemListByTitle).toHaveBeenCalled();
    await slice.do.setPageOfStoreTestItem(2);
    expect(instance.get().pageOfStoreTestItemByTitle).toBe(2);
    expect(slice.use).toHaveProperty("pageOfStoreTestItem");
  });
});
