import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { ConstantRegistry, via } from "akanjs/constant";
import type { SerializedSignal } from "akanjs/signal";
import { FetchClient } from "./fetchClient";

const SprocketInput = via((field) => ({ name: field(String) }));
const SprocketObject = via(SprocketInput, () => ({}));
const LightSprocket = via(SprocketObject, ["name"] as const, () => ({}));
class Sprocket extends via(SprocketObject, LightSprocket, () => ({})) {}
const SprocketInsight = via(Sprocket, () => ({}));
ConstantRegistry.buildModel("sprocket", SprocketInput, SprocketObject, Sprocket, LightSprocket, SprocketInsight, {});

const sprocket: SerializedSignal = {
  prefix: "sprocket",
  slice: { "": { args: [], guards: ["Public"] }, inShop: { args: [], guards: ["Public"] } },
  getGuards: ["Public"],
  cruGuards: ["Public"],
  endpoint: {},
};
const reference = {
  $$typeof: Symbol.for("react.client.reference"),
  $$id: "apps/x/lib/__client/sprocket.ref.ts#reference",
};

type Handoffs = Record<string, (...args: unknown[]) => Record<string, Promise<Record<string, unknown>>>>;
interface Probed {
  slice: Record<string, Record<string, unknown>>;
  instance: { handler: Record<string, unknown> };
  clone: () => Probed & Handoffs;
}
const clientOf = () => {
  const { fetch } = FetchClient.build({}, { sprocket }, { origin: "https://app.example" });
  const handler = fetch.instance.handler;
  handler.sprocket = async () => ({ id: "s1", name: "first" });
  handler.sprocketList = async () => [{ id: "s1", name: "first" }];
  handler.sprocketInsight = async () => ({ count: 1 });
  handler.sprocketListInShop = async () => [];
  handler.sprocketInsightInShop = async () => ({ count: 0 });
  return fetch as unknown as Probed & Handoffs;
};

beforeEach(() => {
  FetchClient.resetSharedRegistry();
  FetchClient.setModelRuntimes(null);
});
afterEach(() => {
  FetchClient.setModelRuntimes(null);
});

describe("a handoff of a model whose client reference is registered", () => {
  test("carries the reference on the slice meta, of a client built before or after the registration", () => {
    const before = clientOf();
    FetchClient.setModelRuntimes({ sprocket: reference });
    const after = clientOf();
    for (const fetch of [before, after]) {
      expect(fetch.slice.sprocket).toEqual({
        refName: "sprocket",
        sliceName: "sprocket",
        argLength: 0,
        _runtime: reference,
      });
      expect(fetch.slice.sprocketInShop?._runtime).toBe(reference);
    }
  });

  test("carries it on the init, awaited or read as a promise, and on what `getInit` resolves", async () => {
    FetchClient.setModelRuntimes({ sprocket: reference });
    const fetch = clientOf();
    const handle = fetch.initSprocket();
    expect((await handle.sprocketInit)._runtime).toBe(reference);
    const awaited = (await handle) as unknown as Record<string, Record<string, unknown>>;
    expect(awaited.sprocketInit._runtime).toBe(reference);
    expect((await fetch.initSprocketInShop().sprocketInitInShop)._runtime).toBe(reference);
    expect(((await fetch.getSprocketInit()) as unknown as Record<string, unknown>)._runtime).toBe(reference);
  });

  test("carries it on the view and the edit payload, and on what `getView` and `getEdit` resolve", async () => {
    FetchClient.setModelRuntimes({ sprocket: reference });
    const fetch = clientOf();
    expect((await fetch.viewSprocket("s1").sprocketView)._runtime).toBe(reference);
    expect((await fetch.editSprocket("s1").sprocketEdit)._runtime).toBe(reference);
    expect(((await fetch.getSprocketView("s1")) as unknown as Record<string, unknown>)._runtime).toBe(reference);
    expect(((await fetch.getSprocketEdit("s1")) as unknown as Record<string, unknown>)._runtime).toBe(reference);
  });

  test("a clone made for one request hands the same reference over", async () => {
    FetchClient.setModelRuntimes({ sprocket: reference });
    const fetch = clientOf();
    const clone = fetch.clone();
    clone.instance.handler.sprocket = async () => ({ id: "s1", name: "first" });
    expect(clone.slice.sprocket?._runtime).toBe(reference);
    expect((await clone.viewSprocket("s1").sprocketView)._runtime).toBe(reference);
  });
});

describe("a handoff of a model with no client reference", () => {
  test("has no `_runtime` key at all, so the payload is what it was", async () => {
    const fetch = clientOf();
    expect(Object.keys(fetch.slice.sprocket ?? {})).toEqual(["refName", "sliceName", "argLength"]);
    expect("_runtime" in (await fetch.initSprocket().sprocketInit)).toBe(false);
    expect(Object.keys(await fetch.viewSprocket("s1").sprocketView)).toEqual([
      "refName",
      "sprocketObj",
      "sprocketViewAt",
    ]);
    expect("_runtime" in (await fetch.editSprocket("s1").sprocketEdit)).toBe(false);
  });

  test("a model the references leave out stays bare while its neighbour carries one", () => {
    FetchClient.setModelRuntimes({ gadget: reference });
    expect("_runtime" in (clientOf().slice.sprocket ?? {})).toBe(false);
  });

  test("references taken back leave the slice metas they were on", () => {
    const fetch = clientOf();
    FetchClient.setModelRuntimes({ sprocket: reference });
    expect(fetch.slice.sprocket?._runtime).toBe(reference);
    FetchClient.setModelRuntimes(null);
    expect("_runtime" in (fetch.slice.sprocket ?? {})).toBe(false);
  });
});
