import "../test/registerDom";
import { afterEach, beforeAll, beforeEach, describe, expect, jest, test } from "bun:test";
import { act } from "react";
import { mount } from "./mount.fixture";
import { setTestEnv, stubSignal } from "./store.fixture";

let instance: import("./storeInstance").StoreInstance;

beforeAll(async () => {
  setTestEnv("livetest");
  const { store } = await import("./store");
  const { StoreInstance } = await import("./storeInstance");
  const { StoreRegistry } = await import("./storeRegistry");
  class LiveStore extends store("liveNote" as const, () => ({ alpha: 1, beta: "b", gamma: false })) {}
  instance = new StoreInstance(StoreRegistry.merge("liveRoot", LiveStore));
});

describe("StoreInstance liveness", () => {
  test("st.use counts a key while mounted and releases it on unmount", () => {
    const Reader = () => <span>{String(instance.use.alpha())}</span>;
    const unmount = mount(<Reader />);
    expect(instance.liveKeys.get("alpha")).toBe(1);
    unmount();
    expect(instance.liveKeys.has("alpha")).toBe(false);
  });

  test("sel and ref record the keys their selector reaches", () => {
    const Selector = () => <span>{String(instance.sel((s) => `${String(s.alpha)}-${String(s.beta)}`))}</span>;
    const Referrer = () => {
      instance.ref((s) => s.gamma);
      return null;
    };
    const unmount = mount(
      <>
        <Selector />
        <Referrer />
      </>,
    );
    expect(instance.liveKeys.get("alpha")).toBe(1);
    expect(instance.liveKeys.get("beta")).toBe(1);
    expect(instance.liveKeys.get("gamma")).toBe(1);
    unmount();
    expect(instance.liveKeys.size).toBe(0);
  });

  test("use with agent: false subscribes without joining the live set", () => {
    const Quiet = () => <span>{String(instance.use.alpha({ agent: false }))}</span>;
    const unmount = mount(<Quiet />);
    expect(instance.liveKeys.has("alpha")).toBe(false);
    act(() => instance.set({ alpha: 2 }));
    expect(document.body.textContent).toContain("2");
    unmount();
    act(() => instance.set({ alpha: 1 }));
  });

  test("a declared action wins its name over the generated set<Key> convenience", () => {
    expect(instance.generatedSetters.has("setAlpha")).toBe(true);
    expect(instance.actionArity.get("setAlpha")).toBe(1);
  });
});

describe("StoreInstance zone liveness", () => {
  test("a subscription inside an agent scope counts for that zone's view and for the root alike", async () => {
    const { ScopeContext } = await import("use-agentic");
    const Reader = () => <span>{String(instance.use.alpha())}</span>;
    const unmount = mount(
      <ScopeContext.Provider value={["comments"]}>
        <Reader />
      </ScopeContext.Provider>,
    );
    expect(instance.liveKeysIn("comments").get("alpha")).toBe(1);
    expect(instance.liveKeysIn("posts").has("alpha")).toBe(false);
    expect(instance.liveKeys.get("alpha")).toBe(1);
    unmount();
    expect(instance.liveKeysIn("comments").size).toBe(0);
    expect(instance.liveKeys.size).toBe(0);
  });

  test("nested scopes count for every ancestor view", () => {
    instance.retainLive("beta", "comments.thread");
    expect(instance.liveKeysIn("comments").get("beta")).toBe(1);
    expect(instance.liveKeysIn("comments.thread").get("beta")).toBe(1);
    expect(instance.liveKeysIn("posts").has("beta")).toBe(false);
    instance.releaseLive("beta", "comments.thread");
    expect(instance.liveKeys.size).toBe(0);
  });
});

describe("StoreInstance gated liveness", () => {
  test("a key read only behind an inactive gate is off the screen until the gate opens", async () => {
    const { AgenticSurface } = await import("use-agentic");
    const gate = new AgenticSurface().gate(false);
    instance.retainLive("beta", "", gate);
    instance.retainLive("gamma", "", gate);
    instance.retainLive("gamma");
    expect(instance.liveKeys.has("beta")).toBe(false);
    expect(instance.liveKeys.get("gamma")).toBe(1);
    gate.set(true);
    expect(instance.liveKeys.get("beta")).toBe(1);
    expect(instance.liveKeys.get("gamma")).toBe(2);
    instance.releaseLive("beta", "", gate);
    instance.releaseLive("gamma", "", gate);
    instance.releaseLive("gamma");
    expect(instance.liveKeys.size).toBe(0);
  });

  test("st.use under an inactive AgentActivity subscribes without lending the screen its key", async () => {
    const { AgentActivity } = await import("use-agentic");
    const Reader = () => <span>{String(instance.use.alpha())}</span>;
    const unmount = mount(
      <AgentActivity active={false}>
        <Reader />
      </AgentActivity>,
    );
    expect(instance.liveKeys.has("alpha")).toBe(false);
    act(() => instance.set({ alpha: 7 }));
    expect(document.body.textContent).toContain("7");
    unmount();
    act(() => instance.set({ alpha: 1 }));
    expect(instance.liveKeys.size).toBe(0);
  });
});

describe("StoreInstance draft writes", () => {
  const firstId = "aaaaaaaaaaaaaaaaaaaaaaaa";
  const secondId = "bbbbbbbbbbbbbbbbbbbbbbbb";
  const openedAt = new Date("2026-01-01T00:00:00.000Z");
  const movedAt = new Date("2026-02-02T00:00:00.000Z");
  interface DraftInstance {
    get: () => {
      slotNoteForm: { title: string };
      slotNoteFormDraft: { pending: { form: { title: string } } | null; appliedAt: Date | null } | null;
    };
    do: { [key: string]: (...args: unknown[]) => Promise<void> };
  }
  let server: { [id: string]: { title: string; updatedAt: Date } } = {};
  let rootIdx = 0;
  let makeDraftInstance: () => DraftInstance;
  let draftKeyOf: (id: string) => string;

  const storedFormOf = (id: string) => {
    const raw = localStorage.getItem(draftKeyOf(id));
    return raw ? (JSON.parse(raw) as { form: { id: string; title: string } }).form : null;
  };
  const settle = async () => {
    for (let i = 0; i < 10; i++) await Promise.resolve();
  };
  const open = async (instance: DraftInstance, id: string) => {
    await instance.do.editSlotNote(id, { draftScope: `id:${id}` });
    await settle();
  };

  beforeAll(async () => {
    const { Int } = await import("akanjs/base");
    const { ConstantRegistry, via } = await import("akanjs/constant");
    const { DraftStore } = await import("./draftStore");
    const { store } = await import("./store");
    const { StoreInstance } = await import("./storeInstance");
    const { StoreRegistry } = await import("./storeRegistry");
    const Input = via((f) => ({ title: f(String) }));
    const Obj = via(Input, () => ({}));
    const Light = via(Obj, ["title"] as const, () => ({}));
    const Full = via(Obj, Light, () => ({}));
    const Insight = via(Full, (f) => ({ count: f(Int, { default: 0 }) }));
    const cnst = ConstantRegistry.buildModel("slotNote", Input, Obj, Full, Light, Insight, {});
    const signal = stubSignal("slotNote", cnst, { prefix: "slotNote", endpoint: {}, slice: { "": { args: [] } } });
    Object.assign(signal.fetch, { slotNote: async (id: string) => new Full().set({ id, ...server[id] } as never) });
    makeDraftInstance = () => {
      class SlotNoteStore extends store(signal, () => ({})) {}
      StoreRegistry.register(SlotNoteStore);
      rootIdx += 1;
      return new StoreInstance(StoreRegistry.merge(`slotRoot${rootIdx}`, SlotNoteStore)) as unknown as DraftInstance;
    };
    draftKeyOf = (id) => DraftStore.keyOf("slotNote", DraftStore.editScope(id));
  });

  beforeEach(() => {
    jest.useFakeTimers();
    localStorage.clear();
    server = {
      [firstId]: { title: "first on server", updatedAt: openedAt },
      [secondId]: { title: "second on server", updatedAt: openedAt },
    };
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test("a write still pending when another record opens lands under the record it was typed for", async () => {
    const instance = makeDraftInstance();
    await open(instance, secondId);
    await instance.do.setTitleOnSlotNote("typed in second");
    jest.advanceTimersByTime(400);
    await settle();
    server[secondId] = { title: "second moved", updatedAt: movedAt };

    await open(instance, firstId);
    await instance.do.setTitleOnSlotNote("typed in first");
    await open(instance, secondId);
    expect(instance.get().slotNoteFormDraft?.pending?.form.title).toBe("typed in second");
    jest.advanceTimersByTime(400);
    await settle();
    expect(storedFormOf(firstId)).toMatchObject({ id: firstId, title: "typed in first" });
    expect(storedFormOf(secondId)).toMatchObject({ id: secondId, title: "typed in second" });
  });

  test("a write still pending when its record reopens at a newer version is offered back", async () => {
    const instance = makeDraftInstance();
    await open(instance, firstId);
    await instance.do.setTitleOnSlotNote("typed in first");
    server[firstId] = { title: "first moved", updatedAt: movedAt };

    await open(instance, firstId);
    jest.advanceTimersByTime(400);
    await settle();
    expect(instance.get().slotNoteForm.title).toBe("first moved");
    expect(instance.get().slotNoteFormDraft?.pending?.form.title).toBe("typed in first");
    expect(storedFormOf(firstId)?.title).toBe("typed in first");
  });

  test("discarding an applied draft right after typing leaves nothing stored", async () => {
    const instance = makeDraftInstance();
    await open(instance, firstId);
    await instance.do.setTitleOnSlotNote("typed in first");
    jest.advanceTimersByTime(400);
    await settle();
    await open(instance, firstId);
    expect(instance.get().slotNoteFormDraft?.appliedAt).toBeInstanceOf(Date);

    await instance.do.setTitleOnSlotNote("typed in first, again");
    await instance.do.discardSlotNoteFormDraft();
    jest.advanceTimersByTime(400);
    await settle();
    expect(instance.get().slotNoteForm.title).toBe("first on server");
    expect(storedFormOf(firstId)).toBeNull();
  });
});
