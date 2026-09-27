import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { installMockHost } from "@akanjs/native/core/testing";
import { Int, resetEnvCache, SLICE_META, STATE_DERIVED_META } from "akanjs/base";
import { ConstantRegistry, via } from "akanjs/constant";
import type { ClientSignal } from "akanjs/fetch";
import type { SerializedSignal } from "akanjs/signal";
import { DraftStore } from "./draftStore";
import { store } from "./store";
import { MemoryStorage, setTestEnv } from "./store.fixture";
import { StoreInstance } from "./storeInstance";
import { StoreRegistry } from "./storeRegistry";

const NoteInput = via((f) => ({
  title: f(String),
  count: f(Int, { default: 0 }),
  token: f.secret(String).optional(),
}));
const NoteObject = via(NoteInput, () => ({}));
const NoteLight = via(NoteObject, ["title"] as const, () => ({}));
const NoteFull = via(NoteObject, NoteLight, () => ({}));
const NoteInsight = via(NoteFull, (f) => ({ count: f(Int, { default: 0 }) }));
const noteConstant = ConstantRegistry.buildModel("draftNote", NoteInput, NoteObject, NoteFull, NoteLight, NoteInsight, {
  NoteInput,
  NoteObject,
  NoteFull,
  NoteLight,
  NoteInsight,
});

const NOTE_ID = "aaaaaaaaaaaaaaaaaaaaaaaa";
let serverUpdatedAt = new Date("2026-01-01T00:00:00.000Z");
let serverTitle = "from server";

const makeSignal = () => {
  const calls: Record<string, ReturnType<typeof mock>> = {
    createDraftNote: mock(async (data: Record<string, unknown>) => new NoteFull({ id: NOTE_ID, ...data })),
    updateDraftNote: mock(async (id: string, data: Record<string, unknown>) => new NoteFull({ id, ...data })),
    draftNote: mock(
      async (id: string) => new NoteFull({ id, title: serverTitle, updatedAt: serverUpdatedAt } as never),
    ),
    draftNoteList: mock(async () => []),
    draftNoteInsight: mock(async () => new NoteInsight({ count: 0 })),
  };
  const fetch = new Proxy(calls, {
    get(target, key: string) {
      target[key] ??= mock(async () => null);
      return target[key];
    },
  });
  const serializedSignal: SerializedSignal = { prefix: "draftNote", endpoint: {}, slice: { "": { args: [] } } };
  return {
    refName: "draftNote",
    _slice: { [SLICE_META]: {} },
    cnst: noteConstant,
    fetch,
    serializedSignal,
    slices: [],
    calls,
  } as unknown as ClientSignal<"draftNote"> & { calls: typeof calls };
};

let storage: MemoryStorage;
let rootIndex = 0;

const makeInstance = () => {
  class NoteStore extends store(makeSignal(), () => ({})) {}
  StoreRegistry.register(NoteStore);
  rootIndex += 1;
  return new StoreInstance(StoreRegistry.merge(`draftRoot${rootIndex}`, NoteStore)) as unknown as {
    get: () => Record<string, any>;
    do: Record<string, (...args: any[]) => any>;
    flushDrafts: () => void;
  };
};

/** Draft records only — `akan.draft-identity.<app>` shares the storage and is deliberately not one. */
const draftCount = () =>
  [...Array(storage.length).keys()].filter((index) => storage.key(index)?.startsWith("akan.draft.")).length;

/** The store fires its draft read with `void`; two macrotasks is well past it. */
const settle = async () => {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
};

beforeEach(() => {
  setTestEnv("drafttest");
  resetEnvCache();
  serverUpdatedAt = new Date("2026-01-01T00:00:00.000Z");
  serverTitle = "from server";
  storage = new MemoryStorage();
  Object.defineProperty(globalThis, "window", {
    value: {
      localStorage: storage,
      location: { pathname: "/notes", protocol: "http:", host: "localhost" },
      addEventListener: () => undefined,
    },
    configurable: true,
  });
  Object.defineProperty(globalThis, "localStorage", { value: storage, configurable: true });
  Object.defineProperty(globalThis, "document", {
    value: { cookie: "", visibilityState: "visible", addEventListener: () => undefined },
    configurable: true,
  });
});

afterEach(() => {
  Reflect.deleteProperty(globalThis, "window");
  Reflect.deleteProperty(globalThis, "localStorage");
  Reflect.deleteProperty(globalThis, "document");
  resetEnvCache();
});

describe("form draft lifecycle", () => {
  test("saves a new form under its scope and restores it on the next open", async () => {
    const first = makeInstance();
    first.do.newDraftNote({}, { draftScope: "new:scope-a" });
    await settle();
    first.do.setTitleOnDraftNote("half typed");
    first.flushDrafts();
    await settle();

    const second = makeInstance();
    second.do.newDraftNote({}, { draftScope: "new:scope-a" });
    await settle();
    expect(second.get().draftNoteForm.title).toBe("half typed");
    expect(second.get().draftNoteFormDraft.appliedAt).toBeInstanceOf(Date);
  });

  test("does not restore into a different scope", async () => {
    const first = makeInstance();
    first.do.newDraftNote({}, { draftScope: "new:scope-a" });
    await settle();
    first.do.setTitleOnDraftNote("belongs to a");
    first.flushDrafts();
    await settle();

    const second = makeInstance();
    second.do.newDraftNote({}, { draftScope: "new:scope-b" });
    await settle();
    expect(second.get().draftNoteForm.title).toBe("");
    expect(second.get().draftNoteFormDraft.appliedAt).toBeNull();
  });

  test("writes a pending draft when the native shell goes to the background", async () => {
    const host = installMockHost({ platform: "ios", plugins: { "app-state": { events: ["change"] } } });
    try {
      const instance = makeInstance();
      instance.do.newDraftNote({}, { draftScope: "new:scope-bg" });
      await settle();
      instance.do.setTitleOnDraftNote("typed before the app left");
      await settle();
      expect(draftCount()).toBe(0);

      host.emit("app-state", "change", { state: "inactive" });
      await settle();
      expect(draftCount()).toBe(0);
      host.emit("app-state", "change", { state: "background" });
      await settle();
      expect(draftCount()).toBe(1);
    } finally {
      host.uninstall();
    }
  });

  test("saves nothing when no scope is armed", async () => {
    const instance = makeInstance();
    instance.do.newDraftNote({});
    await settle();
    instance.do.setTitleOnDraftNote("unsaved");
    instance.flushDrafts();
    await settle();
    expect(instance.get().draftNoteFormDraft).toBeNull();
    expect(draftCount()).toBe(0);
  });

  test("drops the record once the form is back where it opened", async () => {
    const instance = makeInstance();
    instance.do.newDraftNote({}, { draftScope: "new:scope-a" });
    await settle();
    instance.do.setTitleOnDraftNote("typed");
    instance.flushDrafts();
    await settle();
    expect(draftCount()).toBe(1);

    instance.do.setTitleOnDraftNote("");
    instance.flushDrafts();
    await settle();
    expect(draftCount()).toBe(0);
  });

  test("never writes a secret field", async () => {
    const instance = makeInstance();
    instance.do.newDraftNote({}, { draftScope: "new:scope-a" });
    await settle();
    instance.do.setTokenOnDraftNote("hunter2");
    instance.do.setTitleOnDraftNote("with a token");
    instance.flushDrafts();
    await settle();
    expect(storage.getItem(DraftStore.keyOf("draftNote", "new:scope-a"))).not.toContain("hunter2");
  });

  test("an edit whose record has not moved restores straight into the form", async () => {
    const first = makeInstance();
    await first.do.editDraftNote(NOTE_ID, { draftScope: DraftStore.editScope(NOTE_ID) });
    await settle();
    first.do.setTitleOnDraftNote("my unsaved edit");
    first.flushDrafts();
    await settle();

    const second = makeInstance();
    await second.do.editDraftNote(NOTE_ID, { draftScope: DraftStore.editScope(NOTE_ID) });
    await settle();
    expect(second.get().draftNoteForm.title).toBe("my unsaved edit");
    expect(second.get().draftNoteFormDraft.pending).toBeNull();
  });

  test("an edit whose record has moved leaves the draft pending and never overwrites the server value", async () => {
    const first = makeInstance();
    await first.do.editDraftNote(NOTE_ID, { draftScope: DraftStore.editScope(NOTE_ID) });
    await settle();
    first.do.setTitleOnDraftNote("my unsaved edit");
    first.flushDrafts();
    await settle();

    serverUpdatedAt = new Date("2026-02-02T00:00:00.000Z");
    const second = makeInstance();
    await second.do.editDraftNote(NOTE_ID, { draftScope: DraftStore.editScope(NOTE_ID) });
    await settle();
    expect(second.get().draftNoteForm.title).toBe("from server");
    expect(second.get().draftNoteFormDraft.pending.form.title).toBe("my unsaved edit");

    second.do.restoreDraftNoteFormDraft();
    expect(second.get().draftNoteForm.title).toBe("my unsaved edit");
    expect(second.get().draftNoteFormDraft.pending).toBeNull();
    expect(second.get().draftNoteFormDraft.appliedAt).toBeInstanceOf(Date);
  });

  test("drops a draft the record has caught up with instead of offering it back", async () => {
    const first = makeInstance();
    await first.do.editDraftNote(NOTE_ID, { draftScope: DraftStore.editScope(NOTE_ID) });
    await settle();
    first.do.setTitleOnDraftNote("autosaved");
    first.flushDrafts();
    await settle();
    expect(draftCount()).toBe(1);

    serverTitle = "autosaved";
    serverUpdatedAt = new Date("2026-02-02T00:00:00.000Z");
    const second = makeInstance();
    await second.do.editDraftNote(NOTE_ID, { draftScope: DraftStore.editScope(NOTE_ID) });
    await settle();
    expect(second.get().draftNoteForm.title).toBe("autosaved");
    expect(second.get().draftNoteFormDraft.pending).toBeNull();
    expect(second.get().draftNoteFormDraft.appliedAt).toBeNull();
    expect(draftCount()).toBe(0);
  });

  test("discarding an applied draft puts back the form the editor opened with", async () => {
    const first = makeInstance();
    first.do.newDraftNote({ title: "seeded" }, { draftScope: "new:scope-a" });
    await settle();
    first.do.setTitleOnDraftNote("typed over the seed");
    first.flushDrafts();
    await settle();

    const second = makeInstance();
    second.do.newDraftNote({ title: "seeded" }, { draftScope: "new:scope-a" });
    await settle();
    expect(second.get().draftNoteForm.title).toBe("typed over the seed");

    second.do.discardDraftNoteFormDraft();
    expect(second.get().draftNoteForm.title).toBe("seeded");
    expect(second.get().draftNoteFormDraft.appliedAt).toBeNull();
    expect(draftCount()).toBe(0);
  });

  test("a successful submit clears the record and disarms saving", async () => {
    const instance = makeInstance();
    instance.do.newDraftNote({}, { draftScope: "new:scope-a" });
    await settle();
    instance.do.setTitleOnDraftNote("about to submit");
    instance.flushDrafts();
    await settle();
    expect(draftCount()).toBe(1);

    await instance.do.submitDraftNote();
    await settle();
    expect(draftCount()).toBe(0);
    expect(instance.get().draftNoteFormDraft).toBeNull();
  });

  test("resetting clears the record too", async () => {
    const instance = makeInstance();
    instance.do.newDraftNote({}, { draftScope: "new:scope-a" });
    await settle();
    instance.do.setTitleOnDraftNote("abandoned");
    instance.flushDrafts();
    await settle();

    instance.do.resetDraftNote();
    await settle();
    expect(draftCount()).toBe(0);
    expect(instance.get().draftNoteFormDraft).toBeNull();
  });
});

describe("form draft write scheduling", () => {
  test("keeps the original savedAt when a draft is auto-applied rather than re-stamping it", async () => {
    const first = makeInstance();
    first.do.newDraftNote({}, { draftScope: "new:scope-a" });
    await settle();
    first.do.setTitleOnDraftNote("typed a while ago");
    first.flushDrafts();
    await settle();
    const savedAt = JSON.parse(storage.getItem(DraftStore.keyOf("draftNote", "new:scope-a")) ?? "{}").savedAt;

    const second = makeInstance();
    second.do.newDraftNote({}, { draftScope: "new:scope-a" });
    await settle();
    second.flushDrafts();
    await settle();
    expect(JSON.parse(storage.getItem(DraftStore.keyOf("draftNote", "new:scope-a")) ?? "{}").savedAt).toBe(savedAt);
  });
});

// An app store extending a lib store for the same model sends every lib entry through `StoreRegistry.merge` twice.
describe("a lib store extended by an app store", () => {
  test("merges when both are registered, and the model keeps one draft entry", () => {
    class LibExtStore extends store(makeSignal(), () => ({})) {}
    class AppExtStore extends store(makeSignal(), () => ({ appOnly: true }), LibExtStore) {}
    const root = StoreRegistry.merge("draftExtRoot", LibExtStore, AppExtStore);
    expect(Object.keys(root[STATE_DERIVED_META].drafts)).toEqual(["draftNoteForm"]);
    expect(root[STATE_DERIVED_META].drafts.draftNoteForm.draftKey).toBe("draftNoteFormDraft");
  });

  test("merges a lib store's persist and computed keys rather than calling them duplicates", () => {
    class LibPrefStore extends store(
      "draftPref" as const,
      ({ persist }) => ({ count: persist(Int, { default: 1 }) }),
      ({ computed }) => ({ label: computed(["count"], (count) => `count:${count}`) }),
    ) {}
    class AppPrefStore extends store("draftPref" as const, () => ({ appOnly: true }), LibPrefStore) {}
    const root = StoreRegistry.merge("draftPrefRoot", LibPrefStore, AppPrefStore);
    expect(root[STATE_DERIVED_META].persistSession.count.kind).toBe("persist");
    expect([...root[STATE_DERIVED_META].derivedKeys]).toEqual(["label"]);
  });

  test("still rejects two independent declarations of one state key", () => {
    class FirstOwnerStore extends store("draftOwnerA" as const, ({ persist }) => ({
      shared: persist(Int, { default: 1 }),
    })) {}
    class SecondOwnerStore extends store("draftOwnerB" as const, ({ persist }) => ({
      shared: persist(Int, { default: 2 }),
    })) {}
    expect(() => StoreRegistry.merge("draftOwnerRoot", FirstOwnerStore, SecondOwnerStore)).toThrow(
      "Duplicate state metadata key: shared",
    );
  });
});
