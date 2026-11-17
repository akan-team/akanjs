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
const referenceId = "apps/x/lib/__client/sprocket.ref.ts#reference";
const referenceTag = Symbol.for("react.client.reference");
//? The shape React's `registerClientReference` returns for a bundled `"use client"` export: a function.
const reference = Object.defineProperties(() => undefined, {
  $$typeof: { value: referenceTag },
  $$id: { value: referenceId },
  $$async: { value: false },
});
const idOf = (handoff: Record<string, unknown> | undefined) => {
  const { $$typeof, $$id } = (handoff?._runtime ?? {}) as { $$typeof?: symbol; $$id?: string };
  return $$typeof === referenceTag ? $$id : undefined;
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
      expect(Object.keys(fetch.slice.sprocket ?? {})).toEqual(["refName", "sliceName", "argLength", "_runtime"]);
      expect(idOf(fetch.slice.sprocket)).toBe(referenceId);
      expect(idOf(fetch.slice.sprocketInShop)).toBe(referenceId);
    }
  });

  test("carries it on the init, awaited or read as a promise, and on what `getInit` resolves", async () => {
    FetchClient.setModelRuntimes({ sprocket: reference });
    const fetch = clientOf();
    const handle = fetch.initSprocket();
    expect(idOf(await handle.sprocketInit)).toBe(referenceId);
    const awaited = (await handle) as unknown as Record<string, Record<string, unknown>>;
    expect(idOf(awaited.sprocketInit)).toBe(referenceId);
    expect(idOf(await fetch.initSprocketInShop().sprocketInitInShop)).toBe(referenceId);
    expect(idOf((await fetch.getSprocketInit()) as unknown as Record<string, unknown>)).toBe(referenceId);
  });

  test("carries it on the view and the edit payload, and on what `getView` and `getEdit` resolve", async () => {
    FetchClient.setModelRuntimes({ sprocket: reference });
    const fetch = clientOf();
    expect(idOf(await fetch.viewSprocket("s1").sprocketView)).toBe(referenceId);
    expect(idOf(await fetch.editSprocket("s1").sprocketEdit)).toBe(referenceId);
    expect(idOf((await fetch.getSprocketView("s1")) as unknown as Record<string, unknown>)).toBe(referenceId);
    expect(idOf((await fetch.getSprocketEdit("s1")) as unknown as Record<string, unknown>)).toBe(referenceId);
  });

  test("a clone made for one request hands the same reference over", async () => {
    FetchClient.setModelRuntimes({ sprocket: reference });
    const fetch = clientOf();
    const clone = fetch.clone();
    expect(idOf(clone.slice.sprocket)).toBe(referenceId);
    clone.instance.handler.sprocket = async () => ({ id: "s1", name: "first" });
    expect(idOf(await clone.viewSprocket("s1").sprocketView)).toBe(referenceId);
  });
});

describe("a handoff taken before the references were registered", () => {
  test("a slice meta a module kept carries the reference without `fetch.slice` being read again", () => {
    const kept = clientOf().slice.sprocket;
    expect(idOf(kept)).toBeUndefined();

    FetchClient.setModelRuntimes({ sprocket: reference });

    expect(idOf(kept)).toBe(referenceId);
  });

  test("an init handle and a view handle built before carry it on what they resolve after", async () => {
    const fetch = clientOf();
    const init = fetch.initSprocket();
    const view = fetch.viewSprocket("s1");

    FetchClient.setModelRuntimes({ sprocket: reference });

    expect(idOf(await init.sprocketInit)).toBe(referenceId);
    expect(idOf(await view.sprocketView)).toBe(referenceId);
  });
});

describe("a copy of a handoff that carries a reference", () => {
  test("keeps the reference when it is a spread or an `Object.assign`", async () => {
    FetchClient.setModelRuntimes({ sprocket: reference });
    const fetch = clientOf();
    const init = await fetch.initSprocket().sprocketInit;

    expect(idOf({ ...init })).toBe(referenceId);
    expect(idOf(Object.assign({}, fetch.slice.sprocket))).toBe(referenceId);
    expect(idOf({ ...(await fetch.viewSprocket("s1").sprocketView), extra: 1 })).toBe(referenceId);
  });

  test("still clones with `structuredClone` and through JSON, where the copy holds an empty object instead", async () => {
    FetchClient.setModelRuntimes({ sprocket: reference });
    const fetch = clientOf();
    const handoffs = [
      fetch.slice.sprocket,
      await fetch.initSprocket().sprocketInit,
      await fetch.viewSprocket("s1").sprocketView,
      await fetch.editSprocket("s1").sprocketEdit,
    ];

    for (const handoff of handoffs) {
      const cloned = structuredClone(handoff) as Record<string, unknown>;
      const parsed = JSON.parse(JSON.stringify(handoff)) as Record<string, unknown>;
      for (const copy of [cloned, parsed]) {
        expect(copy._runtime).toEqual({});
        expect(idOf(copy)).toBeUndefined();
        expect(copy.refName).toBe("sprocket");
      }
    }
  });
});

describe("a client built with no signal of its own", () => {
  test("lists the slices another client of the same server registered, before any handler is read", () => {
    const { fetch: libFetch } = FetchClient.build({}, {}, { origin: "https://app.example" });
    clientOf();

    const slices = (libFetch as unknown as Probed).slice;

    expect(slices.sprocket).toEqual({ refName: "sprocket", sliceName: "sprocket", argLength: 0 });
    expect(slices.sprocketInShop?.sliceName).toBe("sprocketInShop");
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
    expect(idOf(fetch.slice.sprocket)).toBe(referenceId);
    FetchClient.setModelRuntimes(null);
    expect("_runtime" in (fetch.slice.sprocket ?? {})).toBe(false);
  });
});
