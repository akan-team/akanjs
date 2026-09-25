import { beforeAll, describe, expect, test } from "bun:test";
import type { ClientSignal } from "akanjs/fetch";
import { createElement } from "react";
import { renderToReadableStream } from "react-dom/server.browser";

let html: string;
let bridge: InstanceType<typeof import("akanjs/store")["AgentBridge"]>;
let Dock: typeof import("./Dock")["Dock"];

/**
 * Imported after the environment is set, not before: the `akanjs/store` barrel reaches `baseSt`, which calls
 * `getEnv()` while the module is still evaluating. Static imports all run before any test body could set it.
 */
beforeAll(async () => {
  process.env.AKAN_PUBLIC_APP_NAME = "docktest";
  process.env.AKAN_PUBLIC_REPO_NAME = "docktest";
  process.env.AKAN_PUBLIC_SERVE_DOMAIN = "localhost";
  process.env.AKAN_PUBLIC_ENV = "testing";

  const [{ Int, SLICE_META }, { ConstantRegistry, via }, storeFacet, dockFacet] = await Promise.all([
    import("akanjs/base"),
    import("akanjs/constant"),
    import("akanjs/store"),
    import("./Dock"),
  ]);
  const { AgentBridge, store, StoreInstance, StoreRegistry } = storeFacet;

  const DeskInput = via((f) => ({
    label: f(String),
    seats: f(Int, { default: 0 }),
  }));
  const DeskObject = via(DeskInput, () => ({}));
  const DeskLight = via(DeskObject, ["label"] as const, () => ({}));
  const DeskFull = via(DeskObject, DeskLight, () => ({}));
  const DeskInsight = via(DeskFull, (f) => ({ count: f(Int, { default: 0 }) }));
  const cnst = ConstantRegistry.buildModel("dockDesk", DeskInput, DeskObject, DeskFull, DeskLight, DeskInsight, {
    DeskInput,
    DeskObject,
    DeskFull,
    DeskLight,
    DeskInsight,
  });

  const serializedSignal = {
    prefix: "dockDesk",
    getGuards: ["SignedIn"],
    cruGuards: ["SignedIn"],
    endpoint: {},
    slice: { "": { args: [] } },
  };
  const handlers: Record<string, unknown> = {};
  const signal = {
    refName: "dockDesk",
    _slice: { [SLICE_META]: {} },
    cnst,
    fetch: new Proxy(handlers, { get: (target, key: string) => (target[key] ??= async () => null) }),
    serializedSignal,
    slices: [],
  } as unknown as ClientSignal<"dockDesk">;

  class DeskStore extends store(signal, () => ({ deskDraft: "" })) {
    wipeDesk() {
      this.set({ deskDraft: "" });
    }
  }
  StoreRegistry.register(DeskStore);
  const instance = new StoreInstance(StoreRegistry.merge("dockRoot", DeskStore));
  Dock = dockFacet.Dock;
  bridge = new AgentBridge(instance);
  instance.retainLive("deskDraft");
  html = await new Response(await renderToReadableStream(createElement(Dock, { bridge, open: true }))).text();
});

describe("Agent.Dock", () => {
  test("renders the state keys a page can read", () => {
    expect(html).toContain("deskDraft");
    expect(html).toContain("dockDeskForm");
  });

  test("the withheld section is empty once the catalogue refuses nothing", () => {
    // Base keys used to land here as a catalogue refusal; opt-out is now `{ agent: false }` at each `st.use`.
    const count = html.match(/Withheld<\/span><span[^>]*>(\d+)</)?.[1];
    expect(count).toBe("0");
  });

  test("offers no tool the page did not declare", () => {
    // Tools come from the surface, so a store method and a generated setter appear nowhere in the dock.
    expect(html).not.toContain("wipeDesk");
    expect(html).not.toContain("setLabelOnDockDesk");
  });

  test("offers an assemble preview of the turn context", () => {
    expect(html).toContain("Assemble");
  });

  test("renders nothing in production", async () => {
    const previous = process.env.AKAN_PUBLIC_ENV;
    process.env.AKAN_PUBLIC_ENV = "main";
    try {
      const production = await new Response(
        await renderToReadableStream(createElement(Dock, { bridge, open: true })),
      ).text();
      expect(production).not.toContain("Assemble");
      expect(production).not.toContain("Agent");
    } finally {
      process.env.AKAN_PUBLIC_ENV = previous;
    }
  });
});
