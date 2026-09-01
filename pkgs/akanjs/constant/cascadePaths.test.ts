import { describe, expect, test } from "bun:test";
import { enumOf, ID } from "akanjs/base";
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

class CascadeTestOwnerType extends enumOf("cascadeTestOwnerType", ["cascadeTestAsset", "cascadeTestAlbum"] as const) {}

describe("CascadePaths removeRef", () => {
  test("collects single and array relation fields", () => {
    const Model = via((f) => ({
      cover: f(AssetFull, { cascade: "removeRef" }).optional(),
      gallery: f([AssetFull], { cascade: "removeRef" }),
      untouched: f(AssetFull).optional(),
    }));

    const cover = Model.cascade.removeRef.get("cover");
    expect([...Model.cascade.removeRef.keys()]).toEqual(["cover", "gallery"]);
    expect(cover && ConstantRegistry.getRefName(cover)).toBe("cascadeTestAsset");
  });

  test("merges input and object declarations into the full model", () => {
    const Input = via((f) => ({ cover: f(AssetFull, { cascade: "removeRef" }).optional() }));
    const Object_ = via(Input, (f) => ({ backup: f(AssetFull, { cascade: "removeRef" }).optional() }));
    const Light = via(Object_, ["cover"] as const, () => ({}));
    const Full = via(Object_, Light, () => ({}));

    expect([...Full.cascade.removeRef.keys()]).toEqual(["cover", "backup"]);
  });

  test("names the field when the action is unknown", () => {
    // A macro import and a bundled build both reach the collector without a typecheck, so the union alone is not
    // enough: an unknown action would otherwise be dropped and the field would look wired up.
    expect(() => via((f) => ({ cover: f(AssetFull, { cascade: "detach" as never }) }))).toThrow(
      'Cascade field "cover" declares cascade: "detach", which is not one of removeRef,removeWith',
    );
  });

  test("rejects a field with no document of its own to remove", () => {
    expect(() => via((f) => ({ name: f(String, { cascade: "removeRef" }) }))).toThrow(
      'Cascade field "name" is not a model reference',
    );
    // An id is not a reference the framework can resolve to a model, so it names no service to remove through.
    expect(() => via((f) => ({ assetId: f(ID, { cascade: "removeRef" }) }))).toThrow("is not a model reference");
    // A scalar is embedded in the parent's `_doc` and has no row to remove.
    expect(() => via((f) => ({ tag: f(TagInput, { cascade: "removeRef" }) }))).toThrow("is not a model reference");
  });

  test("rejects a nested array", () => {
    expect(() => via((f) => ({ grid: f([[AssetFull]], { cascade: "removeRef" }) }))).toThrow(
      'Cascade field "grid" is a nested array and cannot cascade',
    );
  });
});

describe("CascadePaths removeWith", () => {
  test("collects an owner named by ref, by refPath, and by relation", () => {
    const Model = via((f) => ({
      asset: f(ID, { ref: "cascadeTestAsset", cascade: "removeWith" }),
      owner: f(ID, { refPath: "ownerType", cascade: "removeWith" }),
      ownerType: f(CascadeTestOwnerType),
      cover: f(AssetFull, { cascade: "removeWith" }).optional(),
    }));

    expect([...Model.cascade.removeWith.keys()]).toEqual(["asset", "owner", "cover"]);
    expect(Model.cascade.removeWith.get("asset")?.refName).toBe("cascadeTestAsset");
    expect(Model.cascade.removeWith.get("owner")?.typeKey).toBe("ownerType");
    expect(Model.cascade.removeWith.get("owner")?.typeValues).toEqual(["cascadeTestAsset", "cascadeTestAlbum"]);
    const cover = Model.cascade.removeWith.get("cover")?.modelRef;
    expect(cover && ConstantRegistry.getRefName(cover)).toBe("cascadeTestAsset");
  });

  test("keeps the two directions apart on the same field shape", () => {
    const Model = via((f) => ({
      cover: f(AssetFull, { cascade: "removeRef" }).optional(),
      album: f(AssetFull, { cascade: "removeWith" }).optional(),
    }));

    expect([...Model.cascade.removeRef.keys()]).toEqual(["cover"]);
    expect([...Model.cascade.removeWith.keys()]).toEqual(["album"]);
  });

  test("rejects a field that names no owner", () => {
    expect(() => via((f) => ({ label: f(String, { cascade: "removeWith" }) }))).toThrow(
      'Cascade field "label" declares cascade: "removeWith" but names no owner',
    );
    expect(() => via((f) => ({ tag: f(TagInput, { cascade: "removeWith" }) }))).toThrow("names no owner");
  });

  test("rejects more than one owner", () => {
    expect(() => via((f) => ({ assets: f([AssetFull], { cascade: "removeWith" }) }))).toThrow(
      'Cascade field "assets" is an array and names more than one owner',
    );
  });

  test("requires refPath to name an enum field", () => {
    // A free-form owner type is unknowable at build time, so every model's removal would have to sweep this table.
    expect(() =>
      via((f) => ({ owner: f(ID, { refPath: "ownerType", cascade: "removeWith" }), ownerType: f(String) })),
    ).toThrow("must be an enumOf(...) naming the owner refNames it may hold");
    expect(() => via((f) => ({ owner: f(ID, { refPath: "missing", cascade: "removeWith" }) }))).toThrow(
      'declares refPath: "missing", which is not a field',
    );
  });

  test("rejects ref and refPath together", () => {
    expect(() =>
      via((f) => ({
        owner: f(ID, { ref: "cascadeTestAsset", refPath: "ownerType", cascade: "removeWith" }),
        ownerType: f(CascadeTestOwnerType),
      })),
    ).toThrow("declares both ref and refPath");
  });

  test("rejects a ref that holds no id", () => {
    expect(() => via((f) => ({ at: f(Date, { ref: "cascadeTestAsset", cascade: "removeWith" }) }))).toThrow(
      'Cascade field "at" declares ref or refPath and must hold an ID',
    );
  });
});
