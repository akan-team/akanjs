import { describe, expect, mock, test } from "bun:test";
import { ACTION_META, DataList, Int, SLICE_META, STATE_DERIVED_META, STATE_INIT_META, STATE_META } from "akanjs/base";
import { Translator } from "akanjs/client/translator";
import { ConstantRegistry, via } from "akanjs/constant";
import type { ClientSignal } from "akanjs/fetch";
import type { SerializedSignal } from "akanjs/signal";
import type { RootStoreCls } from "./rootStore";
import { type StoreCls, store } from "./store";
import { MemoryStorage, setTestEnv } from "./store.fixture";
import { StoreInstance } from "./storeInstance";
import { StoreRegistry } from "./storeRegistry";

const StoreTestInput = via((f) => ({
  title: f(String),
  count: f(Int, { default: 0 }),
  tags: f([String]),
  settings: f(Map, { of: String, default: () => new Map<string, string>() }).optional(),
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
const setupEnv = () => setTestEnv("storetest");

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
    mergeStoreTestItem: mock(
      async (idOrModel: string | { id: string }, data: Record<string, unknown>) =>
        new StoreTestFull({ id: typeof idOrModel === "string" ? idOrModel : idOrModel.id, title: "merged", ...data }),
    ),
    removeStoreTestItem: mock(
      async (id: string) => new StoreTestFull({ id, title: "removed", removedAt: new Date() } as never),
    ),
    storeTestItem: mock(
      async (id: string) => new StoreTestFull({ id, title: "loaded", settings: { theme: "dark" } } as never),
    ),
    storeTestItemList: mock(async () => [
      new StoreTestLight({ id: "aaaaaaaaaaaaaaaaaaaaaaaa", title: "Ada" }),
      new StoreTestLight({ id: "bbbbbbbbbbbbbbbbbbbbbbbb", title: "Ben" }),
    ]),
    storeTestItemInsight: mock(async () => new StoreTestInsight({ count: 2 })),
    storeTestItemListByTitle: mock(async () => [
      new StoreTestLight({ id: "aaaaaaaaaaaaaaaaaaaaaaaa", title: "Ada", createdAt: new Date(300) } as never),
      new StoreTestLight({ id: "bbbbbbbbbbbbbbbbbbbbbbbb", title: "Ben", createdAt: new Date(100) } as never),
    ]),
    storeTestItemInsightByTitle: mock(async () => new StoreTestInsight({ count: 2 })),
  };
  const sortValueMap = new Map([["storeTestItem", { latest: { createdAt: -1 as const } }]]);
  const rooms: { args: unknown[]; handleEvent: (event: unknown) => void; onResync?: () => void; open: boolean }[] = [];
  const recordRoom = (...argData: unknown[]) => {
    const handleEvent = argData.at(-2) as (event: unknown) => void;
    const policy = argData.at(-1) as { onResync?: () => void };
    const room = { args: argData.slice(0, -2), handleEvent, onResync: policy?.onResync, open: true };
    rooms.push(room);
    return () => {
      room.open = false;
    };
  };
  calls.subscribeStoreTestItemLiveByTitle = mock(recordRoom) as never;
  calls.subscribeStoreTestItemLiveBySearch = mock(recordRoom) as never;
  const fetch = new Proxy(calls, {
    get(target, key: string) {
      if (key === "sortValueMap") return sortValueMap;
      target[key] ??= mock(async () => null);
      return target[key];
    },
  });
  const serializedSignal: SerializedSignal = {
    prefix: "storeTestItem",
    endpoint: {},
    slice: {
      "": { args: [{ type: "search", name: "query", refName: "String", nullable: true }] },
      byTitle: { args: [{ type: "param", name: "title", refName: "String" }], live: { sort: ["latest"] } },
      byTags: { args: [{ type: "search", name: "tags", refName: "String", arrDepth: 1, nullable: true }] },
      bySearch: {
        args: [
          { type: "param", name: "title", refName: "String" },
          { type: "search", name: "text", refName: "String", nullable: true },
        ],
        live: { sort: ["latest"], pauseOn: ["text"] },
      },
    },
  };
  return {
    rooms,
    refName: "storeTestItem",
    _slice: { [SLICE_META]: {} },
    cnst: storeTestConstant,
    fetch,
    serializedSignal,
    slices: [],
    calls,
  } as unknown as ClientSignal<"storeTestItem"> & { calls: typeof calls; rooms: typeof rooms };
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
    await instance.do.loadMoreOfStoreTestItemByTitle();
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

  test("keeps the newest page request and drops a slower one that answers after it", async () => {
    setupEnv();
    const signal = makeSignal();
    const gates: Array<() => void> = [];
    signal.calls.storeTestItemListByTitle = mock(
      async () =>
        await new Promise<InstanceType<typeof StoreTestLight>[]>((resolve) => {
          const page = gates.length + 1;
          gates.push(() => resolve([new StoreTestLight({ id: "aaaaaaaaaaaaaaaaaaaaaaaa", title: `page${page}` })]));
        }),
    );
    class RaceStore extends store(signal, () => ({})) {}
    StoreRegistry.register(RaceStore);
    const instance = new StoreInstance(makeRoot("raceRoot", RaceStore));

    const first = instance.do.initStoreTestItemByTitle("Ada");
    gates[0]?.();
    await first;

    const toPage2 = instance.do.setPageOfStoreTestItemByTitle(2);
    const toPage3 = instance.do.setPageOfStoreTestItemByTitle(3);
    gates[2]?.();
    await toPage3;
    gates[1]?.();
    await toPage2;

    expect(instance.get().pageOfStoreTestItemByTitle).toBe(3);
    const rows = [...(instance.get().storeTestItemListByTitle as DataList<InstanceType<typeof StoreTestLight>>)];
    expect(rows.map((row) => row.title)).toEqual(["page3"]);
    expect(instance.get().storeTestItemListLoadingByTitle).toBe(false);
  });

  test("loads more from the tail of the list, not from a page number", async () => {
    setupEnv();
    const signal = makeSignal();
    const rowsOf = (from: number, count: number) =>
      new Array(count)
        .fill(null)
        .map((_, i) => new StoreTestLight({ id: `${from + i}`.padStart(24, "0"), title: `row${from + i}` } as never));
    signal.calls.storeTestItemListByTitle = mock(async (_title: string, skip: number, limit: number) =>
      rowsOf(skip, Math.min(limit, 5 - skip)),
    );
    class MoreStore extends store(signal, () => ({})) {}
    StoreRegistry.register(MoreStore);
    const instance = new StoreInstance(makeRoot("moreRoot", MoreStore));
    const titles = () =>
      [...(instance.get().storeTestItemListByTitle as DataList<InstanceType<typeof StoreTestLight>>)].map(
        (row) => row.title,
      );

    await instance.do.initStoreTestItemByTitle("Ada", { limit: 2 });
    expect(titles()).toEqual(["row0", "row1"]);
    expect(instance.get().hasMoreOfStoreTestItemByTitle).toBe(true);

    await instance.do.loadMoreOfStoreTestItemByTitle();
    expect(signal.calls.storeTestItemListByTitle).toHaveBeenLastCalledWith("Ada", 2, 2, "latest", undefined);
    expect(titles()).toEqual(["row0", "row1", "row2", "row3"]);
    expect(instance.get().pageOfStoreTestItemByTitle).toBe(1);
    expect(instance.get().isCumulativeOfStoreTestItemByTitle).toBe(true);

    await instance.do.loadMoreOfStoreTestItemByTitle();
    expect(titles()).toEqual(["row0", "row1", "row2", "row3", "row4"]);
    expect(instance.get().hasMoreOfStoreTestItemByTitle).toBe(false);

    signal.calls.storeTestItemListByTitle.mockClear();
    await instance.do.loadMoreOfStoreTestItemByTitle();
    expect(signal.calls.storeTestItemListByTitle).not.toHaveBeenCalled();

    await instance.do.refreshStoreTestItemByTitle({ invalidate: true });
    expect(signal.calls.storeTestItemListByTitle).toHaveBeenLastCalledWith("Ada", 0, 5, "latest", expect.any(Object));
    expect(titles()).toEqual(["row0", "row1", "row2", "row3", "row4"]);
  });

  test("clears the list spinner when a page request fails", async () => {
    setupEnv();
    const signal = makeSignal();
    class FailStore extends store(signal, () => ({})) {}
    StoreRegistry.register(FailStore);
    const instance = new StoreInstance(makeRoot("failRoot", FailStore));

    await instance.do.initStoreTestItemByTitle("Ada");
    signal.calls.storeTestItemListByTitle = mock(async () => {
      throw new Error("network gone");
    });

    await expect(instance.do.setPageOfStoreTestItemByTitle(2)).rejects.toThrow("network gone");
    expect(instance.get().storeTestItemListLoadingByTitle).toBe(false);
  });

  test("names the closed endpoint when the slice serves no create", async () => {
    setupEnv();
    const signal = makeSignal();
    const fetch = new Proxy(signal.fetch, {
      get: (target, key) => (key === "createStoreTestItem" ? undefined : Reflect.get(target, key)),
    });
    class ClosedStore extends store({ ...signal, fetch }, () => ({})) {}
    StoreRegistry.register(ClosedStore);
    const instance = new StoreInstance(makeRoot("closedRoot", ClosedStore));

    await expect(instance.do.createStoreTestItem({ title: "created", count: 0, tags: [] })).rejects.toMatchObject({
      error: "base.error.endpointClosed",
      data: { endpoint: "createStoreTestItem" },
    });
  });

  test("seeds the edit form with a cloned map, not an empty object", async () => {
    setupEnv();
    const signal = makeSignal();
    class EditStore extends store(signal, () => ({})) {}
    StoreRegistry.register(EditStore);
    const instance = new StoreInstance(makeRoot("editRoot", EditStore));

    await instance.do.editStoreTestItem("aaaaaaaaaaaaaaaaaaaaaaaa");
    const model = instance.get().storeTestItem as { settings: Map<string, string> };
    const form = () => instance.get().storeTestItemForm as { settings: Map<string, string> };

    expect(form().settings).toBeInstanceOf(Map);
    expect(form().settings.get("theme")).toBe("dark");
    expect(form().settings).not.toBe(model.settings);

    await instance.do.writeOnStoreTestItem("settings.theme", "light");
    expect(form().settings.get("theme")).toBe("light");
    expect(model.settings.get("theme")).toBe("dark");
    expect(storeTestConstant.input.purify(form() as never)).toMatchObject({ settings: { theme: "light" } });
  });

  test("stamps every slice stale on every write and clears it on refresh", async () => {
    setupEnv();
    const signal = makeSignal();
    class StaleStore extends store(signal, () => ({})) {}
    StoreRegistry.register(StaleStore);
    const instance = new StoreInstance(makeRoot("staleRoot", StaleStore));

    const staleAtKeys = ["storeTestItemStaleAt", "storeTestItemStaleAtByTitle", "storeTestItemStaleAtByTags"];
    const staleAts = () => staleAtKeys.map((key) => instance.get()[key] as Date);
    const expectRestamped = async (previous: Date[], write: () => unknown) => {
      await write();
      staleAts().forEach((staleAt, idx) => {
        expect(staleAt).not.toBe(previous[idx]);
      });
      return staleAts();
    };
    staleAts().forEach((staleAt) => {
      expect(staleAt.getTime()).toBe(0);
    });

    const before = Date.now();
    await instance.do.createStoreTestItem(
      { title: "created", count: 0, tags: [] },
      { sliceName: "storeTestItemByTitle" },
    );
    staleAts().forEach((staleAt) => {
      expect(staleAt.getTime()).toBeGreaterThanOrEqual(before);
    });

    await instance.do.refreshStoreTestItem({ invalidate: true });
    expect((instance.get().storeTestItemInitAt as Date).getTime()).toBeGreaterThanOrEqual(
      (instance.get().storeTestItemStaleAt as Date).getTime(),
    );

    let previous = staleAts();
    previous = await expectRestamped(previous, async () => {
      await instance.do.newStoreTestItem({ title: "formed", tags: [] });
      await instance.do.createStoreTestItemInForm({ sliceName: "storeTestItemByTags" });
    });
    previous = await expectRestamped(previous, () =>
      instance.do.updateStoreTestItem("aaaaaaaaaaaaaaaaaaaaaaaa", { title: "updated", count: 0, tags: [] }),
    );
    previous = await expectRestamped(previous, () =>
      instance.do.setStoreTestItem(new StoreTestLight({ id: "aaaaaaaaaaaaaaaaaaaaaaaa", title: "pushed" }) as never),
    );
    previous = await expectRestamped(previous, () => instance.do.mergeStoreTestItem("aaaaaaaaaaaaaaaaaaaaaaaa", {}));
    await expectRestamped(previous, () => instance.do.removeStoreTestItem("aaaaaaaaaaaaaaaaaaaaaaaa"));
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

  test("erases action return types on the do facade while keeping args and promise-ness", () => {
    setupEnv();
    class ReturningStore extends store("returningStore" as const, () => ({ returnedValue: 1 })) {
      syncReturn(value: number) {
        this.set({ returnedValue: value });
        return value;
      }
      async asyncReturn(value: number) {
        this.set({ returnedValue: value });
        return { value };
      }
    }
    StoreRegistry.register(ReturningStore);
    const built = StoreRegistry.build(StoreRegistry.merge("returningRoot" as const, ReturningStore));

    type Exact<A, B> = [A] extends [B] ? ([B] extends [A] ? true : never) : never;
    const syncIsVoid: Exact<ReturnType<typeof built.do.syncReturn>, void> = true;
    const asyncIsVoid: Exact<ReturnType<typeof built.do.asyncReturn>, Promise<void>> = true;
    const argsSurvive: Exact<Parameters<typeof built.do.syncReturn>, [value: number]> = true;
    const setterIsVoid: Exact<ReturnType<typeof built.do.setReturnedValue>, void> = true;

    expect([syncIsVoid, asyncIsVoid, argsSurvive, setterIsVoid]).toEqual([true, true, true, true]);
  });
});

describe("live sync store action", () => {
  const liveState = (instance: StoreInstance) => {
    const state = instance.get() as Record<string, any>;
    return {
      ids: [...(state.storeTestItemListByTitle as DataList<{ id: string }>)].map((item) => item.id),
      titles: [...(state.storeTestItemListByTitle as DataList<{ id: string; title: string }>)].map(
        (item) => item.title,
      ),
      count: (state.storeTestItemInsightByTitle as { count: number }).count,
      staleAt: (state.storeTestItemStaleAtByTitle as Date).getTime(),
      lastPage: state.lastPageOfStoreTestItemByTitle as number,
    };
  };
  const arrange = async () => {
    setupEnv();
    const signal = makeSignal();
    class LiveStore extends store(signal, () => ({})) {}
    StoreRegistry.register(LiveStore);
    const instance = new StoreInstance(makeRoot(`liveRoot${Math.random()}`, LiveStore));
    await instance.do.initStoreTestItemByTitle("Ada");
    return { instance, signal };
  };
  const light = (id: string, title: string, createdAt: number) => ({ id, title, createdAt: new Date(createdAt) });

  test("an update replaces a row the window holds and ignores one it does not", async () => {
    const { instance } = await arrange();
    await instance.do.applyLiveStoreTestItemByTitle({
      op: "update",
      id: "aaaaaaaaaaaaaaaaaaaaaaaa",
      light: light("aaaaaaaaaaaaaaaaaaaaaaaa", "Ada Lovelace", 300),
    });
    expect(liveState(instance).titles).toEqual(["Ada Lovelace", "Ben"]);
    expect(liveState(instance).count).toBe(2);

    await instance.do.applyLiveStoreTestItemByTitle({
      op: "update",
      id: "cccccccccccccccccccccccc",
      light: light("cccccccccccccccccccccccc", "Cyd", 400),
    });
    expect(liveState(instance).titles).toEqual(["Ada Lovelace", "Ben"]);
  });

  test("a leave drops the row and lowers the count", async () => {
    const { instance } = await arrange();
    const before = liveState(instance).staleAt;
    await instance.do.applyLiveStoreTestItemByTitle({ op: "leave", id: "aaaaaaaaaaaaaaaaaaaaaaaa" });
    expect(liveState(instance).ids).toEqual(["bbbbbbbbbbbbbbbbbbbbbbbb"]);
    expect(liveState(instance).count).toBe(1);
    expect(liveState(instance).staleAt).toBeGreaterThanOrEqual(before);

    await instance.do.applyLiveStoreTestItemByTitle({ op: "leave", id: "cccccccccccccccccccccccc" });
    expect(liveState(instance).count).toBe(1);
  });

  test("an enter places the row by the declared sort and raises the count", async () => {
    const { instance } = await arrange();
    await instance.do.applyLiveStoreTestItemByTitle({
      op: "enter",
      id: "cccccccccccccccccccccccc",
      light: light("cccccccccccccccccccccccc", "Cyd", 200),
    });
    expect(liveState(instance).titles).toEqual(["Ada", "Cyd", "Ben"]);
    expect(liveState(instance).count).toBe(3);
    expect(liveState(instance).lastPage).toBe(1);
  });

  test("keeps placing rows after the list has loaded more", async () => {
    setupEnv();
    const signal = makeSignal();
    const server = [400, 300, 200, 100].map(
      (at) =>
        new StoreTestLight({ id: `${at}`.padStart(24, "0"), title: `row${at}`, createdAt: new Date(at) } as never),
    );
    signal.calls.storeTestItemListByTitle = mock(async (_title: string, skip: number, limit: number) =>
      server.slice(skip, skip + limit),
    );
    class LoadMoreLiveStore extends store(signal, () => ({})) {}
    StoreRegistry.register(LoadMoreLiveStore);
    const instance = new StoreInstance(makeRoot("loadMoreLiveRoot", LoadMoreLiveStore));
    await instance.do.initStoreTestItemByTitle("Ada", { limit: 2 });
    await instance.do.loadMoreOfStoreTestItemByTitle();
    expect(liveState(instance).titles).toEqual(["row400", "row300", "row200", "row100"]);

    await instance.do.applyLiveStoreTestItemByTitle({
      op: "enter",
      id: "cccccccccccccccccccccccc",
      light: light("cccccccccccccccccccccccc", "Cyd", 250),
    });
    expect(liveState(instance).titles).toEqual(["row400", "row300", "Cyd", "row200", "row100"]);

    expect(liveState(instance).count).toBe(3);
  });

  test("a row past the tail waits for the rows the server still holds", async () => {
    setupEnv();
    const signal = makeSignal();
    const server = [400, 300].map(
      (at) =>
        new StoreTestLight({ id: `${at}`.padStart(24, "0"), title: `row${at}`, createdAt: new Date(at) } as never),
    );
    signal.calls.storeTestItemListByTitle = mock(async (_title: string, skip: number, limit: number) =>
      server.slice(skip, skip + limit),
    );
    class TailStore extends store(signal, () => ({})) {}
    StoreRegistry.register(TailStore);
    const instance = new StoreInstance(makeRoot("tailRoot", TailStore));
    await instance.do.initStoreTestItemByTitle("Ada", { limit: 1 });
    await instance.do.loadMoreOfStoreTestItemByTitle();
    expect(instance.get().hasMoreOfStoreTestItemByTitle).toBe(true);

    const oldest = {
      op: "enter" as const,
      id: "cccccccccccccccccccccccc",
      light: light("cccccccccccccccccccccccc", "Cyd", 50),
    };
    await instance.do.applyLiveStoreTestItemByTitle(oldest);
    expect(liveState(instance).titles).toEqual(["row400", "row300"]);

    await instance.do.loadMoreOfStoreTestItemByTitle();
    expect(instance.get().hasMoreOfStoreTestItemByTitle).toBe(false);
    await instance.do.applyLiveStoreTestItemByTitle(oldest);
    expect(liveState(instance).titles).toEqual(["row400", "row300", "Cyd"]);
  });

  test("the same enter twice does not count the row twice", async () => {
    const { instance } = await arrange();
    const event = {
      op: "enter" as const,
      id: "cccccccccccccccccccccccc",
      light: light("cccccccccccccccccccccccc", "Cyd", 200),
    };
    await instance.do.applyLiveStoreTestItemByTitle(event);
    await instance.do.applyLiveStoreTestItemByTitle(event);
    expect(liveState(instance).titles).toEqual(["Ada", "Cyd", "Ben"]);
    expect(liveState(instance).count).toBe(3);
  });

  test("an enter on a sort the slice did not allowlist counts and refetches instead of guessing", async () => {
    const { instance } = await arrange();
    await instance.do.setSortOfStoreTestItemByTitle("titleAsc");
    const before = liveState(instance).staleAt;
    await instance.do.applyLiveStoreTestItemByTitle({
      op: "enter",
      id: "cccccccccccccccccccccccc",
      light: light("cccccccccccccccccccccccc", "Cyd", 200),
    });
    expect(liveState(instance).ids).not.toContain("cccccccccccccccccccccccc");
    expect(liveState(instance).count).toBe(3);
    expect(liveState(instance).staleAt).toBeGreaterThanOrEqual(before);
  });

  test("a local create on a live slice places the row and is not counted twice", async () => {
    const { instance, signal } = await arrange();
    const created = "cccccccccccccccccccccccc";
    signal.calls.createStoreTestItem = mock(
      async (data: Record<string, unknown>) =>
        new StoreTestFull({ id: created, ...data, createdAt: new Date(200) } as never),
    );
    await instance.do.newStoreTestItem({ title: "Cyd", count: 0, tags: [] });
    await instance.do.createStoreTestItemInForm({ sliceName: "storeTestItemByTitle" });
    expect(liveState(instance).titles).toEqual(["Ada", "Cyd", "Ben"]);
    expect(liveState(instance).count).toBe(3);

    await instance.do.applyLiveStoreTestItemByTitle({ op: "enter", id: created, light: light(created, "Cyd", 200) });
    expect(liveState(instance).count).toBe(3);
    expect(liveState(instance).ids.filter((id) => id === created)).toHaveLength(1);
  });

  test("watching a live slice opens its generated room and closes it on release", async () => {
    const { instance, signal } = await arrange();
    await instance.do.watchLiveStoreTestItemByTitle(["Ada"]);
    expect(signal.rooms).toHaveLength(1);
    expect(signal.rooms[0].args).toEqual(["Ada"]);
    expect(signal.rooms[0].open).toBe(true);

    signal.rooms[0].handleEvent({ op: "leave", id: "aaaaaaaaaaaaaaaaaaaaaaaa" });
    expect(liveState(instance).ids).toEqual(["bbbbbbbbbbbbbbbbbbbbbbbb"]);

    await instance.do.watchLiveStoreTestItemByTitle(["Ada"]);
    expect(signal.rooms).toHaveLength(1);

    await instance.do.watchLiveStoreTestItemByTitle(["Ben"]);
    expect(signal.rooms[0].open).toBe(false);
    expect(signal.rooms).toHaveLength(2);
    expect(signal.rooms[1].args).toEqual(["Ben"]);

    await instance.do.watchLiveStoreTestItemByTitle(null);
    expect(signal.rooms[1].open).toBe(false);
  });

  test("a filled pauseOn argument opens no room, and clearing it opens one", async () => {
    const { instance, signal } = await arrange();
    await instance.do.watchLiveStoreTestItemBySearch(["Ada", "lovelace"]);
    expect(signal.rooms).toHaveLength(0);

    await instance.do.watchLiveStoreTestItemBySearch(["Ada", null]);
    expect(signal.rooms).toHaveLength(1);
    // Trimmed and re-expanded like the list query; the fetch handler sends the hole as null so room ids match.
    expect(signal.rooms[0].args).toEqual(["Ada", undefined]);

    await instance.do.watchLiveStoreTestItemBySearch(["Ada", "lovelace"]);
    expect(signal.rooms[0].open).toBe(false);
    expect(signal.rooms).toHaveLength(1);
  });

  test("a room that comes back after a drop reloads the list", async () => {
    const { instance, signal } = await arrange();
    await instance.do.watchLiveStoreTestItemByTitle(["Ada"]);
    signal.calls.storeTestItemListByTitle.mockClear();
    signal.rooms[0].onResync?.();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(signal.calls.storeTestItemListByTitle).toHaveBeenCalled();
  });

  test("an invalidate stamps the list stale and touches nothing else", async () => {
    const { instance } = await arrange();
    const before = liveState(instance);
    await instance.do.applyLiveStoreTestItemByTitle({ op: "invalidate", id: "cccccccccccccccccccccccc" });
    const after = liveState(instance);
    expect(after.ids).toEqual(before.ids);
    expect(after.count).toBe(before.count);
    expect(after.staleAt).toBeGreaterThanOrEqual(before.staleAt);
  });
});
