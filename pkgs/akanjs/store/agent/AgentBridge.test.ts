import { beforeAll, describe, expect, test } from "bun:test";
import { enumOf, Int, SLICE_META } from "akanjs/base";
import { Translator } from "akanjs/client/translator";
import { ConstantRegistry, via } from "akanjs/constant";
import type { ClientSignal } from "akanjs/fetch";
import type { SerializedSignal } from "akanjs/signal";
import { store } from "../store";
import { StoreInstance } from "../storeInstance";
import { StoreRegistry } from "../storeRegistry";
import { AgentBridge } from "./AgentBridge";

class BridgeStatus extends enumOf("bridgeStatus", ["todo", "done"] as const) {}

const NoteInput = via((f) => ({
  title: f(String),
  count: f(Int, { default: 0 }),
  status: f(BridgeStatus, { default: "todo" }),
  dueAt: f(Date).optional(),
  secretMemo: f.secret(String).optional(),
}));
const NoteObject = via(NoteInput, () => ({}));
const NoteLight = via(NoteObject, ["title"] as const, () => ({}));
const NoteFull = via(NoteObject, NoteLight, () => ({}));
const NoteInsight = via(NoteFull, (f) => ({ count: f(Int, { default: 0 }) }));
const noteConstant = ConstantRegistry.buildModel(
  "bridgeNote",
  NoteInput,
  NoteObject,
  NoteFull,
  NoteLight,
  NoteInsight,
  { NoteInput, NoteObject, NoteFull, NoteLight, NoteInsight, BridgeStatus },
);

const serializedSignal: SerializedSignal = {
  prefix: "bridgeNote",
  getGuards: ["SignedIn"],
  cruGuards: ["SignedIn"],
  endpoint: {},
  slice: { "": { args: [] } },
};

const makeSignal = () => {
  const handlers: Record<string, unknown> = {};
  const fetch = new Proxy(handlers, { get: (target, key: string) => (target[key] ??= async () => null) });
  return {
    refName: "bridgeNote",
    _slice: { [SLICE_META]: {} },
    cnst: noteConstant,
    fetch,
    serializedSignal,
    slices: [],
  } as unknown as ClientSignal<"bridgeNote">;
};

let bridge: AgentBridge;
let instance: StoreInstance;

beforeAll(() => {
  process.env.AKAN_PUBLIC_APP_NAME = "bridgetest";
  process.env.AKAN_PUBLIC_REPO_NAME = "bridgetest";
  process.env.AKAN_PUBLIC_SERVE_DOMAIN = "localhost";
  process.env.AKAN_PUBLIC_ENV = "testing";
  Translator.setActiveLocale("en");

  class NoteStore extends store(makeSignal(), () => ({ draft: "", tally: { runs: 0 } })) {
    async submitDraft() {
      await Promise.resolve();
    }
  }
  StoreRegistry.register(NoteStore);
  instance = new StoreInstance(StoreRegistry.merge("bridgeRoot", NoteStore));
  bridge = new AgentBridge(instance);
  // What a mounted component's subscription does: an unread key is not part of the screen's surface.
  instance.retainLive("draft");
  instance.retainLive("bridgeNoteForm");
});

describe("AgentBridge read", () => {
  test("strips a secret field the user typed into the form", () => {
    // The form is the case the mask exists for: it holds what the user typed, and an in-page agent ships what it
    // reads to a remote model. `immerify` has already dropped the class, so the model comes from the declaration.
    const form = instance.get().bridgeNoteForm as Record<string, unknown>;
    instance.set({ bridgeNoteForm: { ...form, title: "Ship it", secretMemo: "hunter2" } });
    const read = bridge.read("bridgeNoteForm") as Record<string, unknown>;
    expect(read.title).toBe("Ship it");
    expect(read).not.toHaveProperty("secretMemo");
  });

  test("passes a primitive through and refuses an object no model claims", () => {
    expect(bridge.read("draft")).toBe("");
    instance.retainLive("tally");
    expect(() => bridge.read("tally")).toThrow("belongs to no model");
    instance.releaseLive("tally");
    expect(() => bridge.read("nothingHere")).toThrow("Unknown state key");
  });
});

describe("AgentBridge live keys", () => {
  test("reads the keys the screen subscribes, not the rest of their store", () => {
    // Key-level, not store-level: a component reading the form says nothing about the list beside it.
    expect(bridge.readableKeys()).toEqual(["bridgeNoteForm", "draft"]);
    expect(() => bridge.read("pageOfBridgeNote")).toThrow('State key "pageOfBridgeNote" is not read by this screen');
    instance.releaseLive("draft");
    expect(bridge.readableKeys()).toEqual(["bridgeNoteForm"]);
    expect(() => bridge.read("draft")).toThrow("not read by this screen");
    instance.retainLive("draft");
    expect(bridge.read("draft")).toBe("");
  });

  test("a zone view reads only what its own subtree subscribes", () => {
    instance.retainLive("pageOfBridgeNote", "notes");
    expect(bridge.readableKeys("notes")).toEqual(["pageOfBridgeNote"]);
    expect(bridge.read("pageOfBridgeNote", "notes")).toBe(1);
    expect(() => bridge.read("pageOfBridgeNote", "other")).toThrow("not read by this screen");
    // Zones are views, not walls: the root still sees what a zone reads.
    expect(bridge.readableKeys()).toContain("pageOfBridgeNote");
    instance.releaseLive("pageOfBridgeNote", "notes");
  });
});
