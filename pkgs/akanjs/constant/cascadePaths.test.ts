import { describe, expect, test } from "bun:test";
import { ID } from "akanjs/base";
import { ConstantRegistry, via } from ".";

const AssetInput = via((f) => ({ url: f(String) }));
const AssetObject = via(AssetInput, () => ({}));
const AssetLight = via(AssetObject, ["url"] as const, () => ({}));
const AssetFull = via(AssetObject, AssetLight, () => ({}));
const AssetInsight = via(AssetFull, () => ({}));
ConstantRegistry.buildModel("cascadeTestAsset", AssetInput, AssetObject, AssetFull, AssetLight, AssetInsight, {
  AssetInput,
  AssetObject,
  AssetFull,
  AssetLight,
  AssetInsight,
});

const TagInput = via((f) => ({ name: f(String) }));
ConstantRegistry.buildScalar("cascadeTestTag", TagInput, { TagInput });

describe("CascadePaths", () => {
  test("collects single and array relation fields", () => {
    const Model = via((f) => ({
      cover: f(AssetFull, { cascade: "remove" }).optional(),
      gallery: f([AssetFull], { cascade: "remove" }),
      untouched: f(AssetFull).optional(),
    }));

    expect([...Model.cascade.remove.keys()]).toEqual(["cover", "gallery"]);
    expect(ConstantRegistry.getRefName(Model.cascade.remove.get("cover"))).toBe("cascadeTestAsset");
  });

  test("merges input and object declarations into the full model", () => {
    const Input = via((f) => ({ cover: f(AssetFull, { cascade: "remove" }).optional() }));
    const Object_ = via(Input, (f) => ({ backup: f(AssetFull, { cascade: "remove" }).optional() }));
    const Light = via(Object_, ["cover"] as const, () => ({}));
    const Full = via(Object_, Light, () => ({}));

    expect([...Full.cascade.remove.keys()]).toEqual(["cover", "backup"]);
  });

  test("names the field when the action is unknown", () => {
    // A macro import and a bundled build both reach the collector without a typecheck, so the union alone is not
    // enough: an unknown action would otherwise be dropped and the field would look wired up.
    expect(() => via((f) => ({ cover: f(AssetFull, { cascade: "detach" as never }) }))).toThrow(
      'Cascade field "cover" declares cascade: "detach", which is not one of remove',
    );
  });

  test("rejects a field with no document of its own to remove", () => {
    expect(() => via((f) => ({ name: f(String, { cascade: "remove" }) }))).toThrow(
      'Cascade field "name" is not a model reference',
    );
    // An id is not a reference the framework can resolve to a model, so it names no service to remove through.
    expect(() => via((f) => ({ assetId: f(ID, { cascade: "remove" }) }))).toThrow("is not a model reference");
    // A scalar is embedded in the parent's `_doc` and has no row to remove.
    expect(() => via((f) => ({ tag: f(TagInput, { cascade: "remove" }) }))).toThrow("is not a model reference");
  });

  test("rejects a nested array", () => {
    expect(() => via((f) => ({ grid: f([[AssetFull]], { cascade: "remove" }) }))).toThrow(
      'Cascade field "grid" is a nested array and cannot cascade',
    );
  });
});
