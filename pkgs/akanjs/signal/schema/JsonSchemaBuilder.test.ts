import { describe, expect, test } from "bun:test";
import { enumOf, Int, Upload } from "akanjs/base";
import { ConstantRegistry, via } from "akanjs/constant";
import { JsonSchemaBuilder } from "./JsonSchemaBuilder";

// The subclass form is what registers the enum: `isEnum` walks two prototype hops, so a bare
// `const X = enumOf(...)` is never found by `ConstantRegistry.enum`.
class SchemaRole extends enumOf("schemaRole", ["admin", "user"] as const) {}

class SchemaTagInput extends via((field) => ({ label: field(String) })) {}
class SchemaTagObject extends via(SchemaTagInput, (field) => ({ weight: field(Int, { default: 0 }) })) {}
class LightSchemaTag extends via(SchemaTagObject, ["label"] as const, () => ({})) {}
class SchemaTag extends via(SchemaTagObject, LightSchemaTag, () => ({})) {}
class SchemaTagInsight extends via(SchemaTag, () => ({})) {}
ConstantRegistry.buildModel(
  "schemaTag",
  SchemaTagInput,
  SchemaTagObject,
  SchemaTag,
  LightSchemaTag,
  SchemaTagInsight,
  {},
);

class SchemaPostInput extends via((field) => ({
  title: field(String),
  role: field(SchemaRole, { default: "user" }),
  tag: field(SchemaTag).optional(),
  aliases: field([String]),
  scores: field(Map, { of: Int }),
})) {}
class SchemaPostObject extends via(SchemaPostInput, (field) => ({ views: field(Int, { default: 0 }) })) {}
class LightSchemaPost extends via(SchemaPostObject, ["title"] as const, () => ({})) {}
class SchemaPost extends via(SchemaPostObject, LightSchemaPost, () => ({})) {}
class SchemaPostInsight extends via(SchemaPost, () => ({})) {}
ConstantRegistry.buildModel(
  "schemaPost",
  SchemaPostInput,
  SchemaPostObject,
  SchemaPost,
  LightSchemaPost,
  SchemaPostInsight,
  { SchemaRole },
);

class SchemaVaultInput extends via((field) => ({
  label: field(String),
  password: field.secret(String).optional(),
  internalPath: field.hidden(String).optional(),
  preview: field.visual(String).optional(),
})) {}
class SchemaVaultObject extends via(SchemaVaultInput, () => ({})) {}
class LightSchemaVault extends via(SchemaVaultObject, ["label"] as const, () => ({})) {}
class SchemaVault extends via(SchemaVaultObject, LightSchemaVault, () => ({})) {}
class SchemaVaultInsight extends via(SchemaVault, () => ({})) {}
ConstantRegistry.buildModel(
  "schemaVault",
  SchemaVaultInput,
  SchemaVaultObject,
  SchemaVault,
  LightSchemaVault,
  SchemaVaultInsight,
  {},
);

describe("JsonSchemaBuilder", () => {
  const schema = new JsonSchemaBuilder();

  test("maps every Akan primitive to its JSON Schema form", () => {
    expect(JsonSchemaBuilder.primitive("Boolean")).toEqual({ type: "boolean" });
    expect(JsonSchemaBuilder.primitive("Date")).toEqual({ type: "string", format: "date-time" });
    expect(JsonSchemaBuilder.primitive("Float")).toEqual({ type: "number" });
    expect(JsonSchemaBuilder.primitive("Int")).toEqual({ type: "integer" });
    expect(JsonSchemaBuilder.primitive("ID")).toEqual({ type: "string", pattern: "^[0-9a-fA-F]{24}$" });
    expect(JsonSchemaBuilder.primitive("Upload")).toEqual({ type: "string", format: "binary" });
    expect(JsonSchemaBuilder.primitive("Any")).toEqual({});
    expect(JsonSchemaBuilder.primitive("String")).toEqual({ type: "string" });
    expect(JsonSchemaBuilder.primitive("Unregistered")).toEqual({ type: "string" });
  });

  test("wraps an arg in array depth then nullability, and inlines enum values", () => {
    expect(schema.arg({ type: "search", name: "tags", refName: "String", arrDepth: 2, nullable: true })).toEqual({
      anyOf: [{ type: "array", items: { type: "array", items: { type: "string" } } }, { type: "null" }],
    });
    expect(schema.arg({ type: "search", name: "role", refName: "String", enum: "schemaRole" })).toEqual({
      type: "string",
      enum: ["admin", "user"],
    });
    // `oneOf` is a fixed list an arg carries without a registered enum behind it — the root slice's query keys.
    expect(schema.arg({ type: "search", name: "queryKey", refName: "String", oneOf: ["any", "byAuthor"] })).toEqual({
      type: "string",
      enum: ["any", "byAuthor"],
    });
  });

  test("falls back to an annotated string for an enum that is not registered", () => {
    expect(schema.arg({ type: "search", name: "role", refName: "String", enum: "missingEnum" })).toEqual({
      type: "string",
      "x-akan-enum": "missingEnum",
    });
  });

  test("marks only non-nullable fields required and describes map fields by their value type", () => {
    expect(schema.allModelSchemas().SchemaPostInput).toEqual({
      type: "object",
      additionalProperties: false,
      required: ["title", "role", "aliases", "scores"],
      properties: {
        title: { type: "string" },
        role: { type: "string", enum: ["admin", "user"] },
        tag: { anyOf: [{ $ref: "#/components/schemas/SchemaTag" }, { type: "null" }] },
        aliases: { type: "array", items: { type: "string" } },
        scores: { type: "object", additionalProperties: { type: "integer" } },
      },
    });
  });

  test("drops hidden, secret and visual fields only where the schema describes a response", () => {
    // `SignalContext.resolveReturn` strips the first two from every response, so naming them describes a property
    // no answer carries — and on a real model the names are the leak. A request body carries all three
    // legitimately, so the default keeps them and only the caller that publishes a *return* shape asks for this.
    const keys = (value: unknown) => Object.keys((value as { properties: object }).properties);
    expect(keys(schema.model(SchemaVaultInput))).toEqual(["label", "password", "internalPath", "preview"]);
    expect(keys(schema.model(SchemaVaultInput, { readable: true }))).toEqual(["label"]);
    expect(keys(schema.allModelSchemas({ readable: true }).SchemaVault)).not.toContain("password");
    expect(keys(schema.allModelSchemas().SchemaVault)).toContain("password");
  });

  test("a visual field is absent from the readable schema, since it is absent from the value", () => {
    // A schema that promises a field the payload omits is worse than one that never named it: a non-optional
    // visual field would be listed `required` and a validating client would refuse the whole result.
    const readable = schema.model(SchemaVaultInput, { readable: true }) as { properties: object };
    expect("preview" in readable.properties).toBe(false);
    expect("preview" in (schema.model(SchemaVaultInput) as { properties: object }).properties).toBe(true);
  });

  test("collects referenced models transitively and sorts them by name", () => {
    const referenced = schema.referencedSchemas({
      schema: schema.returns({ refName: "schemaPost", modelType: "input" }),
    });
    // SchemaPostInput references SchemaTag, which pulls in nothing further.
    expect(Object.keys(referenced)).toEqual(["SchemaPostInput", "SchemaTag"]);
  });

  test("returns no schemas when nothing references a model", () => {
    expect(schema.referencedSchemas({ schema: schema.returns({ refName: "Int" }) })).toEqual({});
  });

  test("honours a custom ref prefix on both emit and resolve", () => {
    // `#/$defs/` contains `$`; a regex-based prefix match would read it as end-of-input and resolve nothing.
    const defs = new JsonSchemaBuilder({ refPrefix: "#/$defs/" });
    const returns = defs.returns({ refName: "schemaPost", modelType: "input" });
    expect(returns).toEqual({ $ref: "#/$defs/SchemaPostInput" });
    expect(Object.keys(defs.referencedSchemas({ schema: returns }))).toEqual(["SchemaPostInput", "SchemaTag"]);
    expect(defs.collectRefNames({ $ref: "#/components/schemas/SchemaTag" }).size).toBe(0);
  });

  test("describes an upload arg as binary regardless of the declared model", () => {
    expect(schema.upload({ type: "upload", name: "files", refName: Upload.refName, arrDepth: 1 })).toEqual({
      type: "array",
      items: { type: "string", format: "binary" },
    });
  });

  test("keeps a nullable return distinguishable from a plain one", () => {
    expect(schema.returns({ refName: "Float", nullable: true })).toEqual({
      anyOf: [{ type: "number" }, { type: "null" }],
    });
    expect(schema.returns({ refName: "Any" })).toEqual({});
  });
});
