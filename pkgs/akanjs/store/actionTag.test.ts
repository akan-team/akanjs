import { beforeAll, describe, expect, test } from "bun:test";
import { Int, SLICE_META } from "akanjs/base";
import { ConstantRegistry, via } from "akanjs/constant";
import type { ClientSignal } from "akanjs/fetch";
import type { SerializedSignal } from "akanjs/signal";
import { actionTagOf } from "./actionTag";
import { store } from "./store";
import { StoreInstance } from "./storeInstance";
import { StoreRegistry } from "./storeRegistry";

const TagInput = via((f) => ({ headline: f(String), views: f(Int, { default: 0 }) }));
const TagObject = via(TagInput, () => ({}));
const TagLight = via(TagObject, ["headline"] as const, () => ({}));
const TagFull = via(TagObject, TagLight, () => ({}));
const TagInsight = via(TagFull, (f) => ({ count: f(Int, { default: 0 }) }));
const tagConstant = ConstantRegistry.buildModel("tagPost", TagInput, TagObject, TagFull, TagLight, TagInsight, {
  TagInput,
  TagObject,
  TagFull,
  TagLight,
  TagInsight,
});

const serializedSignal: SerializedSignal = { prefix: "tagPost", cruGuards: ["SignedIn"], endpoint: {}, slice: {} };

let instance: StoreInstance;

beforeAll(() => {
  process.env.AKAN_PUBLIC_APP_NAME = "tagtest";
  process.env.AKAN_PUBLIC_REPO_NAME = "tagtest";
  process.env.AKAN_PUBLIC_SERVE_DOMAIN = "localhost";
  process.env.AKAN_PUBLIC_ENV = "testing";
  const handlers: Record<string, unknown> = {};
  const signal = {
    refName: "tagPost",
    _slice: { [SLICE_META]: {} },
    cnst: tagConstant,
    fetch: new Proxy(handlers, { get: (target, key: string) => (target[key] ??= async () => null) }),
    serializedSignal,
    slices: [],
  } as unknown as ClientSignal<"tagPost">;

  class PostStore extends store(signal, () => ({ mood: "calm" })) {
    async publish() {
      await Promise.resolve();
    }
  }
  StoreRegistry.register(PostStore);
  instance = new StoreInstance(StoreRegistry.merge("tagRoot", PostStore));
});

describe("action tags", () => {
  test("a field setter carries the state path it writes, which only its generator knew", () => {
    expect(actionTagOf(instance.do.setHeadlineOnTagPost)).toEqual({
      action: "setHeadlineOnTagPost",
      state: "tagPostForm.headline",
    });
  });

  test("a plain state setter carries its key, and a module's own action carries its name", () => {
    expect(actionTagOf(instance.do.setMood)).toEqual({ action: "setMood", state: "mood" });
    expect(actionTagOf(instance.do.publish)).toEqual({ action: "publish" });
  });

  test("is invisible to a spread and to JSON, so nothing downstream sees it by accident", () => {
    expect(Object.keys(instance.do.setMood)).toEqual([]);
    expect(JSON.stringify({ ...instance.do.setMood })).toBe("{}");
  });

  test("says nothing about a function nobody tagged", () => {
    expect(actionTagOf(() => undefined)).toBeUndefined();
    expect(actionTagOf("setMood")).toBeUndefined();
    expect(actionTagOf(undefined)).toBeUndefined();
  });
});
