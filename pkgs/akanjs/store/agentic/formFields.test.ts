import { describe, expect, test } from "bun:test";
import {
  CLIENT_VALUE,
  FIELD_META,
  type PrimitiveAgentFace,
  PrimitiveRegistry,
  PrimitiveScalar,
  SERVER_VALUE,
} from "akanjs/base";
import { type ConstantField, ConstantRegistry, via } from "akanjs/constant";
import { FormFields } from "./formFields";

interface FieldNoteDoc {
  lines: string[];
}
class FieldNote extends PrimitiveScalar {
  static override refName = "FieldNote";
  static override [SERVER_VALUE]: FieldNoteDoc;
  static override [CLIENT_VALUE]: FieldNoteDoc;
  static override agent: PrimitiveAgentFace<FieldNoteDoc> = {
    schema: { type: "string" },
    read: (value) => value.lines.join("\n"),
  };
}
PrimitiveRegistry.register(FieldNote);

const Input = via((f) => ({
  title: f(String),
  body: f(FieldNote),
  drafts: f([FieldNote]),
  byLocale: f(Map, { of: FieldNote }),
}));
const Obj = via(Input, () => ({}));
const Light = via(Obj, ["title"] as const, () => ({}));
const Full = via(Obj, Light, () => ({}));
const Insight = via(Full, () => ({}));
ConstantRegistry.buildModel("fieldNotePage", Input, Obj, Full, Light, Insight, {});

const fields = Full[FIELD_META] as unknown as { [key: string]: ConstantField };

describe("FormFields with an agent-faced primitive", () => {
  test("publishes no setter shape for it, alone, in an array, or as a map's values", () => {
    expect(FormFields.schema(fields.body)).toBeNull();
    expect(FormFields.schema(fields.drafts)).toBeNull();
    expect(FormFields.schema(fields.byLocale)).toBeNull();
    expect(FormFields.schema(fields.title)).toEqual({ type: "string" });
  });

  test("leaves it out of the form patch, which the editor owning the field writes instead", () => {
    expect(FormFields.patchable("fieldNotePage").map(({ key }) => key)).toEqual(["title"]);
  });
});
