import { describe, expect, test } from "bun:test";
import { FIELD_META, Int } from "akanjs/base";
import { leakingFieldsOf, mask } from "./mask";
import { via } from "./via";

const MaskFileInput = via((f) => ({
  filename: f(String),
  url: f(String),
  size: f(Int, { default: 0 }),
  abstractData: f.visual(String).optional(),
  origin: f.hidden(String).optional(),
}));
const MaskFileObject = via(MaskFileInput, () => ({}));
const MaskFileLight = via(MaskFileObject, ["filename", "url", "abstractData"] as const, () => ({}));
const MaskFile = via(MaskFileObject, MaskFileLight, () => ({}));

const MaskPostInput = via((f) => ({
  title: f(String),
  body: f.visual(String),
  token: f.secret(String).optional(),
  image: f(MaskFile).optional(),
}));
const MaskPost = via(MaskPostInput, () => ({}));

const fileValue = {
  filename: "shot.png",
  url: "https://cdn.example.com/shot.png",
  size: 4821,
  abstractData: "data:image/png;base64,AAAA",
  origin: "data:image/png;base64,ZZZZ",
};

describe("mask", () => {
  test("drops a visual field, which the page renders and no answer is made from", () => {
    const masked = mask(MaskFileLight, fileValue) as Record<string, unknown>;
    expect(Object.keys(masked).sort()).toEqual(["filename", "url"]);
  });

  test("drops it under a relation too, since that is where a blur placeholder actually rides", () => {
    const masked = mask(MaskPost, {
      title: "A post",
      body: "<p>rendered html</p>",
      token: "tok_live_x",
      image: fileValue,
    }) as { title: string; image: Record<string, unknown> };
    expect(Object.keys(masked).sort()).toEqual(["image", "title"]);
    expect(Object.keys(masked.image).sort()).toEqual(["filename", "size", "url"]);
  });

  test("masks every item of an array by the same model", () => {
    const masked = mask(MaskFileLight, [fileValue, fileValue]) as Record<string, unknown>[];
    expect(masked.map((one) => "abstractData" in one)).toEqual([false, false]);
  });

  test("leaves a value alone when the model carries no field metadata", () => {
    expect(mask({ name: "Nothing" }, fileValue)).toEqual(fileValue);
  });
});

describe("leakingFieldsOf", () => {
  test("reports hidden and secret, and never visual", () => {
    expect(leakingFieldsOf(MaskFile, fileValue)).toEqual(["origin"]);
    // A refusal here means the value must not be published at all. A blur placeholder is not a secret — it is
    // merely not worth its tokens, which masking answers by dropping it.
    expect(leakingFieldsOf(MaskPost, { title: "A post", body: "<p>x</p>" })).toEqual([]);
  });
});

describe("field.visual", () => {
  test("stays an ordinary stored property, so persistence, search and forms are untouched", () => {
    const fields = MaskFileInput[FIELD_META] as Record<string, { fieldType: string; visual: boolean }>;
    expect(fields.abstractData.fieldType).toBe("property");
    expect(fields.abstractData.visual).toBe(true);
    expect(fields.filename.visual).toBe(false);
  });

  test("is inherited by a Light tuple, which copies the field the object class declared", () => {
    const fields = MaskFileLight[FIELD_META] as Record<string, { visual: boolean }>;
    expect(fields.abstractData.visual).toBe(true);
  });
});
