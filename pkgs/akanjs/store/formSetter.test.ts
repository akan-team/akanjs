import { beforeAll, describe, expect, test } from "bun:test";
import { Int } from "akanjs/base";
import { ConstantRegistry, via } from "akanjs/constant";
import type { FetchProxy } from "akanjs/fetch";
import { makeFormSetter } from "./action";
import { formSetterNames } from "./formSetterNames";
import { store } from "./store";
import { StoreRegistry } from "./storeRegistry";

const Input = via((f) => ({ title: f(String), toBiz: f(String).optional(), tags: f([String]) }));
const Obj = via(Input, () => ({}));
const Light = via(Obj, ["title"] as const, () => ({}));
const Full = via(Obj, Light, () => ({}));
const Insight = via(Full, (f) => ({ count: f(Int, { default: 0 }) }));
ConstantRegistry.buildModel("hookSheet", Input, Obj, Full, Light, Insight, {});

const WarnInput = via((f) => ({ toBiz: f(String).optional() }));
const WarnObj = via(WarnInput, () => ({}));
const WarnLight = via(WarnObj, ["toBiz"] as const, () => ({}));
const WarnFull = via(WarnObj, WarnLight, () => ({}));
const WarnInsight = via(WarnFull, (f) => ({ count: f(Int, { default: 0 }) }));
ConstantRegistry.buildModel("warnSheet", WarnInput, WarnObj, WarnFull, WarnLight, WarnInsight, {});

type Actions = { [key: string]: (...args: unknown[]) => unknown };

/** The dispatch context a store action really runs against: a plain object holding `set`/`get` and every action. */
const contextOf = (extra: Actions = {}) => {
  const state: { [key: string]: { [key: string]: unknown } } = { hookSheetForm: { title: "", toBiz: null, tags: [] } };
  const actions = makeFormSetter("hookSheet", { serializedSignal: {} } as unknown as FetchProxy<unknown>);
  const ctx: Actions & { set: (recipe: unknown) => void; get: () => unknown } = {
    ...(actions as unknown as Actions),
    ...extra,
    set: (recipe: unknown) => {
      if (typeof recipe === "function") (recipe as (draft: typeof state) => void)(state);
      else Object.assign(state, recipe);
    },
    get: () => state,
  };
  return { ctx, state };
};

let names: ReturnType<typeof formSetterNames>;
beforeAll(() => {
  names = formSetterNames("HookSheet", "toBiz");
});

describe("generated field setter", () => {
  test("the setter writes the field with no hook declared", () => {
    const { ctx, state } = contextOf();

    ctx[names.setFieldOnModel]?.call(ctx, "acme");
    expect(state.hookSheetForm.toBiz).toBe("acme");
  });

  test("a _postSet hook runs after the write, so it reads the new value", () => {
    const seen: unknown[] = [];
    const { ctx, state } = contextOf({
      [names.postSetField]: function (this: { get: () => unknown }, value: unknown) {
        seen.push([value, (this.get() as { hookSheetForm: { toBiz: unknown } }).hookSheetForm.toBiz]);
        return undefined;
      },
    });

    ctx[names.setFieldOnModel]?.call(ctx, "acme");
    expect(seen).toEqual([["acme", "acme"]]);
    expect(state.hookSheetForm.toBiz).toBe("acme");
  });

  test("the hook can reach the other generated actions, which is what a cascade needs", () => {
    const { ctx, state } = contextOf({
      [names.postSetField]: function (this: Actions, value: unknown) {
        if (value) this.addTagsOnHookSheet?.call(this, [`from:${String(value)}`]);
        return undefined;
      },
    });

    ctx[names.setFieldOnModel]?.call(ctx, "acme");
    expect(state.hookSheetForm.tags).toEqual(["from:acme"]);
  });

  test("clearing the field runs the hook too, with null", () => {
    const seen: unknown[] = [];
    const { ctx } = contextOf({
      [names.postSetField]: (value: unknown) => void seen.push(value),
    });

    ctx[names.setFieldOnModel]?.call(ctx, null);
    expect(seen).toEqual([null]);
  });

  test("a hook is per field — writing another field does not run it", () => {
    const seen: unknown[] = [];
    const { ctx } = contextOf({
      [names.postSetField]: (value: unknown) => void seen.push(value),
    });

    ctx.setTitleOnHookSheet?.call(ctx, "unrelated");
    expect(seen).toEqual([]);
  });
});

describe("post-set hook validation", () => {
  test("a misspelled hook field is named on the console", () => {
    const warned: string[] = [];
    const original = console.warn;
    console.warn = (message: string) => void warned.push(message);
    class WarnSheetStore extends store("warnSheet" as const, () => ({ warnSheetForm: {} })) {
      _postSetToBiz() {}
      _postSetToBizz() {}
    }
    StoreRegistry.register(WarnSheetStore);
    console.warn = original;
    expect(warned).toEqual(["[warnSheetStore] _postSetToBizz matches no field of warnSheet, so it will never run."]);
  });
});
