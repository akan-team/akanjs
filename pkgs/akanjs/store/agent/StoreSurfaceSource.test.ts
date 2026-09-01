import { beforeAll, describe, expect, test } from "bun:test";
import { Int, SLICE_META } from "akanjs/base";
import { Translator } from "akanjs/client/translator";
import { ConstantRegistry, via } from "akanjs/constant";
import type { ClientSignal } from "akanjs/fetch";
import type { SerializedSignal } from "akanjs/signal";
import { AgenticSurface } from "use-agentic";
import { store } from "../store";
import { StoreInstance } from "../storeInstance";
import { StoreRegistry } from "../storeRegistry";
import { AgentBridge } from "./AgentBridge";
import { StoreSurfaceSource } from "./StoreSurfaceSource";

const NoteInput = via((f) => ({ title: f(String) }));
const NoteObject = via(NoteInput, () => ({}));
const NoteLight = via(NoteObject, ["title"] as const, () => ({}));
const NoteFull = via(NoteObject, NoteLight, () => ({}));
const NoteInsight = via(NoteFull, (f) => ({ count: f(Int, { default: 0 }) }));
const noteConstant = ConstantRegistry.buildModel(
  "surfaceNote",
  NoteInput,
  NoteObject,
  NoteFull,
  NoteLight,
  NoteInsight,
  {
    NoteInput,
    NoteObject,
    NoteFull,
    NoteLight,
    NoteInsight,
  },
);

const serializedSignal: SerializedSignal = {
  prefix: "surfaceNote",
  getGuards: ["SignedIn"],
  cruGuards: ["SignedIn"],
  endpoint: {},
  slice: { "": { args: [] } },
};

const makeSignal = () => {
  const handlers: Record<string, unknown> = {};
  const fetch = new Proxy(handlers, { get: (target, key: string) => (target[key] ??= async () => null) });
  return {
    refName: "surfaceNote",
    _slice: { [SLICE_META]: {} },
    cnst: noteConstant,
    fetch,
    serializedSignal,
    slices: [],
  } as unknown as ClientSignal<"surfaceNote">;
};

let source: StoreSurfaceSource;
let instance: StoreInstance;
const entryOf = (name: string) => source.tools().find((tool) => tool.name === name);

beforeAll(() => {
  process.env.AKAN_PUBLIC_APP_NAME = "surfacetest";
  process.env.AKAN_PUBLIC_REPO_NAME = "surfacetest";
  process.env.AKAN_PUBLIC_SERVE_DOMAIN = "localhost";
  process.env.AKAN_PUBLIC_ENV = "testing";
  Translator.setActiveLocale("en");
  class SurfaceNoteStore extends store(makeSignal(), () => ({})) {
    async publishNote() {
      await Promise.resolve();
    }
  }
  StoreRegistry.register(SurfaceNoteStore);
  instance = new StoreInstance(StoreRegistry.merge("surfaceRoot", SurfaceNoteStore));
  source = new StoreSurfaceSource(new AgentBridge(instance));
  instance.retainLive("surfaceNoteForm");
});

describe("StoreSurfaceSource", () => {
  test("contributes the built-ins and nothing the store declared", () => {
    // The store's own methods and generated setters are not tools: an agent gets what a component declared.
    expect(
      source
        .tools()
        .map((tool) => tool.name)
        .sort(),
    ).toEqual(["goBack", "highlight", "navigate", "readScreen", "readState"]);
    expect(entryOf("publishNote")).toBeUndefined();
    expect(entryOf("setTitleOnSurfaceNote")).toBeUndefined();
    expect(entryOf("createSurfaceNote")).toBeUndefined();
  });

  test("readState pulls one masked state key on demand", async () => {
    const surface = new AgenticSurface();
    surface.addSource(source);
    instance.set({ surfaceNoteForm: { ...(instance.get().surfaceNoteForm as object), title: "pulled" } });
    const value = (await surface.call("readState", { key: "surfaceNoteForm" })) as { title: string };
    expect(value.title).toBe("pulled");
    await expect(surface.call("readState", { key: "nope" })).rejects.toThrow("Unknown state key: nope");
  });

  test("readState refuses a key of the same store that nothing on screen reads", async () => {
    const surface = new AgenticSurface();
    surface.addSource(source);
    await expect(surface.call("readState", { key: "pageOfSurfaceNote" })).rejects.toThrow("not read by this screen");
  });

  test("navigate drives the client router and refuses anything but an internal path", async () => {
    const { router } = await import("akanjs/client");
    router.init({ side: "server", routeManifest: [] } as never);
    const surface = new AgenticSurface();
    surface.addSource(source);
    const navigate = entryOf("navigate");
    expect(navigate?.guard?.({ path: "https://evil.example" })).toContain("internal path");
    expect(navigate?.guard?.({ path: "//evil.example" })).toContain("internal path");
    expect(navigate?.guard?.({ path: "/docs/intro" })).toBe(true);
    await expect(surface.call("navigate", { path: "https://evil.example" })).rejects.toThrow("internal path");
    // Waiting for the screen to settle has nothing to wait for with no document, so the call still answers.
    expect(await surface.call("navigate", { path: "/docs/intro" })).toContain("Now on /docs/intro.");
  });

  test("goBack is global, and refuses when there is nothing behind this page", async () => {
    const surface = new AgenticSurface();
    surface.addSource(source);
    const goBack = entryOf("goBack");
    expect(goBack?.parameters).toEqual({ type: "object", properties: {}, additionalProperties: false });
    // History is the browser's, not a control the page draws — but an entry page has nothing behind it.
    await expect(surface.call("goBack", {})).rejects.toThrow("no previous page");
  });

  test("a page's own hook registration shadows a built-in of the same name", async () => {
    const surface = new AgenticSurface();
    surface.addSource(source);
    let shadowed = 0;
    surface.registerTool([], {
      name: "readState",
      run: () => {
        shadowed += 1;
      },
    });
    await surface.call("readState", {});
    expect(shadowed).toBe(1);
  });

  test("readScreen is published and answers honestly with no document", async () => {
    const surface = new AgenticSurface();
    surface.addSource(source);
    const readScreen = entryOf("readScreen");
    expect(readScreen?.settle).toBe(false);
    expect(Object.keys((readScreen?.parameters?.properties ?? {}) as object)).toEqual(["section"]);
    expect(readScreen?.parameters?.required).toBeUndefined();
    expect(await surface.call("readScreen", {})).toBe("No rendered document is available.");
  });

  test("a section nobody is rendering is the caller's mistake, and the refusal offers what is there", async () => {
    const surface = new AgenticSurface();
    surface.addSource(source);
    await expect(surface.call("readScreen", { section: "taskList" })).rejects.toThrow(
      "No section named taskList is on screen",
    );
    // With no document there is nothing to offer, but the refusal still says how to read the screen at all.
    await expect(surface.call("readScreen", { section: "taskList" })).rejects.toThrow("This screen names no sections");
  });

  test("highlight is published as a screen-driving tool and answers honestly with no document", async () => {
    const surface = new AgenticSurface();
    surface.addSource(source);
    expect(await surface.call("highlight", { target: "submitTask" })).toBe("No rendered document is available.");
    await expect(surface.call("highlight", { target: "  " })).rejects.toThrow("highlight needs a target.");
  });
});

describe("StoreSurfaceSource zone views", () => {
  test("readState is gated by the view's own liveness", async () => {
    instance.releaseLive("surfaceNoteForm");
    instance.retainLive("surfaceNoteForm", "notes");
    const surface = new AgenticSurface();
    surface.addSource(source);
    const read = surface.view(["other"]).call("readState", { key: "surfaceNoteForm" });
    await expect(read).rejects.toThrow("not read by this screen");
    const value = (await surface.view(["notes"]).call("readState", { key: "surfaceNoteForm" })) as { title: string };
    expect(value.title).toBeDefined();
    instance.releaseLive("surfaceNoteForm", "notes");
    instance.retainLive("surfaceNoteForm");
  });

  test("the built-ins are published to every view, zone or root", () => {
    const zone = source.tools(["notes"]).map((tool) => tool.name);
    expect(zone).toEqual(["navigate", "goBack", "readScreen", "readState", "highlight"]);
  });
});
